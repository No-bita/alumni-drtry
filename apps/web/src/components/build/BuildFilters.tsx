import type { BuildFiltersState, BuildStage, BuildSupportNeed } from "../../lib/buildShowcase";

type BuildFiltersProps = {
  value: BuildFiltersState;
  onChange: (next: BuildFiltersState) => void;
};

const STAGE_OPTIONS: Array<{ label: string; value: "all" | BuildStage }> = [
  { label: "All stages", value: "all" },
  { label: "Idea", value: "idea" },
  { label: "Prototype", value: "prototype" },
  { label: "Launched", value: "launched" },
  { label: "Scaling", value: "scaling" },
];

const SUPPORT_OPTIONS: Array<{ label: string; value: "all" | BuildSupportNeed }> = [
  { label: "Any support", value: "all" },
  { label: "Mentorship", value: "mentorship" },
  { label: "Clients", value: "clients" },
  { label: "Funding", value: "funding" },
  { label: "Co-founder", value: "cofounder" },
  { label: "Distribution", value: "distribution" },
];

export function BuildFilters({ value, onChange }: BuildFiltersProps) {
  return (
    <section className="build-filters" aria-label="Filter projects">
      <label className="build-filters__field" htmlFor="build-filter-search">
        Search
        <input
          id="build-filter-search"
          className="build-filters__input"
          placeholder="Project, domain, support needed"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
      </label>
      <label className="build-filters__field" htmlFor="build-filter-stage">
        Stage
        <select
          id="build-filter-stage"
          className="build-filters__select"
          value={value.stage}
          onChange={(e) => onChange({ ...value, stage: e.target.value as "all" | BuildStage })}
        >
          {STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="build-filters__field" htmlFor="build-filter-support">
        Support needed
        <select
          id="build-filter-support"
          className="build-filters__select"
          value={value.support}
          onChange={(e) => onChange({ ...value, support: e.target.value as "all" | BuildSupportNeed })}
        >
          {SUPPORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
