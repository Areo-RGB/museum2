#!/usr/bin/env bash
# Creates and launches a local Android emulator matching the connected Xiaomi Pad 7.
set -euo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$SDK/emulator/emulator"
NAME="${MUSEUM_AVD_NAME:-Museum_Xiaomi_Pad_7}"
IMAGE="${MUSEUM_ANDROID_IMAGE:-system-images;android-36;google_apis;x86_64}"
AVD_ROOT="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
CONFIG="$AVD_ROOT/$NAME.avd/config.ini"

for tool in "$SDKMANAGER" "$AVDMANAGER" "$EMULATOR"; do
  if [[ ! -x "$tool" ]]; then
    printf 'Missing Android SDK tool: %s\n' "$tool" >&2
    exit 1
  fi
done

installed_packages=$("$SDKMANAGER" --list_installed 2>/dev/null || true)
if ! grep -Fq "$IMAGE" <<< "$installed_packages"; then
  printf 'Installing %s...\n' "$IMAGE"
  yes | "$SDKMANAGER" "$IMAGE"
fi

if [[ ! -f "$CONFIG" ]]; then
  printf 'Creating AVD %s...\n' "$NAME"
  printf 'no\n' | "$AVDMANAGER" create avd -n "$NAME" -k "$IMAGE" -d medium_tablet
fi

set_property() {
  local key="$1"
  local value="$2"
  local tmp="$CONFIG.$BASHPID.tmp"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 { print key "=" value; updated = 1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' "$CONFIG" > "$tmp"
  mv "$tmp" "$CONFIG"
}

# Xiaomi Pad 7: 2136x3200, 440 dpi, 8 logical cores, about 7.3 GiB RAM.
set_property avd.id "$NAME"
set_property avd.name "$NAME"
set_property hw.cpu.ncore 8
set_property hw.initialOrientation landscape
set_property hw.lcd.width 2136
set_property hw.lcd.height 3200
set_property hw.lcd.density 440
set_property hw.ramSize 7168M
set_property vm.heapSize 512M
set_property hw.gpu.enabled yes
set_property hw.gpu.mode host
set_property showDeviceFrame no

if [[ "${1:-}" == "--create-only" ]]; then
  printf 'Created %s at %s\n' "$NAME" "$CONFIG"
  exit 0
fi

exec "$EMULATOR" -avd "$NAME" -gpu host -no-snapshot -no-boot-anim
