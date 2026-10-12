/** Copy for the small notice shown after a route guard redirects a member somewhere they didn't ask for. */
export type RouteNoticeContent = { message: string };

export type RouteNoticeState = { notice?: RouteNoticeContent };

/** Incomplete member opened a page that needs a finished profile (directory, own profile). */
export const FINISH_PROFILE_NOTICE: RouteNoticeContent = {
  message:
    "That page opens up once your profile is done. Finish the few questions below (two minutes, promise) and it's all yours.",
};

/** Member who already finished onboarding opened /onboarding. */
export const ALREADY_SET_UP_NOTICE: RouteNoticeContent = {
  message: "You're already set up, so there's nothing left to fill in. Dropped you on home instead.",
};

export function noticeState(notice: RouteNoticeContent): RouteNoticeState {
  return { notice };
}
