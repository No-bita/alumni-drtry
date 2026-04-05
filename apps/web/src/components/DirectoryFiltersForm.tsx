import { Button } from "./Button";
import { DEPARTMENTS } from "../constants/departments";
import { BATCH_YEARS } from "../constants/batchYears";
import { OCCUPATION_FILTER_OPTIONS } from "../constants/occupationTypes";

const DEPARTMENTS_SORTED = [...DEPARTMENTS].sort((a, b) => a.label.localeCompare(b.label));

export type DirectoryFiltersFormProps = {
  batchYear: number | null;
  departmentCode: string | null;
  /** Company / org name fragment (linked occupation org name). */
  companyName: string | null;
  /** Occupation type code (ranking signal in directory search). */
  occupationTypeCode: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  onBatchYearChange: (year: number | null) => void;
  onDepartmentChange: (code: string | null) => void;
  onCompanyNameChange: (value: string | null) => void;
  onOccupationChange: (code: string | null) => void;
  onResidenceCountryChange: (value: string | null) => void;
  onResidenceCityChange: (value: string | null) => void;
  onClearAll?: () => void;
  /** Runs directory search with current filters (e.g. navigate on home, commit URL on search page). */
  onSearch?: () => void;
};

export function DirectoryFiltersForm({
  batchYear,
  departmentCode,
  companyName,
  occupationTypeCode,
  residenceCountry,
  residenceCity,
  onBatchYearChange,
  onDepartmentChange,
  onCompanyNameChange,
  onOccupationChange,
  onResidenceCountryChange,
  onResidenceCityChange,
  onClearAll,
  onSearch
}: DirectoryFiltersFormProps) {
  return (
    <>
      {onClearAll ? (
        <div className="directory-filters__toolbar">
          <button type="button" className="directory-filters__clear" onClick={onClearAll}>
            Clear all filters
          </button>
        </div>
      ) : null}

      <div className="directory-filters">
        <div className="directory-filters__field">
          <label className="directory-filters__field-label" htmlFor="directory-filter-company">
            Company
          </label>
          <input
            id="directory-filter-company"
            type="text"
            className="input directory-filters__select"
            value={companyName ?? ""}
            onChange={(e) => onCompanyNameChange(e.target.value.trim() === "" ? null : e.target.value)}
            placeholder="e.g. Acme"
            maxLength={120}
            autoComplete="organization"
            aria-label="Company"
          />
        </div>

        <div className="directory-filters__field">
          <label className="directory-filters__field-label" htmlFor="directory-filter-residence-city">
            City
          </label>
          <input
            id="directory-filter-residence-city"
            type="text"
            className="input directory-filters__select"
            value={residenceCity ?? ""}
            onChange={(e) => onResidenceCityChange(e.target.value === "" ? null : e.target.value)}
            placeholder="e.g. Bengaluru"
            autoComplete="address-level2"
            aria-label="Filter by city of residence"
          />
        </div>

        <div className="directory-filters__field">
          <label className="directory-filters__field-label" htmlFor="directory-filter-residence-country">
            Country
          </label>
          <input
            id="directory-filter-residence-country"
            type="text"
            className="input directory-filters__select"
            value={residenceCountry ?? ""}
            onChange={(e) => onResidenceCountryChange(e.target.value === "" ? null : e.target.value)}
            placeholder="e.g. India"
            autoComplete="country-name"
            aria-label="Filter by country of residence"
          />
        </div>

        <div className="directory-filters__field">
          <label className="directory-filters__field-label" htmlFor="directory-filter-batch-year">
            Graduation batch
          </label>
          <select
            id="directory-filter-batch-year"
            className="input directory-filters__select"
            value={batchYear ?? ""}
            onChange={(e) =>
              onBatchYearChange(e.target.value === "" ? null : Number(e.target.value))
            }
            aria-label="Filter by graduation batch year"
          >
            <option value="">Any batch</option>
            {BATCH_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-filters__field">
          <label className="directory-filters__field-label" htmlFor="directory-filter-department">
            Department
          </label>
          <select
            id="directory-filter-department"
            className="input directory-filters__select"
            value={departmentCode ?? ""}
            onChange={(e) => onDepartmentChange(e.target.value || null)}
            aria-label="Filter by department"
          >
            <option value="">Any department</option>
            {DEPARTMENTS_SORTED.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-filters__field">
          <label className="directory-filters__field-label" htmlFor="directory-filter-occupation">
            Occupation type
          </label>
          <select
            id="directory-filter-occupation"
            className="input directory-filters__select"
            value={occupationTypeCode ?? ""}
            onChange={(e) => onOccupationChange(e.target.value || null)}
            aria-label="Occupation type"
          >
            {OCCUPATION_FILTER_OPTIONS.map((o) => (
              <option key={o.code || "any"} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {onSearch ? (
        <div className="directory-filters__footer">
          <Button type="button" variant="primary" className="directory-filters__search-btn" onClick={onSearch}>
            Search
          </Button>
        </div>
      ) : null}
    </>
  );
}
