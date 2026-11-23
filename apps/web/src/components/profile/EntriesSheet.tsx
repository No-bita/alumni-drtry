import { useState } from "react";
import { api, type OccupationView } from "../../api/client";
import {
  PROFILE_OCCUPATION_TYPE_OPTIONS,
  buildOccupationCreatePayload,
  buildOccupationPatchPayload,
  createEmptyOccupationDraft,
  occupationToDraft,
  resolveOrganizationId,
  type OccupationDraft,
} from "../../lib/occupationProfileEdit";
import { EDUCATION_OCCUPATION_TYPES, isEducationEntry } from "../../lib/profilePage";
import { formatOccupationDatesDurationLine, sortOccupationsForDisplay } from "../../lib/profileDisplay";
import { Button } from "../Button";
import { FormField } from "../forms";
import { ProfileSheet } from "./ProfileSheet";

type Kind = "career" | "education";

const EDUCATION_TYPE_OPTIONS = [
  { value: "higher_education_non_research", label: "Master's, MBA or other degree" },
  { value: "phd_research", label: "PhD" },
];
const CAREER_TYPE_OPTIONS = PROFILE_OCCUPATION_TYPE_OPTIONS.filter(
  (o) => !(EDUCATION_OCCUPATION_TYPES as readonly string[]).includes(o.value),
);

const COPY = {
  career: {
    title: "Career history",
    add: "Add a role",
    empty: "No roles yet.",
    role: "Role",
    org: "Company",
    type: "Type",
    current: "I work here now",
    removeAsk: "Remove this role from your profile?",
    roleRequired: "Add the role.",
  },
  education: {
    title: "Education",
    add: "Add an MS, MBA or PhD",
    empty: "Nothing added after your institute yet.",
    role: "Program",
    org: "University",
    type: "Degree",
    current: "I study here now",
    removeAsk: "Remove this from your profile?",
    roleRequired: "Add the program, e.g. MS, Data Science.",
  },
} as const;

type Props = {
  kind: Kind;
  occupations: OccupationView[];
  /** Education only: the member's institute line (locked) and, for "Other" departments, the typed name. */
  institute?: {
    line: string | null;
    departmentOther?: { value: string; status: "pending" | "approved" | "rejected" | null; rejectionReason?: string | null } | null;
  };
  onClose: () => void;
  /** After any change, so the page reloads the profile. */
  onChanged: () => void;
};

/**
 * Career history or Education: each entry saves on its own (add, edit, remove), so the sheet only
 * needs "Done". Both come from the same job entries, split by type.
 */
