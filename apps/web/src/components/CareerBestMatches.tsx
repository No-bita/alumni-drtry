import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./Avatar";

export type CareerBestMatchRow = {
  id: string;
  name: string;
  titleLine: string;
  locationLine: string;
  chips: string[];
  bio: string | null;
  profileComplete: boolean;
};

type CareerBestMatchesProps = {
  rows: CareerBestMatchRow[];
  committed: { company: string; role: string; city: string };
  onRequestReferral: (row: CareerBestMatchRow) => void;
  openMessagingDraft: (row: CareerBestMatchRow) => void;
};

const ACTIVITY_STUBS = [
  { lightning: "Active this week", clock: "Responds quickly" },
  { lightning: "Active 2d ago", clock: "High response rate" },
  { lightning: "Active this week", clock: "Typically replies within 48h" },
] as const;

function IconSparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false" fill="currentColor">
      <path d="M12 2l1.35 4.65L18 8l-4.65 1.35L12 14l-1.35-4.65L6 8l4.65-1.35L12 2zm7 10l.85 2.9 2.9.85-2.9.85L19 19l-.85-2.9-2.9-.85 2.9-.85L19 12zM5 12l.7 2.45 2.45.7-2.45.7L5 18l-.7-2.45-2.45-.7 2.45-.7L5 12z" />
    </svg>
  );
}

function IconInfoCircle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v7M12 7h.01" />
    </svg>
  );
}

function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <circle cx="12" cy="12" r="9" stroke="rgba(194,90,46,0.55)" strokeWidth="1.4" fill="rgba(194,90,46,0.08)" />
      <path d="M8 12l2.5 2.5L16 9" stroke="#c25a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="currentColor">
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v6l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function IconVerified({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none">
      <path
        d="M12 2l2.2 4.5 5 .7-3.6 3.5.9 5L12 13.9 7.5 15.7l.9-5L4.8 7.2l5-.7L12 2z"
        fill="#6b4dff"
        stroke="#5a3fd9"
        strokeWidth="0.5"
      />
      <path d="M9 12l2 2 4-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type MatchSignals = {
  bullets: string[];
  allFieldsMatch: boolean;
};

function buildMatchSignals(
  row: CareerBestMatchRow,
  committed: { company: string; role: string; city: string }
): MatchSignals {
  const bullets: string[] = [];
  const companyInput = committed.company.trim().toLowerCase();
  const roleInput = committed.role.trim().toLowerCase();
  const cityInput = committed.city.trim().toLowerCase();
  const titleLine = row.titleLine.toLowerCase();
  const locationLine = row.locationLine.toLowerCase();

  const hasCompanyMatch = companyInput.length > 0 && titleLine.includes(companyInput);
  const hasRoleMatch = roleInput.length > 0 && titleLine.includes(roleInput);
  const hasCityMatch = cityInput.length > 0 && locationLine.includes(cityInput);

  if (hasCompanyMatch) {
    bullets.push("Same company");
  }
  if (hasRoleMatch) {
    bullets.push("Same role");
  }
  if (hasCityMatch) {
    bullets.push("Same city");
  }

  return {
    bullets,
    allFieldsMatch: hasCompanyMatch && hasRoleMatch && hasCityMatch,
  };
}

export function CareerBestMatches({ rows, committed, onRequestReferral, openMessagingDraft }: CareerBestMatchesProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (whyOpen) {
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [whyOpen]);

  const closeWhy = useCallback(() => setWhyOpen(false), []);

  useEffect(() => {
    if (!whyOpen) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") closeWhy();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [whyOpen, closeWhy]);

  const cardCount = Math.min(rows.length, 3);

  return (
    <section className="career-best-matches career-best-matches--shell" aria-labelledby="career-best-matches-title">
      <div className="career-best-matches__plate">
        <div className="career-best-matches__head">
          <div className="career-best-matches__head-text">
            <h2 id="career-best-matches-title" className="career-best-matches__title">
              <IconSparkle className="career-best-matches__sparkle" aria-hidden />
              Best matches for you
            </h2>
          </div>
          <button type="button" className="career-best-matches__why-link" onClick={() => setWhyOpen(true)}>
            Why these matches?
            <IconInfoCircle className="career-best-matches__why-icon" aria-hidden />
          </button>
        </div>

        <div className="career-best-matches__grid" data-card-count={String(cardCount)}>
          {rows.map((row, cardIndex) => {
            const matchSignals = buildMatchSignals(row, committed);
            const badgeVariant = matchSignals.allFieldsMatch ? "best" : "great";
            const { bullets } = matchSignals;
            const activity = ACTIVITY_STUBS[cardIndex % ACTIVITY_STUBS.length];
            const showVerified = row.profileComplete;

            return (
              <article key={row.id} className="career-best-matches__card">
                <span
                  className={
                    badgeVariant === "best"
                      ? "career-best-matches__badge career-best-matches__badge--best"
                      : "career-best-matches__badge career-best-matches__badge--great"
                  }
                >
                  {badgeVariant === "best" ? "Best match" : "Great match"}
                </span>

                <div className="career-best-matches__profile">
                  <Avatar name={row.name} size="lg" tone="pastel" />
                  <div className="career-best-matches__profile-text">
                    <p className="career-best-matches__name-row">
                      <span className="career-best-matches__name">{row.name}</span>
                      {showVerified ? (
                        <span className="career-best-matches__verified-wrap" aria-label="Verified alumni profile">
                          <IconVerified className="career-best-matches__verified" />
                        </span>
                      ) : null}
                    </p>
                    <p className="career-best-matches__role">{row.titleLine}</p>
                  </div>
                </div>

                {bullets.length > 0 ? (
                  <ul className="career-best-matches__bullets">
                    {bullets.map((text, bulletIndex) => (
                      <li key={`${row.id}-match-${bulletIndex}`} className="career-best-matches__bullet">
                        <IconCheckCircle className="career-best-matches__check" aria-hidden />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="career-best-matches__signals">
                  <span className="career-best-matches__signal">
                    <IconBolt className="career-best-matches__signal-icon" aria-hidden />
                    {activity.lightning}
                  </span>
                  <span className="career-best-matches__signal-sep" aria-hidden>
                    ·
                  </span>
                  <span className="career-best-matches__signal">
                    <IconClock className="career-best-matches__signal-icon" aria-hidden />
                    {activity.clock}
                  </span>
                </div>

                <div className="career-best-matches__cta">
                  <button type="button" className="career-best-matches__btn-primary" onClick={() => onRequestReferral(row)}>
                    Request referral
                  </button>
                  <button
                    type="button"
                    className="career-best-matches__btn-send"
                    aria-label={`Message ${row.name}`}
                    onClick={() => openMessagingDraft(row)}
                  >
                    <IconSend aria-hidden />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="career-best-matches__dialog"
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          closeWhy();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWhy();
        }}
      >
        <div className="career-best-matches__dialog-panel">
          <h3 id={titleId} className="career-best-matches__dialog-title">
            Why these matches?
          </h3>
          <p className="career-best-matches__dialog-copy">
            We rank alumni by how closely they align with your role, company, and location preferences, then boost profiles
            with richer alumni context (department, batch, and headline overlap). Top picks refresh when you edit filters or
            sort order.
          </p>
          <button type="button" className="career-best-matches__dialog-close" onClick={closeWhy}>
            Close
          </button>
        </div>
      </dialog>
    </section>
  );
}
