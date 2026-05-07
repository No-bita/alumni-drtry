import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { StepTabs } from "../components/StepTabs";
import { Chip } from "../components/Chip";
import {
  api,
  type MeProfileResponse,
  type MeOccupationsResponse,
  type MyOccupationView,
  type MyProfileView,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { OnboardingWelcome } from "../components/onboarding/OnboardingWelcome";
import { assertApiGet } from "../lib/assertApiGet";
import { canAccessOnboardingFlow } from "../lib/onboardingEligibility";
import { isDevHubPagesEnabled } from "../lib/devHubPages";
import { queryKeys } from "../lib/queryKeys";
import { AUTH_SESSION_QUERY_KEY } from "../lib/authSessionQuery";
import { parseInstitutionalEmailForOnboarding, toDisplayNamePart } from "../lib/institutionalEmailParse";
import { DEPARTMENTS } from "../constants/departments";
import { DEGREES } from "../constants/degrees";
import { CAMPUS_IMAGE } from "../constants/images";

const JOIN_YEAR_MIN = 1960;
const joinYearMax = () => new Date().getUTCFullYear() + 1;

const STEPS = [
  { id: 0, name: "Welcome" },
  { id: 1, name: "Confirm details" },
  { id: 2, name: "Occupation" },
  { id: 3, name: "Intent" },
];

const ONBOARDING_STEP_COUNT = 3;

type OnboardingIntent = "referrals" | "hire" | "build" | "mentor" | "explore";

const ONBOARDING_INTENTS: { id: OnboardingIntent; label: string; hint: string }[] = [
  { id: "referrals", label: "Get referrals", hint: "Find alumni and reach out quickly." },
  { id: "hire", label: "Hire", hint: "Post open roles to the alumni network." },
  { id: "build", label: "Build", hint: "Find collaborators for projects." },
  { id: "mentor", label: "Mentor", hint: "Discover alumni and offer guidance." },
  { id: "explore", label: "Explore alumni", hint: "Browse the directory by cohort and context." },
];

const OCCUPATION_OPTIONS: { label: string; code: string }[] = [
  { label: "Full/Part time employment", code: "employment" },
  { label: "PhD / Research", code: "phd_research" },
  { label: "Founded a venture", code: "founded_venture" },
  { label: "Freelance / Consulting", code: "freelance_consulting" },
  { label: "Other", code: "other" },
];

type OccupationFollowUp = {
  company: string;
  role: string;
  university: string;
  industry: string;
  other: string;
};

type OccupationWritePayload = {
  roleTitle: string;
  organizationName: string | null;
  description: string | null;
};

const OCCUPATION_FOLLOW_UP_LABELS: Partial<Record<string, { title: string; fields: Array<keyof OccupationFollowUp> }>> =
  {
    employment: { title: "Employment details", fields: ["company", "role"] },
    phd_research: { title: "PhD / Research details", fields: ["university"] },
    founded_venture: { title: "Venture details", fields: ["company", "role", "industry"] },
    other: { title: "Other details", fields: ["other"] },
  };

function toUiOccupationCode(apiCode: string): string {
  if (apiCode === "full_time_employment" || apiCode === "part_time_employment") return "employment";
  return apiCode;
}

function toApiOccupationCode(uiCode: string): string {
  if (uiCode === "employment") return "full_time_employment";
  return uiCode;
}

function emptyFollowUp(): OccupationFollowUp {
  return { company: "", role: "", university: "", industry: "", other: "" };
}

function buildOccupationWritePayload(code: string, detail: OccupationFollowUp | undefined): OccupationWritePayload {
  const normalized = detail ?? emptyFollowUp();
  if (code === "employment" || code === "full_time_employment" || code === "part_time_employment") {
    const role = normalized.role.trim();
    const company = normalized.company.trim();
    return {
      roleTitle: role || "Current role",
      organizationName: company || null,
      description: null,
    };
  }
  if (code === "phd_research") {
    return {
      roleTitle: "PhD / Research",
      organizationName: normalized.university.trim() || null,
      description: null,
    };
  }
  if (code === "founded_venture") {
    const role = normalized.role.trim();
    const company = normalized.company.trim();
    const industry = normalized.industry.trim();
    return {
      roleTitle: role || "Founder",
      organizationName: company || null,
      description: industry ? `Industry: ${industry}` : null,
    };
  }
  if (code === "other") {
    return {
      roleTitle: normalized.other.trim() || "Other",
      organizationName: null,
      description: null,
    };
  }
  if (code === "freelance_consulting") {
    return {
      roleTitle: "Freelance / Consulting",
      organizationName: null,
      description: null,
    };
  }
  return {
    roleTitle: "Current role",
    organizationName: null,
    description: null,
  };
}

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
  const stepIndex = stepParam ? Math.min(3, Math.max(0, parseInt(stepParam, 10))) : 0;
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
  const [existingOccupationsByCode, setExistingOccupationsByCode] = useState<Map<string, MyOccupationView>>(new Map());
  const [occupationFollowUps, setOccupationFollowUps] = useState<Record<string, OccupationFollowUp>>({});
  const [residenceCountry, setResidenceCountry] = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [mobileCountryCode, setMobileCountryCode] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<OnboardingIntent | null>(null);
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

  const occHydratedRef = useRef(false);

  useEffect(() => {
    if (!occQuery.data?.occupations || occHydratedRef.current) return;
    occHydratedRef.current = true;
    const firstCode = occQuery.data.occupations[0]
      ? toUiOccupationCode(occQuery.data.occupations[0].occupationTypeCode)
      : undefined;
    const codes = new Set(firstCode ? [firstCode] : []);
    const nextByCode = new Map<string, MyOccupationView>();
    occQuery.data.occupations.forEach((o) => {
      const uiCode = toUiOccupationCode(o.occupationTypeCode);
      if (!nextByCode.has(uiCode)) {
        nextByCode.set(uiCode, o);
      }
    });
    queueMicrotask(() => {
      setExistingOccupationCodes(codes);
      setSelectedOccupationCodes(codes);
      setExistingOccupationsByCode(nextByCode);
      setOccupationFollowUps({});
    });
  }, [occQuery.data]);

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
      setResidenceCountry(p.residenceCountry?.trim() ?? "");
      setResidenceCity(p.residenceCity?.trim() ?? "");
      const rawMobile = p.mobilePhone?.trim() ?? "";
      const mobileMatch = rawMobile.match(/^(\+\d{1,4})\s*(\d+)$/);
      if (mobileMatch) {
        setMobileCountryCode(mobileMatch[1] ?? "");
        setMobilePhone(mobileMatch[2] ?? "");
      } else {
        setMobileCountryCode("");
        setMobilePhone(rawMobile);
      }
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

  const showTabs = stepIndex > 0 && stepIndex < 4;

  const goTo = (step: number) => {
    setSaveError(null);
    navigate(`/onboarding?step=${step}`);
  };

  const NULLABLE_PATCH_KEYS = new Set([
    "bio",
    "degreeCode",
  ]);

  const saveProfile = async (payload: {
    fullName?: string;
    batchYear?: number;
    departmentCode?: string;
    degreeCode?: string | null;
    bio?: string | null;
    mobilePhone?: string | null;
    residenceCountry?: string | null;
    residenceCity?: string | null;
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
    if (!lastName.trim()) {
      setSaveError("Please enter your last name.");
      return;
    }
    if (!departmentCode) {
      setSaveError("Please select your department.");
      return;
    }
    if (!degreeCode) {
      setSaveError("Please select your degree.");
      return;
    }
    const joinT = joinYearText.trim();
    if (joinT === "") {
      setSaveError("Please enter your year of joining.");
      return;
    }
    const y = Number(joinT);
    if (!Number.isInteger(y) || y < JOIN_YEAR_MIN || y > joinYearMax()) {
      setSaveError("Please enter a valid year you joined.");
      return;
    }
    if (batchYear == null) {
      setSaveError("Please select your graduation year.");
      return;
    }
    setSaveError(null);
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    const err = await saveProfile({
      fullName,
      batchYear: batchYear ?? undefined,
      departmentCode: departmentCode ?? undefined,
      degreeCode: degreeCode ?? undefined,
    });
    if (err) return;
    goTo(2);
  };

  const handleStep2Next = async () => {
    const nextResidenceCountry = residenceCountry.trim();
    const nextResidenceCity = residenceCity.trim();
    const nextMobileCountryCode = mobileCountryCode.trim();
    const nextMobilePhone = mobilePhone.trim();
    const compactPhone = nextMobilePhone.replace(/[^\d]/g, "");
    if (!nextResidenceCountry) {
      setSaveError("Please enter your current country of residence.");
      return;
    }
    if (!nextResidenceCity) {
      setSaveError("Please enter your current city of residence.");
      return;
    }
    if (!nextMobilePhone) {
      setSaveError("Please enter your mobile number.");
      return;
    }
    if (!nextMobileCountryCode) {
      setSaveError("Please enter your country code.");
      return;
    }
    if (compactPhone.length !== 10) {
      setSaveError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (selectedOccupationCodes.size === 0) {
      setSaveError("Please select your occupation type.");
      return;
    }

    for (const code of selectedOccupationCodes) {
      const config = OCCUPATION_FOLLOW_UP_LABELS[code];
      if (!config) continue;
      const detail = occupationFollowUps[code] ?? emptyFollowUp();
      if (config.fields.includes("company") && !detail.company.trim()) {
        setSaveError(`Please add company for ${config.title.replace(" details", "").toLowerCase()}.`);
        return;
      }
      if (config.fields.includes("role") && !detail.role.trim()) {
        setSaveError(`Please add role for ${config.title.replace(" details", "").toLowerCase()}.`);
        return;
      }
      if (config.fields.includes("university") && !detail.university.trim()) {
        setSaveError("Please add university for PhD / Research.");
        return;
      }
      if (config.fields.includes("industry") && !detail.industry.trim()) {
        setSaveError("Please add industry for your venture.");
        return;
      }
      if (config.fields.includes("other") && !detail.other.trim()) {
        setSaveError("Please add details for Other.");
        return;
      }
    }

    const toCreate = [...selectedOccupationCodes].filter((code) => !existingOccupationCodes.has(code));
    const toUpdate = [...selectedOccupationCodes].filter((code) => existingOccupationCodes.has(code));
    const organizationIdCache = new Map<string, string>();
    const resolveOrganizationId = async (organizationName: string | null): Promise<string | null> => {
      const trimmed = organizationName?.trim() ?? "";
      if (!trimmed) return null;
      const key = trimmed.toLowerCase();
      const cached = organizationIdCache.get(key);
      if (cached) return cached;
      const { data, error } = await api.post<{ organization?: { id?: string } }>("/v1/orgs/suggest", {
        name: trimmed,
      });
      if (error) {
        throw new Error(error.message ?? error.code);
      }
      const id = data?.organization?.id;
      if (!id) {
        throw new Error("Could not create or resolve organization.");
      }
      organizationIdCache.set(key, id);
      return id;
    };

    if (toCreate.length > 0 || toUpdate.length > 0) {
      setSaving(true);
      setSaveError(null);
      try {
        for (const code of toCreate) {
          const payload = buildOccupationWritePayload(code, occupationFollowUps[code]);
          const organizationId = await resolveOrganizationId(payload.organizationName);
          const { error } = await api.post("/v1/me/occupations", {
            occupationTypeCode: toApiOccupationCode(code),
            organizationId,
            roleTitle: payload.roleTitle,
            description: payload.description,
            isCurrent: true,
          });
          if (error) {
            setSaveError(error.message ?? error.code);
            setSaving(false);
            return;
          }
        }
        setExistingOccupationCodes((prev) => new Set([...prev, ...toCreate]));

        for (const code of toUpdate) {
          const existing = existingOccupationsByCode.get(code);
          if (!existing) continue;
          const payload = buildOccupationWritePayload(code, occupationFollowUps[code]);
          const organizationId = await resolveOrganizationId(payload.organizationName);
          const { error } = await api.patch(`/v1/me/occupations/${existing.id}`, {
            organizationId,
            roleTitle: payload.roleTitle,
            description: payload.description,
            isCurrent: true,
          });
          if (error) {
            setSaveError(error.message ?? error.code);
            setSaving(false);
            return;
          }
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not save occupation details.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setSaveError(null);
    const errMin = await saveProfile({
      residenceCountry: nextResidenceCountry,
      residenceCity: nextResidenceCity,
      mobilePhone: `${nextMobileCountryCode} ${nextMobilePhone}`.trim(),
      markMinimumProfileComplete: true,
    });
    if (errMin) return;
    goTo(3);
  };

  const handleStep3Finish = async () => {
    if (!selectedIntent) {
      setSaveError("Please select what you are here for.");
      return;
    }
    setSaveError(null);
    const errDone = await saveProfile({ markOnboardingComplete: true });
    if (errDone) return;

    const params = new URLSearchParams();
    params.set("fromOnboarding", "1");
    params.set("intent", selectedIntent);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("onboarding.intent", selectedIntent);
    }

    if (selectedIntent === "hire") {
      navigate(`/intent/career?compose=1&${params.toString()}`, { replace: true });
      return;
    }
    if (selectedIntent === "build") {
      if (isDevHubPagesEnabled) {
        navigate(`/intent/build?compose=1&${params.toString()}`, { replace: true });
      } else {
        navigate(`/home?${params.toString()}`, { replace: true });
      }
      return;
    }
    navigate(`/search?${params.toString()}`, { replace: true });
  };

  const toggleOccupation = (code: string) => {
    setSelectedOccupationCodes((prev) => {
      if (prev.has(code) && prev.size === 1) return prev;
      setOccupationFollowUps((current) => ({ ...current, [code]: current[code] ?? emptyFollowUp() }));
      return new Set([code]);
    });
  };

  const updateOccupationFollowUp = (code: string, field: keyof OccupationFollowUp, value: string) => {
    setOccupationFollowUps((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] ?? emptyFollowUp()),
        [field]: value,
      },
    }));
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
            ...({ "--campus-hero-image": `url("${CAMPUS_IMAGE}")` } as CSSProperties),
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

  return (
    <>
      <Nav hideIntentNav />
      {showTabs && (
        <StepTabs
          className="step-tabs--onboarding-gold"
          steps={STEPS.slice(1, 4).map((s) => ({
            id: s.id,
            name: s.name,
            done: s.id < stepIndex,
          }))}
          current={stepIndex}
          onStepClick={goTo}
        />
      )}
      {stepIndex === 1 ? (
        <div className="onboarding-confirm">
          <div className="onboarding-confirm__split">
            <div className="onboarding-confirm__left onboarding-confirm__left--form">
              <form
                id="onboarding-step1-form"
                className="onboarding-confirm__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleStep1Next();
                }}
              >
                <div className="onboarding-confirm__name-row">
                  <div className="onboarding-confirm__field onboarding-confirm__field--inline">
                    <label className="onboarding-confirm__label" htmlFor="onboarding-first">
                      First name *
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
                      Last name *
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
                    Department *
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
                    Degree *
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
                    Year you joined (first year of programme) *
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
                    Which year did you graduate? *
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
                {saveError && (
                  <p className="onboarding-confirm__error" role="alert">
                    {saveError}
                  </p>
                )}
              </form>
            </div>
            <aside className="onboarding-confirm__right onboarding-confirm__right--quote" aria-label="About this step">
              <p className="onboarding-confirm__left-eyebrow">Confirm your details</p>
              <h2 className="onboarding-confirm__left-headline">
                We prefilled what we could from your email. Use the form to fix anything.
              </h2>
              <p className="onboarding-confirm__left-note">
                Nothing is saved until you choose <strong>Looks right</strong>.
              </p>
            </aside>
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
      ) : stepIndex === 2 ? (
        <section className="onboarding-occupation" aria-labelledby="onboarding-occupation-heading">
          <div className="onboarding-occupation__panel">
            <p className="onboarding-occupation__step-label">Step 2 of {ONBOARDING_STEP_COUNT}</p>
            <h2 id="onboarding-occupation-heading" className="onboarding-occupation__title">
              Occupation type
            </h2>
            <p className="onboarding-occupation__sub">
              What best describes your current role? Select one option. *
            </p>
            <div className="onboarding-occupation__chips" role="group" aria-label="Occupation choices">
              {OCCUPATION_OPTIONS.map(({ label, code }) => (
                <Chip key={code} active={selectedOccupationCodes.has(code)} onClick={() => toggleOccupation(code)}>
                  {label}
                </Chip>
              ))}
            </div>
            {[...selectedOccupationCodes]
              .filter((code) => OCCUPATION_FOLLOW_UP_LABELS[code])
              .map((code) => {
                const config = OCCUPATION_FOLLOW_UP_LABELS[code];
                if (!config) return null;
                const detail = occupationFollowUps[code] ?? emptyFollowUp();
                return (
                  <div
                    key={`followup-${code}`}
                    className="onboarding-occupation__contact-grid onboarding-occupation__contact-grid--conditional"
                  >
                    {config.fields.includes("company") && (
                      <div className="onboarding-occupation__field">
                        <label className="onboarding-occupation__label" htmlFor={`onboarding-${code}-company`}>
                          Company *
                        </label>
                        <input
                          id={`onboarding-${code}-company`}
                          name={`${code}Company`}
                          className="onboarding-occupation__input"
                          autoComplete="organization"
                          placeholder="Enter company name"
                          value={detail.company}
                          onChange={(e) => updateOccupationFollowUp(code, "company", e.target.value)}
                        />
                      </div>
                    )}
                    {config.fields.includes("role") && (
                      <div className="onboarding-occupation__field">
                        <label className="onboarding-occupation__label" htmlFor={`onboarding-${code}-role`}>
                          Role *
                        </label>
                        <input
                          id={`onboarding-${code}-role`}
                          name={`${code}Role`}
                          className="onboarding-occupation__input"
                          placeholder="Enter your role"
                          value={detail.role}
                          onChange={(e) => updateOccupationFollowUp(code, "role", e.target.value)}
                        />
                      </div>
                    )}
                    {config.fields.includes("university") && (
                      <div className="onboarding-occupation__field">
                        <label className="onboarding-occupation__label" htmlFor={`onboarding-${code}-university`}>
                          University *
                        </label>
                        <input
                          id={`onboarding-${code}-university`}
                          name={`${code}University`}
                          className="onboarding-occupation__input"
                          autoComplete="organization"
                          placeholder="Enter university name"
                          value={detail.university}
                          onChange={(e) => updateOccupationFollowUp(code, "university", e.target.value)}
                        />
                      </div>
                    )}
                    {config.fields.includes("industry") && (
                      <div className="onboarding-occupation__field">
                        <label className="onboarding-occupation__label" htmlFor={`onboarding-${code}-industry`}>
                          Industry *
                        </label>
                        <input
                          id={`onboarding-${code}-industry`}
                          name={`${code}Industry`}
                          className="onboarding-occupation__input"
                          placeholder="e.g., FinTech"
                          value={detail.industry}
                          onChange={(e) => updateOccupationFollowUp(code, "industry", e.target.value)}
                        />
                      </div>
                    )}
                    {config.fields.includes("other") && (
                      <div className="onboarding-occupation__field">
                        <label className="onboarding-occupation__label" htmlFor={`onboarding-${code}-other`}>
                          Please specify *
                        </label>
                        <input
                          id={`onboarding-${code}-other`}
                          name={`${code}Other`}
                          className="onboarding-occupation__input"
                          placeholder="Tell us your current role"
                          value={detail.other}
                          onChange={(e) => updateOccupationFollowUp(code, "other", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            <div className="onboarding-occupation__contact-grid">
              <div className="onboarding-occupation__field">
                <label className="onboarding-occupation__label" htmlFor="onboarding-residence-country">
                  Current country of residence *
                </label>
                <input
                  id="onboarding-residence-country"
                  name="residenceCountry"
                  className="onboarding-occupation__input"
                  autoComplete="country-name"
                  placeholder="e.g., India"
                  value={residenceCountry}
                  onChange={(e) => setResidenceCountry(e.target.value)}
                />
              </div>
              {residenceCountry.trim() && (
                <div className="onboarding-occupation__field">
                  <label className="onboarding-occupation__label" htmlFor="onboarding-residence-city">
                    Current city of residence *
                  </label>
                  <input
                    id="onboarding-residence-city"
                    name="residenceCity"
                    className="onboarding-occupation__input"
                    autoComplete="address-level2"
                    placeholder="e.g., Dubai"
                    value={residenceCity}
                    onChange={(e) => setResidenceCity(e.target.value)}
                  />
                </div>
              )}
              <div className="onboarding-occupation__field onboarding-occupation__field--full">
                <label className="onboarding-occupation__label" htmlFor="onboarding-mobile-phone">
                  Mobile number *
                </label>
                <div className="onboarding-occupation__mobile-row">
                  <label className="visually-hidden" htmlFor="onboarding-mobile-country-code">
                    Country code
                  </label>
                  <input
                    id="onboarding-mobile-country-code"
                    name="mobileCountryCode"
                    className="onboarding-occupation__input onboarding-occupation__input--country-code"
                    autoComplete="tel-country-code"
                    inputMode="tel"
                    placeholder="+91"
                    value={mobileCountryCode}
                    onChange={(e) => setMobileCountryCode(e.target.value)}
                  />
                  <input
                    id="onboarding-mobile-phone"
                    name="mobilePhone"
                    className="onboarding-occupation__input"
                    autoComplete="tel-national"
                    inputMode="tel"
                    placeholder="e.g., 98765 43210"
                    value={mobilePhone}
                    onChange={(e) => setMobilePhone(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {saveError && <p className="onboarding-occupation__error">{saveError}</p>}
            <div className="onboarding-occupation__footer">
              <Button variant="back" onClick={() => goTo(1)} disabled={saving}>
                Back
              </Button>
              <Button variant="primary" onClick={() => void handleStep2Next()} disabled={saving}>
                {saving ? "Saving…" : "Next"}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="onboarding-occupation" aria-labelledby="onboarding-intent-heading">
          <div className="onboarding-occupation__panel">
            <p className="onboarding-occupation__step-label">Step 3 of {ONBOARDING_STEP_COUNT}</p>
            <h2 id="onboarding-intent-heading" className="onboarding-occupation__title">
              What would you like to do? *
            </h2>
            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {ONBOARDING_INTENTS.map((intent) => (
                <button
                  key={intent.id}
                  type="button"
                  className={`onboarding-intent-card${
                    selectedIntent === intent.id ? " onboarding-intent-card--active" : ""
                  }`}
                  onClick={() => setSelectedIntent(intent.id)}
                >
                  <span className="onboarding-intent-card__label">{intent.label}</span>
                  <span className="onboarding-intent-card__hint">{intent.hint}</span>
                </button>
              ))}
            </div>
            {saveError && <p className="onboarding-occupation__error">{saveError}</p>}
            <div className="onboarding-occupation__footer">
              <Button variant="back" onClick={() => goTo(2)} disabled={saving}>
                Back
              </Button>
              <Button variant="primary" onClick={() => void handleStep3Finish()} disabled={saving}>
                {saving ? "Saving…" : "Continue"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
