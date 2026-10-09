#!/usr/bin/env node
// Bucket housekeeping for the museum's R2 media, via the `cf` CLI's login.
//
//   node scripts/r2.mjs mirror [--prune]          Bring the local mirror in line with the bucket
//   node scripts/r2.mjs organize [--apply]        File objects into the folders of bucket-layout.js
//   node scripts/r2.mjs organize --delete-old     Remove old keys whose copy is in place
//   node scripts/r2.mjs manifest [--upload]       Rebuild public/media-manifest.json from the bucket
//
// The mirror defaults to ~/R2/<bucket>; override with R2_MIRROR.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_KEY, publicUrl, targetKey } from './bucket-layout.js';
import { MEDIA_BASE } from '../src/fame/programme.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'museum2-2014-1-001';
const MIRROR = process.env.R2_MIRROR ?? join(homedir(), 'R2', BUCKET);
const CF = join(ROOT, 'node_modules', 'cf', 'bin', 'cf');
const PAGE = 1000;

function cf(...args) {
  const out = execFileSync(process.execPath, [CF, ...args, '--bucket-name', BUCKET],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  const start = out.search(/[[{]/);
  return start < 0 ? null : JSON.parse(out.slice(start));
}

/** Every object in the bucket: { key, size, etag, contentType }. */
function listBucket() {
  const objects = [];
  for (let after; ;) {
    const page = cf('r2', 'objects', 'list', '--per-page', String(PAGE), ...(after ? ['--start-after', after] : []));
    objects.push(...page.map((o) => ({ key: o.key, size: o.size, etag: o.etag, contentType: o.http_metadata?.contentType ?? '' })));
    if (page.length < PAGE) return objects;
    after = page.at(-1).key;
  }
}

function hashFile(path, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    createReadStream(path).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

const localPath = (key) => join(MIRROR, ...key.split('/'));
const sizeOf = (path) => stat(path).then((s) => s.size, () => -1);

/** True when the mirror holds this exact object (R2 etags of single-part uploads are MD5s). */
async function matches(path, object) {
  if (await sizeOf(path) !== object.size) return false;
  return object.etag.includes('-') || await hashFile(path, 'md5') === object.etag;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])));
  return files.flat();
}

async function removeEmptyDirs(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await removeEmptyDirs(join(dir, e.name));
  }
  if (dir !== MIRROR && !(await readdir(dir)).length) await rmdir(dir);
}

/** `cf r2 objects get` writes the raw object to stdout; stream it to disk. */
async function cfDownload(key, file) {
  const child = spawn(process.execPath, [CF, 'r2', 'objects', 'get', key, '--bucket-name', BUCKET],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve, reject) => child.on('error', reject).on('close', resolve));
  await pipeline(child.stdout, createWriteStream(file));
  const code = await exited;
  if (code) throw new Error(`${key}: cf exited with ${code}`);
}

