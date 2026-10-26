/**
 * Ask → Match: turn a plain-language question into a structured intent.
 *
 * Rules only (no network). The service passes a small lexicon of organization and place
 * names already found in the question text (DB lookups), so this module stays pure and
 * unit-testable. An optional LLM parser can replace this behind MATCH_LLM_ENABLED; this
 * parser is always the fallback.
 */

export const MATCH_CATEGORIES = [
  "referral",
  "interview_prep",
  "career_switch",
  "higher_studies",
  "relocation",
  "founder_advice"
] as const;

export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const STUDY_PROGRAMS = ["ms", "mba", "phd"] as const;
export type StudyProgram = (typeof STUDY_PROGRAMS)[number];

export interface MatchIntent {
  /** null when the question does not clearly name a kind of help. */
  category: MatchCategory | null;
  /** Organization display name (resolved from the directory when possible). */
  company: string | null;
  /** Target role label, e.g. "Product Manager". */
  role: string | null;
  /** Career switch only: role the asker is moving away from. */
  fromRole: string | null;
  city: string | null;
  country: string | null;
  studyPrograms: StudyProgram[];
  /** Residual topic words (e.g. "climate", "fintech"), max 6. */
  keywords: string[];
  source: "rules" | "llm";
}

export interface MatchLexiconPlace {
  city: string;
  country: string;
  aliases: string[];
}

export interface MatchLexicon {
  /** Organization names that appear somewhere in the question (pre-filtered by the DB). */
  organizations: string[];
  /** Places whose city label or alias appears somewhere in the question. */
  places: MatchLexiconPlace[];
}

export const EMPTY_MATCH_LEXICON: MatchLexicon = { organizations: [], places: [] };

