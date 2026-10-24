import { type FormEvent, useEffect, useRef } from "react";
import { IconSearch } from "./HomeIcons";

type HomeToolbarSearchProps = {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSubmitSearch: () => void;
  nudgeActive?: boolean;
  focusSignal?: number;
};

export function HomeToolbarSearch({
  searchText,
  onSearchTextChange,
  onSubmitSearch,
  nudgeActive = false,
  focusSignal = 0,
}: HomeToolbarSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!nudgeActive) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [nudgeActive, focusSignal]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitSearch();
  };

  return (
    <form className={`nav-app-toolbar__search-form${nudgeActive ? " nav-app-toolbar__search-form--nudged" : ""}`} onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor="home-toolbar-search-input">
        Search alumni and companies, or type @ and a city name to open that city hub (or a city name without @)
      </label>
      <span className="nav-app-toolbar__search-icon" aria-hidden>
        <IconSearch className="nav-app-toolbar__search-svg" />
      </span>
      <input
        ref={inputRef}
        id="home-toolbar-search-input"
        type="search"
        className={`nav-app-toolbar__search-input${nudgeActive ? " nav-app-toolbar__search-input--nudged" : ""}`}
        autoComplete="off"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
      />
      <span className="nav-app-toolbar__search-kbd" aria-hidden title="Keyboard shortcut">
        ⌘K
      </span>
    </form>
  );
}
