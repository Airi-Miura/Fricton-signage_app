import { useEffect, useState } from "react";

/** ====== API & 型（Authenticated.tsx と同じ） ====== */
type OverlayValues = Record<string, string>;
type Submission = {
  id: number | string;
  companyName: string;
  imageUrl: string;
  images?: string[];
  title?: string;
  submittedAt: string;
  submitterId?: number | string;
  schedule?: Record<string, string[]>;
  message?: string;
  caption?: string;
  lines?: string[];
  textColor?: string;
  overlay?: { values?: OverlayValues };
};

const API_ROOT = (import.meta as any)?.env?.VITE_API_ROOT ?? "http://localhost:8000";
const TOKEN_KEY = "token";
const authHeaders = (): HeadersInit => {
  const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, { signal, headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const fmtJP = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
function flattenSchedule(schedule?: Record<string, string[]>): { label: string; sortKey: string }[] {
  if (!schedule) return [];
  const out: { label: string; sortKey: string }[] = [];
  for (const [d, arr] of Object.entries(schedule)) {
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      const dt = `${d} ${t}`;
      const date = new Date(`${d}T${t}:00Z`);
      const mm = new Date(d).getMonth() + 1;
      const dd = new Date(d).getDate();
      out.push({ label: `${mm}/${dd} ${t}`, sortKey: `${date.getTime()}_${dt}` });
    }
  }
  return out.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
}
function extractTexts(it: Submission): string[] {
  const vals: string[] = [];
  const v = it.overlay?.values || {};
  const keys = ["title", "subtitle", "body", "footer"];
  keys.forEach(k => {
    const s = (v[k] ?? "").trim();
    if (s) vals.push(s);
  });
  if (vals.length === 0) {
    if (it.title) vals.push(it.title);
    if (it.message) vals.push(it.message);
    if (it.caption) vals.push(it.caption);
    if (it.lines && it.lines.length) vals.push(...it.lines);
  }
  return vals
    .flatMap(x => String(x).split(/\r?\n/))
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** ====== SmartArt風カード（同じ） ====== */
function SmartArtItem({ item }: { item: Submission }) {
  const texts = extractTexts(item);
  const chips = flattenSchedule(item.schedule);
  const first = item.images?.[0] || item.imageUrl;

  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "96px 1fr",
        gap: 12,
        border: "1px solid #e5e7eb",
        padding: 12,
        borderRadius: 12,
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ width: 96, height: 96, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <img src={first} alt={item.title ?? "image"} style={{ width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{item.companyName || item.title || "—"}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>申請: {fmtJP.format(new Date(item.submittedAt))}</div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
            ユーザーID: {item.submitterId ?? "—"}
          </div>
        </div>

        {texts.length > 0 && (
          <div style={{ marginTop: 6, color: item.textColor || "#111827", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {texts.map((t, i) => (
              <div key={i} style={{ fontWeight: i === 0 ? 700 : 500 }}>
                {t}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {chips.length === 0 ? (
            <span style={{ fontSize: 12, color: "#6b7280" }}>時間: —</span>
          ) : (
            chips.map((c, i) => (
              <span key={i} style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #d1d5db", fontSize: 12, background: "#f9fafb" }}>
                {c.label}
              </span>
            ))
          )}
        </div>

        {item.images && item.images.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {item.images.slice(1, 8).map((u, i) => (
              <img key={i} src={u} alt={`thumb-${i}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} draggable={false} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** ====== ページ本体（非認証） ====== */
export default function UnauthorizedPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const c = new AbortController();
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const list = await apiGet<Submission[]>("/api/admin/review/queue?status=rejected", c.signal);
        setItems(list || []);
      } catch (e: any) {
        setErr(e?.message || "ロードに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
    return () => c.abort();
  }, []);

  const total = items.length;

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16 }}>
      <h2 style={{ margin: "8px 0 12px" }}>非認証一覧（{total}{loading ? " 読み込み中…" : ""}）</h2>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        非認証（拒否）となった申請を、過去分まで一覧表示します。
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
          {err}
        </div>
      )}

      {total === 0 ? (
        <div style={{ padding: 16, color: "#6b7280", background: "#fafafa", borderRadius: 8 }}>データがありません。</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((it) => (
            <SmartArtItem key={String(it.id)} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}
