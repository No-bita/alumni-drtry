import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CITIES_KEY, setNudgeFrequency, type NudgeFrequency } from "../../lib/cities";

const OPTIONS: Array<{ id: NudgeFrequency; label: string }> = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "never", label: "Never" },
];

/** Linked from the nudge email footer (?emails=manage): how often to hear what’s new in your city. */
export function CityEmailsControl({ current, onClose }: { current: NudgeFrequency; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<NudgeFrequency>(current);
  const [serverValue, setServerValue] = useState<NudgeFrequency>(current);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!busy && serverValue !== current) {
    setServerValue(current);
    setValue(current);
  }

  const choose = async (f: NudgeFrequency) => {
    if (busy || f === value) return;
    const prev = value;
    setValue(f);
    setBusy(true);
    setStatus(null);
    const res = await setNudgeFrequency(f);
    setBusy(false);
    if (res.error) {
      setValue(prev);
      setStatus("Couldn’t save. Try again.");
      return;
    }
    setStatus(f === "never" ? "You won’t get city emails." : `Saved. At most ${f === "weekly" ? "once a week" : "once a month"}.`);
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
  };

  return (
    <section className="cities__card cities__emails" aria-labelledby="cities-emails-title">
      <div className="cities__head cities__head--row">
        <h2 id="cities-emails-title" className="cities__h3">
          City emails
        </h2>
        <button type="button" className="cities__textbtn cities__textbtn--small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="cities__note">Sent only when something’s new in your city.</p>
      <div className="cities__segmented" role="radiogroup" aria-labelledby="cities-emails-title">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`cities__segment${value === o.id ? " cities__segment--on" : ""}`}
            disabled={busy}
            onClick={() => void choose(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {status ? (
        <p className="cities__note" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
