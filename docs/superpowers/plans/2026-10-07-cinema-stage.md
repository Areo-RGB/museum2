# Cinema Stage Implementation Plan

> Execute inline with automatic gates as requested.

**Goal:** Give the cinema its own elevator destination and show exactly the five requested YouTube films.

**Architecture:** Conditional layout owns the theatre only on the Cinema floor. The cinema panel embeds YouTube through its official iframe API; the stage owns playback and destroys it on departure. Seasonal galleries retain their existing archive frames.

**Tech Stack:** Three.js, DOM, YouTube iframe API, Node tests, Vite.

- [ ] Test gallery walls, cinema destination, exact programme and playback lifecycle.
- [ ] Implement conditional layout, disposable theatre and lazy YouTube player with mobile controls and errors.
- [ ] Run tests/build, review, verify browser, push main and deploy.
