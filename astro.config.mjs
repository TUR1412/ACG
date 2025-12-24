import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

const base = process.env.ACG_BASE ?? "/";

export default defineConfig({
  site: "https://tur1412.github.io",
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [
    tailwind({
      applyBaseStyles: false
    })
  ]
});

