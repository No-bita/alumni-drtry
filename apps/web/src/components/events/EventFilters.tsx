import { Chip } from "../Chip";
import type { EventFiltersState, EventFormat, EventTimeframe } from "../../lib/events";

type EventFiltersProps = {
  value: EventFiltersState;
  cities: string[];
  tags: string[];
  onChange: (next: EventFiltersState) => void;
};

const TIMEFRAME_OPTIONS: Array<{ label: string; value: EventTimeframe }> = [
  { label: "All", value: "all" },
  { label: "This week", value: "this_week" },
  { label: "This month", value: "this_month" },
];

const FORMAT_OPTIONS: Array<{ label: string; value: "all" | EventFormat }> = [
  { label: "Any format", value: "all" },
  { label: "Online", value: "online" },
  { label: "Offline", value: "offline" },
  { label: "Hybrid", value: "hybrid" },
];

export function EventFilters({ value, cities, tags, onChange }: EventFiltersProps) {
  return (
    <section className="events-filters" aria-label="Filter events">
      <div className="events-filters__row events-filters__row--top">
        <div className="events-filters__chips" role="group" aria-label="Filter by timeframe">
          {TIMEFRAME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={value.timeframe === option.value}
              onClick={() => onChange({ ...value, timeframe: option.value })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="events-filters__row events-filters__row--controls" role="group" aria-label="Filter controls">
        <label className="events-filters__field events-filters__field--search" htmlFor="events-filter-query">
          Search
          <input
            id="events-filter-query"
            className="events-filters__search-input"
            placeholder="Search title, host, or tag"
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
          />
        </label>
        <label className="events-filters__field" htmlFor="events-filter-format">
          Format
          <select
            id="events-filter-format"
            className="events-filters__select"
            value={value.format}
            onChange={(e) => onChange({ ...value, format: e.target.value as "all" | EventFormat })}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="events-filters__field" htmlFor="events-filter-city">
          City
          <select
            id="events-filter-city"
            className="events-filters__select"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
          >
            <option value="all">All cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
        <label className="events-filters__field" htmlFor="events-filter-tag">
          Interest
          <select
            id="events-filter-tag"
            className="events-filters__select"
            value={value.tag}
            onChange={(e) => onChange({ ...value, tag: e.target.value })}
          >
            <option value="all">All interests</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
