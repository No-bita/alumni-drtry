import type { PublicProfileView } from "../api/client";
import { isDemoProfileBio } from "./demoProfile";

export function profileShowsAboutSection(params: {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  isDemoProfile: boolean;
  isOwnProfile: boolean;
  isEditing: boolean;
}): boolean {
  const { loading, profile, isDemoProfile, isEditing } = params;
  if (loading || isEditing) return true;
  const bioRaw = profile?.bio?.trim() ?? "";
  const showBio = bioRaw.length > 0 && !isDemoProfile && !isDemoProfileBio(profile?.bio);
  return showBio;
}
