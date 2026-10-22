import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
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
import { OnboardingProgress } from "../components/onboarding/OnboardingProgress";
import { assertApiGet } from "../lib/assertApiGet";
import { canResumeOnboarding } from "../lib/onboardingEligibility";
import { ALREADY_SET_UP_NOTICE, noticeState } from "../lib/routeNotices";
import { queryKeys } from "../lib/queryKeys";
import { AUTH_SESSION_QUERY_KEY } from "../lib/authSessionQuery";
import { parseInstitutionalEmailForOnboarding, toDisplayNamePart } from "../lib/institutionalEmailParse";
import { DEPARTMENTS } from "../constants/departments";
import { DEGREES } from "../constants/degrees";
import { CAMPUS_IMAGE } from "../constants/images";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";

const JOIN_YEAR_MIN = 1960;
const joinYearMax = () => new Date().getUTCFullYear() + 5;

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

type Step2Question =
  | { id: "occupation"; label: string }
  | { id: "followup"; label: string; field: keyof OccupationFollowUp }
  | { id: "residenceCountry"; label: string }
  | { id: "residenceCity"; label: string }
  | { id: "mobileCountryCode"; label: string }
  | { id: "mobilePhone"; label: string };

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

function occupationFollowUpValidationError(code: string, detail: OccupationFollowUp | undefined): string | null {
  const config = OCCUPATION_FOLLOW_UP_LABELS[code];
  if (!config) return null;
  const normalized = detail ?? emptyFollowUp();
  if (config.fields.includes("company") && !normalized.company.trim()) {
    return `Please add company for ${config.title.replace(" details", "").toLowerCase()}.`;
  }
  if (config.fields.includes("role") && !normalized.role.trim()) {
    return `Please add role for ${config.title.replace(" details", "").toLowerCase()}.`;
  }
  if (config.fields.includes("university") && !normalized.university.trim()) {
    return "Please add university for PhD / Research.";
  }
  if (config.fields.includes("industry") && !normalized.industry.trim()) {
    return "Please add industry for your venture.";
  }
  if (config.fields.includes("other") && !normalized.other.trim()) {
    return "Please add details for Other.";
  }
  return null;
}

function departmentInVocab(code: string | null): boolean {
  if (!code) return false;
  return DEPARTMENTS.some((x) => x.code === code);
}

type OnboardingDropdownOption = { value: string; label: string };

type OnboardingSearchSelectProps = {
  value: string | null;
  options: OnboardingDropdownOption[];
  placeholder: string;
  onChange: (value: string | null) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onAdvanceEnter?: () => void;
};

