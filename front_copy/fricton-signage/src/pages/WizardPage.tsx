// src/pages/Wizard.tsx
import { useLocation, Navigate } from "react-router-dom";
import type { Kind } from "../services/api";
import TruckPage_R from "./wizard/TruckPage_R";
import RecognizePage from "./wizard/RecognizePage";
import AdminAccountButton from "./wizard/AdminAccountButton";

type ExtKind = Kind | "認証画面";
type State = { kind: ExtKind };

export default function Wizard() {
  const { state } = useLocation() as { state?: State };
  if (!state) return <Navigate to="/" replace />;

  const { kind } = state;

  // 表示するページを選ぶ
  const Page =
    kind === "認証画面" ? RecognizePage :
    kind === "アドトラック管理" ? TruckPage_R :
    null;

  if (!Page) return <Navigate to="/" replace />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 12,
        borderBottom: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 10
      }}>
        <div style={{ fontWeight: 700 }}>FRICTON-SIGNAGE 管理</div>
        <AdminAccountButton />
      </header>

      <main style={{ flex: 1 }}>
        <Page />
      </main>
    </div>
  );
}
