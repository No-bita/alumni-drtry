import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfileAbout } from "../src/components/profile/ProfileAbout";
afterEach(cleanup);
const props={loading:false,profile:null,isOwnProfile:true,isEditing:true,draftBio:"Original introduction",onDraftBio:vi.fn(),draftPersonalEmail:"",draftMobilePhone:"",draftResidenceCountry:"",draftResidenceCity:"",onDraftPersonalEmail:vi.fn(),onDraftMobilePhone:vi.fn(),onDraftResidenceCountry:vi.fn(),onDraftResidenceCity:vi.fn()};
describe("Profile introduction editor",()=>{
  it("uses saved text, public visibility copy and API-aligned limit",()=>{
    render(<ProfileAbout {...props}/>);
    const input=screen.getByLabelText("Introduction (optional)") as HTMLTextAreaElement;
    expect(input.value).toBe("Original introduction");
    expect(input.maxLength).toBe(3000);
    expect(screen.getByText("Shown on your public profile, in your own words.")).toBeTruthy();
    fireEvent.change(input,{target:{value:"New words\nSecond line"}});
    expect(props.onDraftBio).toHaveBeenCalledWith("New words\nSecond line");
  });
  it("allows clearing the introduction",()=>{
    render(<ProfileAbout {...props}/>);
    fireEvent.change(screen.getByLabelText("Introduction (optional)"),{target:{value:""}});
    expect(props.onDraftBio).toHaveBeenCalledWith("");
  });
  it("never offers the editor on another alum's profile",()=>{
    render(<ProfileAbout {...props} isOwnProfile={false}/>);
    expect(screen.queryByLabelText("Introduction (optional)")).toBeNull();
    expect(screen.queryByLabelText("Personal email (optional)")).toBeNull();
  });
});
