import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../../hooks/useDialogFocusManager";
import { alumniCount, brokerKeys, fetchReferralCompaniesAll, referralEligible, type BrokerRequest } from "../../lib/broker";
import { JOB_FUNCTIONS, JOB_FUNCTION_LABELS, type JobFunction } from "../../lib/jobFunctions";
import { lengthCounter, NOTE_FIT_MAX, NOTE_FIT_MIN, NOTE_SHORT_FIELD_MAX, referralDetails, referralProblems } from "../../lib/noteForm";
import { queryKeys } from "../../lib/queryKeys";
import { FormActions, FormField } from "../forms";
import { TapPills } from "../TapPills";
import { BrokerProgress } from "./BrokerProgress";
import "../../styles/referral-discovery.css";
import "../../styles/broker.css";

type Props = {
  onClose: () => void;
  /** Prefill (e.g. from a company page). */
  initialCompany?: string;
};

type Eligibility = { state: "idle" } | { state: "checking" } | { state: "ok"; company: string; count: number } | { state: "error" };

const FUNCTION_OPTIONS = JOB_FUNCTIONS.map((f) => ({ value: f, label: JOB_FUNCTION_LABELS[f] }));

/**
 * Get a referral (brokered, the default): pick the company, tap your function, add the opening and why
 * you're a fit. Alma Mater asks every alum at that company for you and connects you with the first who
 * says yes. Each answer appears only after the one before it.
 */