export function isMatchCategory(value: unknown): value is MatchCategory {
  return typeof value === "string" && (MATCH_CATEGORIES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export interface RoleDefinition {
  label: string;
  /** Words/phrases that identify this role in the question. */
  questionTerms: string[];
  /** Words/phrases matched against occupation role titles in SQL (word-boundary, case-insensitive). */
  titleTerms: string[];
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    label: "Product Manager",
    questionTerms: ["associate product manager", "product manager", "product management", "apm", "pm", "product"],
    titleTerms: [
      "product manager",
      "product management",
      "product lead",
      "product owner",
      "head of product",
      "vp product",
      "pm",
      "apm",
      "gpm",
      "cpo"
    ]
  },
  {
    label: "Software Engineer",
    questionTerms: [
      "software engineer",
      "software engineering",
      "software developer",
      "full stack",
      "backend",
      "frontend",
      "developer",
      "engineering",
      "sde",
      "swe",
      "coding"
    ],
    titleTerms: ["software engineer", "software developer", "developer", "engineer", "sde", "swe", "programmer"]
  },
  {
    label: "Data Scientist",
    questionTerms: ["data scientist", "data science", "machine learning", "ml engineer", "ai engineer", "ml"],
    titleTerms: ["data scientist", "data science", "machine learning", "ml engineer", "applied scientist", "ai engineer"]
  },
  {
    label: "Data Analyst",
    questionTerms: ["data analyst", "business analyst", "analytics", "analyst"],
    titleTerms: ["data analyst", "business analyst", "analytics", "analyst"]
  },
  {
    label: "Consultant",
    questionTerms: ["management consulting", "strategy consulting", "consultant", "consulting"],
    titleTerms: ["consultant", "consulting", "engagement manager"]
  },
  {
    label: "Investment Banker",
    questionTerms: ["investment banking", "investment banker", "banking", "banker", "ib"],
    titleTerms: ["investment banking", "investment banker", "investment bank", "banker", "m&a"]
  },
  {
    label: "Quant / Trader",
    questionTerms: ["quantitative", "quant", "trader", "trading"],
    titleTerms: ["quant", "quantitative", "trader", "trading"]
  },
  {
    label: "Designer",
    questionTerms: ["product design", "designer", "design", "ux", "ui"],
    titleTerms: ["designer", "design", "ux", "ui"]
  },
  {
    label: "Marketing",
    questionTerms: ["marketing", "growth", "brand"],
    titleTerms: ["marketing", "growth", "brand"]
  },
  {
    label: "Sales / BD",
    questionTerms: ["business development", "sales", "bd"],
    titleTerms: ["sales", "business development", "account executive", "account manager"]
  },
  {
    label: "Finance",
    questionTerms: ["finance", "financial analyst", "cfo"],
    titleTerms: ["finance", "financial", "cfo", "controller"]
  },
  {
    label: "Strategy / Operations",
    questionTerms: ["program manager", "operations", "strategy", "bizops"],
    titleTerms: ["strategy", "operations", "program manager", "bizops", "chief of staff"]
  },
  {
    label: "Research",
    questionTerms: ["research scientist", "researcher", "research"],
    titleTerms: ["research scientist", "researcher", "research"]
  }
];

const ROLE_BY_LABEL = new Map(ROLE_DEFINITIONS.map((r) => [r.label.toLowerCase(), r]));

/** Look up a role definition by its label (case-insensitive). */
export function roleDefinitionForLabel(label: string | null | undefined): RoleDefinition | null {
  if (!label) return null;
  return ROLE_BY_LABEL.get(label.trim().toLowerCase()) ?? null;
}

interface CountryDefinition {
  label: string;
  /** Lowercase names used to match `people.residence_country` / canonical country. */
  matchNames: string[];
  /** Lowercase question phrases (word-boundary). "us" is handled separately. */
  questionTerms: string[];
}

export const COUNTRY_DEFINITIONS: readonly CountryDefinition[] = [
  {
    label: "United States",
    matchNames: ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a."],
    questionTerms: ["united states", "usa", "u.s.a", "america"]
  },
  {
    label: "United Kingdom",
    matchNames: ["united kingdom", "uk", "u.k.", "england", "great britain", "britain"],
    questionTerms: ["united kingdom", "uk", "u.k", "england", "britain"]
  },
  { label: "Germany", matchNames: ["germany", "deutschland"], questionTerms: ["germany"] },
  { label: "Canada", matchNames: ["canada"], questionTerms: ["canada"] },
  { label: "Australia", matchNames: ["australia"], questionTerms: ["australia"] },
  { label: "Singapore", matchNames: ["singapore"], questionTerms: ["singapore"] },
  { label: "Netherlands", matchNames: ["netherlands", "the netherlands", "holland"], questionTerms: ["netherlands", "holland"] },
  { label: "France", matchNames: ["france"], questionTerms: ["france"] },
  { label: "Ireland", matchNames: ["ireland"], questionTerms: ["ireland"] },
  { label: "Switzerland", matchNames: ["switzerland"], questionTerms: ["switzerland"] },
  { label: "Sweden", matchNames: ["sweden"], questionTerms: ["sweden"] },
  { label: "Japan", matchNames: ["japan"], questionTerms: ["japan"] },
  {
    label: "United Arab Emirates",
    matchNames: ["united arab emirates", "uae", "u.a.e."],
    questionTerms: ["united arab emirates", "uae"]
  },
  { label: "India", matchNames: ["india"], questionTerms: ["india"] }
];

/** Lowercase residence-country names that count as a match for a country label. */
export function countryMatchNames(label: string | null | undefined): string[] {
  if (!label) return [];
  const def = COUNTRY_DEFINITIONS.find((c) => c.label.toLowerCase() === label.trim().toLowerCase());
  return def ? [...def.matchNames] : [label.trim().toLowerCase()];
}

/** Used only when the directory has no canonical place for a city named in the question. */
export const FALLBACK_PLACES: readonly MatchLexiconPlace[] = [
  { city: "Bengaluru", country: "India", aliases: ["bengaluru", "bangalore", "blr"] },
  { city: "Mumbai", country: "India", aliases: ["mumbai", "bombay"] },
  { city: "Delhi", country: "India", aliases: ["delhi", "new delhi", "ncr"] },
  { city: "Gurugram", country: "India", aliases: ["gurugram", "gurgaon"] },
  { city: "Noida", country: "India", aliases: ["noida"] },
  { city: "Hyderabad", country: "India", aliases: ["hyderabad"] },
  { city: "Pune", country: "India", aliases: ["pune"] },
  { city: "Chennai", country: "India", aliases: ["chennai", "madras"] },
  { city: "Kolkata", country: "India", aliases: ["kolkata", "calcutta"] },
  { city: "Varanasi", country: "India", aliases: ["varanasi", "banaras", "benares", "kashi"] },
  { city: "Ahmedabad", country: "India", aliases: ["ahmedabad"] },
  { city: "Berlin", country: "Germany", aliases: ["berlin"] },
  { city: "Munich", country: "Germany", aliases: ["munich", "münchen"] },
  { city: "London", country: "United Kingdom", aliases: ["london"] },
  { city: "Amsterdam", country: "Netherlands", aliases: ["amsterdam"] },
  { city: "Paris", country: "France", aliases: ["paris"] },
  { city: "Zurich", country: "Switzerland", aliases: ["zurich", "zürich"] },
  { city: "Dubai", country: "United Arab Emirates", aliases: ["dubai"] },
  { city: "Singapore", country: "Singapore", aliases: ["singapore"] },
  { city: "Tokyo", country: "Japan", aliases: ["tokyo"] },
  { city: "Sydney", country: "Australia", aliases: ["sydney"] },
  { city: "Toronto", country: "Canada", aliases: ["toronto"] },
  { city: "San Francisco", country: "United States", aliases: ["san francisco", "bay area", "sf"] },
  { city: "Seattle", country: "United States", aliases: ["seattle"] },
  { city: "New York", country: "United States", aliases: ["new york", "nyc"] },
  { city: "Boston", country: "United States", aliases: ["boston"] },
  { city: "Austin", country: "United States", aliases: ["austin"] }
];

/** Lowercase tokens → org display names (shared with directory search normalization). */
export const KNOWN_ORG_ALIASES: Readonly<Record<string, string>> = {
  google: "Google",
  alphabet: "Google",
  meta: "Meta",
  facebook: "Meta",
  microsoft: "Microsoft",
  msft: "Microsoft",
  amazon: "Amazon",
  aws: "Amazon",
  apple: "Apple",
  netflix: "Netflix",
  nvidia: "NVIDIA",
  adobe: "Adobe",
  oracle: "Oracle",
  salesforce: "Salesforce",
  ibm: "IBM",
  intel: "Intel",
  qualcomm: "Qualcomm",
  samsung: "Samsung",
  tcs: "TCS",
  infosys: "Infosys",
  wipro: "Wipro",
  accenture: "Accenture",
  mckinsey: "McKinsey",
  goldman: "Goldman Sachs",
  jpmorgan: "JPMorgan",
  stripe: "Stripe",
  uber: "Uber",
  linkedin: "LinkedIn"
};

/** [pattern, weight]: weight 2 = names the kind of help outright; 1 = supporting hint. */
const CATEGORY_PATTERNS: Record<MatchCategory, [RegExp, number][]> = {
  referral: [
    [/\brefer(?:ral|rals|red|ring)?\b/, 2],
    [/\breferr?al\b/, 2],
    [/\bget (?:an? )?(?:job|offer) at\b/, 1],
    [/\bopenings? at\b/, 1]
  ],
  interview_prep: [
    [/\binterview(?:s|ing)?\b/, 2],
    [/\bmock\b/, 1],
    [/\bprep(?:are|aring|aration)?\b/, 1],
    [/\bcase (?:study|studies|interview)\b/, 1],
    [/\bguesstimates?\b/, 1],
    [/\b(?:onsite|interview loop|(?:final|hr|technical|case) rounds?)\b/, 1]
  ],
  career_switch: [
    [/\bswitch(?:ing|ed)?\b/, 2],
    [/\btransition(?:ing)?\b/, 2],
    [/\bpivot(?:ing)?\b/, 2],
    [/\bcareer change\b/, 2],
    [/\bmove (?:from|into)\b/, 1],
    [/\bmoving (?:from|into)\b/, 1],
    [/\bget into\b/, 1],
    [/\bbreak into\b/, 1]
  ],
  higher_studies: [
    [/\b(?:ms|m\.s|masters?|mba|phd|ph\.d|msc|meng)\b/, 2],
    [/\b(?:gre|gmat|toefl|ielts|sop|lor)\b/, 2],
    [/\bstud(?:y|ying) abroad\b/, 2],
    [/\bgrad(?:uate)? school\b/, 2],
    [/\b(?:admissions?|applications?) (?:to|for)\b/, 1],
    [/\buniversit(?:y|ies)\b/, 1]
  ],
  relocation: [
    [/\brelocat\w*\b/, 2],
    [/\bmoving to\b/, 1],
    [/\bmove to\b/, 1],
    [/\bshift(?:ing)? to\b/, 1],
    [/\bnew city\b/, 2],
    [/\bflat(?:mates?)?\b/, 2],
    [/\bhousing\b/, 2],
    [/\brent(?:al|ing)?\b/, 1],
    [/\bsettl(?:e|ing) (?:in|into|down)\b/, 1]
  ],
  founder_advice: [
    [/\bco-?founders?\b/, 2],
    [/\bstart-?ups?\b/, 2],
    [/\bfounders?\b/, 2],
    [/\bfundrais\w*\b/, 2],
    [/\binvestors?\b/, 2],
    [/\bangels?\b/, 1],
    [/\bvcs?\b/, 1],
    [/\bpitch(?:ing)?\b/, 1],
    [/\bmvp\b/, 1],
    [/\bmy (?:company|venture|business)\b/, 1]
  ]
};

/** Tie-break order when two categories score equally. */
const CATEGORY_PRIORITY: readonly MatchCategory[] = [
  "referral",
  "interview_prep",
  "career_switch",
  "higher_studies",
  "founder_advice",
  "relocation"
];

const STOPWORDS = new Set(
  (
    "a an the and or but if then so of to in on at for from by with about into onto over under " +
    "i me my mine we us our you your he she they them it its this that these those there here " +
    "is am are was were be been being do does did doing have has had having can could would should will shall may might must " +
    "need needs want wants looking look trying try get got help helps someone anyone somebody anybody who whom which what when where why how " +
    "please pls any some one two next week month year years time now soon really very just also like know " +
    "alum alumni alumnus senior seniors junior juniors iit bhu campus college batch " +
    "job jobs role roles position team company companies work working career advice tips guidance talk chat " +
    "find finding connect connecting reach ask asking question questions best good great new " +
    "first alone between choose choosing decide deciding offer offers option options thinking planning plan " +
    "monday tuesday wednesday thursday friday saturday sunday today tomorrow"
  ).split(/\s+/)
);

const COMPANY_PHRASE_BLOCKLIST = new Set(
  ["i", "my", "the", "a", "an", "pm", "apm", "sde", "swe", "mba", "ms", "phd", "iit", "bhu", "ux", "ui", "ml", "ai", "ib", "bd", "us", "uk", "hr", "ceo", "cto", "vp"]
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Escape a string for use inside a JS or Postgres ARE regular expression. */
export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeQuestion(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Word-boundary phrase test on already-lowercased text. Works for terms with dots/ampersands. */
export function containsPhrase(lowerText: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegexLiteral(p)}(?=$|[^\\p{L}\\p{N}])`, "u");
  return re.test(lowerText);
}

function findRoleInText(lowerText: string): RoleDefinition | null {
  let best: { def: RoleDefinition; len: number; index: number } | null = null;
  for (const def of ROLE_DEFINITIONS) {
    for (const term of def.questionTerms) {
      // Accept simple plurals too ("PMs", "consultants", "data scientists").
      if (!containsPhrase(lowerText, term) && !containsPhrase(lowerText, `${term}s`)) continue;
      const index = lowerText.indexOf(term);
      if (!best || term.length > best.len || (term.length === best.len && index < best.index)) {
        best = { def, len: term.length, index };
      }
    }
  }
  return best?.def ?? null;
}

function detectCareerSwitchRoles(lowerText: string): { fromRole: string | null; role: string | null } {
  const fromTo = lowerText.match(/\bfrom\s+(.+?)\s+(?:to|into)\s+(.+?)(?=[.,;?!]|$|\s+(?:at|in|role|roles)\b)/);
  if (fromTo) {
    const from = findRoleInText(fromTo[1] ?? "");
    const to = findRoleInText(fromTo[2] ?? "");
    if (from || to) {
      return { fromRole: from?.label ?? null, role: to?.label ?? null };
    }
  }
  const toFrom = lowerText.match(/\b(?:into|to)\s+(.+?)\s+from\s+(.+?)(?=[.,;?!]|$)/);
  if (toFrom) {
    const to = findRoleInText(toFrom[1] ?? "");
    const from = findRoleInText(toFrom[2] ?? "");
    if (to) return { fromRole: from?.label ?? null, role: to.label };
  }
  const into = lowerText.match(/\b(?:switch(?:ing)?|transition(?:ing)?|pivot(?:ing)?|move|moving|get|getting|break(?:ing)?)\s+(?:to|into)\s+(.+?)(?=[.,;?!]|$)/);
  if (into) {
    const to = findRoleInText(into[1] ?? "");
    if (to) return { fromRole: null, role: to.label };
  }
  return { fromRole: null, role: null };
}

function detectStudyPrograms(lowerText: string): StudyProgram[] {
  const out: StudyProgram[] = [];
  if (/\b(?:ms|m\.s|masters?|msc|m\.sc|meng|m\.eng)\b/.test(lowerText)) out.push("ms");
  if (/\bmba\b/.test(lowerText)) out.push("mba");
  if (/\b(?:phd|ph\.d|doctorate)\b/.test(lowerText)) out.push("phd");
  return out;
}

interface PlaceHit {
  city: string;
  country: string;
  term: string;
  index: number;
}

function placeHits(lowerText: string, places: readonly MatchLexiconPlace[]): PlaceHit[] {
  const hits: PlaceHit[] = [];
  for (const place of places) {
    for (const term of [place.city, ...place.aliases]) {
      const t = term.trim().toLowerCase();
      if (t.length < 2 || !containsPhrase(lowerText, t)) continue;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegexLiteral(t)}(?=$|[^\\p{L}\\p{N}])`, "u");
      const m = re.exec(lowerText);
      const index = m ? m.index + (m[1]?.length ?? 0) : lowerText.indexOf(t);
      hits.push({ city: place.city, country: place.country, term: t, index });
    }
  }
  return hits;
}

