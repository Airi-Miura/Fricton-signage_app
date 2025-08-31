import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function RegisterPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");            // ★ 追加
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (username.length < 3) return setErr("IDは3文字以上で入力してください");
    if (!name.trim()) return setErr("氏名を入力してください");

    // ★ メール必須 & 形式チェックを追加
    if (!email.trim()) return setErr("メールアドレスを入力してください");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("メールアドレスの形式が正しくありません");

    if (password.length < 6) return setErr("パスワードは6文字以上で入力してください");

    setLoading(true);
    try {
      // ★ FastAPI 直叩き：composeの api は 8000:8000 で公開
      const res = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★ email を追加送信（サーバ側で必須化しておく）
        body: JSON.stringify({ username, password, name, email }),
      })

      if (!res.ok) {
        // エラー詳細を取得して重複系の文言を出し分け
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          const detail = (data?.detail ?? "").toString().toLowerCase();
          if (detail.includes("email")) throw new Error("このメールアドレスは既に使用されています");
          if (detail.includes("user") || detail.includes("username") || detail.includes("id")) {
            throw new Error("このIDは既に使用されています");
          }
          throw new Error("既に登録済みの可能性があります");
        }
        throw new Error(data.detail || "登録に失敗しました");
      }

      // 成功時：ログイン画面へ
      alert("登録が完了しました。ログインしてください。");
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e.message || "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <form onSubmit={onSubmit}
        style={{ width: 360, padding: 24, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,.06)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>ユーザー登録</h1>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>ID（ユーザー名）</div>
          <input value={username} onChange={e=>setUsername(e.currentTarget.value)} disabled={loading}
            style={{ width:"100%", padding:10, borderRadius:8, border:"1px solid #ddd" }} />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>氏名</div>
          <input value={name} onChange={e=>setName(e.currentTarget.value)} disabled={loading}
            style={{ width:"100%", padding:10, borderRadius:8, border:"1px solid #ddd" }} />
        </label>

        {/* ★ メールアドレス入力（必須）を追加 */}
        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>メールアドレス</div>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={e=>setEmail(e.currentTarget.value)}
            disabled={loading}
            style={{ width:"100%", padding:10, borderRadius:8, border:"1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>パスワード</div>
          <input type="password" value={password} onChange={e=>setPassword(e.currentTarget.value)} disabled={loading}
            style={{ width:"100%", padding:10, borderRadius:8, border:"1px solid #ddd" }} />
        </label>

        {err && <div style={{ color:"#b91c1c", marginBottom: 12 }}>{err}</div>}

        <button type="submit" disabled={loading}
          style={{ width:"100%", padding:12, borderRadius:8, background:"#111827", color:"#fff", fontWeight:700, border:"none", cursor:"pointer", opacity: loading?0.7:1 }}>
          {loading ? "登録中..." : "登録する"}
        </button>

        <div style={{ marginTop: 12, fontSize: 12 }}>
          すでにアカウントがありますか？ <Link to="/">ログイン</Link>
        </div>
      </form>
    </div>
  );
}