async function download(object, path) {
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.part`;
  await cfDownload(object.key, partial);
  if (!(await matches(partial, object))) throw new Error(`${object.key}: download does not match its etag`);
  await rename(partial, path);
}

async function mirror({ prune = false } = {}) {
  const objects = listBucket();
  const wanted = new Set(objects.map((o) => localPath(o.key)));
  const local = await walk(MIRROR);
  // Files the bucket no longer has under that name; moved when an object was renamed.
  const strays = local.filter((p) => !wanted.has(p));
  const hashes = new Map();
  const counts = { kept: 0, moved: 0, copied: 0, downloaded: 0 };
  for (const object of objects) {
    const path = localPath(object.key);
    if (await matches(path, object)) { counts.kept++; continue; }
    // Reuse an identical local file (a stray first) rather than downloading again.
    let source = null;
    for (const candidate of [...strays, ...local.filter((p) => wanted.has(p) && p !== path)]) {
      if (await sizeOf(candidate) !== object.size) continue;
      if (!hashes.has(candidate)) hashes.set(candidate, await hashFile(candidate, 'md5'));
      if (hashes.get(candidate) === object.etag) { source = candidate; break; }
    }
    if (source) {
      await mkdir(dirname(path), { recursive: true });
      const moving = strays.includes(source);
      if (moving) {
        await rename(source, path);
        strays.splice(strays.indexOf(source), 1);
        local.splice(local.indexOf(source), 1, path);
        hashes.set(path, hashes.get(source));
      } else {
        await copyFile(source, path);
      }
      counts[moving ? 'moved' : 'copied']++;
      console.log(`${moving ? 'moved ' : 'copied'}     ${relative(MIRROR, source)} -> ${object.key}`);
    } else {
      await download(object, path);
      counts.downloaded++;
      console.log(`downloaded ${object.key}`);
    }
  }
  for (const stray of strays) {
    if (prune) await rm(stray);
    console.log(`${prune ? 'pruned    ' : 'not in bucket (use --prune):'} ${relative(MIRROR, stray).split(sep).join('/')}`);
  }
  await mkdir(MIRROR, { recursive: true });
  await removeEmptyDirs(MIRROR);
  const bytes = objects.reduce((sum, o) => sum + o.size, 0);
  console.log(`Mirror ${MIRROR}: ${objects.length} objects, ${(bytes / 1e6).toFixed(1)} MB `
    + `(${counts.kept} up to date, ${counts.moved} moved, ${counts.copied} copied, ${counts.downloaded} downloaded).`);
  return objects;
}

async function organize({ apply = false, deleteOld = false } = {}) {
  const objects = await mirror();
  const byKey = new Map(objects.map((o) => [o.key, o]));
  const moves = objects.map((o) => ({ object: o, to: targetKey(o.key, o.contentType) })).filter((m) => m.to !== m.object.key);
  if (!moves.length) return console.log('Bucket is already organised.');
  const collisions = moves.filter((m) => m.to && byKey.has(m.to) && byKey.get(m.to).etag !== m.object.etag);
  if (collisions.length) throw new Error(`Different objects already at ${collisions.map((m) => m.to).join(', ')}`);

  for (const { object, to } of moves) {
    const copied = to && byKey.get(to)?.etag === object.etag;
    if (deleteOld) {
      if (to && !copied) { console.log(`keep   ${object.key} (no verified copy at ${to} yet)`); continue; }
      cf('r2', 'objects', 'delete', object.key, '--force');
      console.log(`delete ${object.key}`);
    } else if (!to) {
      console.log(`obsolete ${object.key} (removed by --delete-old)`);
    } else if (copied) {
      console.log(`copied   ${object.key} -> ${to}`);
    } else if (apply) {
      cf('r2', 'objects', 'put', to, '--file', localPath(object.key), '--content-type', object.contentType);
      console.log(`copy     ${object.key} -> ${to}`);
    } else {
      console.log(`plan     ${object.key} -> ${to}`);
    }
  }
  if (apply) {
    // Confirm every copy landed intact before anything may be deleted.
    const after = new Map(listBucket().map((o) => [o.key, o]));
    const missing = moves.filter((m) => m.to && after.get(m.to)?.etag !== m.object.etag);
    if (missing.length) throw new Error(`Copies not verified: ${missing.map((m) => m.to).join(', ')}`);
    console.log(`All ${moves.filter((m) => m.to).length} copies verified. Old keys stay until --delete-old.`);
  }
  if (deleteOld) {
    const left = new Set(listBucket().map((o) => o.key));
    const stuck = moves.filter((m) => (!m.to || left.has(m.to)) && left.has(m.object.key));
    if (stuck.length) throw new Error(`Still in the bucket: ${stuck.map((m) => m.object.key).join(', ')}`);
    await mirror();
  }
}

async function manifest({ upload = false } = {}) {
  const objects = await mirror();
  const keys = new Set(objects.map((o) => o.key));
  // Mid-reorganisation an object exists twice; list only its filed copy.
  const listed = objects.filter((o) => /^(image|video)\//.test(o.contentType))
    .filter((o) => { const to = targetKey(o.key, o.contentType); return to === o.key || !keys.has(to); });
  const assets = [];
  for (const o of listed.sort((a, b) => a.key.localeCompare(b.key))) {
    assets.push({
      key: o.key, url: publicUrl(MEDIA_BASE, o.key), sizeBytes: o.size, contentType: o.contentType,
      sha256: await hashFile(localPath(o.key), 'sha256'), etag: o.etag,
    });
  }
  const doc = {
    manifestVersion: 1, createdAtUtc: new Date().toISOString(), bucket: BUCKET, publicBaseUrl: MEDIA_BASE,
    totalAssets: assets.length, totalBytes: assets.reduce((sum, a) => sum + a.sizeBytes, 0), assets,
  };
  const file = join(ROOT, 'public', 'media-manifest.json');
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Wrote ${relative(ROOT, file)}: ${assets.length} assets.`);
  if (upload) {
    cf('r2', 'objects', 'put', MANIFEST_KEY, '--file', file, '--content-type', 'application/json');
    console.log(`Uploaded ${MANIFEST_KEY}.`);
  }
}

const [command, ...flags] = process.argv.slice(2);
const has = (flag) => flags.includes(flag);
const commands = {
  mirror: () => mirror({ prune: has('--prune') }),
  organize: () => organize({ apply: has('--apply'), deleteOld: has('--delete-old') }),
  manifest: () => manifest({ upload: has('--upload') }),
};
if (!commands[command]) {
  console.error('Usage: node scripts/r2.mjs <mirror [--prune] | organize [--apply | --delete-old] | manifest [--upload]>');
  process.exit(1);
}
await commands[command]();
