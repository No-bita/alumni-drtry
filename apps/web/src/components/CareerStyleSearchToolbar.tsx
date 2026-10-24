import { useId, type ReactNode } from "react";
import { IconFilters, IconSearch } from "./HomeIcons";

export type CareerStyleSearchToolbarProps = {
  keyword: string;
  onKeywordChange: (value: string) => void;
  /** If set, Enter in the search field calls this (e.g. commit directory URL search). */
  onSubmitKeyword?: () => void;
  filterCount: number;
  onOpenFilters: () => void;
  filtersDrawerOpen: boolean;
  /** Visually hidden label for the keyword field (screen readers). */
  keywordFieldLabel?: string;
  /** Max length for keyword (directory uses `DIRECTORY_KEYWORD_MAX_LENGTH`). */
  keywordMaxLength?: number;
  /** Renders after the Filters control on the same row (e.g. directory “Clear all filters”). */
  afterFilters?: ReactNode;
};

/**
 * Same search row as Careers activity (`CareerIntentFeedRows` toolbar) for reuse on other pages.
 */
export function CareerStyleSearchToolbar({
  keyword,
  onKeywordChange,
  onSubmitKeyword,
  filterCount,
  onOpenFilters,
  filtersDrawerOpen,
  keywordFieldLabel = "Search alumni directory",
  keywordMaxLength,
  afterFilters,
}: CareerStyleSearchToolbarProps) {
  const baseId = useId();
  const keywordId = `${baseId}-keyword`;

  return (
    <div className="career-feed-rows__toolbar" role="search">
      <label className="career-feed-rows__search career-feed-rows__field" htmlFor={keywordId}>
        <span className="visually-hidden">{keywordFieldLabel}</span>
        <IconSearch className="career-feed-rows__search-icon" aria-hidden />
        <input
          id={keywordId}
          type="search"
          className="career-feed-rows__search-input career-feed-rows__search-input--prominent"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onSubmitKeyword) {
              e.preventDefault();
              onSubmitKeyword();
            }
          }}
          autoComplete="off"
          enterKeyHint={onSubmitKeyword ? "search" : undefined}
          maxLength={keywordMaxLength}
        />
      </label>
      <div className="career-feed-rows__toolbar-actions">
        <button
          type="button"
          className="career-feed-rows__filters-btn btn btn--secondary career-feed-rows__filters-btn--ghost"
          aria-expanded={filtersDrawerOpen}
          aria-haspopup="dialog"
          onClick={onOpenFilters}
        >
          <IconFilters className="career-feed-rows__filters-btn-icon" aria-hidden />
          Filters
          {filterCount > 0 ? (
            <span className="career-feed-rows__filters-badge">{filterCount}</span>
          ) : null}
        </button>
        {afterFilters}
      </div>
    </div>
  );
}
