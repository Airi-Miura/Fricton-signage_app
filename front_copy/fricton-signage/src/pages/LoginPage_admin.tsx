// src/pages/LoginPage.tsx（front-copy / 管理者用）
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type LoginResp = {
  ok: boolean;
  username: string;
  name?: string;
  role?: string;   // 期待: "admin"
  token?: string;
};

const API_ROOT =
  (import.meta as any)?.env?.VITE_ADMIN_API_ROOT ?? "http://localhost:8000";
// ★ 一般ログインではなく管理ログインのエンドポイントにする
const ADMIN_LOGIN_URL = `${API_ROOT}/api/auth/admin-login`;
const ADMIN_DEST = "/app/truck";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!email || !pw) {
      setErr("ID（ユーザー名）とパスワードを入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(ADMIN_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // バックエンドは username / password を受け取る想定
        body: JSON.stringify({ username: email, password: pw }),
      });

      const data: LoginResp = await res.json().catch(() => ({ ok: false } as LoginResp));
      if (!res.ok || !data.ok) {
        if (res.status === 401) throw new Error("IDまたはパスワードが違います");
        throw new Error((data as any)?.detail || "ログインに失敗しました");
      }

      // ★ 管理トークン保存（role=admin を前提）
      localStorage.setItem("auth", "ok");
      localStorage.setItem(
        "user",
        JSON.stringify({
          username: data.username,
          name: data.name ?? "",
          role: data.role ?? "admin",
          token: data.token ?? "",
        })
      );

      // ★ 成功時のみ明示的に遷移（自動リダイレクトはしない）
      nav(ADMIN_DEST, { replace: true });
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
          FRICTON-SIGNAGE 管理者ログイン
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
            background: "#111827",
            color: "#fff",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "ログイン中..." : "管理者としてログイン"}
        </button>
      </form>
    </div>
  );
}
