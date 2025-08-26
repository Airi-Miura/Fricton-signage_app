// src/pages/wizard/AllPost.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// ===== 追加：予約一覧API =====
const API_ROOT = "http://localhost:8000";
const BOOKED_API = `${API_ROOT}/api/AllPost/booked`;

// 画像許可タイプ
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// サムネイル枠（推奨サイズの1/4）
const THUMB_W = 200;
const THUMB_H = 125;

// セクション別の推奨サイズ
const TV_W = 800,  TV_H = 500;   // 大型ビジョン（横）
const SIGN_W = 500, SIGN_H = 800; // サイネージ（縦）
const TRUCK_W = 890, TRUCK_H = 330; // アドトラック（横）

// アドトラック　テンプレ定義
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

// アドトラック　サンプルテンプレ3種
const TEMPLATES: Template[] = [
  {
    id: "simple-right-image",
    name: "タイトル、本文、フッター",
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
    name: "タイトル、フッター",
    background: { type: "image", value: "/signage_sample2_resized.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 20, w: 85, h: 30, align: "left", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "footer", label: "フッター",x: 5, y: 70, w: 85, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 1 }
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
      { key: "footer", label: "フッター",x: 70, y: 70, w: 35, h: 20, align: "right", valign: "top", color: "#cbd5e1", fontSize: 15, weight: 400, lines: 3 }
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

//プレビュー
type ImgPreview = { name: string; url: string; width: number; height: number; ok: boolean; typeOk: boolean};
type AudioPreview = { name: string; url: string; duration: number };
type VideoPreview = { name: string; url: string; width: number; height: number; duration: number };

export default function TVForm() {
  const nav = useNavigate();

  // 週表示関連
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
  const fmtMonthDay = useMemo(
    () => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }),
    []
  );
  const slots = useMemo(() => createTimeSlots(30, 8, 22), []);

    // ===== 変更：ダミー予約をやめ、APIから取得した予約でグレーアウト =====
    const [booked, setBooked] = useState<Set<string>>(new Set());
    const [bookedLoading, setBookedLoading] = useState(false);
    const [bookedError, setBookedError] = useState<string | null>(null);
  
    useEffect(() => {
  const ctrl = new AbortController();
  setBookedLoading(true);
  setBookedError(null);

  (async () => {
    try {
      const start = startOfWeek(anchorDate, mondayStart);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const qs = new URLSearchParams({ start: toISODate(start), end: toISODate(end) });

      // ★ APIが複数kind対応ならこちら（&kind=... を繰り返し）
      ["配置型サイネージ", "大型テレビ", "トラック"].forEach(k => qs.append("kind", k));
      // ★ もしAPIが単一kindだけ対応なら次の1行に切り替え
      // qs.set("kind", "サイネージ");

      const url = new URL(BOOKED_API);
      url.search = qs.toString();
      console.log("Request URL:", url.toString());

      const res = await fetch(url.toString(), { signal: ctrl.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      const json: Record<string, string[]> = text ? JSON.parse(text) : {};
      const booked = new Set<string>();
      for (const [d, times] of Object.entries(json)) {
        for (const t of (times || [])) booked.add(`${d}_${t}`);
      }
      setBooked(booked);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Failed to fetch booked slots:", err);
        setBooked(new Set()); // フォールバック
        setBookedError("予約状況の取得に失敗しました");
      }
    } finally {
      setBookedLoading(false);
    }
  })();

  return () => ctrl.abort();
}, [anchorDate, mondayStart]);

  // ▼▼▼ ここから：ファイル関係をセクション別に分割 ▼▼▼
  // 大型ビジョン
  const [tvFiles, setTvFiles] = useState<FileList | null>(null);
  const [tvImgPreviews, setTvImgPreviews] = useState<ImgPreview[]>([]);
  const [tvVideoPreviews, setTvVideoPreviews] = useState<VideoPreview[]>([]);
  const [tvOtherFiles, setTvOtherFiles] = useState<string[]>([]);

  // サイネージ
  const [signFiles, setSignFiles] = useState<FileList | null>(null);
  const [signImgPreviews, setSignImgPreviews] = useState<ImgPreview[]>([]);
  const [signVideoPreviews, setSignVideoPreviews] = useState<VideoPreview[]>([]);
  const [signOtherFiles, setSignOtherFiles] = useState<string[]>([]);

  // アドトラック（画像・音声）
  const [truckImageFiles, setTruckImageFiles] = useState<FileList | null>(null);
  const [truckImgPreviews, setTruckImgPreviews] = useState<ImgPreview[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<AudioPreview | null>(null);

  // アドトラックのプレビューで使うアクティブ画像index
  const [truckActiveImgIndex, setTruckActiveImgIndex] = useState(0);
  const truckActiveImgUrl = truckImgPreviews[truckActiveImgIndex]?.url;

  // 共通：テンプレ/テキスト
  const [tplId, setTplId] = useState<string>(TEMPLATES[0].id);
  const currentTpl = useMemo(() => TEMPLATES.find(t => t.id === tplId)!, [tplId]);
  const [textValues, setTextValues] = useState<Record<string, string>>({});

  const [error, setError] = useState("");

  // 選択スロット（yyyy-mm-dd_HH:MM）
  const [pickedSlots, setPickedSlots] = useState<Set<string>>(new Set());
  const [dragMode, setDragMode] = useState<"select" | "deselect" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: number; slot: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<Set<string>>(new Set());

  //ドラッグ選択
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

  // ▼ プレビュー生成の共通関数
  async function buildPreviews(files: FileList | null, requiredW: number, requiredH: number) {
    const imgs: ImgPreview[] = [];
    const videos: VideoPreview[] = [];
    const others: string[] = [];
    const tasks: Promise<void>[] = [];

    if (!files || files.length === 0) return { imgs, videos, others };

    Array.from(files).forEach(file => {
      const typeOk = ALLOWED_IMAGE_TYPES.includes(file.type);

      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        tasks.push(new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            imgs.push({ name: file.name, url, width: w, height: h, ok: w === requiredW && h === requiredH, typeOk });
            resolve();
          };
          img.onerror = () => { imgs.push({ name: file.name, url, width: 0, height: 0, ok: false, typeOk }); resolve(); };
          img.src = url;
        }));
      } else if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        tasks.push(new Promise<void>(resolve => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => {
            videos.push({ name: file.name, url, width: v.videoWidth || 0, height: v.videoHeight || 0, duration: isFinite(v.duration) ? v.duration : 0 });
            resolve();
          };
          v.onerror = () => { videos.push({ name: file.name, url, width: 0, height: 0, duration: 0 }); resolve(); };
          v.src = url;
        }));
      } else {
        others.push(file.name);
      }
    });

    await Promise.all(tasks);
    imgs.sort((a,b)=>a.name.localeCompare(b.name));
    videos.sort((a,b)=>a.name.localeCompare(b.name));
    return { imgs, videos, others };
  }

  // ▼ セクションごとのプレビュー useEffect
  // 大型ビジョン
  useEffect(() => {
    let revoke: string[] = [];
    (async () => {
      const { imgs, videos, others } = await buildPreviews(tvFiles, TV_W, TV_H);
      setTvImgPreviews(imgs);
      setTvVideoPreviews(videos);
      setTvOtherFiles(others);
      revoke = [...imgs.map(i=>i.url), ...videos.map(v=>v.url)];
    })();
    return () => revoke.forEach(u => URL.revokeObjectURL(u));
  }, [tvFiles]);

  // サイネージ
  useEffect(() => {
    let revoke: string[] = [];
    (async () => {
      const { imgs, videos, others } = await buildPreviews(signFiles, SIGN_W, SIGN_H);
      setSignImgPreviews(imgs);
      setSignVideoPreviews(videos);
      setSignOtherFiles(others);
      revoke = [...imgs.map(i=>i.url), ...videos.map(v=>v.url)];
    })();
    return () => revoke.forEach(u => URL.revokeObjectURL(u));
  }, [signFiles]);

  // アドトラック（画像のみ）
  useEffect(() => {
    let revoke: string[] = [];
    (async () => {
      const { imgs } = await buildPreviews(truckImageFiles, TRUCK_W, TRUCK_H);
      setTruckImgPreviews(imgs);
      setTruckActiveImgIndex(0);
      revoke = imgs.map(i=>i.url);
    })();
    return () => revoke.forEach(u => URL.revokeObjectURL(u));
  }, [truckImageFiles]);

  // 音声プレビュー
  useEffect(() => {
    if (!audioFile) { setAudioPreview(null); return; }
    const url = URL.createObjectURL(audioFile);
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => setAudioPreview({ name: audioFile.name, url, duration: isFinite(a.duration) ? a.duration : 0 });
    a.onerror = () => setAudioPreview({ name: audioFile.name, url, duration: 0 });
    a.src = url;
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // ▼ 週ナビ操作
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
          if (!booked.has(k)) set.add(k); // 予約は含めない
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

  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pickedSlots.size === 0) {
      setError("配信時間帯を1つ以上選択してください");
      return;
    }
    // どれか1セクションでファイルが選ばれていればOK
    if (!(tvFiles?.length || signFiles?.length || truckImageFiles?.length)) {
      setError("大型ビジョン/サイネージ/アドトラックのいずれかでファイルを選択してください");
      return;
    }

    // アドトラック必須テキストチェック
    const missing = currentTpl.textBoxes.filter(tb => tb.required && !textValues[tb.key]?.trim());
    if (missing.length > 0) {
      setError(`必須テキスト（${missing.map(m => m.label).join("、")}）を入力してください`);
      return;
    }

    // 画像サイズの推奨チェック（必要なら外せます）
    if (tvImgPreviews.some(p => !p.ok))    { setError(`大型ビジョンの画像サイズは ${TV_W}×${TV_H} にしてください`); return; }
    if (signImgPreviews.some(p => !p.ok))  { setError(`サイネージの画像サイズは ${SIGN_W}×${SIGN_H} にしてください`); return; }
    if (truckImgPreviews.some(p => !p.ok)) { setError(`アドトラックの画像サイズは ${TRUCK_W}×${TRUCK_H} にしてください`); return; }

    // 日付ごとにまとめる（今のまま）
    const byDate: Record<string, string[]> = {};
    Array.from(pickedSlots).forEach(k => {
      const [d, t] = k.split("_");
      (byDate[d] ??= []).push(t);
    });

    const fd = new FormData();
    fd.append("kind", "配置型サイネージ");
    fd.append("kind", "大型テレビ");
    fd.append("kind", "トラック");
    fd.append("tpl_id", tplId);
    fd.append("text_values", JSON.stringify(textValues));
    fd.append("schedule", JSON.stringify(byDate));

    // 送信フィールドは既存APIに合わせてまとめる（バックエンドいじらずに動かす）
    Array.from(tvFiles ?? []).forEach(f => fd.append("files_AllPost", f));
    Array.from(signFiles ?? []).forEach(f => fd.append("files_AllPost", f));
    Array.from(truckImageFiles ?? []).forEach(f => fd.append("files_AllPost", f));
    if (audioFile) fd.append("audio_truck", audioFile);

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/AllPost", {
        method: "POST",
        body: fd,
      });
      const txt = await res.text();
      console.log("POST /api/AllPost ->", res.status, txt);
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
      <h2>一括配信</h2>

      {/* 大型ビジョンファイル選択（日時選択より上） */}
      <div style={{ marginTop: 16 }}>
        <label>
          大型ビジョン用 動画/画像ファイル
          <input
            type="file"
            accept="video/*,image/*"
            multiple
            onChange={e => {
              setTvFiles(e.target.files ?? null);
              setError("");
            }}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          <strong>推奨サイズ：</strong>{TV_W}px × {TV_H}px（横）
        </div>

        {/* 大型ビジョン画像プレビュー */}
        {tvImgPreviews.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>画像プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {tvImgPreviews.map(p => (
                <div key={p.url} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
                  <div
                    style={{
                      width: THUMB_W,
                      height: THUMB_H,
                      borderRadius: 6,
                      background: "#f8f8f8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      margin: "0 auto 6px",
                    }}
                  >
                    <img src={p.url} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {p.width} × {p.height}px
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: p.ok ? "#16a34a" : "#b91c1c" }}>
                    {p.ok ? `OK（${TV_W}×${TV_H}）` : `NG：${TV_W}×${TV_H}を推奨`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 大型ビジョン動画プレビュー */}
        {tvVideoPreviews.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>動画プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {tvVideoPreviews.map(v => (
                <div key={v.url} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
                  <div
                    style={{
                      width: THUMB_W,
                      height: THUMB_H,
                      borderRadius: 6,
                      background: "#000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      margin: "0 auto 6px",
                    }}
                  >
                    <video
                      src={v.url}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{v.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {v.width} × {v.height}px・{fmtDuration(v.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 画像/動画以外 */}
        {tvOtherFiles.length > 0 && (
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
            画像/動画以外の選択：{tvOtherFiles.join(", ")}
          </div>
        )}
      </div>

      {/* サイネージファイル選択 */}
      <div style={{ marginTop: 16 }}>
        <label>
          サイネージ用 動画/画像ファイル
          <input
            type="file"
            accept="video/*,image/*"
            multiple
            onChange={e => {
              setSignFiles(e.target.files ?? null);
              setError("");
            }}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          <strong>画像サイズ指定：</strong>{SIGN_W}px × {SIGN_H}px（縦）
        </div>

        {/* サイネージ画像プレビュー */}
        {signImgPreviews.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>画像プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
              {signImgPreviews.map(p => (
                <div key={p.url} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
                  <div
                    style={{
                      width: THUMB_W,
                      height: THUMB_H,
                      borderRadius: 6,
                      background: "#f8f8f8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      margin: "0 auto 6px",
                    }}
                  >
                    <img src={p.url} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {p.width} × {p.height}px
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: p.ok ? "#16a34a" : "#b91c1c" }}>
                    {p.ok ? `OK（${SIGN_W}×${SIGN_H}）` : `NG：${SIGN_W}×${SIGN_H}にしてください`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* サイネージ動画プレビュー */}
        {signVideoPreviews.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>動画プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {signVideoPreviews.map(v => (
                <div key={v.url} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
                  <div
                    style={{
                      width: THUMB_W,
                      height: THUMB_H,
                      borderRadius: 6,
                      background: "#000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      margin: "0 auto 6px",
                    }}
                  >
                    <video
                      src={v.url}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{v.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {v.width} × {v.height}px・{fmtDuration(v.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* それ以外のファイル */}
        {signOtherFiles.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            画像/動画以外の選択：{signOtherFiles.join(", ")}
          </div>
        )}
      </div>

      {/* アドトラック　テンプレ選択 */}
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

      {/* アドトラック　素材アップロード */}
      <h3 style={{ marginTop: 20 }}>アップロード</h3>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {/* アドトラック　画像（複数・動画不可） */}
        <label>
          アドトラック用 画像ファイル（複数可・推奨サイズ {TRUCK_W}×{TRUCK_H} ・形式：jpg/jpeg/png/webp）
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={e => { setTruckImageFiles(e.target.files ?? null); setError(""); }}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>

        {truckImgPreviews.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>画像プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
              {truckImgPreviews.map((p, idx) => (
                <div key={p.url} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, background: "#fff" }}>
                  <div
                    style={{
                      width: THUMB_W, height: THUMB_H, borderRadius: 6, background: "#f8f8f8",
                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: "0 auto 6px",
                      outline: idx === truckActiveImgIndex ? "2px solid #2563eb" : "none", cursor: "pointer"
                    }}
                    title="クリックでこの画像をプレビュー"
                    onClick={() => setTruckActiveImgIndex(idx)}
                  >
                    <img src={p.url} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{p.width} × {p.height}px</div>
                  {!p.typeOk && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>NG形式（jpg/png/webpのみ）</div>}
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: p.ok ? "#16a34a" : "#b91c1c" }}>
                    {p.ok ? `OK（${TRUCK_W}×${TRUCK_H}）` : `NG：${TRUCK_W}×${TRUCK_H}を推奨`}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setTruckActiveImgIndex(i => Math.max(0, i - 1))} disabled={truckActiveImgIndex <= 0}>◀︎ 前の画像</button>
              <button onClick={() => setTruckActiveImgIndex(i => Math.min(truckImgPreviews.length - 1, i + 1))} disabled={truckActiveImgIndex >= truckImgPreviews.length - 1}>次の画像 ▶︎</button>
            </div>
          </div>
        )}

        {/* アドトラック　音声（単一・任意） */}
        <label>
          アドトラック用 音声ファイル（1つまで・任意）
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

      {/* アドトラック　テキスト入力（テンプレに応じて生成） */}
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

      {/* アドトラック　ライブプレビュー（890×330 の比率で拡縮） */}
      <h3 style={{ marginTop: 24 }}>プレビュー</h3>
      <div
        style={{
          width: "100%", maxWidth: 890, aspectRatio: "890 / 330",
          position: "relative", border: "1px solid #ddd", borderRadius: 12, overflow: "hidden",
          background: currentTpl.background.type === "image" ? undefined : "#000",
        }}
      >
        {/* アドトラック　背景画像 */}
        {currentTpl.background.type === "image" && (
          <img
            src={currentTpl.background.value}
            alt="背景"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}

        {/* アドトラック　画像枠：アップロード画像を1枚だけ表示（手動切替対応） */}
        {truckActiveImgUrl && (
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
              src={truckActiveImgUrl}
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

        {/* アドトラック　テキスト枠 */}
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

      {/* 週ナビ */}
      <h3 style={{ marginTop: 24 }}>配信スケジュール（週表示）</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button onClick={goPrevWeek}>◀︎ 前の週</button>
        <button onClick={goThisWeek}>今週</button>
        <button onClick={goNextWeek}>次の週 ▶︎</button>
        <div style={{ marginLeft: 8, opacity: 0.8 }}>
          週の開始日：{fmtMonthDay.format(startOfWeek(anchorDate, mondayStart))}
        </div>
        {bookedLoading && <div style={{ marginLeft: 12, fontSize: 12, opacity: 0.8 }}>予約状況を取得中…</div>}
        {bookedError && <div style={{ marginLeft: 12, fontSize: 12, color: "#b91c1c" }}>{bookedError}</div>}
      </div>

      {/* 週グリッド（ドラッグ対応） */}
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
