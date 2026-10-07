# Finish period floors

The existing design uses seasonal floors, month sections, one ordinary frame per
manifest item, a featured duplicate, and a shared lobby with an animated escalator.
Keep the cinema and lobby alive while replacing only the hall, frames, curator,
collision registry and tour route. Load media by distance and cap active video
textures, rather than excluding videos from the collection.

1. Test assigned item IDs and complete-floor shuffling in `tests/collection.test.js`.
   Fix Curator to honor slot IDs, preserve coverage when shuffling, and cancel old
   asynchronous assignments on disposal. Dispose only frame-owned GPU resources.
2. Wire floor switching in `main.js`, update collisions and interactions, reset
   the player and tour, and add a DOM floor picker. Expose M and lobby controls.
   Keep offline fallback, uploads, cinema playback and guided tours working.
3. Run Node tests, production build and browser checks for initial load, all floors,
   rapid switches and bounded GPU memory. Verify the real manifest's coverage.
4. Update README and CLAUDE.md with automatic verification, deployment and main
   push workflow. Merge remote history while retaining the modular implementation
   and Hertha branding. Review, rerun checks and push without force.

Review focus: empty manifest, large video-only periods, stale loads after switching,
shared GPU resource disposal, and incomplete coverage after rehanging.
