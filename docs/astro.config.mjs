import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://s-hiraoku.github.io",
  base: "/hover-translate",
  integrations: [
    starlight({
      title: "Hover Translate",
      description: "Hover any text block to translate between English and Japanese.",
      customCss: ["./src/styles/custom.css"],
      defaultLocale: "root",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        ja: {
          label: "日本語",
          lang: "ja",
        },
      },
      social: {
        github: "https://github.com/s-hiraoku/hover-translate",
      },
      sidebar: [
        {
          label: "Guide",
          translations: { ja: "ガイド" },
          items: [
            { slug: "getting-started" },
            { slug: "features" },
            { slug: "settings" },
            { slug: "shortcuts" },
            { slug: "troubleshooting" },
            { slug: "privacy" },
          ],
        },
      ],
    }),
  ],
});
