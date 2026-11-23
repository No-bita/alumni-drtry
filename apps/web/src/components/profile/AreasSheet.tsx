import { useState } from "react";
import { api, type MeAreasResponse } from "../../api/client";
import { areasChanged, normalizeAreasForSave } from "../../lib/personAreas";
import { ProfileAreasEditor } from "./ProfileAreasEditor";
import { ProfileSheet } from "./ProfileSheet";

type Props = {
  saved: string[];
  onClose: () => void;
  onSaved: () => void;
};

/** Areas of experience: what people can ask you about, used by Ask. */
export function AreasSheet({ saved, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<string[]>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!areasChanged(saved, draft)) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await api.put<MeAreasResponse>("/v1/me/areas", { areas: normalizeAreasForSave(draft) });
    setSaving(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    onSaved();
  };

  return (
    <ProfileSheet title="Areas of experience" onClose={onClose} onSave={save} saving={saving} error={error}>
      <ProfileAreasEditor draftAreas={draft} onDraftAreasChange={setDraft} />
    </ProfileSheet>
  );
}
