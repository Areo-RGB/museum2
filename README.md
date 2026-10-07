# Media Gallery — Personal Museum derivative

A walkable Three.js gallery. On every visit, frames are filled at random from a media collection
in a Cloudflare R2 bucket (described by `public/media-manifest.json`). Any frame can be recurated:
hang another random piece, or upload your own image or video (stored locally in IndexedDB).

Through the door in the front wall is **The Little Cinema**: rows of velvet seats, a big screen
between drapes, a projector beam and a starry ceiling. Click the screen to open the programme and
pick a film. The house lights dim while it plays, the screen's colour spills onto the room, and the
soundtrack is positional, so it fades as you walk out.

This prototype is derived from ideas and portions of the MIT-licensed **barisulgen/personal-museum** project. The original MIT license is preserved in `LICENSE`.

## Run

```bash
npm install
npm run dev
```

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | walk (`Shift` to hurry) |
| Mouse | look |
| Click a frame | open the curator panel |
| `C` | guided tour (click or `C` again to take over) |
| `R` | rehang every frame with new random pieces (uploads stay) |
| Click the cinema screen | open the film programme |
| Click a seat | sit down (any movement key stands you up) |
| `Space` | pause / resume the film (in the cinema) |
| `Esc` | release the mouse |

## Project structure

```
src/
  main.js              Composition root: wires modules together, owns the input mode state machine
  config.js            All tuning knobs (media limits, player speed, tour timing, rendering)
  styles.css
  core/app.js          Renderer, scene, camera, frame loop; features plug in as systems { update(dt, app) }
  world/
    layout.js          Declarative room: walls, benches, frame slots, colliders — edit this to change the gallery
    environment.js     Builds architecture + lighting from layout.js
    frame.js           MediaFrame: moulding, mat, media surface, caption plaque, picture light, fit modes
    cinema.js          CinemaHall: seats, screen, drapes, projector, house lights, playback API
    textures.js        Procedural textures (wood floor)
  media/
    library.js         Loads the R2 manifest, derives captions, deals items like a shuffled deck
    loader.js          Image/video → texture (downscaled, EXIF-aware), concurrency limiter
    curator.js         Decides what hangs where: upload → random collection item → fallback
  cinema/
    programme.js       What the cinema can show: placeholder films + videos from the collection
    films.js           GeneratedFilm (canvas) and VideoFilm (video + positional audio), one shared interface
    generators.js      Procedural placeholder films (countdown leader, aurora, starfield, test card)
  controls/
    interactions.js    Registry of clickable things: add(meshes, { caption, activate }); walls occlude
    player.js          Pointer lock, sliding collisions, sitting
    tour.js            Cinematic tour
  ui/                  Overlay, HUD, frame editor and cinema programme (DOM only, talk via callbacks)
  storage/db.js        IndexedDB persistence for uploads
```

Common extensions:

- **Add/move frames or walls** — edit `world/layout.js`; colliders and lighting follow automatically.
- **Real films for the cinema** — add entries to `PLACEHOLDER_FILMS` in `cinema/programme.js` with
  `source: { type: 'video', url }` (the host must send CORS headers, e.g. upload them to the R2 bucket).
- **Something clickable** — `interactions.add(meshes, { caption: () => ({ title, subtitle }), activate })`.
- **Another media source** — produce `MediaItem`s (see `media/library.js`) and hand them to the curator.
- **A new per-frame behaviour** — add an object with `update(dt, app)` via `app.addSystem()`.
- In dev builds, `window.museum` exposes `{ app, frames, curator, library, tour }` for poking around in devtools.

## Media collection

`public/media-manifest.json` lists the bucket objects (`key`, `url`, `contentType`, ...). Images
(`image/*`) and videos (`video/*`) are supported; captions are derived from file names
(e.g. `IMG_20230115_105410.jpg` → "15 January 2023 · 10:54").

WebGL needs CORS to sample cross-origin media. The bucket has this CORS rule applied:

```json
[{ "allowed": { "origins": ["*"], "methods": ["GET", "HEAD"], "headers": ["Range"] },
   "exposeHeaders": ["Content-Length", "Content-Range", "ETag"], "maxAgeSeconds": 86400 }]
```

(`cf r2 buckets cors update <bucket> --rules '<json>'`). Restrict `origins` to your deployed domain if you prefer.
Collection URLs get a `?cors=1` suffix: R2 doesn't send `Vary: Origin`, so this keeps CORS responses
in their own browser-cache entry (R2 ignores the query string).

Images are downscaled to 2048 px before upload to the GPU; at most 3 videos hang at once and they
only play while you're nearby (see `config.js`).
