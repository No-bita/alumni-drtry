/** Browser-friendly reverse geocode (no API key). BigDataCloud documents this endpoint for client use. */

export type ReverseGeocodePlace = { city: string; country: string };

type BigDataCloudClientPayload = {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
};

export async function reverseGeocodeClient(latitude: number, longitude: number): Promise<ReverseGeocodePlace | null> {
  const u = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  u.searchParams.set("latitude", String(latitude));
  u.searchParams.set("longitude", String(longitude));
  u.searchParams.set("localityLanguage", "en");

  const res = await fetch(u.toString());
  if (!res.ok) return null;

  const j = (await res.json()) as BigDataCloudClientPayload;
  const city = (j.city || j.locality || j.principalSubdivision || "").trim();
  const country = (j.countryName || "").trim();
  if (!city && !country) return null;
  return {
    city: city || country,
    country: country || city,
  };
}
