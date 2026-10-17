#!/usr/bin/env node
// Builds the tablet APK straight from the SDK tools (no Gradle), installs it on
// every connected adb device and launches it.
// Needs: Android SDK (ANDROID_HOME, platform android-35, build-tools), a JDK
// (javac, jar, keytool) and kotlinc (on PATH or KOTLINC=/path/to/kotlinc).
// Set ANDROID_SERIAL to target a single device; MUSEUM_KEYSTORE to sign with
// another keystore (default: the Android debug keystore).
// Usage: node scripts/android-debug.js [--no-install] [--no-launch]
"use strict";

const APP_ID = "uk.h03.gallery";
const ACTIVITY = `${APP_ID}/.MainActivity`;

async function main() {
  const { fs, path, os, IS_WIN, ROOT, run, capture, fail, parseArgs, spawnSync } = await helpers();
  const { flags } = parseArgs();
  const androidDir = path.join(ROOT, "android");
  const out = path.join(androidDir, "build");
  const bat = (name) => (IS_WIN ? `${name}.bat` : name);
  const exe = (name) => (IS_WIN ? `${name}.exe` : name);

  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    IS_WIN ? path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk") : path.join(os.homedir(), "Android", "Sdk")]
    .find((p) => p && fs.existsSync(p));
  if (!sdk) fail("Android SDK not found; set ANDROID_HOME.");
  const versions = fs.readdirSync(path.join(sdk, "build-tools"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (versions.length === 0) fail(`no build-tools in ${sdk}`);
  const bt = path.join(sdk, "build-tools", versions[versions.length - 1]);
  const androidJar = path.join(sdk, "platforms", "android-35", "android.jar");
  if (!fs.existsSync(androidJar)) fail(`missing ${androidJar} (install platform android-35)`);

  const kotlinc = process.env.KOTLINC
    || findOnPath(bat("kotlinc"), { fs, path })
    || [path.join(os.homedir(), ".local", "share", "kotlinc-dl", "kotlinc", "bin", bat("kotlinc"))].find((p) => fs.existsSync(p));
  if (!kotlinc) fail("kotlinc not found; install the Kotlin compiler or set KOTLINC=/path/to/kotlinc.");
  const stdlib = path.join(path.dirname(kotlinc), "..", "lib", "kotlin-stdlib.jar");

  const sources = (ext) => walk(path.join(androidDir, "src"), { fs, path }).filter((f) => f.endsWith(ext));
  const classes = path.join(out, "classes");
  const dex = path.join(out, "dex");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  fs.mkdirSync(dex, { recursive: true });
  const cp = [androidJar, classes].join(path.delimiter);

  run(path.join(bt, exe("aapt2")), ["link", "-o", path.join(out, "base.apk"), "-I", androidJar, "--manifest", path.join(androidDir, "AndroidManifest.xml")]);
  run(kotlinc, ["-nowarn", "-jvm-target", "11", "-classpath", androidJar, "-d", classes, ...sources(".kt"), ...sources(".java")], { shell: IS_WIN });
  run("javac", ["--release", "11", "-nowarn", "-classpath", cp, "-d", classes, ...sources(".java")]);
  // Jar the classes first: d8 takes no directories and a file list can overflow the Windows command line.
  run("jar", ["cf", path.join(out, "classes.jar"), "-C", classes, "."]);
  run(path.join(bt, bat("d8")), ["--release", "--min-api", "33", "--lib", androidJar, "--output", dex, path.join(out, "classes.jar"), stdlib], { shell: IS_WIN });
  fs.copyFileSync(path.join(out, "base.apk"), path.join(out, "unsigned.apk"));
  run("jar", ["uf", path.join(out, "unsigned.apk"), "-C", dex, "classes.dex"]);
  run(path.join(bt, exe("zipalign")), ["-f", "4", path.join(out, "unsigned.apk"), path.join(out, "aligned.apk")]);

  const keystore = process.env.MUSEUM_KEYSTORE || path.join(os.homedir(), ".android", "debug.keystore");
  if (!fs.existsSync(keystore)) {
    fs.mkdirSync(path.dirname(keystore), { recursive: true });
    run("keytool", ["-genkeypair", "-keystore", keystore, "-storepass", "android", "-keypass", "android",
      "-alias", "androiddebugkey", "-dname", "CN=Android Debug", "-keyalg", "RSA", "-validity", "10000"]);
  }
  const apk = path.join(out, "museum.apk");
  run(path.join(bt, bat("apksigner")), ["sign", "--ks", keystore, "--ks-pass", "pass:android", "--out", apk, path.join(out, "aligned.apk")], { shell: IS_WIN });
  console.log(`Built ${apk}`);
  if (flags.has("no-install")) return;

  const adb = [exe("adb"), path.join(sdk, "platform-tools", exe("adb"))].find((a) => capture(a, ["version"]));
  if (!adb) fail("adb not found.");
  const serials = capture(adb, ["devices"]).split(/\r?\n/).slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial)
    .filter((serial) => !process.env.ANDROID_SERIAL || serial === process.env.ANDROID_SERIAL);
  if (serials.length === 0) fail(`no devices connected ('${adb} devices' is empty).`);

  let failed = false;
  for (const serial of serials) {
    console.log(`== ${serial}`);
    const install = spawnSync(adb, ["-s", serial, "install", "-r", apk], { stdio: "inherit" });
    if (install.status !== 0) {
      console.error(`hint: on a signature mismatch run: ${adb} -s ${serial} uninstall ${APP_ID}`);
      failed = true;
      continue;
    }
    if (!flags.has("no-launch")) {
      spawnSync(adb, ["-s", serial, "shell", "am", "start", "-n", ACTIVITY], { stdio: "inherit" });
    }
  }
  process.exit(failed ? 1 : 0);
}

function walk(dir, { fs, path }) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p, { fs, path }) : [p];
  });
}

