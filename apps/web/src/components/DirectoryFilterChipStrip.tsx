import { DEPARTMENTS } from "../constants/departments";
import { OCCUPATION_FILTER_OPTIONS } from "../constants/occupationTypes";
import type { DirectorySearchDraft } from "../lib/directorySearchUrlState";
import { normalizeQ } from "../lib/directorySearchUrlState";

export type DirectoryFilterFacetKey = keyof DirectorySearchDraft;

export type DirectoryFilterChipStripProps = {
  applied: DirectorySearchDraft;
  onRemoveFacet: (key: DirectoryFilterFacetKey) => void;
  onAddFilters: () => void;
};

type ChipItem = { key: DirectoryFilterFacetKey; label: string };

function deptLabel(code: string): string {
  return DEPARTMENTS.find((d) => d.code === code)?.label ?? code;
}

function occLabel(code: string): string {
  return OCCUPATION_FILTER_OPTIONS.find((o) => o.code === code)?.label ?? code;
}

function buildChips(applied: DirectorySearchDraft): ChipItem[] {
  const chips: ChipItem[] = [];
  /** Keyword lives in the toolbar search input — omit duplicate chip here. */
  if (applied.company?.trim()) {
    chips.push({ key: "company", label: `Company · ${applied.company.trim()}` });
  }
  if (applied.residenceCity?.trim()) {
    chips.push({ key: "residenceCity", label: `City · ${applied.residenceCity.trim()}` });
  }
  if (applied.residenceCountry?.trim()) {
    chips.push({ key: "residenceCountry", label: `Country · ${applied.residenceCountry.trim()}` });
  }
  if (applied.batch != null) {
    chips.push({ key: "batch", label: `Batch · ${applied.batch}` });
  }
  if (applied.dept?.trim()) {
    chips.push({ key: "dept", label: `Dept · ${deptLabel(applied.dept.trim())}` });
  }
  if (applied.occ?.trim()) {
    chips.push({ key: "occ", label: `Occupation · ${occLabel(applied.occ.trim())}` });
  }
  return chips;
}

export function DirectoryFilterChipStrip({ applied, onRemoveFacet, onAddFilters }: DirectoryFilterChipStripProps) {
  const chips = buildChips(applied);
  const hasCommittedKeyword = Boolean(normalizeQ(applied.q));

  return (
    <section className="directory-filter-chips" aria-label="Active directory filters">
      <div className="directory-filter-chips__scroll">
        <div className="directory-filter-chips__inner">
          {chips.length === 0 ? (
            <p className="directory-filter-chips__hint">
              {hasCommittedKeyword
                ? "No structured filters — use More filters to narrow results."
                : "No filters applied."}
            </p>
          ) : (
            <ul className="directory-filter-chips__list" role="list">
              {chips.map((c) => (
                <li key={c.key} className="directory-filter-chips__item">
                  <span className="directory-filter-chips__chip">
                    <span className="directory-filter-chips__chip-text">{c.label}</span>
                    <button
                      type="button"
                      className="directory-filter-chips__remove"
                      onClick={() => onRemoveFacet(c.key)}
                      aria-label={`Remove filter: ${c.label}`}
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="directory-filter-chips__add" onClick={onAddFilters}>
            {chips.length === 0 ? "Add filters" : "More filters"}
          </button>
        </div>
      </div>
    </section>
  );
}
