/** Occupation type codes from DB seed — reserved for future directory refine UI (filter was removed until a richer occupation model ships). */
export const OCCUPATION_FILTER_OPTIONS = [
  { code: "", label: "Any occupation" },
  { code: "full_time_employment", label: "Full time employment" },
  { code: "part_time_employment", label: "Part time employment" },
  { code: "freelance_consulting", label: "Freelance / consulting" },
  { code: "phd_research", label: "PhD / research" },
  { code: "postdoctoral_research", label: "Postdoctoral research" },
  { code: "founded_venture", label: "Founded a venture" },
  { code: "civil_services_government", label: "Civil services / government" },
  { code: "military", label: "Military" },
  { code: "higher_education_non_research", label: "Higher education" },
  { code: "sabbatical_career_break", label: "Sabbatical / break" },
  { code: "other", label: "Other" },
] as const;
