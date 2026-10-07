# Cinema Screen Implementation Plan

**Goal:** Play the five YouTube films on the theatre screen, with no popup video.

**Architecture:** A CSS3D iframe shares the WebGL screen's world transform. A
depth-tested transparent cutout in the alpha-enabled WebGL canvas reveals it,
so seats and walls occlude playback. Programme selection enters a viewing mode
with direct player interaction; walking retains screen playback. Floor departure
destroys the player and its CSS renderer.

- [x] Test screen dimensions, transforms and depth cutout material.
- [x] Add the screen renderer and connect viewing/programme/walking modes.
- [x] Verify playback, perspective, occlusion and mobile layout; test/build/review.
- [ ] Push main, deploy and check live.
