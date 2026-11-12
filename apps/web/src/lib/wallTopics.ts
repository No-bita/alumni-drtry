/** Existing Wall topic labels and storage tokens. Feed filtering remains unchanged. */
export type BulletinUiCategoryToken = "careers" | "hiring" | "relocation" | "startups" | "guidance";
export type WallFeedLane = BulletinUiCategoryToken;
export type WallTopicFamily = Exclude<BulletinUiCategoryToken, "hiring">;
export const WALL_TOPIC_FAMILIES: ReadonlyArray<{ id: WallTopicFamily; label: string }> = [
  { id: "careers", label: "Careers" },
  { id: "relocation", label: "Relocation" },
  { id: "startups", label: "Startups" },
  { id: "guidance", label: "Guidance" },
];
export const WALL_TOPIC_FAMILY_LABEL: Record<WallTopicFamily, string> = {
  careers: "Careers", relocation: "Relocation", startups: "Startups", guidance: "Guidance",
};
export function wallTopicFamilyToUiCategory(topic: WallTopicFamily): WallTopicFamily { return topic; }
/** Structured hiring keeps its separate flow and is not relabeled as Careers. */
export function wallLaneToTopicFamily(lane: WallFeedLane): WallTopicFamily | null {
  return lane === "hiring" ? null : lane;
}
