import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";

export default defineConfig({
  site: "https://knaba.de",
  output: "static",
  trailingSlash: "always",
  integrations: [solid()],
  vite: { server: { allowedHosts: ["terminal.local"] } },
  devToolbar: { enabled: false },
});
