import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MeOccupationsResponse } from "../../api/client";
import { assertApiGet } from "../../lib/assertApiGet";
import { alumniCount, hiringEligible } from "../../lib/broker";
import {
  EXPERIENCE_BANDS,
  EXPERIENCE_BAND_LABELS,
  JOB_FUNCTIONS,
  JOB_FUNCTION_LABELS,
  hiringHeaderLine,
} from "../../lib/jobFunctions";
import { queryKeys } from "../../lib/queryKeys";
import { HIRING_BODY_MAX, HIRING_BODY_MIN, HIRING_SHORT_MAX as SHORT_MAX, hiringLocation, hiringProblems, type HiringDraft, type HiringWhere } from "../../lib/hiringDraft";
import { FormField } from "../forms";
import { TapPills } from "../TapPills";
import "../../styles/broker.css";

type Props = {
  draft: HiringDraft;
  onChange: (next: HiringDraft) => void;
  myCity: string | null;
  attempted: boolean;
};

const FUNCTION_OPTIONS = JOB_FUNCTIONS.map((f) => ({ value: f, label: JOB_FUNCTION_LABELS[f] }));
const EXPERIENCE_OPTIONS = EXPERIENCE_BANDS.map((b) => ({ value: b, label: EXPERIENCE_BAND_LABELS[b] }));
const RESPOND_OPTIONS = [
  { value: "reachout" as const, label: "Reach out to me" },
  { value: "link" as const, label: "Apply via link" },
];

/**
 * Careers → Hiring: one tap at a time. Function (with an optional role title) → experience → where →
 * company (your current one, changeable) → how people respond → the details. No heading: the card
 * header is built from these answers.
 */
