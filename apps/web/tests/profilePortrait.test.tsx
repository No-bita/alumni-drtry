import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfilePortrait } from "../src/components/profile/ProfilePortrait";
import { ProfileExperience } from "../src/components/profile/ProfileExperience";
import { ProfileEngagementCards } from "../src/components/profile/ProfileEngagementCards";
import type { OccupationView, PublicProfileView } from "../src/api/client";

afterEach(cleanup);
const profile: PublicProfileView = {id:"sample",fullName:"Sample Alum",departmentCode:"CSE",departmentName:"Computer Science",batchYear:2020,parsedJoiningYear:2016,bio:"An introduction.\nIn my own words.",residenceCity:"Bengaluru",residenceCountry:"India"};
const past: OccupationView = {id:"past",occupationTypeCode:"full_time_employment",occupationTypeName:"Full-time",organizationId:null,organizationName:"First Co",roleTitle:"Analyst",description:"Original details",startDate:"2020-01-01",endDate:"2021-12-31",isCurrent:false};
const current: OccupationView = {...past,id:"current",organizationName:"Second Co",roleTitle:"Designer",startDate:"2022-01-01",endDate:null,isCurrent:true};

describe("Person portrait",()=>{
  it("shows the stored introduction without inventing a quote or hobby",()=>{
    render(<ProfilePortrait loading={false} profile={profile} occupations={[]}/>);
    expect(screen.getByText(/An introduction/).textContent).toBe(profile.bio);
    expect(screen.queryByText(/Outside work/)).toBeNull();
  });
  it("does not call a past occupation Today",()=>{
    render(<ProfilePortrait loading={false} profile={{...profile,bio:null}} occupations={[past]}/>);
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.getByText("Previously")).toBeTruthy();
    expect(screen.queryByText("In their words")).toBeNull();
  });
  it("keeps both current and previous context with current first",()=>{
    const {container}=render(<ProfilePortrait loading={false} profile={profile} occupations={[past,current]}/>);
    expect(container.textContent?.indexOf("Designer")).toBeLessThan(container.textContent!.indexOf("Analyst"));
  });
  it("keeps all job details and college facts in the path",()=>{
    const {container}=render(<MemoryRouter><ProfileExperience loading={false} profile={profile} occupations={[current,past]} isOwnProfile={false} onboardingIncomplete={false}/></MemoryRouter>);
    expect(screen.getByText("IIT BHU")).toBeTruthy();
    expect(screen.getByText(/Joined 2016/)).toBeTruthy();
    expect(screen.getAllByText("Original details")).toHaveLength(2);
    expect(container.textContent?.indexOf("Analyst")).toBeLessThan(container.textContent!.indexOf("Designer"));
  });
  it("does not infer unwillingness from missing help preferences",()=>{
    render(<ProfileEngagementCards/>);
    expect(screen.getByText("No help preferences shared.")).toBeTruthy();
    expect(screen.queryByText(/Not open/)).toBeNull();
  });
});
