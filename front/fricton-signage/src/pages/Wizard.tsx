// src/pages/Wizard.tsx
import { useLocation, Navigate } from "react-router-dom";
import type { Kind } from "../services/api";
import TruckPage from "./wizard/TruckPage";

// Kind に "一括配信" を足したローカル型
type ExtKind = Kind | "一括配信";

// location.state は kind のみ
type State = { kind: ExtKind };

export default function Wizard() {
  const { state } = useLocation() as { state?: State };
  if (!state) return <Navigate to="/" replace />;

  const { kind } = state;


  if (kind === "アドトラック") return <TruckPage />;

  return <Navigate to="/" replace />;
}
