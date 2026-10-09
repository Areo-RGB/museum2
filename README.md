# Hertha 03 Zehlendorf · 2014er Museum

A walkable Three.js museum of the 111 images and videos described by
`public/media-manifest.json`, hosted in Cloudflare R2. Choose among nine seasonal
floors (including the undated archive) using the elevator recessed into the right-hand
wall, its wall-mounted directory, the welcome screen, or `M`. Every asset has its own ordinary frame; a
featured duplicate closes each floor. Month sections run in date order. Only the
selected floor exists, and textures stream in by distance. Switching floors
cancels pending media loads and disposes floor-owned GPU resources. The elevator
closes its doors during the change, then reopens with you inside the cabin on the
selected floor. Walk out through the doorway to explore.

Upload your own image or video to any frame (saved locally in IndexedDB).
Rehanging swaps works while keeping the floor's complete collection represented.

Through a door on the left, right inside the entrance, is **The Little Cinema**: rows of velvet seats, a big screen
between drapes, a projector beam and a starry ceiling. Click the screen to open the programme and
pick a film. The house lights dim while it plays, the screen's colour spills onto the room, and the
soundtrack is positional, so it fades as you walk out.

This prototype is derived from ideas and portions of the MIT-licensed **barisulgen/personal-museum** project. The original MIT license is preserved in `LICENSE`.

## Run

```bash
npm install
npm run dev
```

## Deploy

Hosted on Cloudflare Workers (static assets) at **https://gallery.h03.uk**.

```bash
npm run deploy   # = cf deploy: builds with Vite and uploads to the Worker
```

`cloudflare.config.ts` holds the Worker settings; `domains: ["gallery.h03.uk"]` attaches the custom
domain on the `h03.uk` zone (Cloudflare manages the DNS record and certificate). Build output goes
to `.cloudflare/output/` (git-ignored).

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | walk (`Shift` to hurry) |
| Mouse | look |
| Click a frame | open the curator panel |
| `M` / click the lobby elevator | choose a time period |
| `C` | guided tour (click or `C` again to take over) |
| `R` | rehang every frame with new random pieces (uploads stay) |
| Click the cinema screen | open the film programme |
| Click a seat | sit down (any movement key stands you up) |
| `Space` | pause / resume the film (in the cinema) |
| `Esc` | release the mouse |

On touch devices, use the left stick to walk and drag the gallery to look. Aim
the crosshair and tap **Use** to curate, call the elevator, select a cinema film,
or sit. **Tour** starts the guided visit; tap the gallery to take over. **Menu**
pauses movement and opens the welcome controls. Panels support portrait and
landscape screens and device safe areas.

Rendering batches each frame's moulding and uses two draws for its caption.
Streaming decisions run five times per second; fades and movement stay smooth.
Phones, small viewports, low-memory and data-saving devices use 1024px image
textures, two concurrent media loads, two active gallery videos and a smaller
streaming radius. GPU pixel budgets cap high-DPI rendering. This lowers GPU
memory and decoding work; R2 still serves the original source files, so image
download sizes are unchanged. Hidden tabs skip rendering and pause video playback.

Visited photos are saved in the browser's disk cache (up to 96 MiB, 64 images,
12 MiB per image). Least recently used photos are evicted first; after seven
days a photo is revalidated online, with a saved copy available during network
outages. The manifest always checks for updates and keeps its last valid copy
as a network-failure fallback. **Clear downloaded photos** in the welcome/menu
screen frees the photo cache without removing uploads. Persistent caching needs
HTTPS or localhost and falls back to normal loading if storage is unavailable.
Videos retain native HTTP/range streaming. Fingerprinted JS/CSS assets have
one-year browser caching; HTML and the manifest revalidate so new deployments
and collection edits remain discoverable. This is not a fully offline app.

## Project structure

