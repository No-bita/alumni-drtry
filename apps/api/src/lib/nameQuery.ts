/**
 * Finding alumni by name from free text (the Ask box and the directory's search text).
 *
 * Two ways a name can match:
 * - Prefix: the whole text is short (1–4 words) and every word starts a word of the alum's name,
 *   in any order ("ananya", "ananya r", "rao ananya"). Catches partial typing.
 * - Mention: the alum's full name (two words or more) appears word for word inside longer text
 *   ("could Ananya Rao help with pricing").
 *
 * Names are compared lowercased, with anything that is not a letter or digit treated as a space,
 * the same way in TypeScript and in SQL (`NAME_NORMALIZE_SQL`).
 */

/** Most name matches returned alongside Ask results. */
export const NAME_MATCH_LIMIT = 5;
/** Longest text treated as "just a name" for prefix matching. */
export const NAME_PREFIX_MAX_WORDS = 4;

/** Lowercase words, splitting on anything that is not a letter or digit. */
export function nameWords(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/**
 * Words to prefix-match against names, or null when the text doesn't look like a name: too many
 * words, a one-letter word, or nothing at least three letters long (so "pm" or "ai" alone never
 * lists everyone whose name starts that way).
 */
export function namePrefixWords(text: string): string[] | null {
  const words = nameWords(text);
  if (words.length === 0 || words.length > NAME_PREFIX_MAX_WORDS) return null;
  if (words.some((w) => w.length < 2)) return null;
  if (!words.some((w) => w.length >= 3)) return null;
  if (words.every((w) => /^\p{N}+$/u.test(w))) return null;
  return words;
}

/** The text as one space-separated phrase of words, for "full name mentioned" matching. */
export function namePhrase(text: string): string {
  return nameWords(text).join(" ");
}

/** SQL for a column's name in the same normalized form as `namePhrase`. */
export function nameNormalizeSql(column: string): string {
  return `btrim(regexp_replace(lower(COALESCE(${column}, '')), '[^[:alnum:]]+', ' ', 'g'))`;
}

/**
 * SQL condition: every prefix word starts some word of the normalized name.
 * `wordsPh` is a bound text[]; `nnSql` is the normalized name expression.
 */
export function namePrefixConditionSql(nnSql: string, wordsPh: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM unnest(${wordsPh}::text[]) AS qw(w)
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest(string_to_array(${nnSql}, ' ')) AS nw(w)
      WHERE left(nw.w, char_length(qw.w)) = qw.w
    )
  )`;
}

/** SQL condition: the full name (two words or more) appears word for word in the bound phrase. */
export function nameMentionConditionSql(nnSql: string, phrasePh: string): string {
  return `(strpos(${nnSql}, ' ') > 0 AND strpos(' ' || ${phrasePh}::text || ' ', ' ' || ${nnSql} || ' ') > 0)`;
}
