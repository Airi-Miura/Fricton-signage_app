// src/lib/submitter-resolver.ts
const API_ROOT = (import.meta as any)?.env?.VITE_API_ROOT ?? "http://localhost:8000";
const TOKEN_KEY = "token" as const;

const authHeaders = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export type SubmitterLite = {
  id?: string | number;
  email?: string;
  name?: string;
  avatarUrl?: string;
};

async function postJSON(url: string, body: any, signal?: AbortSignal) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
}

/** 画像→送信者（既存） */
export async function resolveSubmittersByImages(
  entries: { submissionId: string | number; imageUrls: string[] }[],
  signal?: AbortSignal
): Promise<Record<string, SubmitterLite>> {
  if (!entries.length) return {};

  const ids = entries.map(e => String(e.submissionId));
  try {
    let res = await postJSON(`${API_ROOT}/api/admin/submitter/resolve`, { entries }, signal);
    if (res.ok) {
      const data = await res.json();
      if (data?.submitters) return data.submitters;
    }

    res = await postJSON(`${API_ROOT}/api/admin/submitter/resolve`, { submissionIds: ids }, signal);
    if (res.ok) {
      const data = await res.json();
      if (data?.submitters) return data.submitters;
    }

    const res3 = await fetch(
      `${API_ROOT}/api/admin/submitter/resolve?ids=${encodeURIComponent(ids.join(","))}`,
      { headers: { ...authHeaders() }, credentials: "include", signal }
    );
    if (res3.ok) {
      const data = await res3.json();
      if (data?.submitters) return data.submitters;
    }
  } catch (e) {
    if (import.meta.env?.DEV) console.debug("[resolver(images)] failed", e);
  }
  return {};
}

/** ★ 追加：ユーザID配列 → ユーザ情報（名前/メール） */
export async function resolveUsersByIds(
  idsIn: (string | number)[],
  signal?: AbortSignal
): Promise<Record<string, SubmitterLite>> {
  const ids = Array.from(new Set(idsIn.map(String))).filter(Boolean);
  if (!ids.length) return {};

  const tryGet = async (url: string) => {
    const res = await fetch(url, { headers: { ...authHeaders() }, credentials: "include", signal });
    if (!res.ok) return null;
    return res.json();
  };

  try {
    // v1: POST /api/admin/users/bulk { ids: [...] }
    let res = await postJSON(`${API_ROOT}/api/admin/users/bulk`, { ids }, signal);
    if (res.ok) {
      const data = await res.json();
      if (data?.users) return indexUsers(data.users);
      if (Array.isArray(data)) return indexUsers(data); // 単配列でも対応
    }

    // v2: GET /api/admin/users/bulk?ids=1,2,3
    let data = await tryGet(`${API_ROOT}/api/admin/users/bulk?ids=${encodeURIComponent(ids.join(","))}`);
    if (data?.users) return indexUsers(data.users);
    if (Array.isArray(data)) return indexUsers(data);

    // v3: GET /api/admin/users?ids=1,2,3
    data = await tryGet(`${API_ROOT}/api/admin/users?ids=${encodeURIComponent(ids.join(","))}`);
    if (data?.users) return indexUsers(data.users);
    if (Array.isArray(data)) return indexUsers(data);

    // v4: 最終手段（N<=50想定）：/api/admin/users/:id を1件ずつ
    const out: Record<string, SubmitterLite> = {};
    for (const id of ids) {
      const d = await tryGet(`${API_ROOT}/api/admin/users/${encodeURIComponent(id)}`);
      if (d) {
        const u = unwrapUser(d);
        if (u?.id != null) out[String(u.id)] = u;
      }
    }
    return out;
  } catch (e) {
    if (import.meta.env?.DEV) console.debug("[resolver(ids)] failed", e);
    return {};
  }
}

function indexUsers(list: any[]): Record<string, SubmitterLite> {
  const out: Record<string, SubmitterLite> = {};
  for (const raw of list ?? []) {
    const u = unwrapUser(raw);
    if (u?.id != null) out[String(u.id)] = u;
  }
  return out;
}

/** バックエンドのキー揺れを吸収して {id,name,email} に変換 */
function unwrapUser(raw: any): SubmitterLite | null {
  if (!raw) return null;
  const id = raw.id ?? raw.user_id ?? raw.userId ?? raw._id;
  const email =
    raw.email ??
    raw.mail ??
    raw.emailAddress ??
    raw.contact_email ??
    raw.primary_email;

  // 表示名の候補を優先順位で
  const name =
    raw.display_name ??
    raw.displayName ??
    raw.name ??
    raw.username ??
    raw.user_name ??
    raw.account_name ??
    null;

  const avatarUrl = raw.avatarUrl ?? raw.avatar_url ?? raw.icon_url ?? undefined;

  return { id, email, name: name ?? undefined, avatarUrl };
}
