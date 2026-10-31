#!/usr/bin/env bash
# Builds the production font files from the @fontsource-variable packages.
#
#   1. npm install @fontsource-variable/fraunces@5.3.0 @fontsource-variable/atkinson-hyperlegible-next@5.3.0
#      in a scratch folder (not in the repo), then pass that folder's node_modules as $1.
#   2. python3 -m venv venv && venv/bin/pip install fonttools brotli   (fontTools 4.68 was used)
#   3. FONTTOOLS=venv/bin/python ./build-fonts.sh /path/to/scratch/node_modules
#   4. Delete the scratch node_modules.
#
# What it does: pins Fraunces to SOFT 100 (rounded terminals) and WONK 1 (the leaning n, m and h),
# keeps only the weights we use, and writes woff2. The latin files are what a typical page loads;
# the latin-ext files load only when a name such as "Łódź" or "Dvořák" appears (unicode-range).
set -euo pipefail
NM="${1:?pass the node_modules folder that holds @fontsource-variable}"
PY="${FONTTOOLS:-python3}"
OUT="$(cd "$(dirname "$0")" && pwd)"
FR="$NM/@fontsource-variable/fraunces/files"
AT="$NM/@fontsource-variable/atkinson-hyperlegible-next/files"
TMP="$(mktemp -d)"

inst() { # src out axes...
  local src="$1" out="$2"; shift 2
  "$PY" -m fontTools.varLib.instancer -q "$src" "$@" -o "$TMP/x.ttf"
  "$PY" -m fontTools.ttLib.woff2 compress -o "$OUT/$out" "$TMP/x.ttf" >/dev/null
}

for sub in latin latin-ext; do
  # Display roman: weights 500 to 800, optical size kept from 12 to 72 so small numerals stay sturdy
  # and big ones stay crisp (sizes above 72 px use the 72 cut, which is plenty for our soft style)
  inst "$FR/fraunces-$sub-full-normal.woff2" "fraunces-roman-$sub.woff2" SOFT=100 WONK=1 wght=500:800 opsz=12:72
  # Display italic: one static cut, used only as a flourish ("and an Encore", "No. 42")
  inst "$FR/fraunces-$sub-full-italic.woff2" "fraunces-italic-$sub.woff2" SOFT=100 WONK=1 wght=450 opsz=48
  # Text: weights 400 to 800
  inst "$AT/atkinson-hyperlegible-next-$sub-wght-normal.woff2" "atkinson-next-$sub.woff2" wght=400:800
done

# The italic is a flourish face ("and an Encore", "No. 42", the italic E). Keep lowercase, digits and the
# few capitals those strings use. A new italic string with other capitals must add them here.
"$PY" -m fontTools.subset "$OUT/fraunces-italic-latin.woff2" \
  --text="abcdefghijklmnopqrstuvwxyz0123456789ENKDT.,'’?! " \
  --layout-features='kern,liga' --flavor=woff2 --output-file="$TMP/i.woff2"
mv "$TMP/i.woff2" "$OUT/fraunces-italic-latin.woff2"
rm -f "$OUT/fraunces-italic-latin-ext.woff2"

cp "$NM/@fontsource-variable/fraunces/LICENSE" "$OUT/OFL-Fraunces.txt"
cp "$NM/@fontsource-variable/atkinson-hyperlegible-next/LICENSE" "$OUT/OFL-AtkinsonHyperlegibleNext.txt"
rm -rf "$TMP"
ls -l "$OUT"/*.woff2 | awk '{print $5, $9}'
