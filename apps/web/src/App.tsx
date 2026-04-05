import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { CAREER_INTENT_DEFAULT_PATH } from "./constants/careerTabs";
import { DeferredVercelAnalytics } from "./components/DeferredVercelAnalytics";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { canAccessOnboardingFlow, superAdminSkipsAlumniJourney } from "./lib/onboardingEligibility";

/** Each `import()` becomes its own JS chunk; only the current route’s page loads (no static `pages/*` imports here). */
const Landing = lazy(() => import("./pages/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const AuthVerify = lazy(() => import("./pages/AuthVerify").then((m) => ({ default: m.AuthVerify })));
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const Notifications = lazy(() =>
  import("./pages/Notifications").then((m) => ({ default: m.Notifications }))
);
const ConnectionThread = lazy(() =>
  import("./pages/ConnectionThread").then((m) => ({ default: m.ConnectionThread }))
);
const IntentPage = lazy(() => import("./pages/IntentPage").then((m) => ({ default: m.IntentPage })));
const CareerPage = lazy(() => import("./pages/CareerPage").then((m) => ({ default: m.CareerPage })));

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ padding: "4rem var(--page-x)", textAlign: "center" }}
    >
      <p className="body-text" style={{ color: "var(--ink-muted)" }}>
        Loading…
      </p>
    </div>
  );
}

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

type ProfileGateMode = "directory" | "home";

/**
 * directory: requires completed profile; onboarding-eligible incomplete → /onboarding; returning incomplete → /home
 * home: onboarding-eligible incomplete → /onboarding; complete or returning incomplete → allow
 */
function ProfileGate({ mode, children }: { mode: ProfileGateMode; children: React.ReactNode }) {
  const auth = useAuth();
  const { id: routeProfileId } = useParams();

  if (auth.status !== "authenticated") {
    return null;
  }

  const person = auth.person;
  if (superAdminSkipsAlumniJourney(person)) {
    return <>{children}</>;
  }

  if (auth.myProfileError) {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        <p className="body-text" style={{ color: "var(--ink-muted)" }}>
          Couldn’t load your profile. Try refreshing.
        </p>
      </div>
    );
  }

  const profile = auth.myProfile;
  if (!profile) {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        Loading…
      </div>
    );
  }

  if (profile.profileCompletedAt) {
    return <>{children}</>;
  }

  const viewingOwnProfile = Boolean(routeProfileId && routeProfileId === profile.id);
  /** Allow read-only alumni profiles (e.g. “You might want to meet” on /home) even when own profile is incomplete. */
  const viewingSomeoneElseProfile = Boolean(routeProfileId && routeProfileId !== profile.id);
  const directoryAllowedIncomplete = viewingOwnProfile || viewingSomeoneElseProfile;

  if (canAccessOnboardingFlow(profile, person)) {
    if (mode === "directory" && directoryAllowedIncomplete) {
      return <>{children}</>;
    }
    return <Navigate to="/onboarding" replace />;
  }

  if (mode === "directory") {
    if (directoryAllowedIncomplete) {
      return <>{children}</>;
    }
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/verify" element={<AuthVerify />} />
        <Route
          path="/search"
          element={
            <RequireAuth>
              <ProfileGate mode="directory">
                <Search />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/profiles/:id"
          element={
            <RequireAuth>
              <ProfileGate mode="directory">
                <Profile />
              </ProfileGate>
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
        <Route
          path="/home"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <Home />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/career"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <Navigate to={CAREER_INTENT_DEFAULT_PATH} replace />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/career/:careerTab"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <CareerPage />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/:intentSlug"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <IntentPage />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <Notifications />
            </RequireAuth>
          }
        />
        <Route
          path="/connections/:threadId"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <ConnectionThread />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DeferredVercelAnalytics />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
