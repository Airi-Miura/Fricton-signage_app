import { useEffect, useMemo, useState } from "react";

// ★このページが対象とする物理（ページごとに差し替え）
const KIND = "アドトラック"; 

const API_ROOT = "http://localhost:8000";
const BOOKED_API = `${API_ROOT}/api/truck/booked`;

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

export default function TruckPage_R() {
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // 予約済みスロット集合（"YYYY-MM-DD_HH:MM"）
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // 週が変わったら当該週の予約を取得（グレーアウト用）
  useEffect(() => {
    const start = startOfWeek(anchorDate, false);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const qs = new URLSearchParams({
      start: toISODate(start),
      end: toISODate(end),
      kind: "トラック",
    });

    const ctrl = new AbortController();
    setLoading(true);
    setLoadErr(null);

    fetch(`${BOOKED_API}?${qs.toString()}`, { signal: ctrl.signal })
      .then(async r => {
        const t = await r.text();
        if (!r.ok) throw new Error(t || `HTTP ${r.status}`);
        const json: Record<string, string[]> = t ? JSON.parse(t) : {};
        const s = new Set<string>();
        Object.entries(json).forEach(([d, arr]) => (arr || []).forEach(time => s.add(`${d}_${time}`)));
        setBooked(s);
      })
      .catch(err => {
        if ((err as any).name === "AbortError") return;
        console.error(err);
        setLoadErr("予約状況の取得に失敗しました");
        setBooked(new Set()); // フォールバック：全て未予約扱い
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [anchorDate]);

  // 週の計算
  const mondayStart = false;
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate, mondayStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchorDate, mondayStart]);

  const dayISO = useMemo(() => weekDays.map(toISODate), [weekDays]);

  const fmtWeekday = useMemo(() => new Intl.DateTimeFormat("ja-JP", { weekday: "short" }), []);
  const fmtMonthDay = useMemo(
    () => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }),
    []
  );
  const slots = useMemo(() => createTimeSlots(30, 8, 22), []);

  // 週移動
  const goPrevWeek = () => setAnchorDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  const goNextWeek = () => setAnchorDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  const goThisWeek = () => { const d = new Date(); d.setHours(0,0,0,0); setAnchorDate(d); };

  return (
    <div style={{ maxWidth: 1000, margin: "24px auto", padding: 16 }}>
      <h2>配信スケジュール（{KIND}）</h2>

      {/* 週ナビ */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button onClick={goPrevWeek}>◀︎ 前の週</button>
        <button onClick={goThisWeek}>今週</button>
        <button onClick={goNextWeek}>次の週 ▶︎</button>
        <div style={{ marginLeft: 8, opacity: 0.8 }}>
          週の開始日：{fmtMonthDay.format(startOfWeek(anchorDate, mondayStart))}
        </div>
        {loading && <div style={{ marginLeft: 12, fontSize: 12, opacity: 0.8 }}>取得中…</div>}
        {loadErr && <div style={{ marginLeft: 12, fontSize: 12, color: "#b91c1c" }}>{loadErr}</div>}
      </div>

      {/* 週グリッド（グレーアウトのみ） */}
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
        {slots.map((t) => (
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

            {/* 7列のスロット：予約のみグレー */}
            {weekDays.map((_, dIdx) => {
              const key = `${dayISO[dIdx]}_${t}`;
              const reserved = booked.has(key);
              return (
                <div
                  key={key}
                  // クリック挙動・詳細取得を廃止（デコイ）
                  title={reserved ? "予約あり" : ""}
                  style={{
                    borderRight: "1px solid #eee",
                    borderBottom: "1px solid #eee",
                    padding: "0",
                    cursor: "default",
                    background: reserved ? "#eee" : "white",
                    minHeight: 32,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
