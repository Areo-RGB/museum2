# Project workflow

Finish authorized work without stopping at routine confirmation gates, including
Superpowers gates. Treat explicit user instructions as authoritative.

After each completed implementation:
- Run `npm test` and `npm run build`; fix failures before shipping.
- Verify affected behavior in the browser, including media loading and controls.
- Commit the completed work and push to `origin/main` automatically.
- Fetch and reconcile remote changes first. Preserve remote history; never force
  push or overwrite unrelated user changes.
- Deploy the verified app with `npm run deploy` to `https://gallery.h03.uk` and
  check the live result. Report authentication/network failures clearly.
- Put failures, gaps, and open todos first in the final summary.

# Architecture

`main.js` composes focused modules. `MediaLibrary.floors()` derives seasonal floors
and month sections from the manifest. `createLayout(floor)` creates one ordinary
slot per asset, plus a featured duplicate. Uploads may override individual slots.
Only the selected floor's hall and frames exist. Lobby and atmosphere persist across switches. The cinema is its own elevator
destination; its theatre and YouTube player exist only on that floor. Closing
the programme or leaving the floor stops playback and destroys the iframe. Dispose floor-owned GPU resources and cancel stale media
loads; never dispose materials/geometries shared by every frame.

Curator streams media by distance. `maxVideos` caps active video textures, never
collection coverage. Rehanging swaps existing works so the full floor remains
represented. Preserve the manifest and stable slot IDs for upload persistence.
