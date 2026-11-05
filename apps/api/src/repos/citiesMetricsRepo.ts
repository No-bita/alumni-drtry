import type { DbExecutor } from "../db/types.js";

/** Cities v1 admin metrics (SPEC §8). Headline: acceptance of Cities notes, by category. */
export interface CitiesNoteCategoryMetrics {
  category: string;
  sent: number;
  accepted: number;
  declined: number;
  pending: number;
  /** accepted ÷ (accepted + declined); null until someone has replied. Target ≥ 70%. */
  acceptanceRate: number | null;
  /** declined ÷ (accepted + declined): guardrail. */
  declineRate: number | null;
}

export interface CitiesMetrics {
  windowDays: number;
  notes: { overall: CitiesNoteCategoryMetrics; byCategory: CitiesNoteCategoryMetrics[] };
  arrivals: {
    /** Distinct people shown the "New in [city]?" opt-in. */
    promptShown: number;
    optedIn: number;
    /** optedIn ÷ promptShown. */
    optInRate: number | null;
    offers: number;
    offersPerArrival: number | null;
    /** Share of arrivals with at least one offer within 7 days. */
    withOfferIn7dShare: number | null;
    newcomerNotesPerArrival: number | null;
  };
  coffee: { asksSent: number; accepted: number; fullThisWeekImpressions: number };
  cityHelpOnFromPanel: number;
  cityUpdatesFromMovedAway: number;
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

export class CitiesMetricsRepo {
  constructor(private readonly db: DbExecutor) {}

  async getMetrics(days: number): Promise<CitiesMetrics> {
    const win = (col: string) => `${col} >= now() - ($1::int * interval '1 day')`;
    const events = (type: string) =>
      this.db
        .query<{ c: number; people: number }>(
          `SELECT COUNT(*)::int AS c, COUNT(DISTINCT person_id)::int AS people FROM beta_usage_events
           WHERE event_type = $2 AND ${win("occurred_at")}`,
          [days, type]
        )
        .then((r) => r.rows[0] ?? { c: 0, people: 0 });

    const [notes, arrivals, prompt, full, helpOn, updated] = await Promise.all([
      this.db.query<{ category: string | null; sent: number; accepted: number; declined: number; pending: number }>(
        `SELECT source_category AS category, COUNT(*)::int AS sent,
                COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
                COUNT(*) FILTER (WHERE status = 'declined')::int AS declined,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM contact_requests WHERE source = 'cities' AND ${win("created_at")}
         GROUP BY ROLLUP (source_category)`,
        [days]
      ),
      this.db.query<{ arrivals: number; offers: number; with_offer_7d: number; newcomer_notes: number }>(
        `SELECT COUNT(*)::int AS arrivals,
                COALESCE(SUM((SELECT COUNT(*) FROM city_help_offers o WHERE o.arrival_id = a.id)), 0)::int AS offers,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM city_help_offers o WHERE o.arrival_id = a.id AND o.created_at < a.opted_in_at + interval '7 days'
                ))::int AS with_offer_7d,
                COALESCE(SUM((SELECT COUNT(*) FROM contact_requests cr
                  JOIN city_help_offers o ON o.id = cr.city_help_offer_id WHERE o.arrival_id = a.id)), 0)::int AS newcomer_notes
         FROM city_arrivals a WHERE ${win("a.opted_in_at")}`,
        [days]
      ),
      events("cities_arrival_prompt_shown"),
      events("cities_coffee_full_shown"),
      events("cities_city_help_on"),
      events("cities_city_updated")
    ]);

    const toMetrics = (r: { category: string | null; sent: number; accepted: number; declined: number; pending: number }, label: string) => ({
      category: label,
      sent: r.sent,
      accepted: r.accepted,
      declined: r.declined,
      pending: r.pending,
      acceptanceRate: ratio(r.accepted, r.accepted + r.declined),
      declineRate: ratio(r.declined, r.accepted + r.declined)
    });
    // ROLLUP: the row with a NULL category is the total (Cities notes always have a category).
    const total = notes.rows.find((r) => r.category === null) ?? { category: null, sent: 0, accepted: 0, declined: 0, pending: 0 };
    const byCategory = ["coffee", "relocation", "visiting", "newcomer"].map((c) =>
      toMetrics(notes.rows.find((r) => r.category === c) ?? { category: c, sent: 0, accepted: 0, declined: 0, pending: 0 }, c)
    );
    const a = arrivals.rows[0] ?? { arrivals: 0, offers: 0, with_offer_7d: 0, newcomer_notes: 0 };
    const coffee = byCategory.find((c) => c.category === "coffee")!;

    return {
      windowDays: days,
      notes: { overall: toMetrics(total, "all"), byCategory },
      arrivals: {
        promptShown: prompt.people,
        optedIn: a.arrivals,
        optInRate: ratio(a.arrivals, prompt.people),
        offers: a.offers,
        offersPerArrival: ratio(a.offers, a.arrivals),
        withOfferIn7dShare: ratio(a.with_offer_7d, a.arrivals),
        newcomerNotesPerArrival: ratio(a.newcomer_notes, a.arrivals)
      },
      coffee: { asksSent: coffee.sent, accepted: coffee.accepted, fullThisWeekImpressions: full.c },
      cityHelpOnFromPanel: helpOn.c,
      cityUpdatesFromMovedAway: updated.c
    };
  }
}
