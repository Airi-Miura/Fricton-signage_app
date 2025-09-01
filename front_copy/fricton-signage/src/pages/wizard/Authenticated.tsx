// src/pages/admin/Authenticated.tsx
import { useEffect, useMemo, useRef, useState } from "react";

/** ====== 型 ====== */
type OverlayValues = Record<string, string>;
type Submission = {
  id: number | string;
  companyName: string;
  imageUrl: string;
  images?: string[];                   // すべての画像URL（任意）
  submittedAt: string;                 // ISO
  submitterId?: number | string;       // だれが
  submitterEmail?: string;             // メール
  schedule?: Record<string, string[]>; // YYYY-MM-DD: [HH:MM, ...]
  message?: string;
  caption?: string;
  lines?: string[];
  textColor?: string;
  overlay?: { values?: OverlayValues }; // テンプレ側の文言（任意）
};

/** ====== 定数・APIユーティリティ ====== */
const API_ROOT =
  (import.meta as any)?.env?.VITE_API_ROOT ?? "http://localhost:8000";
const TOKEN_KEY = "token" as const;
const PAGE_LIMIT = 50;

// DOM依存を避けるため HeadersInit ではなく Record を返す
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
  if (u.startsWith("/")) return `${API_ROOT}${u}`; // /files/... など
  return `${API_ROOT.replace(/\/$/, "")}/${u}`;
}

function normalizeImages(item: Submission): Submission {
  const images = (item.images ?? [])
    .filter(Boolean)
    .map((x) => ensureAbsUrl(x)!);
  const imageUrl = ensureAbsUrl(item.imageUrl) || images[0] || "";
  return { ...item, images, imageUrl };
}

/** --- 送信者ID/メールのキー揺れ吸収 --- */
function coerceSubmitter(raw: any): { submitterId?: string | number; submitterEmail?: string } {
  const submitterId =
    raw.submitterId ??
    raw.user_id ?? raw.userId ?? raw.username ??
    raw.requester_id ?? raw.requesterId ?? raw.requester ??
    raw.user?.id;

  const submitterEmail =
    raw.submitterEmail ??
    raw.requester_email ?? raw.requesterEmail ??
    raw.email ?? raw.user?.email ?? raw.submitter?.email;

  return { submitterId, submitterEmail };
}

/** --- 1件分を完全正規化 --- */
function normalizeSubmission(raw: any): Submission {
  const base = raw as Submission;
  const { submitterId, submitterEmail } = coerceSubmitter(raw);
  return normalizeImages({ ...base, submitterId, submitterEmail });
}

function flattenSchedule(
  schedule?: Record<string, string[]>
): { label: string; sortKey: number }[] {
  if (!schedule) return [];
  const out: { label: string; sortKey: number }[] = [];
  for (const [d, arr] of Object.entries(schedule)) {
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      // d: YYYY-MM-DD, t: HH:mm を JST(+09:00)として解釈
      const ts = new Date(`${d}T${t}:00+09:00`).getTime();
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

/** ====== SmartArt風（縦方向画像リスト）アイテム ====== */
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

          {/* 右肩：ユーザーID & メール */}
          <div
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#6b7280",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "flex-end",
              maxWidth: "60%",
            }}
          >
            <span>ユーザーID: {item.submitterId ?? "—"}</span>
            <span style={{ wordBreak: "break-all" }}>
              メール:{" "}
              {item.submitterEmail ? (
                <a
                  href={`mailto:${item.submitterEmail}`}
                  style={{ color: "#2563eb", textDecoration: "none" }}
                >
                  {item.submitterEmail}
                </a>
              ) : (
                "—"
              )}
            </span>
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

/** ====== ページング対応レスポンス型 ====== */
type PagedResp =
  | Submission[]
  | {
      ok?: boolean;
      items?: Submission[];
      nextPage?: number | null;
    };

/** ====== ページ本体（承認済み） ====== */
function AuthenticatedPage() {
  const [items, setItems] = useState<Submission[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "old">("new");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = async (p: number, signal?: AbortSignal) => {
    setLoading(true);
    setErr(null);
    try {
      const path = `/api/admin/review/queue?status=approved&page=${p}&limit=${PAGE_LIMIT}`;
      const resp = (await apiGet<PagedResp>(path, signal)) as PagedResp;

      let arrRaw: any[] = Array.isArray(resp)
        ? resp
        : Array.isArray(resp.items)
        ? resp.items!
        : [];

      const arr: Submission[] = arrRaw.map(normalizeSubmission);

      setItems((prev) => {
        const seen = new Set(prev.map((x) => String(x.id)));
        return [...prev, ...arr.filter((x) => !seen.has(String(x.id)))];
      });

      const nextExplicit =
        !Array.isArray(resp) && resp.nextPage != null ? resp.nextPage : null;
      const inferred = arr.length >= PAGE_LIMIT ? p + 1 : null;
      const next = nextExplicit ?? inferred;
      setHasMore(next != null);
      if (next != null) setPage(next);
    } catch (e: any) {
      setErr(e?.message || "ロードに失敗しました");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // 初回ロード
  useEffect(() => {
    const c = new AbortController();
    setItems([]);
    setPage(1);
    setHasMore(true);
    fetchPage(1, c.signal);
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 無限スクロール
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((ent) => {
        if (ent.isIntersecting && !loading) {
          fetchPage(page);
        }
      });
    });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, hasMore, loading, page]);

  // 検索＆並び替え後の配列
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = items;
    if (kw) {
      arr = arr.filter((it) => {
        const texts = extractTexts(it).join("\n").toLowerCase();
        return (
          String(it.submitterId ?? "").toLowerCase().includes(kw) ||
          (it.companyName ?? "").toLowerCase().includes(kw) ||
          texts.includes(kw) ||
          (it.submitterEmail ?? "").toLowerCase().includes(kw)
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
        承認一覧（{total}
        {loading ? " 読み込み中…" : ""}）
      </h2>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
        承認された申請を、過去分まで一覧表示します。
      </div>

      {/* 検索＆並び替え */}
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
          placeholder="ユーザーID／会社名／文言／メールで検索"
          style={{
            width: 300,
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

      {/* 無限スクロール監視点 */}
      <div ref={sentinelRef} style={{ height: 12 }} />
    </div>
  );
}

export default AuthenticatedPage;
