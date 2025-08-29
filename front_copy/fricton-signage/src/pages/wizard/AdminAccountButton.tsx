import { useEffect, useState } from "react";

const API_ROOT = (import.meta as any)?.env?.VITE_ADMIN_API_ROOT ?? "http://localhost:8000";
const ADMIN_ME_URL = `${API_ROOT}/api/auth/admin/me`;
const CHANGE_PW_URL = `${API_ROOT}/api/auth/admin/change_password`;
const RENAME_URL = `${API_ROOT}/api/auth/admin/rename`;

type Me = { id: number; username: string; display_name?: string | null; is_active: boolean };

export default function AdminAccountButton() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<"pw" | "id">("pw");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [curPw2, setCurPw2] = useState("");
  const [newId, setNewId] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const token = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}")?.token as string | undefined; } catch { return undefined; }
  })();

  useEffect(() => {
    if (!open) return;
    setMsg(null); setErr(null);
    // 現在のIDをAPIから取得
    const ac = new AbortController();
    fetch(ADMIN_ME_URL, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setErr(j?.detail || "取得に失敗しました"); return; }
        setMe(j as Me);
        setNewId((j as Me).username);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [open, token]);

  const onChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!curPw || !newPw || !newPw2) { setErr("すべての項目を入力してください"); return; }
    if (newPw !== newPw2) { setErr("新しいパスワードが一致しません"); return; }
    if (newPw.length < 6) { setErr("新しいパスワードは6文字以上にしてください"); return; }
    setLoading(true);
    try {
      const res = await fetch(CHANGE_PW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) throw new Error("現在のパスワードが違います");
        throw new Error(data?.detail || "変更に失敗しました");
      }
      setMsg("パスワードを変更しました");
      setCurPw(""); setNewPw(""); setNewPw2("");
    } catch (e: any) {
      setErr(e.message || "変更に失敗しました");
    } finally { setLoading(false); }
  };

  const onRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!curPw2 || !newId) { setErr("すべての項目を入力してください"); return; }
    setLoading(true);
    try {
      const res = await fetch(RENAME_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: curPw2, new_username: newId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) throw new Error("現在のパスワードが違います");
        if (res.status === 409) throw new Error("そのIDは既に使用されています");
        throw new Error(data?.detail || "変更に失敗しました");
      }
      setMsg("ID（ユーザー名）を変更しました");
      setMe(m => (m ? { ...m, username: data?.username ?? newId } : m));
      // localStorage の user.username も更新
      try {
        const u = JSON.parse(localStorage.getItem("user") || "{}");
        u.username = data?.username ?? newId;
        localStorage.setItem("user", JSON.stringify(u));
      } catch {}
      setCurPw2("");
    } catch (e: any) {
      setErr(e.message || "変更に失敗しました");
    } finally { setLoading(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
      >
        アカウント設定
      </button>

      {!open ? null : (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 1000
        }}>
          <div style={{ width: 420, background: "#fff", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottom: "1px solid #eee" }}>
              <div style={{ fontWeight: 700 }}>アカウント設定</div>
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => { setTab("pw"); setErr(null); setMsg(null); }}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: tab==="pw" ? "#111827" : "#fff", color: tab==="pw" ? "#fff" : "#111" }}
                >パスワード変更</button>
                <button
                  onClick={() => { setTab("id"); setErr(null); setMsg(null); }}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: tab==="id" ? "#111827" : "#fff", color: tab==="id" ? "#fff" : "#111" }}
                >ID変更</button>
              </div>

              {me && (
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                  現在のID: <span style={{ fontWeight: 700 }}>{me.username}</span>
                </div>
              )}

              {err && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{err}</div>}
              {msg && <div style={{ color: "#065f46", marginBottom: 10 }}>{msg}</div>}

              {tab === "pw" ? (
                <form onSubmit={onChangePw}>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>現在のパスワード</div>
                    <input type="password" value={curPw} onChange={(e) => setCurPw(e.currentTarget.value)} disabled={loading} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>新しいパスワード</div>
                    <input type="password" value={newPw} onChange={(e) => setNewPw(e.currentTarget.value)} disabled={loading} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>新しいパスワード（確認）</div>
                    <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.currentTarget.value)} disabled={loading} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
                  </label>
                  <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 700, border: "none", cursor:"pointer", opacity: loading ? 0.7 : 1 }}>
                    {loading ? "更新中..." : "パスワードを変更"}
                  </button>
                </form>
              ) : (
                <form onSubmit={onRename}>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>新しいID（ユーザー名）</div>
                    <input type="text" value={newId} onChange={(e) => setNewId(e.currentTarget.value)} disabled={loading} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>現在のパスワード</div>
                    <input type="password" value={curPw2} onChange={(e) => setCurPw2(e.currentTarget.value)} disabled={loading} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
                  </label>
                  <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, borderRadius: 8, background: "#111827", color: "#fff", fontWeight: 700, border: "none", cursor:"pointer", opacity: loading ? 0.7 : 1 }}>
                    {loading ? "更新中..." : "IDを変更"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
