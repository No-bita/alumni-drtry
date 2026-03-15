import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { ProgressBar } from "../components/ProgressBar";
import { StepTabs } from "../components/StepTabs";
import { Input, Textarea } from "../components/Input";
import { Chip } from "../components/Chip";
import { api, type MeProfileResponse, type MeOccupationsResponse } from "../api/client";
import { DEPARTMENTS } from "../constants/departments";
import { CAMPUS_IMAGE, CAMPUS_IMAGE_SMALL } from "../constants/images";

const STEPS = [
  { id: 0, name: "Welcome" },
  { id: 1, name: "Name" },
  { id: 2, name: "Batch" },
  { id: 3, name: "Occupation" },
  { id: 4, name: "Links & Bio" },
  { id: 5, name: "Done" },
];

const BATCH_OPTIONS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015];

const OCCUPATION_OPTIONS: { label: string; code: string }[] = [
  { label: "Full time employment", code: "full_time_employment" },
  { label: "Part time employment", code: "part_time_employment" },
  { label: "PhD / Research", code: "phd_research" },
  { label: "Founded a venture", code: "founded_venture" },
  { label: "Freelance / Consulting", code: "freelance_consulting" },
  { label: "Other", code: "other" },
];

export function Onboarding() {
  const [searchParams] = useSearchParams();
  const stepParam = searchParams.get("step");
  const stepIndex = stepParam ? Math.min(5, Math.max(0, parseInt(stepParam, 10))) : 0;
  const [name, setName] = useState("");
  const [batchYear, setBatchYear] = useState<number | null>(null);
  const [departmentCode, setDepartmentCode] = useState<string | null>(null);
  const [selectedOccupationCodes, setSelectedOccupationCodes] = useState<Set<string>>(new Set());
  const [existingOccupationCodes, setExistingOccupationCodes] = useState<Set<string>>(new Set());
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get<MeProfileResponse>("/v1/me/profile"),
      api.get<MeOccupationsResponse>("/v1/me/occupations"),
    ]).then(([profileRes, occupationsRes]) => {
      if (profileRes.data?.profile) {
        const p = profileRes.data.profile;
        if (p.fullName) setName(p.fullName);
        if (p.batchYear != null) setBatchYear(p.batchYear);
        const dept = p.departmentCode ?? p.parsedDepartmentCode;
        if (dept) setDepartmentCode(dept.toLowerCase());
        if (p.bio) setBio(p.bio);
      }
      if (occupationsRes.data?.occupations) {
        setExistingOccupationCodes(new Set(occupationsRes.data.occupations.map((o) => o.occupationTypeCode)));
        setSelectedOccupationCodes(new Set(occupationsRes.data.occupations.map((o) => o.occupationTypeCode)));
      }
    });
  }, []);

  const progress = (stepIndex + 1) / (STEPS.length + 1);
  const showTabs = stepIndex > 0 && stepIndex < 5;

  const goTo = (step: number) => {
    setSaveError(null);
    navigate(`/onboarding?step=${step}`);
  };

  const saveProfile = async (payload: { fullName?: string; batchYear?: number; departmentCode?: string; bio?: string | null }) => {
    const keys = Object.keys(payload) as (keyof typeof payload)[];
    const body = keys.reduce((acc, k) => {
      const v = payload[k];
      if (v !== undefined && v !== null && v !== "") acc[k] = v;
      return acc;
    }, {} as Record<string, unknown>);
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    const { error } = await api.patch("/v1/me/profile", body);
    setSaving(false);
    if (error) {
      setSaveError(error.message ?? error.code);
      return true;
    }
    return false;
  };

  const handleStep1Next = async () => {
    if (name.trim()) {
      const err = await saveProfile({ fullName: name.trim() });
      if (err) return;
    }
    goTo(2);
  };

  const handleStep2Next = async () => {
    if (batchYear != null || departmentCode) {
      const err = await saveProfile({ batchYear: batchYear ?? undefined, departmentCode: departmentCode ?? undefined });
      if (err) return;
    }
    goTo(3);
  };

  const handleStep3Next = async () => {
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
    goTo(4);
  };

  const handleStep4Finish = async () => {
    const err = await saveProfile({ bio: bio.trim() || null });
    if (err) return;
    goTo(5);
  };

  const toggleOccupation = (code: string) => {
    setSelectedOccupationCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  if (stepIndex === 0) {
    return (
      <>
        <Nav />
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
            <p className="eyebrow" style={{ marginBottom: 8 }}>Welcome back</p>
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

  if (stepIndex === 5) {
    return (
      <>
        <Nav />
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
            <p className="eyebrow" style={{ marginBottom: 8 }}>You’re all set</p>
            <h1 className="page-headline" style={{ color: "var(--cream)", marginBottom: 12 }}>
              You’re part of the <span className="italic-accent">directory</span>.
            </h1>
            <p style={{ color: "rgba(242,237,228,0.8)", marginBottom: 24 }}>
              Other alumni can now find you and reach out.
            </p>
            <Button variant="primary" onClick={() => navigate("/search")}>
              Explore directory
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <ProgressBar value={progress} />
      {showTabs && (
        <StepTabs
          steps={STEPS.slice(1, 5).map((s) => ({
            id: s.id,
            name: s.name,
            done: s.id < stepIndex,
          }))}
          current={stepIndex}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", minHeight: "60vh" }}>
        <div
          className="campus-panel"
          style={{
            backgroundImage: `url(${CAMPUS_IMAGE_SMALL})`,
          }}
        />
        <div className="form-panel">
          {stepIndex === 1 && (
            <>
              <p className="eyebrow" style={{ marginBottom: 8 }}>Step 1</p>
              <h2 className="section-headline" style={{ marginBottom: 16 }}>Your name</h2>
              <Input
                label="Full name"
                placeholder="As you’d like to appear in the directory"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ marginBottom: 24 }}
              />
              {saveError && <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{saveError}</p>}
              <div className="form-panel__footer">
                <Button variant="skip" onClick={() => goTo(2)} disabled={saving}>Skip</Button>
                <Button variant="primary" onClick={handleStep1Next} disabled={saving}>{saving ? "Saving…" : "Next"}</Button>
              </div>
            </>
          )}
          {stepIndex === 2 && (
            <>
              <p className="eyebrow" style={{ marginBottom: 8 }}>Step 2</p>
              <h2 className="section-headline" style={{ marginBottom: 16 }}>Batch & department</h2>
              <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 16 }}>
                We may have parsed this from your email — confirm or pick.
              </p>
              <div className="ui-label" style={{ marginBottom: 8 }}>Graduation year</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {BATCH_OPTIONS.map((y) => (
                  <Chip
                    key={y}
                    active={batchYear === y}
                    onClick={() => setBatchYear(batchYear === y ? null : y)}
                  >
                    {y}
                  </Chip>
                ))}
              </div>
              <div className="ui-label" style={{ marginBottom: 8 }}>Department</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                {DEPARTMENTS.map((d) => (
                  <Chip
                    key={d.code}
                    active={departmentCode === d.code}
                    onClick={() => setDepartmentCode(departmentCode === d.code ? null : d.code)}
                  >
                    {d.label}
                  </Chip>
                ))}
              </div>
              {saveError && <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{saveError}</p>}
              <div className="form-panel__footer">
                <Button variant="back" onClick={() => goTo(1)} disabled={saving}>Back</Button>
                <Button variant="primary" onClick={handleStep2Next} disabled={saving}>{saving ? "Saving…" : "Next"}</Button>
              </div>
            </>
          )}
          {stepIndex === 3 && (
            <>
              <p className="eyebrow" style={{ marginBottom: 8 }}>Step 3</p>
              <h2 className="section-headline" style={{ marginBottom: 16 }}>Occupation type</h2>
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
              {saveError && <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{saveError}</p>}
              <div className="form-panel__footer">
                <Button variant="back" onClick={() => goTo(2)} disabled={saving}>Back</Button>
                <Button variant="primary" onClick={handleStep3Next} disabled={saving}>{saving ? "Saving…" : "Next"}</Button>
              </div>
            </>
          )}
          {stepIndex === 4 && (
            <>
              <p className="eyebrow" style={{ marginBottom: 8 }}>Step 4</p>
              <h2 className="section-headline" style={{ marginBottom: 16 }}>Bio & links</h2>
              <Textarea
                label="Short bio"
                placeholder="A few lines about you — shared with other alumni."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                style={{ marginBottom: 16 }}
              />
              {saveError && <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{saveError}</p>}
              <div className="form-panel__footer">
                <Button variant="back" onClick={() => goTo(3)} disabled={saving}>Back</Button>
                <Button variant="primary" onClick={handleStep4Finish} disabled={saving}>{saving ? "Saving…" : "Finish"}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
