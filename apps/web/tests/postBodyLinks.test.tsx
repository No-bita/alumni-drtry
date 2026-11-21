import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntentcastActivityRowsList, type CareerFeedRowModel } from "../src/components/CareerIntentFeedRows";
import { PostBodyLinks } from "../src/components/PostBodyLinks";

afterEach(cleanup);
describe("Wall post body links", () => {
  it("links full HTTP/HTTPS URLs safely and preserves all text", () => {
    const text = "Read https://example.com/path?q=1&x=2.\nThen http://example.org/help!";
    const { container } = render(<PostBodyLinks text={text} />);
    const links = screen.getAllByRole("link");
    expect(links.map(a => a.getAttribute("href"))).toEqual(["https://example.com/path?q=1&x=2", "http://example.org/help"]);
    expect(container.textContent).toBe(text);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
  it("keeps balanced URL parentheses but excludes surrounding punctuation", () => {
    render(<PostBodyLinks text="See (https://example.com/wiki/Thing_(one)). Next [https://example.org/page]." />);
    expect(screen.getAllByRole("link").map(a => a.getAttribute("href"))).toEqual(["https://example.com/wiki/Thing_(one)", "https://example.org/page"]);
  });
  it("does not interpret markup, bare domains or unsafe schemes", () => {
    const text = '<img src=x onerror=alert(1)> example.com www.example.com javascript:alert(1) data:text/html,test ftp://example.org javascript:https://example.com';
    const { container } = render(<PostBodyLinks text={text} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe(text);
  });
  it("keeps malformed URLs as text and supports uppercase HTTPS", () => {
    const text = "https:// HTTPS://EXAMPLE.COM/path";
    const { container } = render(<PostBodyLinks text={text} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(container.textContent).toBe(text);
  });
});

const row: CareerFeedRowModel = {
  id: "post", tone: "general", roleHeader: "https://example.org/title", companySubtitle: null,
  summary: "Read https://example.com/body.", chips: [], kindLabel: null, employmentType: null,
  compensation: null, experience: null, authorPersonId: "author", authorFullName: "Sample Alum",
  authorInstitutionName: null, authorDepartmentCode: null, authorBatchYear: null, authorRoleLine: null,
  postedRelative: null, postedAtIso: undefined, roleListingUrl: null, resumeListingUrl: null,
};
it("limits linkification to opted-in Wall body text, never the title", () => {
  render(<MemoryRouter><IntentcastActivityRowsList rows={[row]} viewerPersonId={null} deleteSubmittingId={null} onRequestDelete={() => {}} linkifyBody /></MemoryRouter>);
  expect(screen.getByRole("link", {name:"https://example.com/body"}).getAttribute("href")).toBe("https://example.com/body");
  expect(screen.queryByRole("link", {name:"https://example.org/title"})).toBeNull();
});
it("keeps non-Wall shared rows plain by default", () => {
  render(<MemoryRouter><IntentcastActivityRowsList rows={[row]} viewerPersonId={null} deleteSubmittingId={null} onRequestDelete={() => {}} /></MemoryRouter>);
  expect(screen.queryByRole("link", {name:"https://example.com/body"})).toBeNull();
});
