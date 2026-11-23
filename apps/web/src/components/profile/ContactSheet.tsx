import { useState } from "react";
import { api } from "../../api/client";
import { FormField } from "../forms";
import { ProfileSheet } from "./ProfileSheet";

type Props = {
  personalEmail: string | null;
  mobilePhone: string | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Private contact details. Shared only when you accept someone's reachout. */
export function ContactSheet({ personalEmail, mobilePhone, onClose, onSaved }: Props) {
  const [email, setEmail] = useState(personalEmail ?? "");
  const [phone, setPhone] = useState(mobilePhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const save = async () => {
    const nextEmail = email.trim();
    if (nextEmail && !EMAIL_RE.test(nextEmail)) {
      setEmailError("That email has a typo somewhere.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await api.patch("/v1/me/profile", {
      personalEmail: nextEmail || null,
      mobilePhone: phone.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    onSaved();
  };

  return (
    <ProfileSheet
      title="Contact"
      description="Private. Alumni never see these on your profile; they're shared only when you accept someone's reachout."
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      <FormField label="Personal email" error={emailError}>
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
        />
      </FormField>
      <FormField label="Phone">
        <input className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormField>
    </ProfileSheet>
  );
}
