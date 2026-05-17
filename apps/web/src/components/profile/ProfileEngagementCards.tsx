import {
  OPEN_TO_CATALOG,
  OPEN_TO_MAX_SELECTED,
  OPEN_TO_OPTION_IDS,
  canSelectMoreOpenTo,
  isOpenToSelected,
  openToDisplayItems,
  setOpenToDescription,
  toggleOpenToSelection,
  type OpenToPreferences,
} from "../../lib/openToPreferences";

type OpenToDisplayItem = ReturnType<typeof openToDisplayItems>[number];

function IconOpenToHeader({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </svg>
  );
}

function IconOpenToItem({ kind, className }: { kind: OpenToDisplayItem["icon"]; className?: string }) {
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

type ProfileEngagementCardsProps = {
  loading?: boolean;
  openToPreferences?: OpenToPreferences | null;
  isEditing?: boolean;
  draftOpenTo?: OpenToPreferences;
  onDraftOpenToChange?: (next: OpenToPreferences) => void;
};

export function ProfileEngagementCards({
  loading = false,
  openToPreferences = null,
  isEditing = false,
  draftOpenTo,
  onDraftOpenToChange,
}: ProfileEngagementCardsProps) {
  const displayItems = openToDisplayItems(isEditing ? draftOpenTo : openToPreferences);
  const selectedCount = draftOpenTo?.selected.length ?? 0;

  return (
    <article className="profile-page__engage-card profile-page__engage-card--open-to">
      <header className="profile-page__engage-card-head">
        <span className="profile-page__engage-card-icon-wrap profile-page__engage-card-icon-wrap--header">
          <IconOpenToHeader className="profile-page__engage-card-icon" />
        </span>
        <div className="profile-page__engage-card-head-copy">
          <h2 className="profile-page__engage-card-title">Open to</h2>
          {isEditing ? (
            <p className="profile-page__engage-card-hint">
              Choose up to {OPEN_TO_MAX_SELECTED} ({selectedCount}/{OPEN_TO_MAX_SELECTED} selected)
            </p>
          ) : null}
        </div>
      </header>
      {loading ? (
        <ul className="profile-page__open-to-list">
          {[0, 1, 2].map((i) => (
            <li key={i} className="profile-page__open-to-item profile-page__open-to-item--skeleton">
              <span className="profile-page__skeleton-line profile-page__skeleton-line--open-to-icon" />
              <span className="profile-page__open-to-item-copy">
                <span className="profile-page__skeleton-line profile-page__skeleton-line--open-to-title" />
                <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
              </span>
            </li>
          ))}
        </ul>
      ) : isEditing && draftOpenTo && onDraftOpenToChange ? (
        <ul className="profile-page__open-to-list profile-page__open-to-list--edit">
          {OPEN_TO_OPTION_IDS.map((id) => {
            const catalog = OPEN_TO_CATALOG[id];
            const selected = isOpenToSelected(draftOpenTo, id);
            const atLimit = !selected && !canSelectMoreOpenTo(draftOpenTo);
            const description = draftOpenTo.descriptions[id] ?? "";

            return (
              <li
                key={id}
                className={`profile-page__open-to-item profile-page__open-to-item--edit${atLimit ? " profile-page__open-to-item--edit-disabled" : ""}`}
              >
                <label className="profile-page__open-to-edit-toggle">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={atLimit}
                    onChange={() => onDraftOpenToChange(toggleOpenToSelection(draftOpenTo, id))}
                  />
                  <span className="profile-page__engage-card-icon-wrap">
                    <IconOpenToItem kind={id} className="profile-page__engage-card-icon" />
                  </span>
                  <span className="profile-page__open-to-item-title">{catalog.title}</span>
                </label>
                {selected ? (
                  <textarea
                    className="input input--textarea profile-page__open-to-edit-desc"
                    value={description}
                    placeholder={catalog.defaultDescription}
                    rows={2}
                    aria-label={`${catalog.title} subheading`}
                    onChange={(e) =>
                      onDraftOpenToChange(setOpenToDescription(draftOpenTo, id, e.target.value))
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : displayItems.length > 0 ? (
        <ul className="profile-page__open-to-list">
          {displayItems.map((item) => (
            <li key={item.id} className="profile-page__open-to-item">
              <span className="profile-page__engage-card-icon-wrap">
                <IconOpenToItem kind={item.icon} className="profile-page__engage-card-icon" />
              </span>
              <div className="profile-page__open-to-item-copy">
                <p className="profile-page__open-to-item-title">{item.title}</p>
                <p className="profile-page__open-to-item-desc">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="body-text profile-page__muted-text profile-page__flush-text">
          Not open to anything right now.
        </p>
      )}
    </article>
  );
}
