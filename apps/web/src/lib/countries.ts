import { PHONE_COUNTRIES } from "../constants/phoneCountries";

/**
 * Country names for "country of residence": the same list the API normalises to (apps/api/src/lib/countries.ts
 * is kept in step with phoneCountries by an API test). People can still type a country that isn't listed.
 */
export const RESIDENCE_COUNTRY_NAMES: readonly string[] = [...new Set(PHONE_COUNTRIES.map((c) => c.name))];

export const RESIDENCE_COUNTRY_LIST_ID = "residence-country-names";
