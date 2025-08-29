// src/pages/wizard/TruckPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_ROOT = "http://localhost:8000";
const BOOKED_API = `${API_ROOT}/api/truck/booked`;
const KIND = "アドトラック"; // API/DBのkindを統一

// 推奨サイズ（画像）
const REQUIRED_W_Truck = 890;
const REQUIRED_H_Truck = 330;

// 画像許可タイプ
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// サムネイル（推奨サイズの1/4）
const THUMB_W = Math.round(REQUIRED_W_Truck / 4); // 223
const THUMB_H = Math.round(REQUIRED_H_Truck / 4); // 83

type ImgPreview = { name: string; url: string; width: number; height: number; ok: boolean; typeOk: boolean };
type AudioPreview = { name: string; url: string; duration: number };

// テンプレ定義
type TextAlign = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";
type TextBox = {
  key: string; label: string; x: number; y: number; w: number; h: number;
  align?: TextAlign; valign?: VAlign; color?: string; fontSize?: number; weight?: 400 | 600 | 700 | 800;
  lines?: number; required?: boolean;
};
type ImageBox = { x: number; y: number; w: number; h: number; mode: "cover" | "contain" };
type Template = {
  id: string; name: string;
  background: { type: "image"; value: string };
  imageBox: ImageBox;
  textBoxes: TextBox[];
};

// サンプルテンプレ3種
const TEMPLATES: Template[] = [
  {
    id: "simple-right-image",
    name: "タイトル、本文、フッダー",
    background: { type: "image", value: "/signage_sample1_resized.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 5, w: 85, h: 30, align: "left", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "body", label: "本文", x: 6, y: 34, w: 52, h: 55, align: "left", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 3 },
      { key: "footer", label: "フッター", x: 5, y: 70, w: 85, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 1 }
    ]
  },
  {
    id: "photo-full-bleed",
    name: "タイトル、フッダー",
    background: { type: "image", value: "/signage_sample2_resized.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 20, w: 85, h: 30, align: "left", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "footer", label: "フッター", x: 5, y: 70, w: 85, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 1 }
    ]
  },
  {
    id: "two-columns",
    name: "タイトル（左上）、サブタイトル（左上）、フッター（右下）",
    background: { type: "image", value: "/signage_sample3_resized.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 12, w: 55, h: 40, align: "center", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "subtitle", label: "サブタイトル", x: 6, y: 50, w: 50, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 15, weight: 400, lines: 1 },
      { key: "footer", label: "フッター", x: 70, y: 70, w: 35, h: 20, align: "right", valign: "top", color: "#cbd5e1", fontSize: 15, weight: 400, lines: 3 }
    ]
  }
];

