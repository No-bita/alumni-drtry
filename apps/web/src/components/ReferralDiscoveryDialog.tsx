import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ReferralCompany } from "../lib/careers";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";
import { FormActions, FormField } from "./forms";
import "../styles/referral-discovery.css";

type Props = {
  companies: ReferralCompany[];
  companiesLoading: boolean;
  companiesError: boolean;
  onRetry: () => void;
  onClose: () => void;
  onFind: (role: string, company: string) => void;
};

/** Discovery only. The later reachout composer still owns the note and send confirmation. */
export function ReferralDiscoveryDialog({ companies, companiesLoading, companiesError, onRetry, onClose, onFind }: Props) {
  const titleId = useId();
  const roleId = useId();
  const companyId = useId();
  const listId = useId();
  const hintId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = companies.filter((c) => c.company.toLocaleLowerCase().includes(company.trim().toLocaleLowerCase())).slice(0, 20);
  const showing = open && options.length > 0;
  const roleError = attempted && !role.trim() ? "Choose a role" : undefined;
  const companyError = attempted && !company.trim() ? "Choose a company" : undefined;
  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: dialog, onClose });

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setAttempted(true);
    if (!role.trim() || !company.trim() || submitted.current) return;
    submitted.current = true;
    onFind(role.trim(), company.trim());
  };
  const choose = (name: string) => { setCompany(name); setOpen(false); setActive(-1); };
  const onCompanyKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length) {
      event.preventDefault(); setOpen(true);
      setActive((index) => event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === "Enter" && showing && active >= 0) {
      event.preventDefault(); choose(options[active].company);
    }
  };

  return (
    <div className="referral-discovery__overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="referral-discovery" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog} tabIndex={-1}>
        <h2 id={titleId}>Get a referral</h2>
        <form className="career-hiring-flow__main referral-discovery__form" onSubmit={submit} noValidate onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement && !event.defaultPrevented) { event.preventDefault(); if (!event.nativeEvent.isComposing && event.keyCode !== 229) submit(); } }}>
          <FormField label="Role" required error={roleError}>
            <input id={roleId} className="input" value={role} onChange={(event) => setRole(event.target.value)} maxLength={120} autoComplete="off" placeholder="e.g. Product manager" />
          </FormField>
          <FormField label="Company" required error={companyError} controlId={companyId}>
            <div className="referral-discovery__company">
              <input id={companyId} className="input" role="combobox" aria-autocomplete="list" aria-expanded={showing} aria-controls={listId} aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined} aria-describedby={hintId} value={company} maxLength={120} autoComplete="off" placeholder="Type or choose a company" onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onChange={(event) => { setCompany(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={onCompanyKey} />
              {showing ? <ul id={listId} role="listbox" aria-label="Suggested companies" className="referral-discovery__options">
                {options.map((option, index) => <li id={`${listId}-${index}`} key={option.company} role="option" aria-selected={active === index} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option.company)}>{option.company}</li>)}
              </ul> : null}
              <div id={hintId} className="referral-discovery__suggestion-state" role="status">
                {companiesLoading ? "Loading companies. You can still type a company." : companiesError ? <>Couldn&apos;t load suggestions. You can still type a company. <button type="button" onClick={onRetry}>Retry</button></> : open && !options.length ? "No suggestions. Use the company you typed." : null}
              </div>
            </div>
          </FormField>
          <p className="referral-discovery__help">Choose a role and company to find alumni who can help.</p>
          <FormActions secondary={{ label: "Cancel", onClick: onClose }} primary={{ label: "Find alumni", onClick: () => submit() }} />
        </form>
        <button type="button" className="referral-discovery__close" aria-label="Close" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
