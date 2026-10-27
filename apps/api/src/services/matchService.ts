import { env } from "../config/env.js";
import type { PoolExecutor } from "../db/types.js";
import {
  FALLBACK_PLACES,
  applyIntentOverrides,
  countryMatchNames,
  detectedIntentFields,
  escapeRegexLiteral,
  parseMatchQuestion,
  roleDefinitionForLabel,
  type MatchIntent,
  type MatchIntentOverrides,
  type MatchLexicon
} from "../lib/matchIntent.js";
import { parseQuestionWithLlm, type MatchIntentLlmProvider } from "../lib/matchIntentLlm.js";
import { intentNeedsDetail, primarySignalsForIntent, rankMatches, type MatchReason, type SignalName } from "../lib/matchScore.js";
import type { OpenToOptionId } from "../lib/openToPreferences.js";
import { MatchRepo, type MatchCandidateQuery, type MatchGateSignal } from "../repos/matchRepo.js";
import type { ContactRequestStatus } from "../repos/contactRequestRepo.js";
import type { ReplyStatsView } from "./contactRequestService.js";

/** Reach-out context for match cards (provided by ContactRequestService). */
export interface MatchReachOutInfo {
  latestStatusFromSender(senderPersonId: string, recipientPersonIds: readonly string[]): Promise<Map<string, ContactRequestStatus>>;
  replyStatsForRecipients(recipientPersonIds: readonly string[]): Promise<Map<string, ReplyStatsView>>;
}

export const MATCH_CANDIDATE_LIMIT = 300;

export interface MatchInput {
  question: string;
  overrides?: MatchIntentOverrides;
  viewerPersonId: string;
  viewerIsDemo: boolean;
}

export interface MatchResultView {
  id: string;
  fullName: string;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  headlineRoleTitle: string | null;
  headlineOrganizationName: string | null;
  residenceCity: string | null;
  residenceCountry: string | null;
  whyThem: string;
  reasons: MatchReason[];
  /** All open-to tags the alum selected. */
  openTo: OpenToOptionId[];
  /** Open-to tags relevant to the asked category. */
  relevantOpenTo: OpenToOptionId[];
  /** Latest status of the viewer's own note to this alum, if any. */
  yourNote: ContactRequestStatus | null;
  /** How this alum has replied to notes (only when there are enough notes to say). */
  replyStats: ReplyStatsView | null;
}

export interface MatchResponse {
  intent: MatchIntent;
  /** True when there is nothing to search on yet (e.g. relocation without a city). */
  needsDetail: boolean;
  results: MatchResultView[];
  /** Suggest posting the question as a bulletin when a searchable intent found nobody. */
  fallback: "post_bulletin" | null;
}

export class MatchService {
  private readonly repo: MatchRepo;

  constructor(
    db: PoolExecutor,
    private readonly llmProvider: MatchIntentLlmProvider | null = null,
    private readonly reachOut: MatchReachOutInfo | null = null
  ) {
    this.repo = new MatchRepo(db);
  }

  async resolveIntent(question: string, lexicon: MatchLexicon): Promise<MatchIntent> {
    if (env.MATCH_LLM_ENABLED && this.llmProvider) {
      const fromLlm = await parseQuestionWithLlm(this.llmProvider, question);
      if (fromLlm) return fromLlm;
    }
    return parseMatchQuestion(question, lexicon);
  }

