#!/usr/bin/env bash
# Builds the tablet APK straight from the SDK tools (no Gradle).
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}
BT=$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)
JAR="$SDK/platforms/android-35/android.jar"
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/dex"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest AndroidManifest.xml
KOTLINC=${KOTLINC:-$(command -v kotlinc || echo "$HOME/.local/share/kotlinc-dl/kotlinc/bin/kotlinc")}
STDLIB="$(dirname "$KOTLINC")/../lib/kotlin-stdlib.jar"
"$KOTLINC" -nowarn -jvm-target 11 -classpath "$JAR" -d "$OUT/classes" $(find src -name '*.kt') $(find src -name '*.java')
javac --release 11 -nowarn -classpath "$JAR:$OUT/classes" -d "$OUT/classes" $(find src -name '*.java')
"$BT/d8" --release --min-api 33 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class') "$STDLIB"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
jar uf "$OUT/unsigned.apk" -C "$OUT/dex" classes.dex
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS=${MUSEUM_KEYSTORE:-$HOME/.android/debug.keystore}
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
  -alias androiddebugkey -dname "CN=Android Debug" -keyalg RSA -validity 10000 >/dev/null
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --out "$OUT/museum.apk" "$OUT/aligned.apk"
echo "$OUT/museum.apk"
