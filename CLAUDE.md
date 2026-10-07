# Project workflow

Finish authorized work without stopping at routine confirmation gates, including
Superpowers gates. Treat explicit user instructions as authoritative.

**Always push and deploy.** Every completed change, however small, ends with a
commit pushed to `origin/main` and `npm run deploy`, without asking first.

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
The entrance floor (index 0) is the Hall of Fame, a curated list in
`src/fame/programme.js` registered via `library.add()` and excluded from seasons.
Its featured frame is pinned to a lettered `text` item (rehanging keeps it).
Only the selected floor's hall and frames exist. Lobby and atmosphere persist across switches. The cinema is its own elevator
destination; its theatre and YouTube player exist only on that floor. Closing
the programme preserves playback on the in-world screen. Leaving the floor stops
playback and destroys the iframe and CSS3D screen layer. Dispose floor-owned GPU resources and cancel stale media
loads; never dispose materials/geometries shared by every frame.

Background music is on by default (starting on the first gesture if autoplay
is blocked), visitor-toggled with the choice remembered in localStorage,
persists across floors and holds while a cinema film plays. The cinema programme opens only from the screen or button.

Curator streams media by distance. `maxVideos` caps active video textures, never
collection coverage. Rehanging swaps existing works so the full floor remains
represented. Preserve the manifest and stable slot IDs for upload persistence.
