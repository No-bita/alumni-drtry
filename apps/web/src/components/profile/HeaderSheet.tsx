import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { ProfilePatchResponse } from "../../lib/cities";
import { RESIDENCE_COUNTRY_LIST_ID, RESIDENCE_COUNTRY_NAMES } from "../../lib/countries";
import { FormField } from "../forms";
import { ProfileSheet } from "./ProfileSheet";

type Props = {
  city: string | null;
  country: string | null;
  /** Opened from Cities' "Moved away? Update your city": focus the city field. */
  focusCity?: boolean;
  onClose: () => void;
  /** After a save; `changedCity` is true when the city changed. */
  onSaved: (result: { arrivalPrompt: ProfilePatchResponse["arrivalPrompt"]; changedCity: boolean }) => void;
};

/**
 * The header's one editable detail: where you live. Name, institute, class and department come from
 * onboarding and are locked; the current role comes from Career history.
 */
export function HeaderSheet({ city, country, focusCity = false, onClose, onSaved }: Props) {
  const [draftCity, setDraftCity] = useState(city ?? "");
  const [draftCountry, setDraftCountry] = useState(country ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusCity) cityRef.current?.focus();
  }, [focusCity]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const nextCity = draftCity.trim() || null;
    const { data, error: err } = await api.patch<ProfilePatchResponse>("/v1/me/profile", {
      residenceCountry: draftCountry.trim() || null,
      residenceCity: nextCity,
    });
    setSaving(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    onSaved({ arrivalPrompt: data?.arrivalPrompt ?? null, changedCity: nextCity !== (city ?? null) });
  };

  return (
    <ProfileSheet
      title="Where you live"
      description="Your name, institute, class and department come from onboarding and can't be changed here. Your role comes from Career history."
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      <FormField label="City">
        <input ref={cityRef} className="input" value={draftCity} autoComplete="address-level2" onChange={(e) => setDraftCity(e.target.value)} />
      </FormField>
      <FormField label="Country">
        <input
          className="input"
          value={draftCountry}
          autoComplete="country-name"
          list={RESIDENCE_COUNTRY_LIST_ID}
          onChange={(e) => setDraftCountry(e.target.value)}
        />
      </FormField>
      <datalist id={RESIDENCE_COUNTRY_LIST_ID}>
        {RESIDENCE_COUNTRY_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </ProfileSheet>
  );
}