/**
 * The destination city. A place right after "from"/"leaving" is where the asker is now,
 * so it is skipped; a place after "to"/"in"/"into"/"near" wins; otherwise the longest name.
 */
function detectPlace(lowerText: string, lexicon: MatchLexicon): { city: string; country: string; term: string } | null {
  for (const places of [lexicon.places, FALLBACK_PLACES]) {
    const hits = placeHits(lowerText, places).filter(
      (h) => !/\b(?:from|leaving|left)\s+(?:the\s+)?$/.test(lowerText.slice(0, h.index))
    );
    if (hits.length === 0) continue;
    const preferred = hits.filter((h) => /\b(?:to|in|into|near|at)\s+(?:the\s+)?$/.test(lowerText.slice(0, h.index)));
    const pool = preferred.length > 0 ? preferred : hits;
    pool.sort((a, b) => b.term.length - a.term.length || a.index - b.index);
    const best = pool[0]!;
    return { city: best.city, country: best.country, term: best.term };
  }
  return null;
}

function detectCountry(originalText: string, lowerText: string): string | null {
  // "US" is also a pronoun; accept the uppercase token or "in/to the us" style phrasing only.
  if (/(^|[^A-Za-z])U\.?S\.?A?\.?(?=$|[^A-Za-z])/.test(originalText) || /\b(?:in|to|from) (?:the )?us\b/.test(lowerText)) {
    return "United States";
  }
  for (const def of COUNTRY_DEFINITIONS) {
    if (def.questionTerms.some((t) => containsPhrase(lowerText, t))) return def.label;
  }
  return null;
}

