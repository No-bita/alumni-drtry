/** Intentcast post body (create / update). */
export const BULLETIN_CONTENT_MAX_LENGTH = 2000;

/** Reply message to an intentcast. */
export const BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH = 2000;

/** Open posts auto-close this many days after `created_at` (see IntentcastService.createIntentcast). */
export const BULLETIN_INTENTCAST_OPEN_DAYS = 7;

/** After author removes a post, they may restore it within this window (server-enforced). */
export const BULLETIN_AUTHOR_DELETE_UNDO_MINUTES = 5;
