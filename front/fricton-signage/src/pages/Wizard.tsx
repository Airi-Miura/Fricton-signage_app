// src/pages/Wizard.tsx
import { useLocation, Navigate } from "react-router-dom";
import type { Kind } from "../services/api";
import TVForm from "./wizard/TVForm";
import SignagePage from "./wizard/SignagePage";
import TruckPage from "./wizard/TruckPage";
import AllPost from "./wizard/AllPost"; // ← 一括配信

// Kind に "一括配信" を足したローカル型
type ExtKind = Kind | "一括配信";

// location.state は kind のみ
type State = { kind: ExtKind };

export default function Wizard() {
  const { state } = useLocation() as { state?: State };
  if (!state) return <Navigate to="/" replace />;

  const { kind } = state;

  // 一括配信を最優先
  if (kind === "一括配信") return <AllPost />;
  if (kind === "大型ビジョン") return <TVForm />;
  if (kind === "サイネージ") return <SignagePage />;
  if (kind === "アドトラック") return <TruckPage />;

  return <Navigate to="/" replace />;
}
