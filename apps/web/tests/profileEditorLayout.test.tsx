import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileHero } from "../src/components/profile/ProfileHero";
import { ProfileEngagementCards } from "../src/components/profile/ProfileEngagementCards";
import { useState } from "react";
import type { OpenToPreferences } from "../src/lib/openToPreferences";
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ status: "unauthenticated" }) }));
afterEach(cleanup);
describe("task-first profile editor", () => {
  it("keeps one save/cancel transaction, loading disables both, and share remains", () => {
    const save=vi.fn(), cancel=vi.fn();
    const tree=(saving:boolean)=><MemoryRouter><ProfileHero loading={false} profile={null} occupations={[]} links={[]} profileDisplayName="Sample Alum" isOwnProfile isEditing saving={saving} onSaveEdit={save} onCancelEdit={cancel}/></MemoryRouter>;
    const {rerender}=render(tree(false));
    expect(screen.getByRole("heading",{name:"Sample Alum"})).toBeTruthy();
    expect(document.querySelector(".profile-editor__title-row")).toBeNull();
    expect(document.querySelector(".person-profile__identity .avatar")).toBeTruthy();
    expect(screen.getByRole("heading",{name:"Links"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Save",exact:true}));
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByRole("menuitem",{name:"Cancel editing"}));
    expect(save).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("More options"));
    expect(screen.getByRole("menuitem",{name:"Share profile"})).toBeTruthy();
    rerender(tree(true));
    expect((screen.getByRole("button",{name:"Saving…"}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("menuitem",{name:"Cancel editing"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("retains ten checkbox choices, draft subheadings, and the five-tag limit",()=>{
    function Study(){const [draft,setDraft]=useState<OpenToPreferences>({selected:["advising"],descriptions:{advising:"Existing advice"}});return <ProfileEngagementCards isEditing draftOpenTo={draft} onDraftOpenToChange={setDraft}/>}
    render(<Study/>);
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    fireEvent.change(screen.getByLabelText("Advising subheading"),{target:{value:"Typed advice"}});
    for(const name of ["Referrals","Mentorship","Hiring help","Speaking"])fireEvent.click(screen.getByRole("checkbox",{name}));
    expect((screen.getByRole("checkbox",{name:"Introductions"}) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Advising subheading") as HTMLTextAreaElement).value).toBe("Typed advice");
    fireEvent.click(screen.getByRole("checkbox",{name:"Referrals"}));
    expect((screen.getByRole("checkbox",{name:"Introductions"}) as HTMLInputElement).disabled).toBe(false);
  });
});