export function EntriesSheet({ kind, occupations, institute, onClose, onChanged }: Props) {
  const copy = COPY[kind];
  const entries = sortOccupationsForDisplay(occupations.filter((o) => (kind === "education") === isEducationEntry(o)));
  const [editing, setEditing] = useState<OccupationDraft | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const startAdd = () => {
    const draft = createEmptyOccupationDraft();
    setEditing({ ...draft, occupationTypeCode: kind === "education" ? "higher_education_non_research" : "full_time_employment" });
    setError(null);
  };

  const saveEntry = async () => {
    if (!editing) return;
    if (!editing.roleTitle.trim()) {
      setRoleError(copy.roleRequired);
      return;
    }
    if (!editing.isCurrent && editing.endMonth && editing.startMonth && editing.endMonth < editing.startMonth) {
      setEndError("The end date is before the start date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const organizationId = await resolveOrganizationId(editing.organizationName);
      const res = editing.isNew
        ? await api.post("/v1/me/occupations", buildOccupationCreatePayload(editing, organizationId))
        : await api.patch(`/v1/me/occupations/${editing.id}`, buildOccupationPatchPayload(editing, organizationId));
      if (res.error) throw new Error(res.error.message ?? res.error.code);
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await api.delete(`/v1/me/occupations/${id}`);
    setBusy(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    setRemoving(null);
    onChanged();
  };

  const patch = (p: Partial<OccupationDraft>) => {
    setEditing((prev) => (prev ? { ...prev, ...p, ...(p.isCurrent ? { endMonth: "" } : {}) } : prev));
    if ("roleTitle" in p) setRoleError(null);
    if ("endMonth" in p || "startMonth" in p || "isCurrent" in p) setEndError(null);
  };

  return (
    <ProfileSheet title={copy.title} onClose={onClose} error={error}>
      {kind === "education" && institute ? (
        <div className="pp-entries__institute">
          {institute.line ? <p className="pp-entries__locked">{institute.line}</p> : null}
          <p className="pp-entries__locked-note">From onboarding. It can't be changed here.</p>
          {institute.departmentOther ? (
            <DepartmentOtherField
              initial={institute.departmentOther.value}
              status={institute.departmentOther.status}
              rejectionReason={institute.departmentOther.rejectionReason ?? null}
              onSaved={onChanged}
            />
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="pp-entries__form" role="group" aria-label={editing.isNew ? copy.add : `Edit ${editing.roleTitle}`}>
          <FormField label={copy.role} required error={roleError}>
            <input className="input" value={editing.roleTitle} onChange={(e) => patch({ roleTitle: e.target.value })} />
          </FormField>
          <FormField label={copy.org}>
            <input
              className="input"
              value={editing.organizationName}
              autoComplete="organization"
              onChange={(e) => patch({ organizationName: e.target.value })}
            />
          </FormField>
          <FormField label={copy.type}>
            <select className="input" value={editing.occupationTypeCode} onChange={(e) => patch({ occupationTypeCode: e.target.value })}>
              {(kind === "education" ? EDUCATION_TYPE_OPTIONS : CAREER_TYPE_OPTIONS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="pp-entries__dates">
            <FormField label="Start">
              <input className="input" type="month" value={editing.startMonth} onChange={(e) => patch({ startMonth: e.target.value })} />
            </FormField>
            {!editing.isCurrent ? (
              <FormField label="End" error={endError}>
                <input className="input" type="month" value={editing.endMonth} onChange={(e) => patch({ endMonth: e.target.value })} />
              </FormField>
            ) : null}
          </div>
          <label className="pp-entries__current">
            <input type="checkbox" checked={editing.isCurrent} onChange={(e) => patch({ isCurrent: e.target.checked })} />
            {copy.current}
          </label>
          <div className="pp-entries__form-actions">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={() => void saveEntry()} disabled={busy}>
              {busy ? "Saving…" : editing.isNew ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {entries.length === 0 ? <p className="pp-entries__empty">{copy.empty}</p> : null}
          <ul className="pp-entries__list">
            {entries.map((o) => (
              <li key={o.id} className="pp-entries__item">
                <div className="pp-entries__item-copy">
                  <strong>{o.roleTitle}</strong>
                  {o.organizationName ? <span>{o.organizationName}</span> : null}
                  {formatOccupationDatesDurationLine(o) ? <small>{formatOccupationDatesDurationLine(o)}</small> : null}
                </div>
                {removing === o.id ? (
                  <div className="pp-entries__confirm" role="group" aria-label={copy.removeAsk}>
                    <span>{copy.removeAsk}</span>
                    <button type="button" className="pp-inline-link pp-inline-link--danger" disabled={busy} onClick={() => void remove(o.id)}>
                      Remove
                    </button>
                    <button type="button" className="pp-inline-link" disabled={busy} onClick={() => setRemoving(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="pp-entries__item-actions">
                    <button type="button" className="pp-inline-link" onClick={() => setEditing(occupationToDraft(o))} aria-label={`Edit ${o.roleTitle}`}>
                      Edit
                    </button>
                    <button type="button" className="pp-inline-link" onClick={() => setRemoving(o.id)} aria-label={`Remove ${o.roleTitle}`}>
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="pp-add" onClick={startAdd}>
            + {copy.add}
          </button>
        </>
      )}
    </ProfileSheet>
  );
}

/** "Other" department: the typed name stays editable; a change goes back to review before it shows publicly. */
function DepartmentOtherField({
  initial,
  status,
  rejectionReason,
  onSaved,
}: {
  initial: string;
  status: "pending" | "approved" | "rejected" | null;
  rejectionReason: string | null;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = value.trim() !== initial.trim();
  const save = async () => {
    if (!value.trim()) {
      setError("Please specify your department.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await api.patch("/v1/me/profile", { departmentOtherText: value.trim() });
    setBusy(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    onSaved();
  };
  const help =
    status === "pending"
      ? "Waiting for review. It shows on your profile once approved."
      : status === "rejected"
        ? `Not approved${rejectionReason ? `: ${rejectionReason.replace(/[.\s]+$/, "")}` : ""}. Update it and it goes back for review.`
        : "Changing it sends it back for review before it shows publicly.";
  return (
    <div className="pp-entries__dept">
      <FormField label="Your department" error={error} help={error ? undefined : help}>
        <input className="input" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      {changed ? (
        <Button type="button" variant="secondary" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save department"}
        </Button>
      ) : null}
    </div>
  );
}
