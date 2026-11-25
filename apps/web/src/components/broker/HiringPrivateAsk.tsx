import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type MeOccupationsResponse } from "../../api/client";
import { assertApiGet } from "../../lib/assertApiGet";
import { alumniCount, brokerKeys, hiringEligible, type BrokerRequest } from "../../lib/broker";
import { EXPERIENCE_BANDS, EXPERIENCE_BAND_LABELS, JOB_FUNCTIONS, JOB_FUNCTION_LABELS, type ExperienceBand, type JobFunction } from "../../lib/jobFunctions";
import { HIRING_BODY_MAX, HIRING_BODY_MIN, HIRING_SHORT_MAX } from "../../lib/hiringDraft";
import { queryKeys } from "../../lib/queryKeys";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../../hooks/useDialogFocusManager";
import { FormActions, FormField } from "../forms";
import { TapPills } from "../TapPills";
import { BrokerProgress } from "./BrokerProgress";
import "../../styles/broker.css";
import "../../styles/match.css";

const FUNCTION_OPTIONS = JOB_FUNCTIONS.map((f) => ({ value: f, label: JOB_FUNCTION_LABELS[f] }));
const EXPERIENCE_OPTIONS = EXPERIENCE_BANDS.map((b) => ({ value: b, label: EXPERIENCE_BAND_LABELS[b] }));

type Props = {
  /** From the Ask question: the role's function and title, and a company if one was named. */
  prefill: { jobFunction: JobFunction | null; roleTitle: string | null; company: string | null };
  onClose: () => void;
};

/**
 * Ask's Find candidates → "Ask them privately if they're interested": no Wall post. We ask alumni
 * with this function and experience on the hirer's behalf and connect whoever says yes (2-day window).
 */
export function HiringPrivateAsk({ prefill, onClose }: Props) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [jobFunction, setJobFunction] = useState<JobFunction | null>(prefill.jobFunction);
  const [experience, setExperience] = useState<ExperienceBand | null>(null);
  const [roleTitle, setRoleTitle] = useState((prefill.roleTitle ?? "").slice(0, HIRING_SHORT_MAX));
  const [company, setCompany] = useState<string | null>(prefill.company ? prefill.company.slice(0, HIRING_SHORT_MAX) : null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BrokerRequest | null>(null);

  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: dialogRef, onClose: sending ? undefined : onClose });

  // Company: the one named in the question, else the member's current employer, until they edit it.
  const occupations = useQuery({
    queryKey: queryKeys.me.occupations(),
    queryFn: ({ signal }) => assertApiGet<MeOccupationsResponse>("/v1/me/occupations", signal),
  });
  const currentCompany = occupations.data?.occupations.find((o) => o.isCurrent && o.organizationName?.trim())?.organizationName?.trim() ?? "";
  const companyValue = company ?? currentCompany;

  // How many would be asked, for the current taps only.
  const eligibleKey = jobFunction && experience ? `${jobFunction}:${experience}` : null;
  const [eligibleFor, setEligibleFor] = useState<{ key: string; count: number | null } | null>(null);
  useEffect(() => {
    if (!jobFunction || !experience) return;
    const key = `${jobFunction}:${experience}`;
    const ctl = new AbortController();
    void hiringEligible(jobFunction, experience, ctl.signal).then(({ data }) => {
      if (!ctl.signal.aborted) setEligibleFor({ key, count: data?.count ?? null });
    });
    return () => ctl.abort();
  }, [jobFunction, experience]);
  const eligible = eligibleFor && eligibleFor.key === eligibleKey ? eligibleFor.count : null;

  const msgLen = message.trim().length;
  const ready = Boolean(jobFunction && experience) && msgLen >= HIRING_BODY_MIN && msgLen <= HIRING_BODY_MAX && eligible !== 0;

  const send = async () => {
    if (!ready || !jobFunction || !experience || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await api.post<{ request: BrokerRequest }>("/v1/broker-requests", {
      kind: "hiring",
      role: {
        jobFunction,
        experience,
        roleTitle: roleTitle.trim() || null,
        company: companyValue.trim() || null,
        message: message.trim(),
      },
    });
    setSending(false);
    if (err || !data) {
      setError(err?.message ?? "Couldn't send. Try again.");
      return;
    }
    setDone(data.request);
    void queryClient.invalidateQueries({ queryKey: brokerKeys.all });
  };

  return (
    <div
      className="match-dialog__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="match-dialog" ref={dialogRef} tabIndex={-1}>
        <button type="button" className="match-dialog__close" aria-label="Close" onClick={onClose} disabled={sending}>
          ×
        </button>
        <h2 id={titleId} className="match-dialog__title">
          Ask matching alumni privately
        </h2>
        {done ? (
          <div role="status">
            <p className="broker-note">
              We&apos;ve privately asked {alumniCount(done.askedCount)} if they&apos;re interested. Nothing goes on the Wall, and you&apos;ll
              be connected with whoever says yes.
            </p>
            <BrokerProgress request={done} />
            <FormActions primary={{ label: "Done", onClick: onClose }} />
          </div>
        ) : (
          <form
            className="match-dialog__form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <p className="match-dialog__body">Nothing goes on the Wall. We ask alumni with this function and experience, and connect you with whoever says yes.</p>
            <TapPills label="Which function?" options={FUNCTION_OPTIONS} value={jobFunction} onChange={setJobFunction} />
            <TapPills label="Experience level?" options={EXPERIENCE_OPTIONS} value={experience} onChange={setExperience} />
            <div className="match-dialog__pair">
              <FormField label="Role title" help="Optional" className="match-dialog__field">
                <input className="match-dialog__input" value={roleTitle} maxLength={HIRING_SHORT_MAX} onChange={(e) => setRoleTitle(e.target.value)} />
              </FormField>
              <FormField label="Company" className="match-dialog__field">
                <input className="match-dialog__input" value={companyValue} maxLength={HIRING_SHORT_MAX} autoComplete="organization" onChange={(e) => setCompany(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Details" required help={`${msgLen} / ${HIRING_BODY_MAX}`}>
              <textarea
                className="match-dialog__textarea"
                rows={4}
                value={message}
                maxLength={HIRING_BODY_MAX}
                placeholder="What the role involves and who'd be a great fit."
                onChange={(e) => setMessage(e.target.value)}
              />
            </FormField>
            {jobFunction && experience ? (
              <p className={`broker-note${eligible === 0 ? " broker-note--warn" : ""}`} role="status">
                {eligible === null
                  ? "Checking who matches…"
                  : eligible === 0
                    ? "No alumni match this function and experience yet."
                    : `We'll ask ${alumniCount(eligible)}.`}
              </p>
            ) : null}
            {error ? (
              <p className="match-dialog__error" role="alert">
                {error}
              </p>
            ) : null}
            <FormActions
              secondary={{ label: "Cancel", onClick: onClose, disabled: sending }}
              primary={{ label: sending ? "Asking…" : "Ask privately", disabled: !ready || sending, onClick: () => void send() }}
            />
          </form>
        )}
      </div>
    </div>
  );
}
