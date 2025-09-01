// src/pages/admin/Unauthorized.tsx
import { useEffect, useMemo, useState } from "react";

/** ====== 型 ====== */
type OverlayValues = Record<string, string>;
type Submission = {
  id: number | string;
  companyName: string;
  imageUrl: string;
  images?: string[];
  submittedAt: string;
  submitterId?: number | string;
  schedule?: Record<string, string[]>;
  message?: string;
  caption?: string;
  lines?: string[];
  textColor?: string;
  overlay?: { values?: OverlayValues };
};

/** ====== 定数・APIユーティリティ ====== */
const API_ROOT =
  (import.meta as any)?.env?.VITE_API_ROOT ?? "http://localhost:8000";
const TOKEN_KEY = "token" as const;

// HeadersInit だと DOM lib が無い環境で型エラーになることがあるので Record に
const authHeaders = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    signal,
    headers: { ...authHeaders() },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** ====== ユーティリティ ====== */
const fmtJP = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function ensureAbsUrl(u?: string) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${API_ROOT}${u}`;
  return `${API_ROOT.replace(/\/$/, "")}/${u}`;
}

function normalizeImages(item: Submission): Submission {
  const images = (item.images ?? [])
    .filter(Boolean)
    .map((x) => ensureAbsUrl(x)!);
  const imageUrl = ensureAbsUrl(item.imageUrl) || images[0] || "";
  return { ...item, images, imageUrl };
}

function flattenSchedule(
  schedule?: Record<string, string[]>
): { label: string; sortKey: number }[] {
  if (!schedule) return [];
  const out: { label: string; sortKey: number }[] = [];
  for (const [d, arr] of Object.entries(schedule)) {
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      const dtStr = `${d}T${t}:00+09:00`; // JST として解釈
      const ts = new Date(dtStr).getTime();
      const mm = new Date(d).getMonth() + 1;
      const dd = new Date(d).getDate();
      out.push({ label: `${mm}/${dd} ${t}`, sortKey: ts });
    }
  }
  return out.sort((a, b) => a.sortKey - b.sortKey);
}

function extractTexts(it: Submission): string[] {
  const vals: string[] = [];
  const v = it.overlay?.values || {};
  const keys = ["title", "subtitle", "body", "footer"];
  keys.forEach((k) => {
    const s = (v[k] ?? "").trim();
    if (s) vals.push(s);
  });
  if (vals.length === 0) {
    if (it.message) vals.push(it.message);
    if (it.caption) vals.push(it.caption);
    if (it.lines && it.lines.length) vals.push(...it.lines);
  }
  return vals
    .flatMap((x) => String(x ?? "").split(/\r?\n/))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** ====== SmartArt風カード ====== */
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
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          background: "#f3f4f6",
        }}
      >
        {first ? (
          <img
            src={first}
            alt="thumbnail"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
            draggable={false}
          />
        ) : null}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {item.companyName || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            申請: {fmtJP.format(new Date(item.submittedAt))}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
            ユーザーID: {item.submitterId ?? "—"}
          </div>
        </div>

        {texts.length > 0 && (
          <div
            style={{
              marginTop: 6,
              color: item.textColor || "#111827",
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
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
              <span
                key={i}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  fontSize: 12,
                  background: "#f9fafb",
                }}
              >
                {c.label}
              </span>
            ))
          )}
        </div>

        {item.images && item.images.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {item.images.slice(1, 8).map((u, i) => (
              <img
                key={i}
                src={u}
                alt={`thumb-${i}`}
                style={{
                  width: 56,
                  height: 56,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                }}
                loading="lazy"
                draggable={false}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** ====== ページ本体（非認証一覧） ====== */
function UnauthorizedPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 任意：検索・並び替え（必要なければ消してOK）
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old">("new");

  // 初回ロード
  useEffect(() => {
    const c = new AbortController();
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const list = await apiGet<Submission[]>(
          "/api/admin/review/queue?status=rejected",
          c.signal
        );
        setItems((list ?? []).map(normalizeImages));
      } catch (e: any) {
        setErr(e?.message || "ロードに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
    return () => c.abort();
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = items;
    if (kw) {
      arr = arr.filter((it) => {
        const texts = extractTexts(it).join("\n").toLowerCase();
        return (
          String(it.submitterId ?? "").toLowerCase().includes(kw) ||
          (it.companyName ?? "").toLowerCase().includes(kw) ||
          texts.includes(kw)
        );
      });
    }
    return [...arr].sort((a, b) => {
      const ta = new Date(a.submittedAt).getTime();
      const tb = new Date(b.submittedAt).getTime();
      return sort === "new" ? tb - ta : ta - tb;
    });
  }, [items, q, sort]);

  const total = filtered.length;

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16 }}>
      <h2 style={{ margin: "8px 0 12px" }}>
        非認証一覧（{total}
        {loading ? " 読み込み中…" : ""}）
      </h2>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        非認証（拒否）となった申請を、過去分まで一覧表示します。
      </div>

      {/* 検索＆並び替え（不要ならこのブロックごと削除OK） */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ユーザーID／会社名／文言で検索"
          style={{
            width: 260,
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
          }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "new" | "old")}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
            background: "#fff",
          }}
          title="並び替え"
        >
          <option value="new">新しい順</option>
          <option value="old">古い順</option>
        </select>
      </div>

      {err && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "#fef2f2",
            color: "#991b1b",
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      )}

      {total === 0 ? (
        <div
          style={{
            padding: 16,
            color: "#6b7280",
            background: "#fafafa",
            borderRadius: 8,
          }}
        >
          データがありません。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((it) => (
            <SmartArtItem key={String(it.id)} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

export default UnauthorizedPage;
