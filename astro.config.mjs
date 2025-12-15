import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

const base = process.env.ACG_BASE ?? "/";

export default defineConfig({
  site: "https://tur1412.github.io",
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false
    })
  ]
});

