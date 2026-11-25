import type { BrokerConversation } from "./broker";

/** The character counter appears from this share of the limit (there is no permanent rules line). */
export const COUNTER_FROM_SHARE = 0.9;
/** "Goes read-only on …" shows this close to the quiet-days cut-off. */
export const READ_ONLY_SOON_MS = 2 * 24 * 60 * 60 * 1000;

/** How many of the newest messages in a row are mine (the server allows `limits.maxUnanswered`). */
export function trailingMine(messages: readonly { mine: boolean }[]): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i]!.mine; i -= 1) n += 1;
  return n;
}

/**
 * Starter messages for an empty conversation: a few one-tap openers, per side and per kind of request.
 * Tapping one puts its text in the message box to edit (it never sends by itself, and never counts
 * toward the unanswered-messages limit until the member sends it).
 *
 * NOT SHOWN YET: the copy below is a draft and isn't decided. The pills are commented out where the
 * conversation renders (BrokerConversationThread). To turn them on, settle the copy here and uncomment.
 */
export const STARTER_MESSAGES_DRAFT: Record<BrokerConversation["role"], Record<BrokerConversation["request"]["kind"], string[]>> = {
  helper: {
    referral: ["Happy to refer you. Could you send your résumé?", "What's the job ID for this role?", "I've submitted your referral."],
    hiring: ["Thanks for thinking of me. Could you share more about the role?", "What does the hiring process look like?"],
  },
  asker: {
    referral: ["Thanks for saying yes!", "Here's my résumé: ", "The job ID is "],
    hiring: ["Thanks for your interest!", "Here's the job description: "],
  },
};

