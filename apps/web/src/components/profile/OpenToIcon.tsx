import type { OpenToOptionId } from "../../lib/openToPreferences";

/** Line icon for an "Open to" tag. */
export function OpenToIcon({ kind, className }: { kind: OpenToOptionId; className?: string }) {
  if (kind === "coffee") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M18 8h1a4 4 0 010 8h-1" strokeLinecap="round" />
        <path d="M2 8h14v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 2v2M10 2v2M14 2v2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "mentorship") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6 20v-1.5a6 6 0 0112 0V20" strokeLinecap="round" />
        <path d="M12 4.5V2M16.2 5.8l1.3-1.3M19.5 12H22M16.2 18.2l1.3 1.3M7.8 5.8L6.5 4.5M4.5 12H2M7.8 18.2l-1.3 1.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "hiring") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" strokeLinecap="round" />
        <path d="M12 12v3M9 13.5h6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "advising") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
        <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "speaking") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M12 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3z" strokeLinecap="round" />
        <path d="M19 10v1a7 7 0 01-14 0v-1M12 18v3M8 21h8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "intros") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "city_help") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    );
  }
  if (kind === "study_advice") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M2 9l10-5 10 5-10 5L2 9z" strokeLinejoin="round" />
        <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "collaboration") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
        <path d="M12 3v18M3 12h18" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </svg>
  );
}