  async match(input: MatchInput): Promise<MatchResponse> {
    const lexicon = await this.repo.findLexicon(input.question);
    const parsed = await this.resolveIntent(input.question, lexicon);
    const intent = applyIntentOverrides(parsed, input.overrides);

    if (intentNeedsDetail(intent)) {
      await this.log(intent, 0, input, true);
      return { intent, needsDetail: true, results: [], fallback: null };
    }

    const candidates = await this.repo.findCandidates(buildCandidateQuery(intent, lexicon, input));
    const ranked = rankMatches(intent, candidates);
    await this.log(intent, ranked.length, input, false);

    const ids = ranked.map((m) => m.candidate.personId);
    const [yourNotes, replyStats] = this.reachOut
      ? await Promise.all([
          this.reachOut.latestStatusFromSender(input.viewerPersonId, ids),
          this.reachOut.replyStatsForRecipients(ids)
        ])
      : [new Map<string, ContactRequestStatus>(), new Map<string, ReplyStatsView>()];

    return {
      intent,
      needsDetail: false,
      results: ranked.map((m) => ({
        id: m.candidate.personId,
        fullName: m.candidate.fullName,
        batchYear: m.candidate.batchYear,
        departmentCode: m.candidate.departmentCode,
        departmentName: m.candidate.departmentName,
        headlineRoleTitle: m.candidate.headlineRoleTitle,
        headlineOrganizationName: m.candidate.headlineOrganizationName,
        residenceCity: m.candidate.residenceCity,
        residenceCountry: m.candidate.residenceCountry,
        whyThem: m.whyThem,
        reasons: m.reasons,
        openTo: m.candidate.openTo,
        relevantOpenTo: m.relevantOpenTo,
        yourNote: yourNotes.get(m.candidate.personId) ?? null,
        replyStats: replyStats.get(m.candidate.personId) ?? null
      })),
      fallback: ranked.length === 0 ? "post_bulletin" : null
    };
  }

  private async log(intent: MatchIntent, resultCount: number, input: MatchInput, needsDetail: boolean): Promise<void> {
    if (!env.MATCH_ANALYTICS_ENABLED || input.viewerIsDemo) return;
    try {
      await this.repo.logQuery({
        category: intent.category,
        detectedFields: detectedIntentFields(intent),
        parserSource: intent.source,
        resultCount,
        hadOverrides: Boolean(input.overrides && Object.keys(input.overrides).length > 0),
        needsDetail,
        company: intent.company,
        role: intent.role,
        city: intent.city,
        country: intent.country
      });
    } catch {
      /* analytics must never break matching */
    }
  }
}

function cityNamesFor(city: string | null, lexicon: MatchLexicon): string[] {
  if (!city) return [];
  const key = city.trim().toLowerCase();
  const names = new Set<string>([key]);
  const place =
    lexicon.places.find((p) => p.city.toLowerCase() === key || p.aliases.includes(key)) ??
    FALLBACK_PLACES.find((p) => p.city.toLowerCase() === key || p.aliases.includes(key));
  if (place) {
    names.add(place.city.toLowerCase());
    for (const a of place.aliases) names.add(a.toLowerCase());
  }
  return [...names];
}

function rolePatternFor(label: string | null): string | null {
  if (!label) return null;
  const def = roleDefinitionForLabel(label);
  const terms = def ? def.titleTerms : [label.trim()];
  const escaped = terms.filter((t) => t.trim().length > 0).map((t) => escapeRegexLiteral(t.trim()));
  return escaped.length > 0 ? escaped.join("|") : null;
}

const GATE_FOR_SIGNAL: Record<SignalName, MatchGateSignal[]> = {
  company: ["cc", "pc"],
  currentCompany: ["cc"],
  role: ["cr", "pr"],
  currentRole: ["cr"],
  place: ["city", "country"],
  study: ["sp", "st"],
  founder: ["fd"],
  keyword: []
};

export function buildCandidateQuery(
  intent: MatchIntent,
  lexicon: MatchLexicon,
  viewer: { viewerPersonId: string; viewerIsDemo: boolean }
): MatchCandidateQuery {
  return {
    viewerPersonId: viewer.viewerPersonId,
    viewerIsDemo: viewer.viewerIsDemo,
    companyPattern: intent.company ? escapeRegexLiteral(intent.company.trim()) : null,
    rolePattern: rolePatternFor(intent.role),
    fromRolePattern: intent.category === "career_switch" ? rolePatternFor(intent.fromRole) : null,
    cityNames: cityNamesFor(intent.city, lexicon),
    // A named city is precise; only fall back to the whole country when no city was asked.
    countryNames: intent.city ? [] : countryMatchNames(intent.country),
    studyPrograms: intent.studyPrograms,
    wantStudy: intent.category === "higher_studies" || intent.studyPrograms.length > 0,
    wantFounder: intent.category === "founder_advice",
    keywords: intent.keywords.map((k) => ({ keyword: k, pattern: escapeRegexLiteral(k) })),
    candidateLimit: MATCH_CANDIDATE_LIMIT,
    requiredAnyOf: [...new Set(primarySignalsForIntent(intent).flatMap((sig) => GATE_FOR_SIGNAL[sig]))]
  };
}
