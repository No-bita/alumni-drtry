import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { DeferredVercelAnalytics } from "./components/DeferredVercelAnalytics";
import { GlobalMessagingWidget } from "./components/GlobalMessagingWidget";
import { GlobalNotificationsWidget } from "./components/GlobalNotificationsWidget";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { canAccessOnboardingFlow, superAdminSkipsAlumniJourney } from "./lib/onboardingEligibility";
import { isDevHubPagesEnabled } from "./lib/devHubPages";

/** Each `import()` becomes its own JS chunk; only the current route’s page loads (no static `pages/*` imports here). */
const Landing = lazy(() => import("./pages/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const AuthVerify = lazy(() => import("./pages/AuthVerify").then((m) => ({ default: m.AuthVerify })));
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const ConnectionThread = lazy(() =>
  import("./pages/ConnectionThread").then((m) => ({ default: m.ConnectionThread }))
);
const IntentPage = lazy(() => import("./pages/IntentPage").then((m) => ({ default: m.IntentPage })));
const LocationPage = lazy(() => import("./pages/LocationPage").then((m) => ({ default: m.LocationPage })));
const CareerPage = lazy(() => import("./pages/CareerPage").then((m) => ({ default: m.CareerPage })));
const BuildPage = lazy(() => import("./pages/BuildPage").then((m) => ({ default: m.BuildPage })));
const EventsPage = lazy(() => import("./pages/Events").then((m) => ({ default: m.EventsPage })));

function LocationHubRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/intent/location/bengaluru", search }} replace />;
}

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

function OwnProfileRequiresOnboardingComplete({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { id: routeProfileId } = useParams();

  if (auth.status !== "authenticated") return null;
  if (superAdminSkipsAlumniJourney(auth.person)) return <>{children}</>;

  const profile = auth.myProfile;
  if (!profile) {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        Loading…
      </div>
    );
  }

  const viewingOwnProfile = Boolean(routeProfileId && routeProfileId === profile.id);
  if (viewingOwnProfile && !profile.onboardingCompletedAt) {
    return <Navigate to="/onboarding" replace />;
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
              <OwnProfileRequiresOnboardingComplete>
                <ProfileGate mode="directory">
                  <Profile />
                </ProfileGate>
              </OwnProfileRequiresOnboardingComplete>
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
          path="/events"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                {isDevHubPagesEnabled ? <EventsPage /> : <Navigate to="/home" replace />}
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/location"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <LocationHubRedirect />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/location/:citySlug"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <LocationPage />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/career"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                <CareerPage />
              </ProfileGate>
            </RequireAuth>
          }
        />
        <Route
          path="/intent/career/:careerTab"
          element={
            <RequireAuth>
              <Navigate to="/intent/career" replace />
            </RequireAuth>
          }
        />
        <Route
          path="/intent/build"
          element={
            <RequireAuth>
              <ProfileGate mode="home">
                {isDevHubPagesEnabled ? <BuildPage /> : <Navigate to="/home" replace />}
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
        <GlobalNotificationsWidget />
        <GlobalMessagingWidget />
      </AuthProvider>
    </BrowserRouter>
  );
}
