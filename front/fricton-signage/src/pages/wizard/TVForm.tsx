// src/pages/wizard/TVForm.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// ===== APIエンドポイント =====
const API_ROOT = "http://localhost:8000";
const BOOKED_API = `${API_ROOT}/api/signage/booked`; // kind=大型ビジョン で予約を取得

// 推奨サイズ（画像：横）
const REQUIRED_W = 800;
const REQUIRED_H = 500;
// サムネイル枠（推奨サイズの1/4）
const THUMB_W = 200;
const THUMB_H = 125;

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

type ImgPreview = { name: string; url: string; width: number; height: number; ok: boolean };
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
  const dayISO = weekDays.map(d => toISODate(d));

  // ===== 予約状況（APIから取得） =====
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
      kind: "大型テレビ",
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

  // ファイル関係
  const [files, setFiles] = useState<FileList | null>(null);
  const [imgPreviews, setImgPreviews] = useState<ImgPreview[]>([]);
  const [videoPreviews, setVideoPreviews] = useState<VideoPreview[]>([]);
  const [otherFiles, setOtherFiles] = useState<string[]>([]);
  const [error, setError] = useState("");

  // 選択スロット（yyyy-mm-dd_HH:MM）
  const [pickedSlots, setPickedSlots] = useState<Set<string>>(new Set());

  // ドラッグ選択
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "deselect" | null>(null);
  const [dragStart, setDragStart] = useState<{ day: number; slot: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<Set<string>>(new Set());

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

  // 画像/動画プレビュー生成
  useEffect(() => {
    // 既存URLを解放
    setImgPreviews(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.url));
      return [];
    });
    setVideoPreviews(prev => {
      prev.forEach(p => URL.revokeObjectURL(p.url));
      return [];
    });
    setOtherFiles([]);

    if (!files || files.length === 0) return;

    const imgs: ImgPreview[] = [];
    const videos: VideoPreview[] = [];
    const others: string[] = [];
    const tasks: Promise<void>[] = [];

    Array.from(files).forEach(file => {
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        tasks.push(
          new Promise<void>(resolve => {
            const img = new Image();
            img.onload = () => {
              const w = img.naturalWidth;
              const h = img.naturalHeight;
              imgs.push({ name: file.name, url, width: w, height: h, ok: w === REQUIRED_W && h === REQUIRED_H });
              resolve();
            };
            img.onerror = () => {
              imgs.push({ name: file.name, url, width: 0, height: 0, ok: false });
              resolve();
            };
            img.src = url;
          })
        );
      } else if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        tasks.push(
          new Promise<void>(resolve => {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.onloadedmetadata = () => {
              videos.push({
                name: file.name,
                url,
                width: v.videoWidth || 0,
                height: v.videoHeight || 0,
                duration: isFinite(v.duration) ? v.duration : 0,
              });
              resolve();
            };
            v.onerror = () => {
              videos.push({ name: file.name, url, width: 0, height: 0, duration: 0 });
              resolve();
            };
            v.src = url;
          })
        );
      } else {
        others.push(file.name);
      }
    });

    Promise.all(tasks).then(() => {
      imgs.sort((a, b) => a.name.localeCompare(b.name));
      videos.sort((a, b) => a.name.localeCompare(b.name));
      setImgPreviews(imgs);
      setVideoPreviews(videos);
      setOtherFiles(others);
    });

    // cleanup
    return () => {
      imgs.forEach(p => URL.revokeObjectURL(p.url));
      videos.forEach(p => URL.revokeObjectURL(p.url));
    };
  }, [files]);

  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pickedSlots.size === 0) {
      setError("配信時間帯を1つ以上選択してください");
      return;
    }
    if (!files || files.length === 0) {
      setError("動画または画像ファイルを選択してください");
      return;
    }
    // 画像サイズチェック（TVは 800×500）
    if (imgPreviews.some(p => !p.ok)) {
      setError("画像サイズは 800px × 500px にしてください（NGの画像があります）");
      return;
    }
    // 予約済みとの重複検出
    const conflicts = Array.from(pickedSlots).filter(k => booked.has(k));
    if (conflicts.length > 0) {
      setError("既に予約済みの時間帯が含まれています。別の時間を選んでください。");
      return;
    }

    // 選択スロットを日付ごとに整形
    const byDate: Record<string, string[]> = {};
    Array.from(pickedSlots).forEach(k => {
      const [d, t] = k.split("_");
      (byDate[d] ??= []).push(t);
    });

    // 画像バイナリ送信のため FormData を使用
    const fd = new FormData();
    fd.append("kind", "大型ビジョン");
    fd.append("schedule", JSON.stringify(byDate));
    Array.from(files ?? []).forEach(f => fd.append("files_tv", f));

    setLoading(true);
    try {
      const res = await fetch(`${API_ROOT}/api/tv`, {
        method: "POST",
        body: fd,
      });

      const txt = await res.text();
      console.log("POST /api/tv ->", res.status, txt);
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
      <h2>大型ビジョン</h2>

      {/* ① ファイル選択（日時選択より上） */}
      <div style={{ marginTop: 16 }}>
        <label>
          動画/画像ファイル
          <input
            type="file"
            accept="video/*,image/*"
            multiple
            onChange={e => {
              setFiles(e.target.files ?? null);
              setError("");
            }}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          <strong>推奨サイズ：</strong>800px × 500px（横）
        </div>

        {/* 画像プレビュー */}
        {imgPreviews.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>画像プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {imgPreviews.map(p => (
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
                    {p.ok ? "OK（800×500）" : "NG：800×500を推奨"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 動画プレビュー */}
        {videoPreviews.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>動画プレビュー</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {videoPreviews.map(v => (
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
        {otherFiles.length > 0 && (
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
            画像/動画以外の選択：{otherFiles.join(", ")}
          </div>
        )}
      </div>

      {/* ② 週表示の日時選択（SignagePage と同様） */}
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
