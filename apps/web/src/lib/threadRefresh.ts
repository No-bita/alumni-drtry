/**
 * Messages refresh when you open a thread, come back to the tab, or send.
 * No timers, no polling: the inbox only checks when you actually look at it.
 */
export const THREAD_REFRESH_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  refetchInterval: false,
} as const;
