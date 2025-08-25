// src/pages/Wizard.tsx
import { useLocation, Navigate } from "react-router-dom";
import type { Kind } from "../services/api";
import TVForm from "./wizard/TVForm";
import SignagePage from "./wizard/SignagePage";
import TruckPage from "./wizard/TruckPage";
import AllPost from "./wizard/AllPost"; // ← 一括配信

// Kind に "一括配信" を足したローカル型
type ExtKind = Kind | "一括配信";

type State = { kind: ExtKind; title: string };

export default function Wizard() {
  const { state } = useLocation() as { state?: State };
  if (!state) return <Navigate to="/" replace />;

  const { kind, title } = state;

  // 一括配信を最優先
  if (kind === "一括配信") return <AllPost title={title} />;
  if (kind === "大型ビジョン") return <TVForm title={title} />;
  if (kind === "サイネージ") return <SignagePage title={title} />;
  if (kind === "アドトラック") return <TruckPage title={title} />;

  return <Navigate to="/" replace />;
}
