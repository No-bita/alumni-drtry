import { describe, expect, it } from "vitest";
import { WALL_TOPIC_FAMILIES, wallLaneToTopicFamily, wallTopicFamilyToUiCategory } from "../src/lib/wallTopics";
describe("existing Wall topics", () => {
  it("keeps the existing labels, order and storage tokens", () => {
    expect(WALL_TOPIC_FAMILIES).toEqual([
      { id: "careers", label: "Careers" }, { id: "relocation", label: "Relocation" },
      { id: "startups", label: "Startups" }, { id: "guidance", label: "Guidance" },
    ]);
    for (const topic of WALL_TOPIC_FAMILIES) {
      expect(wallTopicFamilyToUiCategory(topic.id)).toBe(topic.id);
      expect(wallLaneToTopicFamily(topic.id)).toBe(topic.id);
    }
  });
  it("does not fold structured hiring into Careers", () => {
    expect(wallLaneToTopicFamily("hiring")).toBeNull();
  });
});
