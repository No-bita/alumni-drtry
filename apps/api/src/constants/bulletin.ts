/** Intentcast post body (create / update). */
export const BULLETIN_CONTENT_MAX_LENGTH = 2000;

/**
 * General intentcasts (guidance / mentorship / collaboration): first non-empty line = headline, rest = details.
 * Hiring posts use structured copy — limits are not applied to that category.
 */
export const BULLETIN_TITLE_MAX_CHARS = 120;
export const BULLETIN_DESCRIPTION_MAX_CHARS = 1800;
/** Referral asks: fit answer budget, enforced on create (web composer) and edit (server). */
export const REFERRAL_FIT_ANSWER_MAX_CHARS = 500;

/** Structured job / resume listing URL on a referral intentcast (create only; stored in dedicated columns). */
export const BULLETIN_LISTING_URL_MAX_CHARS = 2048;

/** Reply message to an intentcast. */
export const BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH = 2000;

/** Open posts auto-close this many days after `created_at` (see IntentcastService.createIntentcast). */
export const BULLETIN_INTENTCAST_OPEN_DAYS = 7;

/** After author removes a post, they may restore it within this window (server-enforced). */
export const BULLETIN_AUTHOR_DELETE_UNDO_MINUTES = 5;