```
src/
  main.js              Composition root: wires modules together, owns the input mode state machine
  config.js            All tuning knobs (media limits, player speed, tour timing, rendering)
  styles.css
  core/app.js          Renderer, scene, camera, frame loop; features plug in as systems { update(dt, app) }
  core/deviceProfile.js Device-aware render/media budgets
  world/
    layout.js          createLayout(floor): hall, month sections, frame slots, walls, colliders, cinema placement
                       (the cinema is defined in its own local coordinates and placed via a transform)
    environment.js     One-time atmosphere and disposable per-floor architecture
    lobby.js           Elevator cabin with sliding doors and floor directory
    signage.js         Canvas-drawn signs and period wall text
    frame.js           MediaFrame: moulding, mat, media surface, caption plaque, picture light, fit modes
    cinema.js          CinemaHall: seats, screen, drapes, projector, house lights, playback API
    textures.js        Procedural textures (wood floor)
  media/
    library.js         Loads the R2 manifest, derives dates/captions/periods, deals items like a shuffled deck
    loader.js          Image/video → texture (downscaled, EXIF-aware), concurrency limiter
    cache.js           Bounded persistent photo cache and network-first manifest fallback
    curator.js         What hangs where (upload → assigned manifest item → fallback),
                       and streams textures in/out by distance
  cinema/
    programme.js       What the cinema can show: placeholder films + videos from the collection
    films.js           GeneratedFilm (canvas) and VideoFilm (video + positional audio), one shared interface
    generators.js      Procedural placeholder films (countdown leader, aurora, starfield, test card)
  controls/
    interactions.js    Registry of clickable things: add(meshes, { caption, activate }); walls occlude
    player.js          Pointer lock, sliding collisions, sitting
    touch.js           Joystick, drag-to-look and touch actions
    tour.js            Cinematic tour
  ui/                  Overlay, HUD, frame editor and cinema programme (DOM only, talk via callbacks)
  storage/db.js        IndexedDB persistence for uploads
```

Common extensions:

- **Hall rhythm** — `SPACING` in `world/layout.js` controls frame spacing; each month gets
  exactly one ordinary slot per item. Colliders, lights and signage follow automatically.
- **Different periods** (months, years, ...) — change `periodFor()` in `media/library.js`.
- **Real films for the cinema** — add entries to `PLACEHOLDER_FILMS` in `cinema/programme.js` with
  `source: { type: 'video', url }` (the host must send CORS headers, e.g. upload them to the R2 bucket).
- **Something clickable** — `interactions.add(meshes, { caption: () => ({ title, subtitle }), activate })`.
- **Another media source** — produce `MediaItem`s (see `media/library.js`) and hand them to the curator.
- **A new per-frame behaviour** — add an object with `update(dt, app)` via `app.addSystem()`.
- In dev builds, `window.museum` exposes `{ app, layout, frames, curator, library, tour, cinema, player }` for poking around in devtools.

## Media collection

`public/media-manifest.json` lists the bucket objects (`key`, `url`, `contentType`, ...). Images
(`image/*`) and videos (`video/*`) are supported; captions are derived from file names
(e.g. `IMG_20230115_105410.jpg` → "15 January 2023 · 10:54").

### Bucket layout and local mirror

The bucket is filed the way the museum is built (rules in `scripts/bucket-layout.js`):

```
floors/2023-1-spring/IMG_20230415_101500.jpg   one folder per seasonal floor (December → next winter)
floors/undated/...                              no date in the file name
hall-of-fame/...                                curated entrance-floor videos (src/fame/programme.js)
music/Twelve_White_Walls.mp3                    background music
manifest.json                                   copy of public/media-manifest.json
```

`scripts/r2.mjs` keeps it that way, entirely through the `cf` CLI (list, get, put, delete) and its login:

```bash
npm run r2:mirror                       # sync the bucket to ~/R2/<bucket> (R2_MIRROR overrides); MD5-verified, moves instead of re-downloading
node scripts/r2.mjs organize            # dry run: where unfiled objects (e.g. new uploads at the root) would go
node scripts/r2.mjs organize --apply    # copy them into place and verify the copies
npm run r2:manifest                     # rebuild public/media-manifest.json (and upload it as manifest.json)
# deploy, check the live site, then:
node scripts/r2.mjs organize --delete-old   # remove the old keys (only those with a verified copy)
```

`CONFIG.media.hidden` lists file names, so hiding a work survives it being refiled.

WebGL needs CORS to sample cross-origin media. The bucket has this CORS rule applied:

```json
[{ "allowed": { "origins": ["*"], "methods": ["GET", "HEAD"], "headers": ["Range"] },
   "exposeHeaders": ["Content-Length", "Content-Range", "ETag"], "maxAgeSeconds": 86400 }]
```

(`cf r2 buckets cors update <bucket> --rules '<json>'`). Restrict `origins` to your deployed domain if you prefer.
Collection URLs get a `?cors=1` suffix: R2 doesn't send `Vary: Origin`, so this keeps CORS responses
in their own browser-cache entry (R2 ignores the query string).

Images are downscaled to 2048 px before upload to the GPU. Textures are only loaded within
`loadDistance` of the visitor and freed beyond `unloadDistance`; the nearest six video textures can load at once, and videos only play while you're
nearby (see `config.js`).

## Verification and workflow

Run `npm test` and `npm run build` before shipping. `CLAUDE.md` records the requested
automatic commit, push-to-main and Cloudflare deployment workflow. Browser checks
cover all-floor manifest coverage, repeated switching, real R2 media and controls.
Transient media failures show a retry caption and retry after five seconds.