function detectCompany(originalText: string, lowerText: string, lexicon: MatchLexicon, placeTerms: string[]): string | null {
  // 1) Directory organizations named in the question (longest wins).
  let best: string | null = null;
  for (const name of lexicon.organizations) {
    const n = name.trim();
    if (n.length < 2) continue;
    if (COMPANY_PHRASE_BLOCKLIST.has(n.toLowerCase())) continue;
    if (containsPhrase(lowerText, n) && (!best || n.length > best.length)) best = n;
  }
  if (best) return best;

  // 2) Well-known aliases (e.g. "aws" → Amazon).
  for (const [token, display] of Object.entries(KNOWN_ORG_ALIASES)) {
    if (containsPhrase(lowerText, token)) return display;
  }

  // 3) Capitalized phrase after a preposition, e.g. "referral at Zeta Labs".
  const re = /(?:^|[^\p{L}\p{N}])(?:at|in|with|join|joining|for)\s+(\p{Lu}[\p{L}\p{N}&.'+-]*(?:\s+\p{Lu}[\p{L}\p{N}&.'+-]*){0,3})/gu;
  for (const m of originalText.matchAll(re)) {
    const phrase = (m[1] ?? "").trim().replace(/[.'-]+$/, "");
    const lower = phrase.toLowerCase();
    if (phrase.length < 2 || COMPANY_PHRASE_BLOCKLIST.has(lower)) continue;
    if (/^(?:gre|gmat|toefl|ielts|sat|cat|upsc|gate)$/.test(lower)) continue;
    if (placeTerms.some((t) => t === lower)) continue;
    if (COUNTRY_DEFINITIONS.some((c) => c.questionTerms.includes(lower) || c.label.toLowerCase() === lower)) continue;
    if (findRoleInText(lower)) continue;
    if (STOPWORDS.has(lower)) continue;
    return phrase;
  }
  return null;
}

function extractKeywords(lowerText: string, consumed: string[]): string[] {
  let residual = ` ${lowerText} `;
  for (const phrase of consumed) {
    if (!phrase) continue;
    residual = residual.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegexLiteral(phrase.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, "gu"), "$1 ");
  }
  for (const patterns of Object.values(CATEGORY_PATTERNS)) {
    for (const [re] of patterns) residual = residual.replace(new RegExp(re.source, "g"), " ");
  }
  const tokens = residual.split(/[^\p{L}\p{N}+#-]+/u).map((t) => t.replace(/^-+|-+$/g, ""));
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length < 3 || STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

function scoreCategories(lowerText: string): Map<MatchCategory, number> {
  const scores = new Map<MatchCategory, number>();
  for (const cat of MATCH_CATEGORIES) {
    const score = CATEGORY_PATTERNS[cat].reduce((sum, [re, weight]) => (re.test(lowerText) ? sum + weight : sum), 0);
    if (score > 0) scores.set(cat, score);
  }
  return scores;
}

const RELOCATION_STRONG = /\b(?:relocat\w*|new city|flat(?:mates?)?|housing|rent(?:al|ing)?|settl(?:e|ing) (?:in|into|down))\b/;

function pickCategory(
  lowerText: string,
  scores: Map<MatchCategory, number>,
  ctx: {
    hasPlace: boolean;
    hasCountry: boolean;
    hasCompany: boolean;
    hasRole: boolean;
    studyPrograms: StudyProgram[];
    switchRole: string | null;
  }
): MatchCategory | null {
  // "moving to Berlin" is relocation; "moving to product" is a career switch.
  if (scores.has("relocation") && !ctx.hasPlace && !ctx.hasCountry && ctx.switchRole && !RELOCATION_STRONG.test(lowerText)) {
    scores.delete("relocation");
  }
  if (scores.has("career_switch") && ctx.hasPlace && !ctx.switchRole) {
    scores.delete("career_switch");
    scores.set("relocation", (scores.get("relocation") ?? 0) + 1);
  }

  let best: MatchCategory | null = null;
  let bestScore = 0;
  for (const cat of CATEGORY_PRIORITY) {
    const s = scores.get(cat) ?? 0;
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  if (best) return best;

  // Entity-only questions.
  if (ctx.studyPrograms.length > 0) return "higher_studies";
  if (ctx.switchRole) return "career_switch";
  // "Who works at Google in Seattle?" is about the company, not a move.
  if (ctx.hasPlace && !ctx.hasCompany && !ctx.hasRole) return "relocation";
  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function parseMatchQuestion(question: string, lexicon: MatchLexicon = EMPTY_MATCH_LEXICON): MatchIntent {
  const original = question.replace(/\s+/g, " ").trim();
  const lower = normalizeQuestion(question);

  const place = detectPlace(lower, lexicon);
  const placeTerms = place ? [place.term, place.city.toLowerCase()] : [];
  const countryFromText = detectCountry(original, lower);
  const studyPrograms = detectStudyPrograms(lower);
  const switchRoles = detectCareerSwitchRoles(lower);
  const company = detectCompany(original, lower, lexicon, placeTerms);

  const scores = scoreCategories(lower);
  const category = pickCategory(lower, scores, {
    hasPlace: Boolean(place),
    hasCountry: Boolean(countryFromText),
    hasCompany: Boolean(company),
    hasRole: Boolean(findRoleInText(lower)),
    studyPrograms,
    switchRole: switchRoles.role
  });

  let role: string | null = null;
  let fromRole: string | null = null;
  if (category === "career_switch") {
    role = switchRoles.role;
    fromRole = switchRoles.fromRole;
    if (!role) role = findRoleInText(lower)?.label ?? null;
    if (fromRole && fromRole === role) fromRole = null;
  } else if (category !== "relocation" && category !== "higher_studies") {
    role = findRoleInText(lower)?.label ?? null;
  }

  const city = place?.city ?? null;
  const country = place?.country ?? countryFromText ?? null;

  const consumed: string[] = [];
  if (company) consumed.push(company);
  consumed.push(...placeTerms);
  if (countryFromText) {
    const def = COUNTRY_DEFINITIONS.find((c) => c.label === countryFromText);
    if (def) consumed.push(...def.questionTerms, def.label);
  }
  for (const label of [role, fromRole]) {
    const def = roleDefinitionForLabel(label);
    if (def) consumed.push(...def.questionTerms.map((t) => `${t}s`), ...def.questionTerms);
  }
  const keywords = extractKeywords(lower, consumed);

  return {
    category,
    company,
    role,
    fromRole,
    city,
    country,
    studyPrograms,
    keywords,
    source: "rules"
  };
}

export interface MatchIntentOverrides {
  category?: MatchCategory | null;
  company?: string | null;
  role?: string | null;
  city?: string | null;
  country?: string | null;
}

/**
 * Apply user corrections from the editable chips. A key that is present (even null)
 * replaces the parsed value; absent keys keep the parsed value.
 */
export function applyIntentOverrides(intent: MatchIntent, overrides: MatchIntentOverrides | undefined): MatchIntent {
  if (!overrides) return intent;
  const next: MatchIntent = { ...intent };
  const clean = (v: string | null | undefined): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t.length > 0 ? t : null;
  };
  if ("category" in overrides) next.category = overrides.category ?? null;
  if ("company" in overrides) next.company = clean(overrides.company);
  if ("role" in overrides) {
    next.role = clean(overrides.role);
    if (next.role === null) next.fromRole = null;
  }
  if ("city" in overrides) next.city = clean(overrides.city);
  if ("country" in overrides) next.country = clean(overrides.country);
  if (next.category !== "career_switch") next.fromRole = null;
  return next;
}

/** Which intent fields were detected — for privacy-safe logging (names only, never values). */
export function detectedIntentFields(intent: MatchIntent): string[] {
  const fields: string[] = [];
  if (intent.company) fields.push("company");
  if (intent.role) fields.push("role");
  if (intent.fromRole) fields.push("from_role");
  if (intent.city) fields.push("city");
  if (intent.country) fields.push("country");
  if (intent.studyPrograms.length > 0) fields.push("study_program");
  if (intent.keywords.length > 0) fields.push("keywords");
  return fields;
}
