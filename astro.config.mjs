import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

const base = process.env.ACG_BASE ?? "/";

export default defineConfig({
  site: "https://tur1412.github.io",
  base,
  output: "static",
  trailingSlash: "always",
  vite: {
    build: {
      sourcemap: false,
      minify: "esbuild",
      reportCompressedSize: false
    },
    esbuild: {
      drop: ["debugger", "console"]
    }
  },
  integrations: [
    tailwind({
      applyBaseStyles: false
    })
  ]
});
