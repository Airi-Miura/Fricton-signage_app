// src/pages/AppLayout.tsx
import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import AdminAccountButton from "./wizard/AdminAccountButton";

export default function AppLayout() {
  const nav = useNavigate();

  const logout = () => {
    localStorage.removeItem("auth");
    localStorage.removeItem("user");
    nav("/", { replace: true });
  };

  // タブの共通スタイル
  const tabBase: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    textDecoration: "none",
    color: "#111827",
    fontWeight: 600,
    background: "#fff",
    transition: "all .15s ease",
  };
  const tabActive: React.CSSProperties = {
    ...tabBase,
    background: "#111827",
    color: "#fff",
    borderColor: "#111827",
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      {/* ヘッダー */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 12,
          background: "rgba(255,255,255,0.9)",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          boxShadow: "0 6px 16px rgba(17,24,39,.06)",
          backdropFilter: "saturate(180%) blur(6px)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          FRICTON-SIGNAGE かんりよー
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AdminAccountButton />
          <button
            onClick={logout}
            style={{
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* タブ */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          padding: 8,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#f8fafc",
        }}
      >
        <NavLink
          to="AllPost" // ルート名の大文字小文字は App.tsx に合わせる
          style={({ isActive }) => (isActive ? tabActive : tabBase)}
        >
          認証画面
        </NavLink>
        <NavLink
          to="truck"
          style={({ isActive }) => (isActive ? tabActive : tabBase)}
        >
          アドトラック管理
        </NavLink>
        <NavLink
          to="Authenticated" // ルート名の大文字小文字は App.tsx に合わせる
          style={({ isActive }) => (isActive ? tabActive : tabBase)}
        >
          認証済み
        </NavLink>
        <NavLink
          to="Unauthorized" // ルート名の大文字小文字は App.tsx に合わせる
          style={({ isActive }) => (isActive ? tabActive : tabBase)}
        >
          非認証一覧
        </NavLink>
      </div>

      {/* コンテンツ */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
          boxShadow: "0 4px 12px rgba(0,0,0,.04)",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
