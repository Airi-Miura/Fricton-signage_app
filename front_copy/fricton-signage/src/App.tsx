import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import SignagePage_R from "./pages/wizard/SignagePage_R";
import TruckPage_R from "./pages/wizard/TruckPage_R";
import TVPage_R from "./pages/wizard/TVPage_R";
import RecognizePage from "./pages/wizard/RecognizePage";
import AppLayout_R from "./pages/AppLayout";
import LoginPage_admin from "./pages/LoginPage_admin";
import type { ReactNode } from "react";



function RequireAuth({ children }: { children: ReactNode }) {
  const authed = localStorage.getItem("auth") === "ok";
  return authed ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ログイン */}
         <Route path="/" element={<LoginPage_admin />} />

        {/* ログイン後のタブ付き領域 */}
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout_R />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="signage" replace />} />

          <Route path="signage" element={<SignagePage_R />} />
          <Route path="truck" element={<TruckPage_R />} />
          <Route path="tv" element={<TVPage_R />} />
          <Route path="allpost" element={<RecognizePage/>} />
        </Route>

        {/* それ以外はログインへ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
