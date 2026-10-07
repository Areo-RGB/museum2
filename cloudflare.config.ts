import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "personal-museum-media-gallery",
    // Custom domain on the h03.uk zone; Cloudflare creates the DNS record and certificate.
    "domains": ["gallery.h03.uk"],
    "compatibilityDate": "2026-10-06",
    "observability": {
      "enabled": true
    },
    "assets": {
      "notFoundHandling": "single-page-application"
    }
  }
});
