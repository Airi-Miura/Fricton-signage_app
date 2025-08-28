// src/pages/Wizard.tsx
import { useLocation, Navigate } from "react-router-dom";
import type { Kind } from "../services/api";
import TruckPage_R from "./wizard/TruckPage_R";
import RecognizePage from "./wizard/RecognizePage"; 

// Kind に "一括配信" を足したローカル型
type ExtKind = Kind | "認証画面";

type State = { kind: ExtKind};

export default function Wizard() {
  const { state } = useLocation() as { state?: State };
  if (!state) return <Navigate to="/" replace />;

  const { kind } = state;


  if (kind === "認証画面") return <RecognizePage />;
  if (kind === "アドトラック管理") return <TruckPage_R />;

  return <Navigate to="/" replace />;
}
