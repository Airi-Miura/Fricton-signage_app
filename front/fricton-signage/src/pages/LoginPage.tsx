// src/pages/LoginPage.tsx
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 既にログイン済みならタブ画面へ
  useEffect(() => {
    if (localStorage.getItem("auth") === "ok") {
      nav("/app/truck", { replace: true });
    }
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!email || !pw) {
      setErr("ID（ユーザー名）とパスワードを入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // バックエンドは username / password を受け取る想定
        body: JSON.stringify({ username: email, password: pw }),
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error("IDまたはパスワードが違います");
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail || "ログインに失敗しました");
      }

      // { ok: true, token: "..." } を想定
      const data = await res.json();

      // ★ 追加: トークンを保存（/api/trucks などの Authorization 用）
      if (data?.token) {
        localStorage.setItem("token", data.token);
      }

      // 既存のフラグ/ユーザー情報はそのまま
      localStorage.setItem("auth", "ok");
      localStorage.setItem("user", JSON.stringify(data));

      nav("/app/truck", { replace: true });
    } catch (e: any) {
      setErr(e.message || "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          padding: 24,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 4px 12px rgba(0,0,0,.06)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
          FRICTON-SIGNAGE ログイン
        </h1>

        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>ID（ユーザー名）</div>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            disabled={loading}
            autoComplete="username"
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>パスワード</div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.currentTarget.value)}
            disabled={loading}
            autoComplete="current-password"
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>

        {err && (
          <div style={{ color: "#b91c1c", marginBottom: 12 }}>
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        {/* 新規登録への導線 */}
        <div style={{ marginTop: 12, fontSize: 12, textAlign: "center" }}>
          アカウントがありませんか？ <Link to="/register">新規登録</Link>
        </div>
      </form>
    </div>
  );
}
