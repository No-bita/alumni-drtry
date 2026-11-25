import { useState } from "react";
import { api } from "../../api/client";
import { JOB_FUNCTIONS, JOB_FUNCTION_LABELS, type JobFunction } from "../../lib/jobFunctions";
import { TapPills } from "../TapPills";
import { ProfileSheet } from "./ProfileSheet";

type Props = {
  saved: JobFunction | null;
  onClose: () => void;
  onSaved: () => void;
};

const OPTIONS = JOB_FUNCTIONS.map((f) => ({ value: f, label: JOB_FUNCTION_LABELS[f] }));

/** One tap: the member's function. Hiring requests reach members by function and experience. */
export function FunctionSheet({ saved, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<JobFunction | null>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft) {
      setError("Pick your function.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await api.put("/v1/me/job-function", { jobFunction: draft });
    setSaving(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    onSaved();
  };

  return (
    <ProfileSheet
      title="Your function"
      description="When an alum is hiring for your function and experience, Alma Mater asks you privately. Only you see this."
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      <TapPills label="Which function fits you best?" options={OPTIONS} value={draft} onChange={setDraft} />
    </ProfileSheet>
  );
}