function OnboardingSearchSelect({
  value,
  options,
  placeholder,
  onChange,
  inputRef,
  onAdvanceEnter,
}: OnboardingSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? "",
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="onboarding-welcome__search-select" ref={rootRef}>
      <div className="onboarding-welcome__search-select-control">
        <input
          ref={inputRef}
          className="onboarding-welcome__inline-select onboarding-welcome__search-select-input"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery("");
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (open) {
              const top = filteredOptions[0];
              if (top) {
                onChange(top.value);
                setOpen(false);
                setQuery("");
              }
              return;
            }
            onAdvanceEnter?.();
          }}
        />
        <span className="onboarding-welcome__search-select-icon" aria-hidden>
          ⌕
        </span>
      </div>
      {open ? (
        <div className="onboarding-welcome__search-select-panel" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`onboarding-welcome__search-select-option${value === option.value ? " onboarding-welcome__search-select-option--active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p className="onboarding-welcome__search-select-empty">No matches found</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Onboarding() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const authPerson = auth.status === "authenticated" ? auth.person : null;
  const authMyProfile = auth.status === "authenticated" ? auth.myProfile : undefined;
  const authMyProfileError = auth.status === "authenticated" ? auth.myProfileError : undefined;
  const [stepIndex, setStepIndex] = useState(0);
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
  const departmentSelectRef = useRef<HTMLInputElement>(null);
  const [selectedOccupationCodes, setSelectedOccupationCodes] = useState<Set<string>>(new Set());
  const [existingOccupationCodes, setExistingOccupationCodes] = useState<Set<string>>(new Set());
  const [existingOccupationsByCode, setExistingOccupationsByCode] = useState<Map<string, MyOccupationView>>(new Map());
  const [occupationFollowUps, setOccupationFollowUps] = useState<Record<string, OccupationFollowUp>>({});
  const [residenceCountry, setResidenceCountry] = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [mobileCountryCode, setMobileCountryCode] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [gate, setGate] = useState<"loading" | "allow" | "redirect">("loading");
  const [alreadySetUp, setAlreadySetUp] = useState(false);
  /** True once the first profile load has been judged, so a same-session completion cannot flip the notice on. */
  const firstProfileJudgedRef = useRef(false);
  const [welcomeProfile, setWelcomeProfile] = useState<MyProfileView | null>(null);
  const [stepRenderVersion, setStepRenderVersion] = useState(0);
  const [step1QuestionIndex, setStep1QuestionIndex] = useState(0);
  const [step2QuestionIndex, setStep2QuestionIndex] = useState(0);
  const analyticsStartedRef = useRef(false);
  const step1ProgressRef = useRef(0);
  const step2ProgressRef = useRef(0);

  const activeOccupationCode = useMemo(
    () => [...selectedOccupationCodes][0] ?? null,
    [selectedOccupationCodes]
  );
  const activeOccupationFollowUpConfig = activeOccupationCode
    ? OCCUPATION_FOLLOW_UP_LABELS[activeOccupationCode]
    : undefined;
  const step1QuestionCount = 6;
  const step2Questions = useMemo<Step2Question[]>(() => {
    const questions: Step2Question[] = [{ id: "occupation", label: "What best describes your current role?" }];
    if (activeOccupationFollowUpConfig) {
      for (const field of activeOccupationFollowUpConfig.fields) {
        const labelByField: Record<keyof OccupationFollowUp, string> = {
          company: "Company",
          role: "Role",
          university: "University",
          industry: "Industry",
          other: "Please specify",
        };
        questions.push({ id: "followup", label: labelByField[field], field });
      }
    }
    questions.push(
      { id: "residenceCountry", label: "Current country of residence" },
      { id: "residenceCity", label: "Current city of residence" },
      { id: "mobileCountryCode", label: "Country code" },
      { id: "mobilePhone", label: "Mobile number" }
    );
    return questions;
  }, [activeOccupationFollowUpConfig]);
  const maxStep2QuestionIndex = Math.max(0, step2Questions.length - 1);
  if (step2QuestionIndex > maxStep2QuestionIndex) {
    setStep2QuestionIndex(maxStep2QuestionIndex);
  }
  const step2CurrentQuestion = step2Questions[step2QuestionIndex];
  /** One running count across both sections (section two used to restart at 1). */
  const progressTotal = step1QuestionCount + step2Questions.length;
  const progressCurrent =
    stepIndex === 2 ? step1QuestionCount + step2QuestionIndex + 1 : step1QuestionIndex + 1;
  const step1QuestionId = useMemo(() => {
    if (step1QuestionIndex === 0) return "first_name";
    if (step1QuestionIndex === 1) return "last_name";
    if (step1QuestionIndex === 2) return "department";
    if (step1QuestionIndex === 3) return "degree";
    if (step1QuestionIndex === 4) return "join_year";
    return "graduation_year";
  }, [step1QuestionIndex]);

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
      if (!firstProfileJudgedRef.current) {
        firstProfileJudgedRef.current = true;
        if (p.onboardingCompletedAt) setAlreadySetUp(true);
      }
      if (!canResumeOnboarding(p)) {
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
  const departmentOptions = useMemo<OnboardingDropdownOption[]>(() => {
    const normalized = departmentCode?.trim().toLowerCase() ?? "";
    const vocabOptions = DEPARTMENTS.map((department) => ({
      value: department.code,
      label: department.label,
    }));
    if (normalized && !departmentInVocab(normalized)) {
      return [
        { value: normalized, label: `${parsedDeptLabel ?? normalized} (from email)` },
        ...vocabOptions,
      ];
    }
    return vocabOptions;
  }, [departmentCode, parsedDeptLabel]);
  const degreeOptions = useMemo<OnboardingDropdownOption[]>(
    () => DEGREES.map((degree) => ({ value: degree.code, label: degree.label })),
    []
  );

  const goTo = (step: number) => {
    setSaveError(null);
    const nextStep = Math.min(2, Math.max(0, step));
    if (nextStep !== 1) setStep1QuestionIndex(0);
    if (nextStep !== 2) setStep2QuestionIndex(0);
    setStepIndex((prev) => {
      const next = Math.min(2, Math.max(0, step));
      if (next !== prev) setStepRenderVersion((v) => v + 1);
      return next;
    });
  };

  const handleOnboardingStart = () => {
    if (!analyticsStartedRef.current) {
      analyticsStartedRef.current = true;
      trackBetaUsageEvent("onboarding_started", { source: "welcome_start" });
    }
    goTo(1);
  };

  useEffect(() => {
    if (stepIndex !== 1) return;
    if (step1QuestionIndex <= step1ProgressRef.current) return;
    step1ProgressRef.current = step1QuestionIndex;
    trackBetaUsageEvent("onboarding_step_advanced", {
      stage: "profile",
      questionId: step1QuestionId,
      questionIndex: step1QuestionIndex + 1,
    });
  }, [stepIndex, step1QuestionId, step1QuestionIndex]);

  useEffect(() => {
    if (stepIndex !== 2) return;
    if (step2QuestionIndex <= step2ProgressRef.current) return;
    step2ProgressRef.current = step2QuestionIndex;
    trackBetaUsageEvent("onboarding_step_advanced", {
      stage: "occupation_contact",
      questionId: step2CurrentQuestion?.id ?? "unknown",
      questionIndex: step2QuestionIndex + 1,
    });
  }, [step2CurrentQuestion?.id, step2QuestionIndex, stepIndex]);

  useEffect(() => {
    if (!saveError) return;
    const questionId =
      stepIndex === 1
        ? step1QuestionId
        : stepIndex === 2
          ? (step2CurrentQuestion?.id ?? "unknown")
          : "unknown";
    trackBetaUsageEvent("onboarding_validation_error", {
      stepIndex,
      questionId,
      message: saveError,
    });
  }, [saveError, step1QuestionId, step2CurrentQuestion?.id, stepIndex]);



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

  const step1QuestionError = (questionIndex: number): string | null => {
    switch (questionIndex) {
      case 0:
        return firstName.trim() ? null : "Please enter your first name.";
      case 1:
        return lastName.trim() ? null : "Please enter your last name.";
      case 2:
        return departmentCode ? null : "Please select your department.";
      case 3:
        return degreeCode ? null : "Please select your degree.";
      case 4: {
        const joinT = joinYearText.trim();
        if (!joinT) return "Please enter your year of joining.";
        const y = Number(joinT);
        if (!Number.isInteger(y) || y < JOIN_YEAR_MIN || y > joinYearMax()) {
          return "Please enter a valid year you joined.";
        }
        return null;
      }
      case 5:
        return batchYear != null ? null : "Please select your graduation year.";
      default:
        return null;
    }
  };

  const step2QuestionError = (question: Step2Question): string | null => {
    if (question.id === "occupation") {
      return selectedOccupationCodes.size > 0 ? null : "Please select your occupation type.";
    }
    if (question.id === "followup") {
      const detail = occupationFollowUps[activeOccupationCode ?? ""] ?? emptyFollowUp();
      const value = detail[question.field].trim();
      if (!value) return `Please add ${question.label.toLowerCase()}.`;
      return null;
    }
    if (question.id === "residenceCountry") {
      return residenceCountry.trim() ? null : "Please enter your current country of residence.";
    }
    if (question.id === "residenceCity") {
      return residenceCity.trim() ? null : "Please enter your current city of residence.";
    }
    if (question.id === "mobileCountryCode") {
      return mobileCountryCode.trim() ? null : "Please enter your country code.";
    }
    const compactPhone = mobilePhone.trim().replace(/[^\d]/g, "");
    if (!compactPhone) return "Please enter your mobile number.";
    if (compactPhone.length !== 10) return "Please enter a valid 10-digit mobile number.";
    return null;
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
    if (!activeOccupationCode) {
      setSaveError("Please select your occupation type.");
      return;
    }
    const followUpError = occupationFollowUpValidationError(
      activeOccupationCode,
      occupationFollowUps[activeOccupationCode]
    );
    if (followUpError) {
      setSaveError(followUpError);
      return;
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
    const errDone = await saveProfile({ markOnboardingComplete: true });
    if (errDone) return;
    trackBetaUsageEvent("onboarding_completed", {
      totalStep1Questions: step1QuestionCount,
      totalStep2Questions: step2Questions.length,
    });
    navigate("/home?fromOnboarding=1", { replace: true });
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

  const advanceStep1Question = () => {
    const err = step1QuestionError(step1QuestionIndex);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaveError(null);
    if (step1QuestionIndex < step1QuestionCount - 1) {
      setStep1QuestionIndex((i) => i + 1);
      return;
    }
    void handleStep1Next();
  };

  const advanceStep2Question = () => {
    if (!step2CurrentQuestion) return;
    const err = step2QuestionError(step2CurrentQuestion);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaveError(null);
    if (step2QuestionIndex < step2Questions.length - 1) {
      setStep2QuestionIndex((i) => i + 1);
      return;
    }
    void handleStep2Next();
  };

  const handleStep1FieldEnter = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (saving) return;
    advanceStep1Question();
  };

  const handleStep2FieldEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (saving) return;
    advanceStep2Question();
  };

  const handleInlineEnterAdvance = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") return;
    if (event.defaultPrevented) return;
    if (saving) return;
    const target = event.target;
    if (target instanceof HTMLButtonElement) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLInputElement) return;
    event.preventDefault();
    if (stepIndex === 1) {
      advanceStep1Question();
      return;
    }
    if (stepIndex === 2) {
      advanceStep2Question();
      return;
    }
  };

  useEffect(() => {
    if (stepIndex <= 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (event.repeat) return;
      if (event.defaultPrevented) return;
      if (saving) return;
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLButtonElement && activeElement.classList.contains("btn")) {
        return;
      }
      event.preventDefault();
      if (stepIndex === 1) {
        advanceStep1Question();
        return;
      }
      if (stepIndex === 2) {
        advanceStep2Question();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
    return (
      <Navigate
        to="/home"
        replace
        state={alreadySetUp ? noticeState(ALREADY_SET_UP_NOTICE) : undefined}
      />
    );
  }

  if (auth.status === "authenticated" && welcomeProfile) {
    return (
      <OnboardingWelcome
        onBegin={handleOnboardingStart}
        showBeginButton={stepIndex === 0}
      >
        {stepIndex > 0 ? (
          <div key={`onboarding-step-${stepIndex}-${stepRenderVersion}`} className="onboarding-flow__panel">
            <div className="onboarding-welcome__inline-question" onKeyDown={handleInlineEnterAdvance}>
              {stepIndex === 1 ? (
                <>
                  <OnboardingProgress current={progressCurrent} total={progressTotal} />
                  <div className="onboarding-welcome__question-head">
                    <span className="onboarding-welcome__question-index">{progressCurrent}</span>
                    <p className="onboarding-welcome__inline-label">
                      {step1QuestionIndex === 0 ? "What is your first name?" : null}
                      {step1QuestionIndex === 1 ? "What is your last name?" : null}
                      {step1QuestionIndex === 2 ? "Which department were you in?" : null}
                      {step1QuestionIndex === 3 ? "Which degree did you complete?" : null}
                      {step1QuestionIndex === 4 ? "Which year did you join IIT BHU?" : null}
                      {step1QuestionIndex === 5 ? "Which year did you graduate?" : null}
                    </p>
                  </div>
                  {step1QuestionIndex === 0 ? <input className="onboarding-welcome__inline-input" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} onKeyDown={handleStep1FieldEnter} /> : null}
                  {step1QuestionIndex === 1 ? <input className="onboarding-welcome__inline-input" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} onKeyDown={handleStep1FieldEnter} /> : null}
                  {step1QuestionIndex === 2 ? (
                    <OnboardingSearchSelect
                      inputRef={departmentSelectRef}
                      value={departmentCode}
                      options={departmentOptions}
                      placeholder="Type or select an option"
                      onChange={setDepartmentCode}
                      onAdvanceEnter={advanceStep1Question}
                    />
                  ) : null}
                  {step1QuestionIndex === 3 ? (
                    <OnboardingSearchSelect
                      value={degreeCode}
                      options={degreeOptions}
                      placeholder="Type or select an option"
                      onChange={setDegreeCode}
                      onAdvanceEnter={advanceStep1Question}
                    />
                  ) : null}
                  {step1QuestionIndex === 4 ? <input className="onboarding-welcome__inline-input onboarding-welcome__inline-input--narrow" type="number" inputMode="numeric" min={JOIN_YEAR_MIN} max={joinYearMax()} step={1} value={joinYearText} onChange={(e) => onJoinYearTextChange(e.target.value)} onKeyDown={handleStep1FieldEnter} /> : null}
                  {step1QuestionIndex === 5 ? (
                    <div className="onboarding-welcome__inline-options">
                      <button type="button" className={`onboarding-welcome__inline-option ${batchYear === gradYear4 ? "onboarding-welcome__inline-option--active" : ""}`} onClick={() => pickProgram(4)}>{gradYear4} (4-year)</button>
                      <button type="button" className={`onboarding-welcome__inline-option ${batchYear === gradYear5 ? "onboarding-welcome__inline-option--active" : ""}`} onClick={() => pickProgram(5)}>{gradYear5} (5-year)</button>
                    </div>
                  ) : null}
                  {saveError ? <p className="onboarding-welcome__inline-error">{saveError}</p> : null}
                  <div className="onboarding-welcome__inline-actions">
                    <Button type="button" variant="back" onClick={() => { setSaveError(null); if (step1QuestionIndex > 0) { setStep1QuestionIndex((i) => i - 1); return; } goTo(0); }} disabled={saving}>Back</Button>
                    <Button variant="primary" disabled={saving} onClick={advanceStep1Question}>{saving ? "Saving…" : step1QuestionIndex < step1QuestionCount - 1 ? "OK" : "Looks right →"}</Button>
                  </div>
                </>
              ) : null}
              {stepIndex === 2 ? (
                <>
                  <OnboardingProgress current={progressCurrent} total={progressTotal} />
                  <div className="onboarding-welcome__question-head">
                    <span className="onboarding-welcome__question-index">{progressCurrent}</span>
                    <p className="onboarding-welcome__inline-label">
                    {step2CurrentQuestion?.id === "occupation" ? "What best describes your current role?" : null}
                    {step2CurrentQuestion?.id === "followup" ? `${step2CurrentQuestion.label} *` : null}
                    {step2CurrentQuestion?.id === "residenceCountry" ? "What is your current country of residence?" : null}
                    {step2CurrentQuestion?.id === "residenceCity" ? "What is your current city of residence?" : null}
                    {step2CurrentQuestion?.id === "mobileCountryCode" ? "What is your country code?" : null}
                    {step2CurrentQuestion?.id === "mobilePhone" ? "What is your mobile number?" : null}
                    </p>
                  </div>
                  {step2CurrentQuestion?.id === "occupation" ? (
                    <div className="onboarding-welcome__inline-options onboarding-welcome__inline-options--stack">
                      {OCCUPATION_OPTIONS.map(({ label, code }) => <Chip key={code} active={selectedOccupationCodes.has(code)} onClick={() => toggleOccupation(code)}>{label}</Chip>)}
                    </div>
                  ) : null}
                  {step2CurrentQuestion?.id === "followup" ? <input className="onboarding-welcome__inline-input" autoComplete={step2CurrentQuestion.field === "company" || step2CurrentQuestion.field === "university" ? "organization" : "off"} value={activeOccupationCode ? (occupationFollowUps[activeOccupationCode] ?? emptyFollowUp())[step2CurrentQuestion.field] : ""} onChange={(e) => { if (!activeOccupationCode) return; updateOccupationFollowUp(activeOccupationCode, step2CurrentQuestion.field, e.target.value); }} onKeyDown={handleStep2FieldEnter} /> : null}
                  {step2CurrentQuestion?.id === "residenceCountry" ? <input className="onboarding-welcome__inline-input" autoComplete="country-name" value={residenceCountry} onChange={(e) => setResidenceCountry(e.target.value)} onKeyDown={handleStep2FieldEnter} /> : null}
                  {step2CurrentQuestion?.id === "residenceCity" ? <input className="onboarding-welcome__inline-input" autoComplete="address-level2" value={residenceCity} onChange={(e) => setResidenceCity(e.target.value)} onKeyDown={handleStep2FieldEnter} /> : null}
                  {step2CurrentQuestion?.id === "mobileCountryCode" ? <input className="onboarding-welcome__inline-input onboarding-welcome__inline-input--narrow" autoComplete="tel-country-code" inputMode="tel" value={mobileCountryCode} onChange={(e) => setMobileCountryCode(e.target.value)} onKeyDown={handleStep2FieldEnter} /> : null}
                  {step2CurrentQuestion?.id === "mobilePhone" ? <input className="onboarding-welcome__inline-input" autoComplete="tel-national" inputMode="tel" value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} onKeyDown={handleStep2FieldEnter} /> : null}
                  {saveError ? <p className="onboarding-welcome__inline-error">{saveError}</p> : null}
                  <div className="onboarding-welcome__inline-actions">
                    <Button variant="back" onClick={() => { setSaveError(null); if (step2QuestionIndex > 0) { setStep2QuestionIndex((i) => i - 1); return; } goTo(1); }} disabled={saving}>Back</Button>
                    <Button variant="primary" onClick={advanceStep2Question} disabled={saving}>{saving ? "Saving…" : step2QuestionIndex < step2Questions.length - 1 ? "OK" : "Continue"}</Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </OnboardingWelcome>
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
          <Button variant="primary" onClick={() => goTo(1)}>
            Get started
          </Button>
        </div>
      </div>
    </>
  );
}
