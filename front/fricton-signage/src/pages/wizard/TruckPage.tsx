// src/pages/wizard/TruckPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  title?: string; // ← オプショナルに
};

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
  key: string;           // 例: "title"
  label: string;         // 入力ラベル表示
  x: number;             // left %（0-100）
  y: number;             // top %（0-100）
  w: number;             // width %（0-100）
  h: number;             // height %（0-100）
  align?: TextAlign;     // 水平整列
  valign?: VAlign;       // 垂直整列
  color?: string;
  fontSize?: number;     // px
  weight?: 400 | 600 | 700 | 800;
  lines?: number;        // 最大行数（CSS line-clamp）
  required?: boolean;    // 未入力不可にするか
};

type ImageBox = {
  x: number; y: number; w: number; h: number; mode: "cover" | "contain";
};

type Template = {
  id: string;
  name: string;
  background: { type: "image"; value: string }; // 画像は public 配下に置く
  imageBox: ImageBox;              // ユーザー画像の表示領域
  textBoxes: TextBox[];            // テキスト枠
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
      { key: "footer", label: "フッター",x: 5, y: 70, w: 85, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 1 }
    ]
  },
  {
    id: "photo-full-bleed",
    name: "タイトル、フッダー",
    background: { type: "image", value: "/signage_sample2_resized.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 20, w: 85, h: 30, align: "left", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "footer", label: "フッター",x: 5, y: 70, w: 85, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 1 }
    ]
  },
  {
    id: "two-columns",
    name: "タイトル（左上）、サブタイトル（左上）、フッダー（右下）",
    background: { type: "image", value: "/signage_sample3_resized.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 12, w: 55, h: 40, align: "center", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "subtitle", label: "サブタイトル", x: 6, y: 50, w: 50, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 15, weight: 400, lines: 1 },
      { key: "footer", label: "フッター",x: 70, y: 70, w: 35, h: 20, align: "right", valign: "top", color: "#cbd5e1", fontSize: 15, weight: 400, lines: 3 }
    ]
  }
];


// 30分スロット生成
function createTimeSlots(stepMin = 30, startHour = 8, endHour = 22) {
  const list: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      list.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return list;
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
export default function TruckPage({ title }: Props) {
  const nav = useNavigate();

  // 週表示
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  });
  const mondayStart = false;
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate, mondayStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [anchorDate, mondayStart]);
  const fmtWeekday = useMemo(() => new Intl.DateTimeFormat("ja-JP", { weekday: "short" }), []);
  const fmtMonthDay = useMemo(() => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }), []);
  const slots = useMemo(() => createTimeSlots(30, 8, 22), []);

  // ★ダミー予約（以前のコードで使っていた booked が未定義だったので戻しました）
  const booked = useMemo(() => {
    const s = new Set<string>();
    const day0 = toISODate(weekDays[0]);
    s.add(`${day0}_10:00`);
    s.add(`${day0}_10:30`);
    return s;
  }, [weekDays]);

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

  // アップロード
  const [imageFiles, setImageFiles] = useState<FileList | null>(null); // 画像（複数）
  const [audioFile, setAudioFile] = useState<File | null>(null);       // 音声（単一）
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

  // プレビュー：表示中の画像index（手動切替）
  const [activeImgIndex, setActiveImgIndex] = useState(0);

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
          if (!booked.has(k)) set.add(k);
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
    // 既存URLを解放
    setImgPreviews(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.url));
      return [];
    });

    if (!imageFiles || imageFiles.length === 0) return;

    const imgs: ImgPreview[] = [];
    const tasks: Promise<void>[] = [];

    Array.from(imageFiles).forEach(file => {
      const typeOk = ALLOWED_IMAGE_TYPES.includes(file.type);
      const url = URL.createObjectURL(file);
      tasks.push(
        new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            imgs.push({
              name: file.name,
              url,
              width: w,
              height: h,
              ok: w === REQUIRED_W_Truck && h === REQUIRED_H_Truck, // 推奨サイズ一致チェック
              typeOk,
            });
            resolve();
          };
          img.onerror = () => {
            imgs.push({
              name: file.name,
              url,
              width: 0,
              height: 0,
              ok: false,
              typeOk, // ← 必須（型に合わせる）
            });
            resolve();
          };
          img.src = url;
        })
      );
    });

    Promise.all(tasks).then(() => {
      imgs.sort((a, b) => a.name.localeCompare(b.name));
      setImgPreviews(imgs);
      setActiveImgIndex(0);
    });

    return () => { imgs.forEach(p => URL.revokeObjectURL(p.url)); };
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

  //テキスト枠の CSS 生成（配置＆整列のみ。文字サイズは中のdivで調整）
  // テキスト枠の CSS（配置＆整列）
