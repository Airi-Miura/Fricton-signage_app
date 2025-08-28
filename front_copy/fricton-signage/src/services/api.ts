// src/services/api.ts
export const API_BASE = "/api";

export const kinds = ["認証画面","アドトラック管理"] as const;
export type Kind = typeof kinds[number];  // ← これに合わせておく（重複の union 型は削除）

export type FirstChoice = {
  id: number;
  kind: Kind;
  title: string;
  created_at: string;
};

export async function createFirstChoice(input: { kind: Kind; title: string }) {
  const res = await fetch(`${API_BASE}/FirstChoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchFirstChoices(): Promise<FirstChoice[]> {
  const ac = new AbortController();
  const res = await fetch(`${API_BASE}/FirstChoice`, { signal: ac.signal });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.items ?? [];
}

