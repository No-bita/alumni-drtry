/** Must match apps/api bulletin limits. */
export const BULLETIN_POST_MAX_LENGTH = 2000;

/** First line headline cap (general intentcasts only — must match apps/api). */
export const BULLETIN_TITLE_MAX_CHARS = 120;

/** Body-after-headline cap (general intentcasts only — must match apps/api). */
export const BULLETIN_DESCRIPTION_MAX_CHARS = 1800;

/** Referral asks: fit answer budget (must match apps/api). */
export const REFERRAL_FIT_ANSWER_MAX_CHARS = 500;

export const BULLETIN_REPLY_MAX_LENGTH = 2000;

/** Must match `BULLETIN_AUTHOR_DELETE_UNDO_MINUTES` in apps/api. */
export const BULLETIN_AUTHOR_DELETE_UNDO_MINUTES = 5;

/** Default `INTENTCAST_AUTHOR_DELETE_RETENTION_DAYS` in apps/api (copy only; card dates are server truth). */
export const BULLETIN_AUTHOR_DELETE_RETENTION_DAYS = 7;
