import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest shape", () => {
  it("declares the translate-selection command used by the popup", () => {
    const command = manifest.commands?.["translate-selection"];

    expect(command).toBeDefined();
    expect(command?.description).toEqual(expect.any(String));
    expect(command?.suggested_key?.default).toEqual(expect.any(String));
  });

  it("matches the extension surface expected by tests and runtime code", () => {
    expect(manifest.default_locale).toBe("en");
    expect(manifest.content_scripts?.some((script) => script.matches?.includes("<all_urls>"))).toBe(
      true,
    );
    expect(manifest.host_permissions).toContain("https://api-free.deepl.com/*");
  });

  it.skip("declares the paid DeepL API host permission", () => {
    expect(manifest.host_permissions).toContain("https://api.deepl.com/*");
  });
});
