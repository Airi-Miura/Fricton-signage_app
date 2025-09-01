// src/pages/wizard/TruckPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog";

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

// 入力が空の時に表示＆送信時に補完する既定文言
const PLACEHOLDER = "ここに文字を入力してください";

// スマホ週ビュー用（Googleカレンダー風）
const MOBILE_TIME_COL_W = 44;   // 左の時間欄の幅(px)
const MOBILE_CELL_MIN_H = 28;   // 各スロットの最小高さ(px)

// 最大行数に収める（改行ベース）
function limitLines(text: string, maxLines = 2) {
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n");
}

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
    background: { type: "image", value: "/fricton-verA.png" },
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
    background: { type: "image", value: "/fricton-verB.png" },
    imageBox: { x: 0, y: 0, w: 100, h: 100, mode: "cover" },
    textBoxes: [
      { key: "title", label: "タイトル", x: 5, y: 20, w: 85, h: 30, align: "left", valign: "top", color: "#ffffff", fontSize: 36, weight: 700, lines: 2, required: true },
      { key: "footer", label: "フッター", x: 5, y: 70, w: 85, h: 20, align: "center", valign: "top", color: "#cbd5e1", fontSize: 18, weight: 400, lines: 1 }
    ]
  },
  {
    id: "two-columns",
    name: "タイトル（左上）、サブタイトル（左上）、フッター（右下）",
    background: { type: "image", value: "/fricton-verC.png" },
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

// ======= 文字色パレット（Word風・簡易版） =======
const THEME_ROWS: string[][] = [
  // 濃→薄を並べた行×数列
  ["#000000", "#1f2937", "#374151", "#4b5563", "#6b7280", "#94a3b8", "#cbd5e1", "#e5e7eb", "#f3f4f6", "#ffffff"],
  ["#0ea5e9", "#0284c7", "#0369a1", "#075985", "#e0f2fe", "#bae6fd", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"],
  ["#22c55e", "#16a34a", "#15803d", "#166534", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#34d399", "#059669"],
  ["#f59e0b", "#d97706", "#b45309", "#92400e", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c"],
  ["#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626"],
  ["#a855f7", "#9333ea", "#7e22ce", "#6b21a8", "#faf5ff", "#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7"],
];

const STANDARD_ROW: string[] = ["#ffffff","#000000","#808080","#ff0000","#ffa500","#ffff00","#9acd32","#00bfff","#1e90ff","#0000cd","#4b0082","#8b00ff"];

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
  const fmtHm = useMemo(() => new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }), []);
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

  // ====== スマホ対応：ブレークポイント（<=768px をモバイル） ======
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

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

  // ★ 文字色（各テキスト枠ごと）
  const [textColors, setTextColors] = useState<Record<string, string>>({});
  useEffect(() => {
    setTextColors(prev => {
      const next = { ...prev };
      currentTpl.textBoxes.forEach(tb => {
        if (!(tb.key in next)) next[tb.key] = tb.color ?? "#ffffff";
      });
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
      setActiveImgIndex(i => Math.min(Math.max(0, i - (idx <= i ? 1 : 0)), Math.max(0, next.length - 1)));
      return next;
    });
  };

  // --- ドラッグ選択ハンドラ（マウス）---
  const finalizeSelection = () => {
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

  useEffect(() => {
    const handleUp = () => { if (isDragging) finalizeSelection(); };
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
    setImgPreviews(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
    setOtherFiles([]);

    if (!imageFiles || imageFiles.length === 0) return;

    const imgs: ImgPreview[] = [];
    const others: string[] = [];
    const tasks: Promise<void>[] = [];

    imageFiles.forEach(file => {
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
      setImgPreviews(imgs);
      setOtherFiles(others);
    });

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

  // ====== contentEditable: 非制御化のための参照＆スタイル ======
  const editableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // テキスト枠の CSS
  const textBoxStyle = (tb: TextBox, focused: boolean): React.CSSProperties => {
    const justifyContent = tb.valign === "middle" ? "center" : tb.valign === "bottom" ? "flex-end" : "flex-start";
    const alignItems = tb.align === "center" ? "center" : tb.align === "right" ? "flex-end" : "flex-start";
    return {
      position: "absolute",
      left: `${tb.x}%`, top: `${tb.y}%`, width: `${tb.w}%`, height: `${tb.h}%`,
      display: "flex", justifyContent, alignItems, padding: isMobile ? 6 : 8,
      fontWeight: tb.weight ?? 600, lineHeight: 1.2, textAlign: tb.align ?? "left",
      overflow: "hidden", wordBreak: "break-word", pointerEvents: "auto",
      outline: focused ? "2px solid #2563eb" : "none",
      borderRadius: 8,
    };
  };

  // テンプレ切替時にDOMへ初期同期
  useEffect(() => {
    currentTpl.textBoxes.forEach(tb => {
      const el = editableRefs.current[tb.key];
      if (!el) return;
      const v = (textValues[tb.key] ?? "").replace(/\r/g, "");
      if (v) el.innerText = v;
      else el.innerHTML = ""; // 空＝placeholder表示
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTpl.id]);

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

  // --- モバイル週グリッド用タッチ選択 ---
  const handleTouchStartGrid =
    (dayIdx: number, slotIdx: number, key: string, disabled: boolean) =>
    (e: React.TouchEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ day: dayIdx, slot: slotIdx });
      setDragMode(pickedSlots.has(key) ? "deselect" : "select");
      setDragPreview(new Set([key]));
    };

  const handleTouchMoveGrid = (e: React.TouchEvent) => {
    if (!isDragging || !dragStart) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    if (!el) return;
    const dAttr = el.getAttribute("data-didx");
    const sAttr = el.getAttribute("data-sidx");
    if (dAttr === null || sAttr === null) return;

    const dIdx = Number(dAttr);
    const sIdx = Number(sAttr);

    const minD = Math.min(dragStart.day, dIdx);
    const maxD = Math.max(dragStart.day, dIdx);
    const minS = Math.min(dragStart.slot, sIdx);
    const maxS = Math.max(dragStart.slot, sIdx);

    const set = new Set<string>();
    for (let d = minD; d <= maxD; d++) {
      for (let s = minS; s <= maxS; s++) {
        const k = `${dayISO[d]}_${slots[s]}`;
        if (!booked.has(k)) set.add(k);
      }
    }
    setDragPreview(set);
    e.preventDefault();
  };

  const handleTouchEndGrid = () => { if (isDragging) finalizeSelection(); };

  // ===== 送信前ダイアログ制御 =====
  const [confirmOpen, setConfirmOpen] = useState(false);

  // バリデーション
  function validateForSubmit(): string | null {
    if (pickedSlots.size === 0) return "配信時間帯を1つ以上選択してください";
    if (!imageFiles || imageFiles.length === 0) return "画像ファイルを1枚以上アップロードしてください";
    const badType = imageFiles.find(f => !ALLOWED_IMAGE_TYPES.includes(f.type) && !/\.(jpe?g|png|webp)$/i.test(f.name));
    if (badType) return "画像は jpg/jpeg/png/webp のみアップロード可能です";
    if (maxImages > 0 && imgPreviews.length > maxImages) return `選択した画像が上限（最大 ${maxImages} 枚）を超えています。予約時間を延長するか、画像枚数を減らしてください。`;
    const conflicts = Array.from(pickedSlots).filter(k => booked.has(k));
    if (conflicts.length > 0) return "既に予約済みの時間帯が含まれています。別の時間を選んでください。";
    return null;
  }

  // 「確認へ」クリック
  function onClickConfirm() {
    setError("");
    const err = validateForSubmit();
    if (err) { setError(err); return; }
    setConfirmOpen(true);
  }

  // 確認ダイアログ用：日程テキスト
  const datetimeTextForDialog = useMemo(() => {
    if (pickedSlots.size === 0) return "（未選択）";
    const map: Record<string, string[]> = {};
    Array.from(pickedSlots).forEach(k => {
      const [d, t] = k.split("_");
      (map[d] ??= []).push(t);
    });
    const dates = Object.keys(map).sort();
    if (dates.length === 1) {
      const d = dates[0];
      const times = map[d].sort();
      const first = times[0];
      const last = times[times.length - 1];
      const [lh, lm] = last.split(":").map(Number);
      const end = new Date(d + "T00:00:00");
      end.setHours(lh, lm + 30, 0, 0);
      return `${fmtMonthDay.format(new Date(d))} ${first} ~ ${fmtHm.format(end)}`;
    }
    return `${dates.length}日（${pickedSlots.size}枠）`;
  }, [pickedSlots, fmtMonthDay, fmtHm]);

  // --- 実送信 ---
  async function doSend() {
    setError("");
    setLoading(true);
    try {
      // 未入力の必須枠はデフォルト文言で補完
      const effectiveText: Record<string, string> = {};
      currentTpl.textBoxes.forEach(tb => {
        const dom = editableRefs.current[tb.key];
        const raw = (dom?.innerText || textValues[tb.key] || "").replace(/\r/g, "");
        const limited = limitLines(raw, tb.lines ?? 2).trim();
        effectiveText[tb.key] = tb.required && !limited ? PLACEHOLDER : limited;
      });

      // スケジュールを日付ごとにまとめる
      const byDate: Record<string, string[]> = {};
      Array.from(pickedSlots).forEach(k => {
        const [d, t] = k.split("_");
        (byDate[d] ??= []).push(t);
      });

      const fd = new FormData();
      fd.append("kind", KIND);
      fd.append("tpl_id", tplId);
      fd.append("text_values", JSON.stringify(effectiveText));
      fd.append("schedule", JSON.stringify(byDate));
      imageFiles.forEach(f => fd.append("files_trucks", f));
      if (audioFile) fd.append("audio", audioFile);

      const token = localStorage.getItem("token") ?? "";

      const res = await fetch(`${API_ROOT}/api/trucks`, {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

      // 送信成功時のアラート
      alert(
        "申請を受け付けました。\n" +
        "確認メールを info@fricton.com から送信しました。\n" +
        "届かない場合は迷惑メールをご確認ください。\n\n" +
        "認証・非認証の判定には3営業日ほどお時間をいただきます。\n" +
        "結果はメールでお知らせいたします。"
      );

      setAnchorDate(d => new Date(d));
      setPickedSlots(new Set());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "送信に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  // ===== 文字色 UI（ポップオーバー） =====
  const [colorOpen, setColorOpen] = useState(false);
  const currentFocusColor = focusedKey ? (textColors[focusedKey] ?? (currentTpl.textBoxes.find(t => t.key === focusedKey)?.color ?? "#ffffff")) : "#ffffff";
  const applyColor = (hex: string) => {
    if (!focusedKey) return;
    setTextColors(prev => ({ ...prev, [focusedKey]: hex }));
  };
  const resetColor = () => {
    if (!focusedKey) return;
    const def = currentTpl.textBoxes.find(t => t.key === focusedKey)?.color ?? "#ffffff";
    setTextColors(prev => ({ ...prev, [focusedKey]: def }));
  };

  return (
    <div style={{ maxWidth: isMobile ? 600 : 1000, margin: "24px auto", padding: isMobile ? 12 : 16 }}>
      <style>{`
        .ce[contenteditable][data-placeholder]:empty::before{
          content: attr(data-placeholder);
          color: #cbd5e1;
          pointer-events: none;
          white-space: pre-wrap;
        }
      `}</style>

      {/* 0) テンプレ選択 */}
      <h3 style={{ marginTop: 8 }}>テンプレートを選択</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
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

        {imgPreviews.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>画像プレビュー</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                合計 {imgPreviews.length} 枚{reservedMinutes > 0 ? ` / 上限 ${maxImages} 枚` : ""}
              </div>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => appendInputRef.current?.click()}>ファイルを追加</button>
              <button
                type="button"
                onClick={() => setImageFiles([])}
                style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px" }}
              >
                すべて削除
              </button>
            </div>

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
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {imgPreviews.map((p, idx) => (
                <div
                  key={p.url}
                  data-idx={idx}
                  style={{
                    position: "relative",
                    flex: isMobile ? "0 0 180px" : "0 0 220px",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 8,
                    background: "#fff",
                    scrollSnapAlign: "center",
                  }}
                >
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
                      width: isMobile ? Math.round(THUMB_W * 0.85) : THUMB_W,
                      height: isMobile ? Math.round(THUMB_H * 0.85) : THUMB_H,
                      borderRadius: 6, background: "#f8f8f8",
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

      {/* 3) ライブプレビュー（ズームなし・常に全体表示） */}
      <h3 style={{ marginTop: 24 }}>プレビュー</h3>

      <div
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : 1000,
          aspectRatio: "890 / 330",
          position: "relative",
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
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

        {/* 文字色ボタン（右上固定） */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1000,
            display: "flex",
            gap: 8,
            alignItems: "center",
            pointerEvents: "auto",
          }}
          onMouseDown={(e) => { e.stopPropagation(); /* フォーカスを奪わない */ }}
        >
          <button
            type="button"
            onMouseDown={(e)=>e.preventDefault()}
            onClick={() => setColorOpen(o => !o)}
            title="文字色"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,.9)",
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 10,
              cursor: "pointer"
            }}
          >
            <span style={{ fontWeight: 700 }}>A</span>
            <span style={{ width: 18, height: 12, background: currentFocusColor, borderRadius: 3, border: "1px solid #00000022", display: "inline-block" }} />
          </button>
          <button
            type="button"
            onMouseDown={(e)=>e.preventDefault()}
            onClick={resetColor}
            title="リセット（テンプレ既定色）"
            style={{
              background: "rgba(255,255,255,.9)",
              border: "1px solid #e5e7eb",
              padding: "6px 10px",
              borderRadius: 10,
              cursor: "pointer"
            }}
          >
            リセット
          </button>
        </div>

        {/* パレット（ポップオーバー） */}
        {colorOpen && (
          <div
            style={{
              position: "absolute",
              top: 48,
              right: 8,
              zIndex: 1000,
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 30px rgba(0,0,0,.15)",
              padding: 10,
              width: isMobile ? 280 : 360,
              pointerEvents: "auto"
            }}
            onMouseDown={(e)=>e.preventDefault()}
          >
            <div style={{ fontSize: 12, fontWeight: 700, margin: "4px 4px 6px" }}>テーマの色</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 6 }}>
              {THEME_ROWS.flat().map((hex, i) => (
                <button
                  key={`t-${i}-${hex}`}
                  onMouseDown={(e)=>e.preventDefault()}
                  onClick={() => applyColor(hex)}
                  title={hex}
                  style={{
                    width: 24, height: 24, borderRadius: 4, border: "1px solid #e5e7eb",
                    background: hex, cursor: "pointer"
                  }}
                />
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 4px 6px" }}>標準の色</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
              {STANDARD_ROW.map((hex, i) => (
                <button
                  key={`s-${i}-${hex}`}
                  onMouseDown={(e)=>e.preventDefault()}
                  onClick={() => applyColor(hex)}
                  title={hex}
                  style={{
                    width: 24, height: 24, borderRadius: 12, border: "1px solid #e5e7eb",
                    background: hex, cursor: "pointer"
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 画像枠 */}
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

        {/* テキスト枠（直接編集） */}
        {currentTpl.textBoxes.map(tb => {
          const maxLines = tb.lines ?? 2;
          const colorToUse = textColors[tb.key] ?? tb.color ?? "#fff";
          return (
            <div
              key={tb.key}
              style={textBoxStyle(tb, focusedKey === tb.key)}
              onClick={() => setFocusedKey(tb.key)}
            >
              <div
                ref={(el) => { editableRefs.current[tb.key] = el; }}
                className="ce"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label={`${tb.label} を入力`}
                data-placeholder={PLACEHOLDER}
                onFocus={() => setFocusedKey(tb.key)}
                onBlur={(e) => {
                  setFocusedKey(k => (k === tb.key ? null : k));
                  const el = e.currentTarget as HTMLDivElement;
                  const text = (el.innerText || "").replace(/\r/g, "");
                  const limited = limitLines(text, maxLines).trim();
                  if (limited) {
                    if (el.innerText !== limited) el.innerText = limited;
                    setTextValues(prev => ({ ...prev, [tb.key]: limited }));
                  } else {
                    el.innerHTML = "";
                    setTextValues(prev => ({ ...prev, [tb.key]: "" }));
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  const text = (el.innerText || "").replace(/\r/g, "");
                  setTextValues(prev => ({ ...prev, [tb.key]: text }));
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const t = (e.clipboardData || (window as any).clipboardData).getData("text") || "";
                  document.execCommand("insertText", false, t);
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  whiteSpace: "pre-wrap",
                  fontSize: (tb.fontSize ?? (isMobile ? 14 : 16)),
                  color: colorToUse,
                  outline: "none",
                  cursor: "text",
                }}
              />
            </div>
          );
        })}

        {otherFiles.length > 0 && (
          <div style={{ position: "absolute", bottom: 6, left: 6, fontSize: 12, opacity: 0.85, background: "rgba(255,255,255,.7)", borderRadius: 4, padding: "2px 6px" }}>
            画像/動画以外の選択：{otherFiles.join(", ")}
          </div>
        )}
      </div>

      {/* 4) 配信スケジュール（週グリッド） */}
      <h3 style={{ marginTop: 24 }}>配信スケジュール</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <button onClick={goPrevWeek} disabled={loading}>◀︎ 前の週</button>
        <button onClick={goThisWeek} disabled={loading}>今週</button>
        <button onClick={goNextWeek} disabled={loading}>次の週 ▶︎</button>
        <div style={{ marginLeft: 8, opacity: 0.8 }}>
          週の開始日：{fmtMonthDay.format(startOfWeek(anchorDate, mondayStart))}
        </div>
        {bookedLoading && <div style={{ marginLeft: 12, fontSize: 12, opacity: 0.8 }}>予約状況を取得中…</div>}
        {bookedError && <div style={{ marginLeft: 12, fontSize: 12, color: "#b91c1c" }}>{bookedError}</div>}
      </div>

      {isMobile ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${MOBILE_TIME_COL_W}px repeat(7, 1fr)`,
            borderTop: "1px solid #ddd",
            borderLeft: "1px solid #ddd",
            maxHeight: "70vh",
            overflow: "auto",
            borderRadius: 8,
            userSelect: "none",
            WebkitOverflowScrolling: 'touch',
          }}
          onTouchMove={handleTouchMoveGrid}
          onTouchEnd={handleTouchEndGrid}
        >
          <div style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, borderRight: "1px solid #ddd", borderBottom: "1px solid #ddd" }} />
          {weekDays.map((d, i) => (
            <div
              key={`mh-${i}`}
              style={{
                position: "sticky",
                top: 0,
                background: "#fff",
                zIndex: 1,
                borderRight: "1px solid #ddd",
                borderBottom: "1px solid #ddd",
                padding: "4px 4px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              {fmtWeekday.format(d)}（{fmtMonthDay.format(d)}）
            </div>
          ))}

          {slots.map((t, sIdx) => (
            <div key={`mrow-${t}`} style={{ display: "contents" }}>
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  borderRight: "1px solid " + "#eee",
                  borderBottom: "1px solid " + "#eee",
                  padding: "6px 4px",
                  fontVariantNumeric: "tabular-nums",
                  background: "#fafafa",
                  fontSize: 11,
                }}
              >
                {t}
              </div>

              {weekDays.map((_, dIdx) => {
                const key = `${dayISO[dIdx]}_${t}`;
                const disabled = booked.has(key);
                const picked = pickedSlots.has(key);
                const preview = dragPreview.has(key);
                return (
                  <div
                    key={key}
                    data-didx={dIdx}
                    data-sidx={sIdx}
                    onTouchStart={handleTouchStartGrid(dIdx, sIdx, key, disabled)}
                    onClick={() => toggleSlot(key, disabled)}
                    title={disabled ? "予約済み" : key.replace("_", " ")}
                    style={{
                      borderRight: "1px solid #eee",
                      borderBottom: "1px solid #eee",
                      padding: "6px 2px",
                      cursor: disabled ? "not-allowed" : "pointer",
                      background: disabled ? "#eee" : picked ? "#e7f7ec" : preview ? "#e8f1ff" : "white",
                      outline: picked ? "2px solid #16a34a" : preview ? "2px solid #3b82f6" : "none",
                      outlineOffset: "-1px",
                      minHeight: MOBILE_CELL_MIN_H,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
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

          {slots.map((t, sIdx) => (
            <div key={`row-${t}`} style={{ display: "contents" }}>
              <div
                style={{
                  borderRight: "1px solid " + "#eee",
                  borderBottom: "1px solid " + "#eee",
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
      )}

      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}

      {/* 送信ボタン */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => nav(-1)} disabled={loading}>戻る</button>
        <button onClick={onClickConfirm} disabled={loading}>
          {loading ? "送信中…" : "確認へ"}
        </button>
        {loading && <span style={{ fontSize: 12, opacity: 0.8 }}>送信中です…</span>}
      </div>

      {/* 送信前の確認ダイアログ */}
      <ConfirmDialog
        open={confirmOpen}
        summary={{
          imagesCount: imageFiles.length,
          audioCount: audioFile ? 1 : 0,
          datetimeText: datetimeTextForDialog,
        }}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSend}
        confirming={loading}
      />
    </div>
  );
}
