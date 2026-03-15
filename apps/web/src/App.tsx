import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { api, type MeProfileResponse } from "./api/client";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { AuthVerify } from "./pages/AuthVerify";
import { Search } from "./pages/Search";
import { Profile } from "./pages/Profile";
import { Onboarding } from "./pages/Onboarding";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === "loading") {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  if (auth.status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RequireProfileComplete({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "complete" | "incomplete">("loading");

  useEffect(() => {
    api.get<MeProfileResponse>("/v1/me/profile").then(({ data, error }) => {
      if (error || !data?.profile?.profileCompletedAt) {
        setStatus("incomplete");
      } else {
        setStatus("complete");
      }
    });
  }, []);

  if (status === "loading") {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  if (status === "incomplete") {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/verify" element={<AuthVerify />} />
      <Route
        path="/search"
        element={
          <RequireAuth>
            <RequireProfileComplete>
              <Search />
            </RequireProfileComplete>
          </RequireAuth>
        }
      />
      <Route
        path="/profiles/:id"
        element={
          <RequireAuth>
            <RequireProfileComplete>
              <Profile />
            </RequireProfileComplete>
          </RequireAuth>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
