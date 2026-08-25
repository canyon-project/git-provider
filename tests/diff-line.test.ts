import { describe, expect, it } from "vitest";
import { pathMatchesLineDiffExtensions } from "../src/diff-line";

describe("pathMatchesLineDiffExtensions", () => {
  it("保留 JS/TS 与常见模板后缀", () => {
    const included = [
      "src/a.ts",
      "src/a.tsx",
      "src/a.js",
      "src/a.jsx",
      "src/a.mjs",
      "src/a.cjs",
      "src/Foo.vue",
      "src/Foo.svelte",
      "src/page.astro",
      "src/index.html",
      "src/index.htm",
      "views/item.njk",
      "views/item.ejs",
      "views/item.hbs",
      "views/item.pug",
    ];
    for (const path of included) {
      expect(pathMatchesLineDiffExtensions(path), path).toBe(true);
    }
  });

  it("排除非源码/模板后缀与测试目录", () => {
    const excluded = [
      "README.md",
      "schema.prisma",
      "src/style.css",
      "src/Foo.vue.bak",
      "src/__tests__/a.ts",
      "src/__test__/Foo.vue",
      "Makefile",
    ];
    for (const path of excluded) {
      expect(pathMatchesLineDiffExtensions(path), path).toBe(false);
    }
  });

  it("按最长后缀匹配，避免 .tsx 被当成 .ts", () => {
    expect(pathMatchesLineDiffExtensions("a.tsx")).toBe(true);
    expect(pathMatchesLineDiffExtensions("a.ts")).toBe(true);
  });
});
