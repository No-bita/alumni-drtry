import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import {
  audienceSizeLine,
  choiceLabel,
  isEveryoneChoice,
  toApiAudience,
  unavailableText,
  type AudienceChoice,
  type AudienceOptions,
  type AudiencePreview,
} from "../lib/postAudience";

type Props = {
  value: AudienceChoice;
  onChange: (next: AudienceChoice) => void;
  /**
   * The label the post will carry (null = Everyone) and whether the picked audience reaches no one else
   * (the composer must not publish while blocked).
   */
  onStateChange?: (state: { label: string | null; blocked: boolean }) => void;
  disabled?: boolean;
};

const PREVIEW_DEBOUNCE_MS = 350;

async function fetchJson<T>(p: Promise<{ data?: T; error?: { code: string; message?: string } }>): Promise<T> {
  const { data, error } = await p;
  if (error || data === undefined) throw new Error(error?.message ?? error?.code ?? "Request failed");
  return data;
}

/**
 * "Who can see this" for every post composer: an institute (default All institutes) plus the author's
 * own batch, department and city, combined with AND. Shows the label the post will carry and a rounded
 * size. The audience can't be changed after posting.
 */
export function PostAudienceField({ value, onChange, onStateChange, disabled }: Props) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const everyone = isEveryoneChoice(value);

  const options = useQuery({
    queryKey: queryKeys.intentcasts.audienceOptions(),
    queryFn: () => fetchJson(api.get<AudienceOptions>("/v1/intentcasts/audience-options")),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const choiceKey = useMemo(() => JSON.stringify(toApiAudience(value)), [value]);
  const [debouncedKey, setDebouncedKey] = useState(choiceKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(choiceKey), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [choiceKey]);

  const preview = useQuery({
    queryKey: queryKeys.intentcasts.audiencePreview(debouncedKey),
    queryFn: () =>
      fetchJson(api.post<AudiencePreview>("/v1/intentcasts/audience-preview", { audience: JSON.parse(debouncedKey) })),
    enabled: !everyone && debouncedKey === choiceKey,
    staleTime: 60_000,
    retry: false,
  });

  const settled = !everyone && debouncedKey === choiceKey && preview.isSuccess;
  const sizeLine = audienceSizeLine(settled ? preview.data : undefined, everyone);
  const blocked = Boolean(settled && preview.data && !preview.data.everyone && preview.data.size === "none");

  const o = options.data;
  const label = settled && preview.data && !preview.data.everyone ? preview.data.label : choiceLabel(value, o);
  const reportedLabel = everyone ? null : label;

  useEffect(() => {
    onStateChange?.({ label: reportedLabel, blocked });
  }, [reportedLabel, blocked, onStateChange]);
  const institutions = useMemo(() => {
    if (!o) return [];
    const own = o.institutions.filter((i) => i.key === o.ownInstitutionKey);
    const rest = o.institutions.filter((i) => i.key !== o.ownInstitutionKey);
    return [...own, ...rest];
  }, [o]);

  const toggle = (part: "batch" | "department" | "city") => onChange({ ...value, [part]: !value[part] });

  return (
    <section className="post-audience" aria-labelledby={`${baseId}-title`}>
      <span id={`${baseId}-title`} className="post-audience__title">
        Who can see this
      </span>
      <button
        type="button"
        className="post-audience__summary"
        aria-expanded={open}
        aria-controls={`${baseId}-panel`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className="post-audience__summary-text">
          <span className="post-audience__summary-label">{label}</span>
          <span className="post-audience__summary-hint">Change</span>
        </span>
      </button>

      {open ? (
        <div id={`${baseId}-panel`} className="post-audience__panel">
          {options.isError ? (
            <p className="post-audience__note" role="status">
              Couldn&apos;t load the audience choices. The post will go to everyone unless you try again later.
            </p>
          ) : null}
          <label className="post-audience__field">
            <span>Institute</span>
            <select
              className="input"
              value={value.institution ?? ""}
              onChange={(e) => onChange({ ...value, institution: e.target.value || null })}
              disabled={disabled || !o}
            >
              <option value="">All institutes</option>
              {institutions.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.key === o?.ownInstitutionKey ? `${i.name} (yours)` : i.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="post-audience__checks" disabled={disabled || !o}>
            <legend>Only people who share your</legend>
            {(["batch", "department", "city"] as const).map((part) => {
              const detail = o?.[part];
              const available = Boolean(detail?.available);
              const word = part === "batch" ? "Batch" : part === "department" ? "Department" : "City";
              const hintId = `${baseId}-${part}-hint`;
              return (
                <label key={part} className={`post-audience__check${available ? "" : " post-audience__check--off"}`}>
                  <input
                    type="checkbox"
                    checked={available && value[part]}
                    disabled={!available}
                    onChange={() => toggle(part)}
                    aria-describedby={hintId}
                  />
                  <span className="post-audience__check-text">
                    <span className="post-audience__check-name">{word}</span>
                    <span id={hintId} className="post-audience__check-value">
                      {detail ? (available ? detail.value : unavailableText(part, detail.reason)) : "Loading…"}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="post-audience__note">
            People must match everything you pick. Batch, department and city match across all institutes unless you
            also pick an institute. Members who haven&apos;t added that detail to their profile won&apos;t see the post.
          </p>
          <button type="button" className="btn btn--secondary post-audience__done" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      ) : null}

      <div
        className={`post-audience__size${sizeLine ? ` post-audience__size--${sizeLine.tone}` : ""}`}
        role={sizeLine?.tone === "block" ? "alert" : "status"}
        aria-live="polite"
      >
        {sizeLine
          ? sizeLine.text
          : preview.isError
            ? "Couldn't check how many people can see this."
            : "Checking how many people can see this…"}
      </div>
      <p className="post-audience__fixed">You can&apos;t change this after posting.</p>
    </section>
  );
}

/** "Visible to: IIT (BHU) Varanasi · Bengaluru" on a card or preview; nothing for Everyone. */
export function PostAudienceLabel({ label, className }: { label: string | null | undefined; className?: string }) {
  if (!label) return null;
  return (
    <p className={`post-audience-label${className ? ` ${className}` : ""}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />
      </svg>
      <span>Visible to: {label}</span>
    </p>
  );
}
