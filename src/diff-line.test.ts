import { describe, expect, it } from "vitest";
import { lineBucketsFromTexts } from "./diff-line";

describe("lineBucketsFromTexts", () => {
  it("maps additions/deletions to head/base line numbers across multiple hunks", () => {
    const oldText = ["a", "old-import", ...Array.from({ length: 5 }, (_, i) => `old-${i}`), "tail"].join(
      "\n",
    );
    const newText = [
      "a",
      "new-import-1",
      "new-import-2",
      ...Array.from({ length: 5 }, (_, i) => `old-${i}`),
      "",
      "inserted-block",
      "tail",
    ].join("\n");

    expect(lineBucketsFromTexts(oldText, newText)).toEqual({
      deletions: [2],
      additions: [2, 3, 9, 10],
    });
  });
});
