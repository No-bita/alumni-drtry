import { type FormEventHandler, useEffect, useId, useRef } from "react";
import { DIRECTORY_KEYWORD_MAX_LENGTH } from "../constants/directorySearch";

export type DirectorySearchBarProps = {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  filterCount: number;
  onOpenRefine: () => void;
  /** `home` = compact bar on dashboard; `directory` = full-width hero on /search */
  variant: "home" | "directory";
  keywordPlaceholder?: string;
  /** Focus keyword on mount (directory page). */
  autoFocusKeyword?: boolean;
  /** Directory only: underlined text control beside the bar (e.g. clear all filters on /search). */
  inlineTrailingAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /**
   * Fires when `type="search"` is cleared via the browser’s clear control (×) — value is empty after the event.
   * Use on /search to reset keyword + filters + URL (same as “Clear all filters”).
   */
  onNativeSearchCleared?: () => void;
};

export function DirectorySearchBar({
  keyword,
  onKeywordChange,
  onSubmit,
  filterCount,
  onOpenRefine,
  variant,
  keywordPlaceholder = "Search by name, role, company, or keyword…",
  autoFocusKeyword = false,
  inlineTrailingAction,
  onNativeSearchCleared
}: DirectorySearchBarProps) {
  const baseId = useId();
  const keywordId = `${baseId}-keyword`;
  const keywordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = keywordInputRef.current;
    if (!el || !onNativeSearchCleared) return;
    const onSearchEvent = () => {
      if (el.value === "") {
        onNativeSearchCleared();
      }
    };
    el.addEventListener("search", onSearchEvent);
    return () => el.removeEventListener("search", onSearchEvent);
  }, [onNativeSearchCleared]);

  const form = (
    <form className="directory-search-bar__form" onSubmit={onSubmit}>
        <label className="directory-search-bar__keyword">
          <span className="visually-hidden">Search alumni</span>
          <div className="directory-search-bar__keyword-inner">
            <input
              ref={keywordInputRef}
              id={keywordId}
              className="input"
              type="search"
              placeholder={keywordPlaceholder}
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              autoFocus={autoFocusKeyword}
              maxLength={DIRECTORY_KEYWORD_MAX_LENGTH}
            />
          </div>
        </label>
      <div className="directory-search-bar__divider" aria-hidden />
      <div className="directory-search-bar__actions">
        <button type="button" className="directory-search-bar__refine" onClick={onOpenRefine}>
          Filter
          {filterCount > 0 ? (
            <span className="directory-search-bar__badge" aria-label={`${filterCount} active filters`}>
              {filterCount}
            </span>
          ) : null}
        </button>
        <button type="submit" className="directory-search-bar__submit">
          Search
        </button>
      </div>
    </form>
  );

  if (variant === "directory" && inlineTrailingAction) {
    return (
      <div
        className={`directory-search-bar directory-search-bar--${variant} directory-search-bar--with-inline-trailing`}
      >
        <div className="directory-search-bar__directory-row">
          {form}
          <button
            type="button"
            className="directory-search-bar__inline-action"
            onClick={inlineTrailingAction.onClick}
            disabled={inlineTrailingAction.disabled}
          >
            {inlineTrailingAction.label}
          </button>
        </div>
      </div>
    );
  }

  return <div className={`directory-search-bar directory-search-bar--${variant}`}>{form}</div>;
}