export function ReferralRequestFlow({ onClose, initialCompany = "" }: Props) {
  const titleId = useId();
  const listId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [company, setCompany] = useState(initialCompany);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [jobFunction, setJobFunction] = useState<JobFunction | null>(null);
  const [role, setRole] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [fit, setFit] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<BrokerRequest | null>(null);
  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: dialog, onClose: sending ? undefined : onClose });

  const companies = useQuery({ queryKey: brokerKeys.companies(), queryFn: ({ signal }) => fetchReferralCompaniesAll(signal) });
  const options = useMemo(() => {
    const q = company.trim().toLocaleLowerCase();
    return (companies.data ?? []).filter((c) => c.company.toLocaleLowerCase().includes(q)).slice(0, 20);
  }, [companies.data, company]);
  const showing = open && options.length > 0;

  // Told before sending: how many alumni at this company would be asked (checked as you type, briefly
  // delayed). Only the answer for the company currently typed counts.
  const typed = company.trim();
  const [checked, setChecked] = useState<{ name: string; result: Eligibility } | null>(null);
  useEffect(() => {
    const name = company.trim();
    if (!name) return;
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      void referralEligible(name, ctl.signal).then(({ data, error: err }) => {
        if (ctl.signal.aborted) return;
        setChecked({ name, result: err || !data ? { state: "error" } : { state: "ok", company: data.company, count: data.count } });
      });
    }, 300);
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [company]);
  const eligibility: Eligibility = !typed ? { state: "idle" } : checked && checked.name === typed ? checked.result : { state: "checking" };

  const companyReady = eligibility.state === "ok" && eligibility.count > 0;
  const fields = { jobUrl, role, company: eligibility.state === "ok" ? eligibility.company : company, fit, resumeUrl };
  const problems = referralProblems(fields);
  const badJob = attempted && problems.includes("job link");
  const badRole = attempted && problems.includes("role");
  const badFit = attempted && problems.includes("why you're a fit");
  const badResume = problems.includes("résumé link");

  const choose = (name: string) => {
    setCompany(name);
    setOpen(false);
    setActive(-1);
  };
  const onCompanyKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (event.key === "ArrowDown" ? (i + 1) % options.length : i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === "Enter" && showing && active >= 0) {
      event.preventDefault();
      choose(options[active]!.company);
    }
  };

  const send = async () => {
    setAttempted(true);
    if (!companyReady || !jobFunction || problems.length > 0 || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await api.post<{ request: BrokerRequest }>("/v1/broker-requests", {
      kind: "referral",
      jobFunction,
      note: referralDetails(fields),
    });
    setSending(false);
    if (err || !data) {
      setError(err?.message ?? "Couldn't send your request. Try again.");
      return;
    }
    setSent(data.request);
    void queryClient.invalidateQueries({ queryKey: brokerKeys.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  return (
    <div className="referral-discovery__overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div className="referral-discovery" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog} tabIndex={-1}>
        <h2 id={titleId}>{sent ? "Request sent" : "Get a referral"}</h2>
        {sent ? (
          <div className="referral-discovery__form">
            <p className="broker-note">We&apos;ve asked {alumniCount(sent.askedCount)} at {sent.company} on your behalf. You won&apos;t see who said no.</p>
            <BrokerProgress request={sent} />
            <p className="broker-note">Track it any time under Notifications.</p>
            <FormActions primary={{ label: "Done", onClick: onClose }} />
          </div>
        ) : (
          <form className="referral-discovery__form" noValidate onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <p className="broker-note">Tell us once. We ask every alum at the company for you and connect you with the first who says yes.</p>
            <FormField label="Which company?" required controlId={`${listId}-input`}>
              <div className="referral-discovery__company">
                <input
                  id={`${listId}-input`}
                  className="input"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showing}
                  aria-controls={listId}
                  aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
                  value={company}
                  maxLength={NOTE_SHORT_FIELD_MAX}
                  autoComplete="off"
                  placeholder="Type or choose a company"
                  onFocus={() => setOpen(true)}
                  onBlur={() => { setOpen(false); setActive(-1); }}
                  onChange={(e) => { setCompany(e.target.value); setOpen(true); setActive(-1); }}
                  onKeyDown={onCompanyKey}
                />
                {showing ? (
                  <ul id={listId} role="listbox" aria-label="Companies where alumni work" className="referral-discovery__options">
                    {options.map((o, i) => (
                      <li id={`${listId}-${i}`} key={o.company} role="option" aria-selected={active === i} onPointerDown={(e) => e.preventDefault()} onClick={() => choose(o.company)}>
                        {o.company} · {alumniCount(o.alumni)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </FormField>
            <p className={`broker-note${eligibility.state === "ok" && eligibility.count === 0 ? " broker-note--warn" : ""}`} role="status">
              {eligibility.state === "checking"
                ? "Checking who's there…"
                : eligibility.state === "error"
                  ? "Couldn't check that company. Try again in a moment."
                  : eligibility.state === "ok"
                    ? eligibility.count > 0
                      ? `We'll ask ${alumniCount(eligibility.count)} at ${eligibility.company}.`
                      : `No alumni at ${eligibility.company} on Alma Mater yet. Try a related company.`
                    : ""}
            </p>

            {companyReady ? (
              <div className="broker-step-in">
                <TapPills
                  label="Which function?"
                  options={FUNCTION_OPTIONS}
                  value={jobFunction}
                  onChange={setJobFunction}
                  error={attempted && !jobFunction ? "Pick a function" : undefined}
                />
              </div>
            ) : null}

            {companyReady && jobFunction ? (
              <div className="referral-discovery__form broker-step-in">
                <FormField label="Role" required error={badRole ? "Add the role" : undefined}>
                  <input className="input" value={role} maxLength={NOTE_SHORT_FIELD_MAX} autoComplete="off" placeholder="e.g. Product Manager, Payments" onChange={(e) => setRole(e.target.value)} />
                </FormField>
                <FormField label="Job link" required error={badJob ? "Add the job link (starting with https://)" : undefined}>
                  <input className="input" type="url" inputMode="url" value={jobUrl} autoComplete="off" placeholder="https://…" onChange={(e) => setJobUrl(e.target.value)} />
                </FormField>
                <FormField label="Why you're a fit" required error={badFit ? `Write ${NOTE_FIT_MIN} to ${NOTE_FIT_MAX} characters` : undefined} help={lengthCounter(fit.trim().length, NOTE_FIT_MIN, NOTE_FIT_MAX)}>
                  <textarea className="input input--textarea" rows={4} value={fit} maxLength={NOTE_FIT_MAX} placeholder="The experience that makes you a fit, in 2–3 lines." onChange={(e) => setFit(e.target.value)} />
                </FormField>
                <FormField label="Résumé link" error={badResume ? "The link must start with https://" : undefined}>
                  <input className="input" type="url" inputMode="url" value={resumeUrl} autoComplete="off" placeholder="Optional" onChange={(e) => setResumeUrl(e.target.value)} />
                </FormField>
              </div>
            ) : null}

            {error ? (
              <p className="broker-note broker-note--warn" role="alert">
                {error}
              </p>
            ) : null}
            <FormActions
              secondary={{ label: "Cancel", onClick: onClose, disabled: sending }}
              primary={{
                label: sending ? "Sending…" : companyReady ? `Ask ${alumniCount(eligibility.state === "ok" ? eligibility.count : 0)}` : "Send request",
                disabled: sending || !companyReady || !jobFunction,
                onClick: () => void send(),
              }}
            />
          </form>
        )}
        <button type="button" className="referral-discovery__close" aria-label="Close" onClick={onClose} disabled={sending}>
          ×
        </button>
      </div>
    </div>
  );
}