function findOnPath(name, { fs, path }) {
  return (process.env.PATH || "").split(path.delimiter).map((d) => path.join(d, name)).find((p) => fs.existsSync(p));
}

// Shared helpers (kept inline so the script has no dependencies). Dynamic
// imports keep it valid under both CommonJS and "type": "module" packages.
async function helpers() {
  const { spawn, spawnSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const IS_WIN = process.platform === "win32";
  const ROOT = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");

  /** Runs a command with inherited stdio; exits the script on failure. */
  function run(cmd, args = [], opts = {}) {
    console.log(`> ${cmd} ${args.join(" ")}`);
    // .cmd/.bat need a shell on Windows; pass one command line (DEP0190).
    const quote = (s) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
    const result = opts.shell
      ? spawnSync([cmd, ...args].map(quote).join(" "), { cwd: ROOT, stdio: "inherit", ...opts })
      : spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
    if (result.error) fail(`failed to run ${cmd}: ${result.error.message}`);
    if (result.signal) fail(`${cmd} stopped by ${result.signal}`);
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  /** Runs a command and returns its trimmed stdout ("" on failure). */
  function capture(cmd, args = [], opts = {}) {
    const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
    return result.status === 0 ? (result.stdout || "").trim() : "";
  }

  function fail(message) {
    console.error(`error: ${message}`);
    process.exit(1);
  }

  /** Splits `--port N` (injected by DesktopCC) and `--flag` switches from the rest. */
  function parseArgs(argv = process.argv.slice(2)) {
    const out = { port: undefined, flags: new Set(), rest: [] };
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--port" && i + 1 < argv.length) out.port = argv[++i];
      else if (arg.startsWith("--port=")) out.port = arg.slice(7);
      else if (arg.startsWith("--") && out.rest.length === 0 && arg !== "--") out.flags.add(arg.slice(2));
      else out.rest.push(arg);
    }
    if (out.rest[0] === "--") out.rest.shift();
    return out;
  }

  /** Installs JS dependencies when node_modules is missing. */
  function ensureNodeModules(manager) {
    if (fs.existsSync(path.join(ROOT, "node_modules"))) return;
    run(manager, ["install"], { shell: IS_WIN });
  }

  /** Stops running copies of `exe` (Windows locks running binaries). */
  function stopRunning(exe) {
    if (!IS_WIN || !fs.existsSync(exe)) return;
    const quoted = exe.replace(/'/g, "''");
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `Get-Process | Where-Object { $_.Path -eq '${quoted}' } | ForEach-Object { Write-Output "closing running copy (pid $($_.Id))"; Stop-Process -Id $_.Id -Force; $_.WaitForExit(5000) | Out-Null }`,
    ], { stdio: "inherit" });
  }

  /** Copies a built binary to a stable location so rebuilds don't fight the running app. */
  function installCopy(from, to) {
    if (!fs.existsSync(from)) fail(`built binary not found: ${from}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    stopRunning(to);
    if (fs.existsSync(to)) fs.rmSync(to, { force: true });
    fs.copyFileSync(from, to);
    if (!IS_WIN) fs.chmodSync(to, 0o755);
    console.log(`Installed ${to}`);
    return to;
  }

  /** Creates/updates a desktop shortcut (.lnk on Windows, .desktop on Linux). */
  function desktopShortcut({ name, target, icon, wmClass, comment }) {
    if (IS_WIN) {
      const q = (s) => s.replace(/'/g, "''");
      const lnk = capture("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `$d=[Environment]::GetFolderPath('Desktop'); $l=Join-Path $d '${q(name)}.lnk'; ` +
        `$s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath='${q(target)}'; ` +
        `$s.WorkingDirectory='${q(path.dirname(target))}'; $s.IconLocation='${q(icon || target)},0'; ` +
        `$s.Description='${q(comment || name)}'; $s.Save(); $l`,
      ]);
      if (!lnk) fail("could not create the desktop shortcut");
      console.log(`Shortcut: ${lnk}`);
      return;
    }
    const xdg = capture("xdg-user-dir", ["DESKTOP"]);
    const desktop = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), "Desktop");
    fs.mkdirSync(desktop, { recursive: true });
    const file = path.join(desktop, `${name.replace(/\s+/g, "")}.desktop`);
    const lines = [
      "[Desktop Entry]", "Type=Application", `Name=${name}`, `Comment=${comment || name}`,
      `Exec="${target}"`, `Path=${path.dirname(target)}`,
      ...(icon && fs.existsSync(icon) ? [`Icon=${icon}`] : []),
      ...(wmClass ? [`StartupWMClass=${wmClass}`] : []),
      "Terminal=false", "",
    ];
    fs.writeFileSync(file, lines.join("\n"), { mode: 0o755 });
    fs.chmodSync(file, 0o755);
    console.log(`Shortcut: ${file}`);
  }

  return { spawn, spawnSync, fs, path, os, IS_WIN, ROOT, run, capture, fail, parseArgs, ensureNodeModules, stopRunning, installCopy, desktopShortcut };
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
