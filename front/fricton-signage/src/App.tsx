import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AppLayout from "./pages/AppLayout";
import SignagePage from "./pages/wizard/SignagePage";
import TruckPage from "./pages/wizard/TruckPage";
import TVForm from "./pages/wizard/TVForm";
import RegisterPage from "./pages/RegisterPage";
import AllPost from "./pages/wizard/AllPost";


function RequireAuth({ children }: { children: ReactNode }) {
  const authed = localStorage.getItem("auth") === "ok";
  return authed ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*ユーザ登録*/}
        <Route path="/register" element={<RegisterPage />} />

        {/* ログイン */}
        <Route path="/" element={<LoginPage />} />

        {/* ログイン後のタブ付き領域 */}
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          {/* /app 直叩きは Signage にリダイレクト */}
          <Route index element={<Navigate to="signage" replace />} />

          {/* タブの中身（3画面） */}
          <Route path="signage" element={<SignagePage />} />
          <Route path="truck" element={<TruckPage />} />
          <Route path="tv" element={<TVForm />} />
          <Route path="AllPost" element={<AllPost />} />
        </Route>

        {/* それ以外はログインへ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