export function HiringCompose({ draft, onChange, myCity, attempted }: Props) {
  const set = (patch: Partial<HiringDraft>) => onChange({ ...draft, ...patch });
  const problems = hiringProblems(draft);
  const occupations = useQuery({
    queryKey: queryKeys.me.occupations(),
    queryFn: ({ signal }) => assertApiGet<MeOccupationsResponse>("/v1/me/occupations", signal),
  });
  const currentCompany = occupations.data?.occupations.find((o) => o.isCurrent && o.organizationName?.trim())?.organizationName?.trim() ?? "";

  // Prefill the company with the member's current employer until they edit it.
  useEffect(() => {
    if (!draft.companyTouched && currentCompany && draft.company !== currentCompany) onChange({ ...draft, company: currentCompany });
  }, [currentCompany, draft, onChange]);

  const whereOptions: Array<{ value: HiringWhere; label: string }> = [
    ...(myCity ? [{ value: "my_city" as const, label: myCity }] : []),
    { value: "remote", label: "Remote" },
    { value: "hybrid", label: "Hybrid" },
    { value: "other", label: myCity ? "Another city" : "A city" },
  ];

  // How many matching alumni would be asked; only the answer for the current taps counts.
  const eligibleKey = draft.jobFunction && draft.experience ? `${draft.jobFunction}:${draft.experience}` : null;
  const [eligibleFor, setEligibleFor] = useState<{ key: string; count: number | null } | null>(null);
  useEffect(() => {
    if (!draft.jobFunction || !draft.experience) return;
    const key = `${draft.jobFunction}:${draft.experience}`;
    const ctl = new AbortController();
    void hiringEligible(draft.jobFunction, draft.experience, ctl.signal).then(({ data }) => {
      if (!ctl.signal.aborted) setEligibleFor({ key, count: data?.count ?? null });
    });
    return () => ctl.abort();
  }, [draft.jobFunction, draft.experience]);
  const eligible = eligibleFor && eligibleFor.key === eligibleKey ? eligibleFor.count : null;

  const showExperience = draft.jobFunction !== null;
  const showWhere = showExperience && draft.experience !== null;
  const showRest = showWhere && draft.where !== null;

  return (
    <div className="hiring-compose">
      <TapPills
        label="Which function?"
        options={FUNCTION_OPTIONS}
        value={draft.jobFunction}
        onChange={(jobFunction) => set({ jobFunction })}
        error={attempted && problems.includes("function") ? "Pick a function" : undefined}
      />
      {draft.jobFunction ? (
        <div className="broker-step-in">
          <FormField label="Role title" help="Optional, e.g. Senior PM, Payments" error={problems.includes("role title") ? `Up to ${SHORT_MAX} characters` : undefined}>
            <input className="input" value={draft.roleTitle} maxLength={SHORT_MAX} autoComplete="off" onChange={(e) => set({ roleTitle: e.target.value })} />
          </FormField>
        </div>
      ) : null}
      {showExperience ? (
        <div className="broker-step-in">
          <TapPills
            label="Experience level?"
            options={EXPERIENCE_OPTIONS}
            value={draft.experience}
            onChange={(experience) => set({ experience })}
            error={attempted && problems.includes("experience") ? "Pick an experience level" : undefined}
          />
        </div>
      ) : null}
      {showWhere ? (
        <div className="broker-step-in">
          <TapPills label="Where?" options={whereOptions} value={draft.where} onChange={(where) => set({ where })} />
          {draft.where === "other" ? (
            <FormField label="City">
              <input className="input" value={draft.otherCity} maxLength={SHORT_MAX} autoComplete="address-level2" onChange={(e) => set({ otherCity: e.target.value })} />
            </FormField>
          ) : null}
        </div>
      ) : null}
      {showRest ? (
        <>
          <div className="broker-step-in">
            <FormField label="Company" help={currentCompany ? "Your current company. Change it if you're hiring for another." : undefined}>
              <input className="input" value={draft.company} maxLength={SHORT_MAX} autoComplete="organization" onChange={(e) => set({ company: e.target.value, companyTouched: true })} />
            </FormField>
          </div>
          <div className="broker-step-in">
            <TapPills
              label="How should people respond?"
              options={RESPOND_OPTIONS}
              value={draft.respondVia}
              onChange={(respondVia) => set({ respondVia })}
              error={attempted && problems.includes("how to respond") ? "Pick how people should respond" : undefined}
            />
            {draft.respondVia === "link" ? (
              <FormField label="Apply link" required error={attempted && problems.includes("apply link") ? "Add the link (starting with https://)" : undefined}>
                <input className="input" type="url" inputMode="url" value={draft.applyUrl} autoComplete="off" placeholder="https://…" onChange={(e) => set({ applyUrl: e.target.value })} />
              </FormField>
            ) : null}
          </div>
          {draft.respondVia ? (
            <div className="broker-step-in hiring-compose">
              <FormField
                label="Details"
                required
                help={`${draft.body.trim().length} / ${HIRING_BODY_MAX}`}
                error={attempted && problems.includes("details") ? `Write at least ${HIRING_BODY_MIN} characters` : undefined}
              >
                <textarea
                  className="input input--textarea"
                  rows={4}
                  value={draft.body}
                  maxLength={HIRING_BODY_MAX}
                  placeholder="What the role involves and who'd be a great fit."
                  onChange={(e) => set({ body: e.target.value })}
                />
              </FormField>
              {draft.jobFunction && draft.experience ? (
                <p className="broker-header-line" aria-label="Card header preview">
                  {hiringHeaderLine({ jobFunction: draft.jobFunction, experience: draft.experience, location: hiringLocation(draft, myCity), company: draft.company })}
                </p>
              ) : null}
              <div className="hiring-compose__private">
                <input
                  id="hiring-ask-privately"
                  type="checkbox"
                  checked={draft.askPrivately}
                  disabled={eligible === 0}
                  onChange={(e) => set({ askPrivately: e.target.checked })}
                />
                <label htmlFor="hiring-ask-privately">
                  Also ask matching alumni privately
                  <span>
                    {eligible === null
                      ? "We ask alumni with this function and experience, and connect you with whoever says yes."
                      : eligible === 0
                        ? "No alumni match this function and experience yet."
                        : `We'll ask ${alumniCount(eligible)} with this function and experience, and connect you with whoever says yes.`}
                  </span>
                </label>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
