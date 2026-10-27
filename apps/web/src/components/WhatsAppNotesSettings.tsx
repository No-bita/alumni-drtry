import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchWhatsAppSettings,
  updateWhatsAppSettings,
  WHATSAPP_SETTINGS_KEY,
  whatsappChatUrl,
  type WhatsAppSettings,
} from "../lib/whatsapp";
import "../styles/whatsapp.css";

type Props = {
  /** "card": profile/settings; "inline": a compact line inside onboarding (hidden unless linked). */
  variant?: "card" | "inline";
};

/** Opt in to (or pause) referral notes on WhatsApp. The website is where this is decided. */
export function WhatsAppNotesSettings({ variant = "card" }: Props) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: WHATSAPP_SETTINGS_KEY, queryFn: ({ signal }) => fetchWhatsAppSettings(signal) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = query.data;

  const save = async (patch: Partial<Pick<WhatsAppSettings, "notesOptedIn" | "notesPaused">>) => {
    setBusy(true);
    setError(null);
    try {
      queryClient.setQueryData(WHATSAPP_SETTINGS_KEY, await updateWhatsAppSettings(patch));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  if (!s) return null;

  if (variant === "inline") {
    if (!s.linked) return null;
    return (
      <label className="wa-inline">
        <input type="checkbox" checked={s.notesOptedIn} disabled={busy} onChange={(e) => void save({ notesOptedIn: e.target.checked })} />
        <span>Also send referral asks to my WhatsApp (…{s.numberHint})</span>
      </label>
    );
  }

  return (
    <section className="wa-card" aria-labelledby="wa-card-title">
      <h2 id="wa-card-title" className="wa-card__title">WhatsApp</h2>
      {!s.linked ? (
        <p className="wa-card__text">
          {s.botNumber ? (
            <>
              Text <strong>hi</strong> to our WhatsApp to link your number and ask for referrals there.{" "}
              <a href={whatsappChatUrl(s.botNumber)} target="_blank" rel="noopener noreferrer">
                Open WhatsApp
              </a>
            </>
          ) : (
            "WhatsApp isn't available yet."
          )}
        </p>
      ) : (
        <>
          <p className="wa-card__text">Linked to the number ending {s.numberHint}.</p>
          {s.stopped ? (
            <p className="wa-card__text">You turned WhatsApp messages off. Text START to the bot to turn them back on.</p>
          ) : null}
          <label className="wa-switch">
            <input type="checkbox" checked={s.notesOptedIn} disabled={busy} onChange={(e) => void save({ notesOptedIn: e.target.checked })} />
            <span>Get referral asks on WhatsApp</span>
          </label>
          {s.notesOptedIn ? (
            <label className="wa-switch">
              <input type="checkbox" checked={s.notesPaused} disabled={busy} onChange={(e) => void save({ notesPaused: e.target.checked })} />
              <span>Pause for now (they'll come by email)</span>
            </label>
          ) : null}
        </>
      )}
      {error ? (
        <p className="wa-card__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