const textBoxStyle = (tb: TextBox): React.CSSProperties => {
  const justifyContent =
    tb.valign === "middle" ? "center" :
    tb.valign === "bottom" ? "flex-end" : "flex-start";
  const alignItems =
    tb.align === "center" ? "center" :
    tb.align === "right" ? "flex-end" : "flex-start";
  return {
    position: "absolute",
    left: `${tb.x}%`,
    top: `${tb.y}%`,
    width: `${tb.w}%`,
    height: `${tb.h}%`,
    display: "flex",
    justifyContent,
    alignItems,
    padding: 8,
    color: tb.color ?? "#fff",
    fontWeight: tb.weight ?? 600,
    lineHeight: 1.2,
    textAlign: tb.align ?? "left",
    overflow: "hidden",
    wordBreak: "break-word",
    pointerEvents: "none",
  };
};


  // プレビュー表示中の画像URL
  const activeImgUrl = imgPreviews[activeImgIndex]?.url;

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
    const badType = Array.from(imageFiles).find(f => !ALLOWED_IMAGE_TYPES.includes(f.type));
    if (badType) {
      setError("画像は jpg/jpeg/png/webp のみアップロード可能です");
      return;
    }
    // 必須テキストチェック
    const missing = currentTpl.textBoxes.filter(tb => tb.required && !textValues[tb.key]?.trim());
    if (missing.length > 0) {
      setError(`必須テキスト（${missing.map(m => m.label).join("、")}）を入力してください`);
      return;
    }

    // day -> times[] へ整形
    const byDate: Record<string, string[]> = {};
    Array.from(pickedSlots).forEach(k => {
      const [d, t] = k.split("_");
      (byDate[d] ??= []).push(t);
    });

    // 送信（multipart/form-data）
    const fd = new FormData();
    fd.append("kind", "アドトラック");
    fd.append("title", title ?? "");
    fd.append("tpl_id", tplId);
    fd.append("text_values", JSON.stringify(textValues));
    fd.append("schedule", JSON.stringify(byDate));
    // 画像（複数）
    Array.from(imageFiles).forEach(f => fd.append("files_trucks", f));
    // 音声（任意）
    if (audioFile) fd.append("audio", audioFile);


    setLoading(true);
    try {
    // RegisterPage.tsxに極力寄せて、ファイル対応だけ追加
    // byDate は pickedSlots から作る想定
    const byDate: Record<string, string[]> = {};
    Array.from(pickedSlots).forEach(k => {
      const [d, t] = k.split("_");
      (byDate[d] ??= []).push(t);
    });

    // ★ Content-Type は絶対に自分で付けない（ブラウザが boundary 付きで付与する）
    const res = await fetch("http://localhost:8000/api/trucks", {
      method: "POST",
      body: fd,
    });

    const txt = await res.text();                 // デバッグ出力（必要なら JSON にパース）
    console.log("POST /api/trucks ->", res.status, txt);
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      alert("送信しました！");
    } catch (err) {
      console.error(err);
      setError("送信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
    }

  const dayISO = weekDays.map(d => toISODate(d));

  return (
    <div style={{ maxWidth: 1000, margin: "24px auto", padding: 16 }}>
      <h2>アドトラック</h2>
      <div style={{ opacity: 0.7, marginBottom: 8 }}>タイトル：{title}</div>

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
                background: "#fff",
                borderRadius: 12,
                overflow: "hidden",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column"
              }}
            >
              <input
                type="radio"
                name="tpl"
                value={t.id}
                checked={tplId === t.id}
                onChange={() => setTplId(t.id)}
                style={{ display: "none" }}
              />
              <div style={{ width: "100%", aspectRatio: "16/9" }}>
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={t.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#f3f4f6",
                      color: "#6b7280",
                      fontSize: 12
                    }}
                  >
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
        {/* 画像（複数・動画不可） */}
        <label>
          画像ファイル（複数可・推奨サイズ {REQUIRED_W_Truck}×{REQUIRED_H_Truck} ・形式：jpg/jpeg/png/webp）
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={e => { setImageFiles(e.target.files ?? null); setError(""); }}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>

        {imgPreviews.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>画像プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
              {imgPreviews.map((p, idx) => (
                <div key={p.url} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
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
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setActiveImgIndex(i => Math.max(0, i - 1))} disabled={activeImgIndex <= 0}>◀︎ 前の画像</button>
              <button onClick={() => setActiveImgIndex(i => Math.min(imgPreviews.length - 1, i + 1))} disabled={activeImgIndex >= imgPreviews.length - 1}>次の画像 ▶︎</button>
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
          <img
            src={currentTpl.background.value}
            alt="背景"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
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
              style={{
                width: "100%",
                height: "100%",
                objectFit: currentTpl.imageBox.mode,
                objectPosition: "center",
              }}
            />
          </div>
        )}

        {/* テキスト枠 */}
        {currentTpl.textBoxes.map(tb => {
          const rawText = (textValues[tb.key] ?? "");           // ← 表示はtrimしない
          const isEmpty = !rawText.trim() && tb.required;       // ← 必須判定はtrimで
          return (
          <div key={tb.key} style={textBoxStyle(tb)}>
            <div
              style={{
                width: "100%",
                height: "100%",
                overflow: "hidden",
                // -webkit-line-clamp を有効化
                display: "-webkit-box" as unknown as React.CSSProperties["display"],
                WebkitBoxOrient: "vertical" as any,
                WebkitLineClamp: (tb.lines ?? 2) as any,
                // 改行(\n)と複数スペースをそのまま表示
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
        <button onClick={onSubmit} disabled={loading}>{loading ? "送信中…" : "確認へ"}</button>
        {loading && <span style={{ fontSize: 12, opacity: 0.8 }}>送信中です…</span>}
      </div>
    </div>
  );
}
