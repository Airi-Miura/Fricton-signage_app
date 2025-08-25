import { NavLink, Outlet, useNavigate } from "react-router-dom";

export default function AppLayout() {
  const nav = useNavigate();
  const logout = () => {
    localStorage.removeItem("auth");
    nav("/", { replace: true });
  };

  const tabStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    textDecoration: "none",
    color: "#111827",
    fontWeight: 600,
  };

  const activeStyle: React.CSSProperties = {
    ...tabStyle,
    background: "#111827",
    color: "#fff",
    borderColor: "#111827",
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>FRICTON-SIGNAGE</div>
        <div style={{ flex: 1 }} />
        <button
          onClick={logout}
          style={{
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          ログアウト
        </button>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <NavLink
          to="AllPost"
          style={({ isActive }) => (isActive ? activeStyle : tabStyle)}
        >
          認証画面
        </NavLink>
        <NavLink
          to="signage"
          style={({ isActive }) => (isActive ? activeStyle : tabStyle)}
        >
          サイネージ管理
        </NavLink>
        <NavLink
          to="truck"
          style={({ isActive }) => (isActive ? activeStyle : tabStyle)}
        >
          アドトラック管理
        </NavLink>
        <NavLink 
          to="tv" 
          style={({ isActive }) => (isActive ? activeStyle : tabStyle)}>
          大型ビジョン管理
        </NavLink>
      </div>

      {/* タブのコンテンツ */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
