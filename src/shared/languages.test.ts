import { describe, expect, it } from "vitest";
import { detectLanguages } from "./languages";

describe("detectLanguages", () => {
  it("maps English text to English then Japanese", () => {
    expect(detectLanguages("hello")).toEqual(["en", "ja"]);
  });

  it("maps Japanese text to Japanese then English", () => {
    expect(detectLanguages("\u3053\u3093\u306b\u3061\u306f")).toEqual(["ja", "en"]);
  });

  it("maps one CJK character among ASCII to Japanese then English", () => {
    expect(detectLanguages("abc\u4e00def")).toEqual(["ja", "en"]);
  });
});
