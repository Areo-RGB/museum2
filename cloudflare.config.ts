import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.js" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    "name": "personal-museum-media-gallery",
    entrypoint,
    // Custom domain on the h03.uk zone; Cloudflare creates the DNS record and certificate.
    "domains": ["gallery.h03.uk"],
    "compatibilityDate": "2026-10-06",
    "observability": {
      "enabled": true
    },
    "assets": {
      "notFoundHandling": "single-page-application"
    },
    env: {
      ASSETS: bindings.assets(),
      // The collection bucket; curator uploads land in its floors/ folders.
      MEDIA: bindings.r2({ name: "museum2-2014-1-001" }),
      // Shared key a curator types once per device to allow uploads.
      UPLOAD_TOKEN: bindings.secret(),
    },
  }
});