// 30分スロット生成
function createTimeSlots(stepMin = 30, startHour = 8, endHour = 22) {
  const list: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      list.push(`${hh}:${mm}`);
    }
  }
  return list;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function startOfWeek(anchor: Date, mondayStart = false) {
  const d = new Date(anchor);
  const day = d.getDay();
  const diff = mondayStart ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
const fmtDuration = (sec: number) => {
  if (!isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// --- コンポーネント本体 ---
export default function TruckPage() {
  const nav = useNavigate();

  // 週表示
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const mondayStart = false;
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate, mondayStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchorDate, mondayStart]);

  const fmtWeekday = useMemo(() => new Intl.DateTimeFormat("ja-JP", { weekday: "short" }), []);
  const fmtMonthDay = useMemo(() => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }), []);
  const slots = useMemo(() => createTimeSlots(30, 8, 22), []);
  const dayISO = weekDays.map(d => toISODate(d));

  // ===== APIから予約取得（kind=アドトラック） =====
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [bookedLoading, setBookedLoading] = useState(false);
  const [bookedError, setBookedError] = useState<string | null>(null);

  useEffect(() => {
    const start = startOfWeek(anchorDate, mondayStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const qs = new URLSearchParams({
      start: toISODate(start),
      end: toISODate(end),
      kind: KIND,
    });

    const ctrl = new AbortController();
    setBookedLoading(true);
    setBookedError(null);

    fetch(`${BOOKED_API}?${qs.toString()}`, { signal: ctrl.signal })
      .then(async res => {
        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        const json: Record<string, string[]> = text ? JSON.parse(text) : {};
        const s = new Set<string>();
        Object.entries(json).forEach(([d, times]) => (times || []).forEach(t => s.add(`${d}_${t}`)));
        setBooked(s);
      })
      .catch(err => {
        if ((err as any).name === "AbortError") return;
        console.error("Failed to fetch booked slots:", err);
        setBooked(new Set()); // フォールバック：全て未予約扱い
        setBookedError("予約状況の取得に失敗しました");
      })
      .finally(() => setBookedLoading(false));

    return () => ctrl.abort();
  }, [anchorDate, mondayStart]);

  // テンプレ選択＆テキスト
  const [tplId, setTplId] = useState<string>(TEMPLATES[0].id);
  const currentTpl = useMemo(() => TEMPLATES.find(t => t.id === tplId)!, [tplId]);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setTextValues(prev => {
      const next: Record<string, string> = { ...prev };
      currentTpl.textBoxes.forEach(tb => { if (!(tb.key in next)) next[tb.key] = ""; });
      return next;
    });
  }, [currentTpl]);

  // アップロード（画像 複数 / 音声 任意 単一）
  const [otherFiles, setOtherFiles] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imgPreviews, setImgPreviews] = useState<ImgPreview[]>([]);
  const [audioPreview, setAudioPreview] = useState<AudioPreview | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // スロット選択（週表示）
  const [pickedSlots, setPickedSlots] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect" | null>(null);
  const [dragStart, setDragStart] = useState<{ day: number; slot: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<Set<string>>(new Set());

  // 予約合計分数 → 画像上限（1分=1枚）
  const reservedMinutes = useMemo(() => pickedSlots.size * 30, [pickedSlots]);
  const maxImages = reservedMinutes;

  // 初回置き換え / 追加
  const handleInitialFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageFiles(prev => [...prev, ...Array.from(files)]);
    setError("");
  };

  
  const appendInputRef = useRef<HTMLInputElement | null>(null);

  const removeAtIndex = (idx: number) => {
    setImageFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // アクティブインデックス補正
      setActiveImgIndex(i => Math.min(Math.max(0, i - (idx <= i ? 1 : 0)), Math.max(0, next.length - 1)));
      return next;
    });
  };

  // --- ドラッグ選択ハンドラ ---
  useEffect(() => {
    const handleUp = () => {
      if (!isDragging) return;
      setPickedSlots(prev => {
        const next = new Set(prev);
        if (dragMode && dragPreview.size > 0) {
          dragPreview.forEach(k => {
            if (dragMode === "select") next.add(k);
            else next.delete(k);
          });
        }
        return next;
      });
      setIsDragging(false);
      setDragMode(null);
      setDragStart(null);
      setDragPreview(new Set());
    };
    if (isDragging) window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [isDragging, dragMode, dragPreview]);

  const goPrevWeek = () =>
    setAnchorDate(d => {
      const nd = new Date(d);
      nd.setDate(d.getDate() - 7);
      return nd;
    });
  const goNextWeek = () =>
    setAnchorDate(d => {
      const nd = new Date(d);
      nd.setDate(d.getDate() + 7);
      return nd;
    });
  const goThisWeek = () => setAnchorDate(new Date());

  const handleMouseDown =
    (dayIdx: number, slotIdx: number, key: string, disabled: boolean) =>
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(true);
      setDragStart({ day: dayIdx, slot: slotIdx });
      setDragMode(pickedSlots.has(key) ? "deselect" : "select");
      setDragPreview(new Set([key]));
    };

  const handleMouseEnter =
    (dayIdx: number, slotIdx: number, keyOf: (d: number, s: number) => string) =>
    () => {
      if (!isDragging || !dragStart) return;
      const minD = Math.min(dragStart.day, dayIdx);
      const maxD = Math.max(dragStart.day, dayIdx);
      const minS = Math.min(dragStart.slot, slotIdx);
      const maxS = Math.max(dragStart.slot, slotIdx);
      const set = new Set<string>();
      for (let d = minD; d <= maxD; d++) {
        for (let s = minS; s <= maxS; s++) {
          const k = keyOf(d, s);
          if (!booked.has(k)) set.add(k); // 予約済みを除外
        }
      }
      setDragPreview(set);
    };

  const toggleSlot = (key: string, disabled: boolean) => {
    if (disabled) return;
    setPickedSlots(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // --- 画像プレビュー生成（タイプ制限＆実寸チェック） ---
  useEffect(() => {
    // 以前のURLを解放
    setImgPreviews(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
    setOtherFiles([]);

    if (!imageFiles || imageFiles.length === 0) return;

    const imgs: ImgPreview[] = [];
    const others: string[] = [];
    const tasks: Promise<void>[] = [];

    imageFiles.forEach(file => {
      // MIME が空でも拡張子で画像判定
      const isImage = (file.type && file.type.startsWith("image/")) || /\.(jpe?g|png|webp)$/i.test(file.name);
      const typeOk = ALLOWED_IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

      if (isImage) {
        const url = URL.createObjectURL(file);
        tasks.push(
          new Promise<void>(resolve => {
            const img = new Image();
            img.onload = () => {
              const w = img.naturalWidth;
              const h = img.naturalHeight;
              imgs.push({ name: file.name, url, width: w, height: h, ok: w === REQUIRED_W_Truck && h === REQUIRED_H_Truck, typeOk });
              resolve();
            };
            img.onerror = () => {
              imgs.push({ name: file.name, url, width: 0, height: 0, ok: false, typeOk });
              resolve();
            };
            img.src = url;
          })
        );
      } else {
        others.push(file.name);
      }
    });

    let cancelled = false;
    Promise.all(tasks).then(() => {
      if (cancelled) return;
      imgs.sort((a, b) => a.name.localeCompare(b.name));
      setImgPreviews(imgs);
      setOtherFiles(others);
    });

    // ★ cleanupでURLをrevokeしない（StrictModeのダブル実行で即消えるため）
    return () => { cancelled = true; };
  }, [imageFiles]);

  // --- 音声プレビュー生成（単一） ---
  useEffect(() => {
    setAudioPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    if (!audioFile) return;

    const url = URL.createObjectURL(audioFile);
    let mounted = true;
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => { if (mounted) setAudioPreview({ name: audioFile.name, url, duration: isFinite(a.duration) ? a.duration : 0 }); };
    a.onerror = () => { if (mounted) setAudioPreview({ name: audioFile.name, url, duration: 0 }); };
    a.src = url;

    return () => { mounted = false; URL.revokeObjectURL(url); };
  }, [audioFile]);

  // テキスト枠の CSS
  const textBoxStyle = (tb: TextBox): React.CSSProperties => {
    const justifyContent = tb.valign === "middle" ? "center" : tb.valign === "bottom" ? "flex-end" : "flex-start";
    const alignItems = tb.align === "center" ? "center" : tb.align === "right" ? "flex-end" : "flex-start";
    return {
      position: "absolute",
      left: `${tb.x}%`, top: `${tb.y}%`, width: `${tb.w}%`, height: `${tb.h}%`,
      display: "flex", justifyContent, alignItems, padding: 8,
      color: tb.color ?? "#fff", fontWeight: tb.weight ?? 600, lineHeight: 1.2, textAlign: tb.align ?? "left",
      overflow: "hidden", wordBreak: "break-word", pointerEvents: "none",
    };
  };

  // プレビュー表示中の画像URL
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const activeImgUrl = imgPreviews[activeImgIndex]?.url;

  // 横スクロール：選択画像に自動スクロール
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(`[data-idx="${activeImgIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeImgIndex]);

  // --- 送信 ---
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // スケジュール選択チェック
    if (pickedSlots.size === 0) {
      setError("配信時間帯を1つ以上選択してください");
      return;
    }
    // 画像チェック（タイプ＆1枚以上）
    if (!imageFiles || imageFiles.length === 0) {
      setError("画像ファイルを1枚以上アップロードしてください");
      return;
    }
    const badType = imageFiles.find(f => !ALLOWED_IMAGE_TYPES.includes(f.type) && !/\.(jpe?g|png|webp)$/i.test(f.name));
    if (badType) {
      setError("画像は jpg/jpeg/png/webp のみアップロード可能です");
      return;
    }
    // 上限チェック（1分=1枚）
    if (maxImages > 0 && imgPreviews.length > maxImages) {
      setError(`選択した画像が上限（最大 ${maxImages} 枚）を超えています。予約時間を延長するか、画像枚数を減らしてください。`);
      return;
    }
    // 必須テキストチェック
    const missing = currentTpl.textBoxes.filter(tb => tb.required && !textValues[tb.key]?.trim());
    if (missing.length > 0) {
      setError(`必須テキスト（${missing.map(m => m.label).join("、")}）を入力してください`);
      return;
    }
    // 予約重複チェック
    const conflicts = Array.from(pickedSlots).filter(k => booked.has(k));
    if (conflicts.length > 0) {
      setError("既に予約済みの時間帯が含まれています。別の時間を選んでください。");
      return;
    }

    setLoading(true);
    try {
      const byDate: Record<string, string[]> = {};
      Array.from(pickedSlots).forEach(k => {
        const [d, t] = k.split("_");
        (byDate[d] ??= []).push(t);
      });

      // 送信（multipart/form-data）
      const fd = new FormData();
      fd.append("kind", KIND);
      fd.append("tpl_id", tplId);
      fd.append("text_values", JSON.stringify(textValues));
      fd.append("schedule", JSON.stringify(byDate));
      imageFiles.forEach(f => fd.append("files_trucks", f));
      if (audioFile) fd.append("audio", audioFile); // 任意

      const res = await fetch(`${API_ROOT}/api/trucks`, {
        method: "POST",
        body: fd
      });

      const txt = await res.text();
      console.log("POST /api/trucks ->", res.status, txt);
      if (!res.ok) {
        let detail = "";
        try {
          const j = JSON.parse(txt);
          if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        } catch {}
        throw new Error(detail || txt || `HTTP ${res.status}`);
      }

      alert("送信しました！");
      // 同週で再フェッチ（即グレー反映）＆選択クリア
      setAnchorDate(d => new Date(d));
      setPickedSlots(new Set());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "送信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "24px auto", padding: 16 }}>
      <h2>アドトラック</h2>

      {/* 0) テンプレ選択 */}
      <h3 style={{ marginTop: 8 }}>テンプレートを選択</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
        {TEMPLATES.map(t => {
          const previewUrl = t.background.type === "image" ? t.background.value : undefined;
          return (
            <label
              key={t.id}
              style={{
                border: tplId === t.id ? "2px solid #2563eb" : "1px solid #ddd",
                background: "#fff", borderRadius: 12, overflow: "hidden",
                cursor: "pointer", display: "flex", flexDirection: "column"
              }}
            >
              <input type="radio" name="tpl" value={t.id} checked={tplId === t.id} onChange={() => setTplId(t.id)} style={{ display: "none" }} />
              <div style={{ width: "100%", aspectRatio: "16/9" }}>
                {previewUrl ? (
                  <img src={previewUrl} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", color: "#6b7280", fontSize: 12 }}>
                    No preview
                  </div>
                )}
              </div>
              <div style={{ fontWeight: 700, textAlign: "center", padding: "8px 4px" }}>{t.name}</div>
            </label>
          );
        })}
      </div>

      {/* 1) 画像/音声アップロード */}
      <h3 style={{ marginTop: 20 }}>素材アップロード</h3>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {/* 初回選択（置き換え）— 常時表示 */}
        <label>
          画像ファイル（複数可・推奨サイズ {REQUIRED_W_Truck}×{REQUIRED_H_Truck} ・形式：jpg/jpeg/png/webp）
          <input
            ref={appendInputRef} 
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={e => handleInitialFiles(e.target.files)}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>

        {/* プレビュー（1枚以上あるとき） */}
        {imgPreviews.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>画像プレビュー</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                合計 {imgPreviews.length} 枚{reservedMinutes > 0 ? ` / 上限 ${maxImages} 枚` : ""}
              </div>
              <div style={{ flex: 1 }} />
              
              {/*追加ボタン → 隠し input を click*/}
              <button
                type="button"
                onClick={() => appendInputRef.current?.click()}
              >
                ファイルを追加
              </button>

              {/* 追加用の隠し input（← ref を付ける） */}
              <input
                ref={appendInputRef} 
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={e => handleInitialFiles(e.target.files)}
                style={{ display: "block", marginTop: 6 }}
              />

              {/* 全削除 */}
              <button
                type="button"
                onClick={() => setImageFiles([])}
                style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px" }}
              >
                すべて削除
              </button>
            </div>

            {/* 横スクロールのコンテナ */}
            <div
              ref={scrollerRef}
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                overflowY: "hidden",
                paddingBottom: 8,
                scrollSnapType: "x proximity",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 8,
                background: "#f8fafc",
              }}
            >
              {imgPreviews.map((p, idx) => (
                <div
                  key={p.url}
                  data-idx={idx}
                  style={{
                    position: "relative",
                    flex: "0 0 220px",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 8,
                    background: "#fff",
                    scrollSnapAlign: "center",
                  }}
                >
                  {/* 個別削除 */}
                  <button
                    type="button"
                    onClick={() => removeAtIndex(idx)}
                    title="この画像を削除"
                    style={{
                      position: "absolute", top: 6, right: 6,
                      border: "none", background: "#ef4444", color: "#fff",
                      borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontSize: 12
                    }}
                  >
                    削除
                  </button>

                  <div
                    style={{
                      width: THUMB_W, height: THUMB_H, borderRadius: 6, background: "#f8f8f8",
                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: "0 auto 6px",
                      outline: idx === activeImgIndex ? "2px solid #2563eb" : "none", cursor: "pointer"
                    }}
                    title="クリックでこの画像をプレビュー"
                    onClick={() => setActiveImgIndex(idx)}
                  >
                    <img src={p.url} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{p.width} × {p.height}px</div>
                  {!p.typeOk && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>NG形式（jpg/png/webpのみ）</div>}
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: p.ok ? "#16a34a" : "#b91c1c" }}>
                    {p.ok ? "OK（890×330）" : "NG：890×330を推奨"}
                  </div>
                </div>
              ))}
            </div>

            {/* 注意書き + 上限表示 */}
            <div style={{
              marginTop: 12,
              fontSize: 12,
              background: "#F1F5F9",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              padding: 10,
              lineHeight: 1.6
            }}>
              <div>※表示は<strong>1分ごとに切替</strong>。</div>
              <div>
                ご予約「分」＝<strong>アップ可能な枚数の上限</strong>
                {reservedMinutes > 0 && <>（この予約では <strong>最大 {maxImages} 枚</strong>）</>}
                。
              </div>
              <div style={{ color: "#6B7280" }}>上限超過分は表示されません。</div>
              {reservedMinutes > 0 && imgPreviews.length > maxImages && (
                <div style={{ marginTop: 6, color: "#b91c1c", fontWeight: 700 }}>
                  現在の選択枚数（{imgPreviews.length}枚）が上限（{maxImages}枚）を超えています。
                </div>
              )}
            </div>
          </div>
        )}

        {/* 音声（単一・任意） */}
        <label>
          音声ファイル（1つまで・任意）
          <input
            type="file"
            accept="audio/*"
            onChange={e => { setAudioFile(e.target.files?.[0] ?? null); setError(""); }}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        {audioPreview && (
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff", maxWidth: 520 }}>
            <div style={{ fontSize: 12, wordBreak: "break-all", marginBottom: 6 }}>{audioPreview.name}</div>
            <audio src={audioPreview.url} controls preload="metadata" style={{ width: "100%" }} />
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>長さ：{fmtDuration(audioPreview.duration)}</div>
          </div>
        )}
      </div>

      {/* 2) テキスト入力（テンプレに応じて生成） */}
      <h3 style={{ marginTop: 24 }}>テキスト入力</h3>
      <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
        {currentTpl.textBoxes.map(tb => (
          <label key={tb.key} style={{ display: "grid", gap: 6 }}>
            {tb.label}{tb.required ? <span style={{ color: "#b91c1c" }}>（必須）</span> : null}
            <textarea
              value={textValues[tb.key] ?? ""}
              onChange={e => setTextValues(prev => ({ ...prev, [tb.key]: e.target.value }))}
              rows={Math.max(2, tb.lines ?? 2)}
              placeholder={`${tb.label}（最大 ${tb.lines ?? 2} 行程度を推奨）`}
              style={{ resize: "vertical", padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
            />
          </label>
        ))}
      </div>

      {/* 3) ライブプレビュー（890×330 の比率で拡縮） */}
      <h3 style={{ marginTop: 24 }}>プレビュー</h3>
      <div
        style={{
          width: "100%", maxWidth: 890, aspectRatio: "890 / 330",
          position: "relative", border: "1px solid #ddd", borderRadius: 12, overflow: "hidden",
          background: currentTpl.background.type === "image" ? undefined : "#000",
        }}
      >
        {/* 背景画像 */}
        {currentTpl.background.type === "image" && (
          <img src={currentTpl.background.value} alt="背景" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}

        {/* 画像枠：アップロード画像を1枚だけ表示（手動切替対応） */}
        {activeImgUrl && (
          <div
            style={{
              position: "absolute",
              left: `${currentTpl.imageBox.x}%`,
              top: `${currentTpl.imageBox.y}%`,
              width: `${currentTpl.imageBox.w}%`,
              height: `${currentTpl.imageBox.h}%`,
              overflow: "hidden",
              borderRadius: 8,
              background: "#111",
            }}
          >
            <img
              src={activeImgUrl}
              alt="メイン画像"
              style={{ width: "100%", height: "100%", objectFit: currentTpl.imageBox.mode, objectPosition: "center" }}
            />
          </div>
        )}

        {/* テキスト枠 */}
        {currentTpl.textBoxes.map(tb => {
          const rawText = (textValues[tb.key] ?? "");
          const isEmpty = !rawText.trim() && tb.required;
          return (
            <div key={tb.key} style={textBoxStyle(tb)}>
              <div
                style={{
                  width: "100%", height: "100%", overflow: "hidden",
                  display: "-webkit-box" as unknown as React.CSSProperties["display"],
                  WebkitBoxOrient: "vertical" as any,
                  WebkitLineClamp: (tb.lines ?? 2) as any,
                  whiteSpace: "pre-wrap",
                  fontSize: ((isEmpty ? 25 : tb.fontSize) ?? 16),
                  color: ((isEmpty ? "#ff6666" : tb.color) ?? "#fff"),
                }}
              >
                {isEmpty ? "（未入力）" : rawText}
              </div>
            </div>
          );
        })}
        {/* それ以外のファイル */}
        {otherFiles.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            画像/動画以外の選択：{otherFiles.join(", ")}
          </div>
        )}
      </div>

      {/* 4) 配信スケジュール（週グリッド） */}
      <h3 style={{ marginTop: 24 }}>配信スケジュール</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button onClick={goPrevWeek} disabled={loading}>◀︎ 前の週</button>
        <button onClick={goThisWeek} disabled={loading}>今週</button>
        <button onClick={goNextWeek} disabled={loading}>次の週 ▶︎</button>
        <div style={{ marginLeft: 8, opacity: 0.8 }}>
          週の開始日：{fmtMonthDay.format(startOfWeek(anchorDate, mondayStart))}
        </div>
        {bookedLoading && <div style={{ marginLeft: 12, fontSize: 12, opacity: 0.8 }}>予約状況を取得中…</div>}
        {bookedError && <div style={{ marginLeft: 12, fontSize: 12, color: "#b91c1c" }}>{bookedError}</div>}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(7, 1fr)",
          borderTop: "1px solid #ddd",
          borderLeft: "1px solid #ddd",
          maxHeight: 520,
          overflow: "auto",
          borderRadius: 8,
          userSelect: "none",
        }}
      >
        {/* ヘッダー */}
        <div style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, borderRight: "1px solid #ddd", borderBottom: "1px solid #ddd" }} />
        {weekDays.map((d, i) => (
          <div
            key={`hdr-${i}`}
            style={{
              position: "sticky",
              top: 0,
              background: "#fff",
              zIndex: 1,
              borderRight: "1px solid #ddd",
              borderBottom: "1px solid #ddd",
              padding: "6px 8px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {fmtWeekday.format(d)}（{fmtMonthDay.format(d)}）
          </div>
        ))}

        {/* 時間行 */}
        {slots.map((t, sIdx) => (
          <div key={`row-${t}`} style={{ display: "contents" }}>
            {/* 時間ラベル */}
            <div
              style={{
                borderRight: "1px solid #eee",
                borderBottom: "1px solid #eee",
                padding: "6px 8px",
                fontVariantNumeric: "tabular-nums",
                background: "#fafafa",
                position: "sticky",
                left: 0,
                zIndex: 1,
              }}
            >
              {t}
            </div>

            {/* 7列のスロット */}
            {weekDays.map((_, dIdx) => {
              const key = `${dayISO[dIdx]}_${t}`;
              const disabled = booked.has(key);
              const picked = pickedSlots.has(key);
              const preview = dragPreview.has(key);
              return (
                <div
                  key={key}
                  onMouseDown={handleMouseDown(dIdx, sIdx, key, disabled)}
                  onMouseEnter={handleMouseEnter(dIdx, sIdx, (d, s) => `${dayISO[d]}_${slots[s]}`)}
                  onClick={() => toggleSlot(key, disabled)}
                  title={disabled ? "予約済み" : key.replace("_", " ")}
                  style={{
                    borderRight: "1px solid #eee",
                    borderBottom: "1px solid #eee",
                    padding: "8px 4px",
                    cursor: disabled ? "not-allowed" : "pointer",
                    background: disabled ? "#eee" : picked ? "#e7f7ec" : preview ? "#e8f1ff" : "white",
                    outline: picked ? "2px solid #16a34a" : preview ? "2px solid #3b82f6" : "none",
                    outlineOffset: "-1px",
                    minHeight: 32,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}

      {/* 送信ボタン */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <button onClick={() => nav(-1)} disabled={loading}>戻る</button>
        <button onClick={onSubmit} disabled={loading}>
          {loading ? "送信中…" : "確認へ"}
        </button>
        {loading && <span style={{ fontSize: 12, opacity: 0.8 }}>送信中です…</span>}
      </div>
    </div>
  );
}
