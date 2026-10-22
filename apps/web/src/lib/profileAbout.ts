import type { PublicProfileView } from "../api/client";

export function profileShowsAboutSection(params: {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  isOwnProfile: boolean;
  isEditing: boolean;
}): boolean {
  const { loading, profile, isEditing } = params;
  if (loading || isEditing) return true;
  const bioRaw = profile?.bio?.trim() ?? "";
  const showBio = bioRaw.length > 0;
  return showBio;
}
