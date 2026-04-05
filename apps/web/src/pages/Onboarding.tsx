import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { ProgressBar } from "../components/ProgressBar";
import { StepTabs } from "../components/StepTabs";
import { Input } from "../components/Input";
import { Chip } from "../components/Chip";
import {
  api,
  type MeProfileResponse,
  type MeOccupationsResponse,
  type MeLinksResponse,
  type MyProfileView,
  type ProfileLinkView,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { OnboardingWelcome } from "../components/onboarding/OnboardingWelcome";
import { assertApiGet } from "../lib/assertApiGet";
import { canAccessOnboardingFlow } from "../lib/onboardingEligibility";
import { queryKeys } from "../lib/queryKeys";
import { AUTH_SESSION_QUERY_KEY } from "../lib/authSessionQuery";
import { parseInstitutionalEmailForOnboarding, toDisplayNamePart } from "../lib/institutionalEmailParse";
import { DEPARTMENTS } from "../constants/departments";
import { DEGREES } from "../constants/degrees";
import { CAMPUS_IMAGE, CAMPUS_IMAGE_SMALL } from "../constants/images";
import { SOCIAL_PLATFORM, normalizeSocialUrl } from "../lib/socialLinks";

const JOIN_YEAR_MIN = 1960;
const joinYearMax = () => new Date().getUTCFullYear() + 1;

const STEPS = [
  { id: 0, name: "Welcome" },
  { id: 1, name: "Confirm details" },
  { id: 2, name: "Occupation" },
  { id: 3, name: "Contact & links" },
  { id: 4, name: "Done" },
];

const ONBOARDING_STEP_COUNT = 3;

const OCCUPATION_OPTIONS: { label: string; code: string }[] = [
  { label: "Full time employment", code: "full_time_employment" },
  { label: "Part time employment", code: "part_time_employment" },
  { label: "PhD / Research", code: "phd_research" },
  { label: "Founded a venture", code: "founded_venture" },
  { label: "Freelance / Consulting", code: "freelance_consulting" },
  { label: "Other", code: "other" },
];

function departmentLabel(code: string | null): string {
  if (!code) return "—";
  const d = DEPARTMENTS.find((x) => x.code === code);
  return d?.label ?? code;
}

function departmentInVocab(code: string | null): boolean {
  if (!code) return false;
  return DEPARTMENTS.some((x) => x.code === code);
}

export function Onboarding() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const authPerson = auth.status === "authenticated" ? auth.person : null;
  const authMyProfile = auth.status === "authenticated" ? auth.myProfile : undefined;
  const authMyProfileError = auth.status === "authenticated" ? auth.myProfileError : undefined;
  const [searchParams] = useSearchParams();
  const stepParam = searchParams.get("step");
  const stepIndex = stepParam ? Math.min(4, Math.max(0, parseInt(stepParam, 10))) : 0;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [batchYear, setBatchYear] = useState<number | null>(null);
  const [departmentCode, setDepartmentCode] = useState<string | null>(null);
  const [degreeCode, setDegreeCode] = useState<string | null>("btech");
  const [joinYearStable, setJoinYearStable] = useState<number | null>(null);
  const [joinYearText, setJoinYearText] = useState("");
  const [parsedDeptLabel, setParsedDeptLabel] = useState<string | null>(null);
  /** When false, show parsed department as a summary; user taps to open the vocab dropdown. */
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(true);
  const departmentSelectRef = useRef<HTMLSelectElement>(null);
  const [selectedOccupationCodes, setSelectedOccupationCodes] = useState<Set<string>>(new Set());
  const [existingOccupationCodes, setExistingOccupationCodes] = useState<Set<string>>(new Set());
  const [residenceCountry, setResidenceCountry] = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [existingLinks, setExistingLinks] = useState<ProfileLinkView[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [gate, setGate] = useState<"loading" | "allow" | "redirect">("loading");
  const [welcomeProfile, setWelcomeProfile] = useState<MyProfileView | null>(null);

  const occQuery = useQuery({
    queryKey: queryKeys.me.occupations(),
    queryFn: ({ signal }) => assertApiGet<MeOccupationsResponse>("/v1/me/occupations", signal),
    enabled: auth.status === "authenticated",
  });

  const linksQuery = useQuery({
    queryKey: queryKeys.me.links(),
    queryFn: ({ signal }) => assertApiGet<MeLinksResponse>("/v1/me/links", signal),
    enabled: auth.status === "authenticated",
  });

  const occHydratedRef = useRef(false);
  const linksHydratedRef = useRef(false);

  useEffect(() => {
    if (!occQuery.data?.occupations || occHydratedRef.current) return;
    occHydratedRef.current = true;
    const codes = new Set(occQuery.data.occupations.map((o) => o.occupationTypeCode));
    setExistingOccupationCodes(codes);
    setSelectedOccupationCodes(codes);
  }, [occQuery.data]);

  useEffect(() => {
    if (!linksQuery.data?.links || linksHydratedRef.current) return;
    linksHydratedRef.current = true;
    const list = linksQuery.data.links;
    setExistingLinks(list);
    const urlFor = (platform: string) =>
      list.find((l) => l.platform.toLowerCase() === platform.toLowerCase())?.url ?? "";
    setTwitterUrl(urlFor(SOCIAL_PLATFORM.twitter));
    setLinkedinUrl(urlFor(SOCIAL_PLATFORM.linkedin));
    setGithubUrl(urlFor(SOCIAL_PLATFORM.github));
  }, [linksQuery.data]);

  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;

    const initFromProfile = (p: MyProfileView | null | undefined) => {
      if (signal.aborted) return;
      if (!p) {
        setGate("redirect");
        return;
      }
      if (!canAccessOnboardingFlow(p, authPerson)) {
        setGate("redirect");
        return;
      }
      setGate("allow");
      setWelcomeProfile(p);
      const email = (p.institutionalEmail ?? "").trim();
      const parsed = email
        ? parseInstitutionalEmailForOnboarding(email)
        : {
            firstName: "",
            lastName: "",
            departmentCode: null as string | null,
            departmentDisplayName: null as string | null,
            joiningYear: null as number | null,
          };

      if (p.fullName?.trim()) {
        const parts = p.fullName.trim().split(/\s+/);
        setFirstName(toDisplayNamePart(parts[0] ?? ""));
        setLastName(toDisplayNamePart(parts.slice(1).join(" ")));
      } else {
        setFirstName(parsed.firstName);
        setLastName(parsed.lastName);
      }

      const dept = p.departmentCode ?? parsed.departmentCode ?? p.parsedDepartmentCode;
      if (dept) {
        setDepartmentCode(dept.toLowerCase());
        setDepartmentPickerOpen(false);
      } else {
        setDepartmentPickerOpen(true);
      }
      // if (p.bio) setBio(p.bio);
      if (p.degreeCode) setDegreeCode(p.degreeCode);
      setParsedDeptLabel(
        p.parsedDepartmentName ?? p.departmentName ?? parsed.departmentDisplayName ?? null
      );
      const inferredJoin =
        p.parsedJoiningYear ??
        parsed.joiningYear ??
        (p.batchYear != null ? p.batchYear - 4 : null);
      setJoinYearStable(inferredJoin);
      setJoinYearText(inferredJoin != null ? String(inferredJoin) : "");
      if (p.batchYear != null) {
        setBatchYear(p.batchYear);
      } else if (inferredJoin != null) {
        setBatchYear(inferredJoin + 4);
      } else {
        setBatchYear(2019 + 4);
      }
      if (p.residenceCountry) setResidenceCountry(p.residenceCountry);
      if (p.residenceCity) setResidenceCity(p.residenceCity);
      if (p.mobilePhone) setMobilePhone(p.mobilePhone);
      if (p.personalEmail) setPersonalEmail(p.personalEmail);
    };

    if (
      auth.status === "authenticated" &&
      authMyProfile &&
      !authMyProfileError
    ) {
      initFromProfile(authMyProfile);
    } else {
      api
        .get<MeProfileResponse>("/v1/me/profile", { signal })
        .then((profileRes) => {
          if (signal.aborted || profileRes.aborted) return;
          initFromProfile(profileRes.data?.profile);
        })
        .catch(() => {
          if (!signal.aborted) setGate("redirect");
        });
    }

    return () => {
      ac.abort();
    };
  }, [auth.status, authPerson, authMyProfile, authMyProfileError]);

  useEffect(() => {
    if (stepIndex === 1 && departmentPickerOpen) {
      departmentSelectRef.current?.focus();
    }
  }, [departmentPickerOpen, stepIndex]);

  const joinYear = useMemo(() => {
    const t = joinYearText.trim();
    if (t !== "") {
      const y = Number(t);
      if (Number.isInteger(y) && y >= JOIN_YEAR_MIN && y <= joinYearMax()) return y;
    }
    return joinYearStable ?? 2019;
  }, [joinYearText, joinYearStable]);

  const gradYear4 = joinYear + 4;
  const gradYear5 = joinYear + 5;

  const progress = (stepIndex + 1) / (STEPS.length + 1);
  const showTabs = stepIndex > 0 && stepIndex < 4;

  const goTo = (step: number) => {
    setSaveError(null);
    navigate(`/onboarding?step=${step}`);
  };

  const NULLABLE_PATCH_KEYS = new Set([
    "bio",
    "degreeCode",
    "personalEmail",
    "mobilePhone",
    "residenceCountry",
    "residenceCity",
  ]);

  const saveProfile = async (payload: {
    fullName?: string;
    batchYear?: number;
    departmentCode?: string;
    degreeCode?: string | null;
    bio?: string | null;
    personalEmail?: string | null;
    mobilePhone?: string | null;
    residenceCountry?: string;
    residenceCity?: string;
    markMinimumProfileComplete?: true;
    markOnboardingComplete?: true;
  }) => {
    const keys = Object.keys(payload) as (keyof typeof payload)[];
    const body = keys.reduce(
      (acc, k) => {
        const v = payload[k];
        if (v === undefined) return acc;
        if (k === "markMinimumProfileComplete" || k === "markOnboardingComplete") {
          if (v === true) acc[k] = true;
          return acc;
        }
        if (v === null && NULLABLE_PATCH_KEYS.has(k)) {
          acc[k] = null;
          return acc;
        }
        if (v !== null && v !== "") acc[k] = v;
        return acc;
      },
      {} as Record<string, unknown>
    );
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    const { error } = await api.patch("/v1/me/profile", body);
    setSaving(false);
    if (error) {
      setSaveError(error.message ?? error.code);
      return true;
    }
    void queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
    return false;
  };

  const handleStep1Next = async () => {
    if (!firstName.trim()) {
      setSaveError("Please enter your first name.");
      return;
    }
    const joinT = joinYearText.trim();
    if (joinT !== "") {
      const y = Number(joinT);
      if (!Number.isInteger(y) || y < JOIN_YEAR_MIN || y > joinYearMax()) {
        setSaveError("Please enter a valid year you joined, or clear the field.");
        return;
      }
    }
    setSaveError(null);
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    const err = await saveProfile({
      fullName,
      batchYear: batchYear ?? undefined,
      departmentCode: departmentCode ?? undefined,
      degreeCode: degreeCode ?? undefined,
      mobilePhone: mobilePhone.trim() || null,
      ...(residenceCountry.trim() ? { residenceCountry: residenceCountry.trim() } : {}),
      ...(residenceCity.trim() ? { residenceCity: residenceCity.trim() } : {}),
    });
    if (err) return;
    goTo(2);
  };

  const handleStep2Next = async () => {
    const toCreate = [...selectedOccupationCodes].filter((code) => !existingOccupationCodes.has(code));
    if (toCreate.length > 0) {
      setSaving(true);
      setSaveError(null);
      for (const code of toCreate) {
        const { error } = await api.post("/v1/me/occupations", {
          occupationTypeCode: code,
          roleTitle: "Current role",
          isCurrent: true,
        });
        if (error) {
          setSaveError(error.message ?? error.code);
          setSaving(false);
          return;
        }
      }
      setExistingOccupationCodes((prev) => new Set([...prev, ...toCreate]));
      setSaving(false);
    }
    setSaveError(null);
    const errMin = await saveProfile({ markMinimumProfileComplete: true });
    if (errMin) return;
    goTo(3);
  };

  const handleStep3Finish = async () => {
    const emailTrim = personalEmail.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setSaveError("Please enter a valid personal email or leave it blank.");
      return;
    }
    for (const [raw, label] of [
      [twitterUrl, "Twitter"],
      [linkedinUrl, "LinkedIn"],
      [githubUrl, "GitHub"],
    ] as const) {
      if (raw.trim() && !normalizeSocialUrl(raw)) {
        setSaveError(`Please enter a valid ${label} URL or leave it blank.`);
        return;
      }
    }
    setSaveError(null);
    const errProfile = await saveProfile({
      // bio: bio.trim() || null,
      personalEmail: emailTrim || null,
    });
    if (errProfile) return;

    setSaving(true);
    let snapshot = [...existingLinks];
    const syncPlatform = async (platform: string, raw: string): Promise<string | null> => {
      const normalized = normalizeSocialUrl(raw);
      const idx = snapshot.findIndex((l) => l.platform.toLowerCase() === platform.toLowerCase());
      const existing = idx >= 0 ? snapshot[idx]! : null;
      if (!normalized) {
        if (!existing) return null;
        const { error } = await api.delete(`/v1/me/links/${existing.id}`);
        if (error) return error.message ?? error.code;
        snapshot = snapshot.filter((l) => l.id !== existing.id);
        return null;
      }
      if (existing) {
        if (existing.url === normalized) return null;
        const { error } = await api.patch(`/v1/me/links/${existing.id}`, { url: normalized });
        if (error) return error.message ?? error.code;
        snapshot = snapshot.map((l) => (l.id === existing.id ? { ...l, url: normalized } : l));
        return null;
      }
      const { data, error } = await api.post<{ link: ProfileLinkView }>("/v1/me/links", {
        platform,
        url: normalized,
        label: null,
      });
      if (error) return error.message ?? error.code;
      if (data?.link) snapshot = [...snapshot, data.link];
      return null;
    };

    const msg =
      (await syncPlatform(SOCIAL_PLATFORM.twitter, twitterUrl)) ??
      (await syncPlatform(SOCIAL_PLATFORM.linkedin, linkedinUrl)) ??
      (await syncPlatform(SOCIAL_PLATFORM.github, githubUrl));
    if (msg) {
      setSaveError(msg);
      setSaving(false);
      return;
    }
    const errDone = await saveProfile({ markOnboardingComplete: true });
    if (errDone) return;
    setExistingLinks(snapshot);
    goTo(4);
  };

  const toggleOccupation = (code: string) => {
    setSelectedOccupationCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const pickProgram = (len: 4 | 5) => {
    setBatchYear(len === 4 ? gradYear4 : gradYear5);
  };

  const onJoinYearTextChange = (raw: string) => {
    setJoinYearText(raw);
    const t = raw.trim();
    if (t === "") {
      setJoinYearStable(null);
      return;
    }
    const y = Number(t);
    if (!Number.isInteger(y) || y < JOIN_YEAR_MIN || y > joinYearMax()) return;
    setJoinYearStable(y);
    setBatchYear((prev) => {
      const g4 = y + 4;
      const g5 = y + 5;
      if (prev === g4 || prev === g5) return prev;
      return g4;
    });
  };

  if (gate === "loading") {
    return (
      <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
        <p className="body-text" style={{ color: "var(--ink-muted)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (gate === "redirect") {
    return <Navigate to="/home" replace />;
  }

  if (stepIndex === 0) {
    if (auth.status === "loading" && welcomeProfile) {
      return (
        <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
          <p className="body-text" style={{ color: "var(--ink-muted)" }}>
            Loading…
          </p>
        </div>
      );
    }
    if (auth.status === "authenticated" && welcomeProfile) {
      const email = welcomeProfile.institutionalEmail ?? auth.person.institutionalEmail;
      return (
        <OnboardingWelcome
          profile={welcomeProfile}
          email={email}
          onBegin={() => navigate("/onboarding?step=1")}
        />
      );
    }
    return (
      <>
        <Nav hideIntentNav />
        <div
          className="campus-panel"
          style={{
            minHeight: "calc(100vh - var(--nav-height))",
            display: "flex",
            alignItems: "flex-end",
            backgroundImage: `url(${CAMPUS_IMAGE})`,
          }}
        >
          <div className="campus-panel__content" style={{ paddingBottom: "4rem" }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Welcome back
            </p>
            <h1 className="page-headline" style={{ color: "var(--cream)", marginBottom: 12 }}>
              Complete your profile, <span className="italic-accent">we remember you</span>.
            </h1>
            <p style={{ color: "rgba(242,237,228,0.8)", marginBottom: 24 }}>
              A few details help other alumni find and connect with you.
            </p>
            <Button variant="primary" onClick={() => navigate("/onboarding?step=1")}>
              Get started
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (stepIndex === 4) {
    return (
      <>
        <Nav hideIntentNav />
        <div
          className="campus-panel"
          style={{
            minHeight: "calc(100vh - var(--nav-height))",
            display: "flex",
            alignItems: "flex-end",
            backgroundImage: `url(${CAMPUS_IMAGE})`,
          }}
        >
          <div className="campus-panel__content" style={{ paddingBottom: "4rem" }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              You’re all set
            </p>
            <h1 className="page-headline" style={{ color: "var(--cream)", marginBottom: 12 }}>
              You’re part of the <span className="italic-accent">directory</span>.
            </h1>
            <p style={{ color: "rgba(242,237,228,0.8)", marginBottom: 24 }}>
              Other alumni can now find you and reach out.
            </p>
            <Button variant="primary" onClick={() => navigate("/home")}>
              Go to home
            </Button>
          </div>
        </div>
      </>
    );
  }

  const onboardingNavRight = (
    <span className="onboarding-setup__nav-context">Setting up your profile</span>
  );

  return (
    <>
      <Nav extraRight={onboardingNavRight} hideIntentNav />
      <ProgressBar value={progress} />
      {showTabs && (
        <StepTabs
          className="step-tabs--onboarding-gold"
          steps={STEPS.slice(1, 4).map((s) => ({
            id: s.id,
            name: s.name,
            done: s.id < stepIndex,
          }))}
          current={stepIndex}
        />
      )}
      {stepIndex === 1 ? (
        <div className="onboarding-confirm">
          <div className="onboarding-confirm__split">
            <aside className="onboarding-confirm__left" aria-label="About this step">
              <p className="onboarding-confirm__left-eyebrow">Confirm your details</p>
              <h2 className="onboarding-confirm__left-headline">
                We prefilled what we could from your email. Use the form to fix anything.
              </h2>
              <p className="onboarding-confirm__left-note">
                Nothing is saved until you choose <strong>Looks right</strong>.
              </p>
            </aside>
            <div className="onboarding-confirm__right">
              <form
                id="onboarding-step1-form"
                className="onboarding-confirm__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleStep1Next();
                }}
              >
                <p className="onboarding-confirm__step-label">Step 1 of {ONBOARDING_STEP_COUNT}</p>
                <h2 className="onboarding-confirm__title">Your details</h2>
                <p className="onboarding-confirm__sub">
                  Click any field to edit. Your department and programme years were guessed from your
                  institutional address—change them if needed.
                </p>
                <div className="onboarding-confirm__name-row">
                  <div className="onboarding-confirm__field onboarding-confirm__field--inline">
                    <label className="onboarding-confirm__label" htmlFor="onboarding-first">
                      First name
                    </label>
                    <input
                      id="onboarding-first"
                      name="firstName"
                      className="onboarding-confirm__input"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="onboarding-confirm__field onboarding-confirm__field--inline">
                    <label className="onboarding-confirm__label" htmlFor="onboarding-last">
                      Last name
                    </label>
                    <input
                      id="onboarding-last"
                      name="lastName"
                      className="onboarding-confirm__input"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="onboarding-confirm__field">
                  <span className="onboarding-confirm__label" id="onboarding-dept-label">
                    Department
                  </span>
                  {!departmentPickerOpen && departmentCode ? (
                    <>
                      <button
                        type="button"
                        className="onboarding-confirm__dept-summary"
                        aria-label={`Department ${
                          departmentInVocab(departmentCode)
                            ? departmentLabel(departmentCode)
                            : parsedDeptLabel ?? departmentLabel(departmentCode)
                        }. Click to change.`}
                        onClick={() => setDepartmentPickerOpen(true)}
                      >
                        <span className="onboarding-confirm__dept-summary-text">
                          {departmentInVocab(departmentCode)
                            ? departmentLabel(departmentCode)
                            : parsedDeptLabel ?? departmentLabel(departmentCode)}
                        </span>
                        <span className="onboarding-confirm__dept-summary-action">Change</span>
                      </button>
                      {(parsedDeptLabel ?? departmentLabel(departmentCode)) && (
                        <p className="onboarding-confirm__hint">
                          <span aria-hidden>↳</span> From email: {parsedDeptLabel ?? departmentLabel(departmentCode)}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <select
                        ref={departmentSelectRef}
                        id="onboarding-dept"
                        name="departmentCode"
                        className="onboarding-confirm__select"
                        value={departmentCode ?? ""}
                        onChange={(e) => setDepartmentCode(e.target.value || null)}
                        aria-labelledby="onboarding-dept-label"
                      >
                        <option value="">Select department</option>
                        {departmentCode && !departmentInVocab(departmentCode) && (
                          <option value={departmentCode}>
                            {parsedDeptLabel ?? departmentCode} (from email)
                          </option>
                        )}
                        {DEPARTMENTS.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <p className="onboarding-confirm__hint">
                        <span aria-hidden>↳</span> Choose the department that matches your programme.
                      </p>
                    </>
                  )}
                </div>
                <div className="onboarding-confirm__field">
                  <label className="onboarding-confirm__label" htmlFor="onboarding-degree">
                    Degree
                  </label>
                  <select
                    id="onboarding-degree"
                    name="degreeCode"
                    className="onboarding-confirm__select"
                    value={degreeCode ?? ""}
                    onChange={(e) => setDegreeCode(e.target.value || null)}
                  >
                    {DEGREES.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="onboarding-confirm__field">
                  <label className="onboarding-confirm__label" htmlFor="onboarding-join-year">
                    Year you joined (first year of programme)
                  </label>
                  <input
                    id="onboarding-join-year"
                    name="joinYear"
                    className="onboarding-confirm__input onboarding-confirm__input--narrow"
                    type="number"
                    inputMode="numeric"
                    min={JOIN_YEAR_MIN}
                    max={joinYearMax()}
                    step={1}
                    value={joinYearText}
                    onChange={(e) => onJoinYearTextChange(e.target.value)}
                  />
                  <p className="onboarding-confirm__hint">
                    <span aria-hidden>↳</span> Graduation choices below follow this year (+4 or +5).
                  </p>
                </div>
                <div className="onboarding-confirm__field">
                  <span className="onboarding-confirm__label" id="onboarding-grad-label">
                    Which year did you graduate?
                  </span>
                  <div
                    className="onboarding-confirm__year-cards"
                    role="group"
                    aria-labelledby="onboarding-grad-label"
                  >
                    <button
                      type="button"
                      className={`onboarding-confirm__year-card ${
                        batchYear === gradYear4 ? "onboarding-confirm__year-card--active" : ""
                      }`}
                      onClick={() => pickProgram(4)}
                    >
                      <span className="onboarding-confirm__year-num">{gradYear4}</span>
                      <span className="onboarding-confirm__year-sub">4-year programme</span>
                    </button>
                    <button
                      type="button"
                      className={`onboarding-confirm__year-card ${
                        batchYear === gradYear5 ? "onboarding-confirm__year-card--active" : ""
                      }`}
                      onClick={() => pickProgram(5)}
                    >
                      <span className="onboarding-confirm__year-num">{gradYear5}</span>
                      <span className="onboarding-confirm__year-sub">5-year programme</span>
                    </button>
                  </div>
                </div>
                <div className="onboarding-confirm__field">
                  <label className="onboarding-confirm__label" htmlFor="onboarding-residence-country">
                    Country of residence (optional)
                  </label>
                  <input
                    id="onboarding-residence-country"
                    type="text"
                    className="onboarding-confirm__input"
                    value={residenceCountry}
                    onChange={(e) => setResidenceCountry(e.target.value)}
                    autoComplete="country-name"
                    placeholder="e.g. India"
                  />
                </div>
                <div className="onboarding-confirm__field">
                  <label className="onboarding-confirm__label" htmlFor="onboarding-residence-city">
                    City of residence (optional)
                  </label>
                  <input
                    id="onboarding-residence-city"
                    type="text"
                    className="onboarding-confirm__input"
                    value={residenceCity}
                    onChange={(e) => setResidenceCity(e.target.value)}
                    autoComplete="address-level2"
                    placeholder="e.g. Bengaluru"
                  />
                </div>
                <div className="onboarding-confirm__field">
                  <label className="onboarding-confirm__label" htmlFor="onboarding-mobile">
                    Mobile number (optional)
                  </label>
                  <input
                    id="onboarding-mobile"
                    type="tel"
                    className="onboarding-confirm__input"
                    value={mobilePhone}
                    onChange={(e) => setMobilePhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="e.g. +91 98765 43210"
                  />
                  <p className="onboarding-confirm__hint">
                    <span aria-hidden>↳</span> Optional — you can edit this anytime from your profile.
                  </p>
                </div>
                {saveError && (
                  <p className="onboarding-confirm__error" role="alert">
                    {saveError}
                  </p>
                )}
              </form>
            </div>
          </div>
          <footer className="onboarding-confirm__footer">
            <Button type="button" variant="back" onClick={() => goTo(0)} disabled={saving}>
              Back
            </Button>
            <Button
              type="submit"
              form="onboarding-step1-form"
              variant="primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Looks right →"}
            </Button>
          </footer>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", minHeight: "60vh" }}>
          <div
            className="campus-panel"
            style={{
              backgroundImage: `url(${CAMPUS_IMAGE_SMALL})`,
            }}
          />
          <div className="form-panel">
            {stepIndex === 2 && (
              <>
                <p className="eyebrow" style={{ marginBottom: 8 }}>
                  Step 2 of {ONBOARDING_STEP_COUNT}
                </p>
                <h2 className="section-headline" style={{ marginBottom: 16 }}>
                  Occupation type
                </h2>
                <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 16 }}>
                  What best describes your current role? (multi-select)
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                  {OCCUPATION_OPTIONS.map(({ label, code }) => (
                    <Chip
                      key={code}
                      active={selectedOccupationCodes.has(code)}
                      onClick={() => toggleOccupation(code)}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
                {saveError && (
                  <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{saveError}</p>
                )}
                <div className="form-panel__footer">
                  <Button variant="back" onClick={() => goTo(1)} disabled={saving}>
                    Back
                  </Button>
                  <Button variant="primary" onClick={() => void handleStep2Next()} disabled={saving}>
                    {saving ? "Saving…" : "Next"}
                  </Button>
                </div>
              </>
            )}
            {stepIndex === 3 && (
              <>
                <p className="eyebrow" style={{ marginBottom: 8 }}>
                  Step 3 of {ONBOARDING_STEP_COUNT}
                </p>
                <h2 className="section-headline" style={{ marginBottom: 8 }}>
                  Contact & links
                </h2>
                <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 20 }}>
                  Optional — add a personal email and social profiles so classmates can reach you. URLs can be full
                  links or just your handle (we’ll add https://).
                </p>
                <Input
                  label="Personal email (optional)"
                  type="email"
                  autoComplete="email"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ marginBottom: 16 }}
                />
                <Input
                  label="Twitter / X (optional)"
                  type="url"
                  inputMode="url"
                  value={twitterUrl}
                  onChange={(e) => setTwitterUrl(e.target.value)}
                  placeholder="https://x.com/yourhandle"
                  style={{ marginBottom: 12 }}
                />
                <Input
                  label="LinkedIn (optional)"
                  type="url"
                  inputMode="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  style={{ marginBottom: 12 }}
                />
                <Input
                  label="GitHub (optional)"
                  type="url"
                  inputMode="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/yourusername"
                  style={{ marginBottom: 16 }}
                />
                {/* Short bio (optional) — commented out; restore Textarea, `bio` state, init from profile, and `bio` in step-3 PATCH if needed */}
                {saveError && (
                  <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{saveError}</p>
                )}
                <div className="form-panel__footer">
                  <Button variant="back" onClick={() => goTo(2)} disabled={saving}>
                    Back
                  </Button>
                  <Button variant="primary" onClick={() => void handleStep3Finish()} disabled={saving}>
                    {saving ? "Saving…" : "Finish"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
