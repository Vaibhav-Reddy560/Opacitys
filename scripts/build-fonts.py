#!/usr/bin/env python3
"""
Regenerates src/lib/rebuild/fonts/files from Google Fonts.

Run: pip install fonttools && python3 scripts/build-fonts.py

Google Fonts now ships these families as VARIABLE fonts only — the `static/`
directories were removed upstream. That is a problem for us specifically,
because opentype.js (which Rebuild uses to convert glyphs to outlines) applies
variation axes only inside `font.getPath()`, its full shaping pipeline — and
that pipeline throws on several of these files:

    substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet supported

It is character-dependent, so it cannot be avoided by disabling features:
"H" renders fine in Inter, "HO" does not. The per-glyph path API that avoids
shaping entirely (`charToGlyph().getPath()`) ignores variations, so a variable
font renders at its default weight no matter what is requested — which is a
silent wrong-weight bug, not a crash.

Baking static instances here removes the whole problem: the weight is in the
outlines, so the safe per-glyph API is also the correct one. Output is
committed, so a deploy never depends on this script or on network access.

OVERLAP REMOVAL IS NOT OPTIONAL. Interpolating a variable font to a fixed
weight routinely leaves contours overlapping each other, and a TrueType
rasteriser doesn't care — but the SVG path we hand to librsvg is filled with
the nonzero rule, where two contours wound in opposite directions cancel
where they overlap. Observed on Archivo at wght 900: the "S" came out with a
bite taken out of its middle. `overlap=REMOVE` runs the contours through
skia-pathops and unions them, so every glyph is a single consistently-wound
region. Requires `pip install skia-pathops`.

Licence: all families are SIL Open Font License. Instancing is a permitted
modification; the OFL files are kept alongside the fonts.
"""
import os
import subprocess
import sys
import urllib.parse

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GF = "https://raw.githubusercontent.com/google/fonts/main"
OUT = os.path.join("src", "lib", "rebuild", "fonts", "files")

# family -> (google fonts path, variable filename, weights to bake)
PLAN = {
    "Arimo":           ("ofl/arimo",           "Arimo[wght].ttf",            [400, 700]),
    "Inter":           ("ofl/inter",           "Inter[opsz,wght].ttf",       [400, 700, 900]),
    "Archivo":         ("ofl/archivo",         "Archivo[wdth,wght].ttf",     [400, 700, 900]),
    "Montserrat":      ("ofl/montserrat",      "Montserrat[wght].ttf",       [400, 700, 900]),
    "RobotoCondensed": ("ofl/robotocondensed", "RobotoCondensed[wght].ttf",  [400, 700]),
    "Oswald":          ("ofl/oswald",          "Oswald[wght].ttf",           [400, 700]),
    "PlayfairDisplay": ("ofl/playfairdisplay", "PlayfairDisplay[wght].ttf",  [400, 700, 900]),
}

# Single-weight families, copied through as-is.
STATIC = {
    "BebasNeue-400.ttf": "ofl/bebasneue/BebasNeue-Regular.ttf",
    "Tinos-400.ttf":     "ofl/tinos/Tinos-Regular.ttf",
    "Tinos-700.ttf":     "ofl/tinos/Tinos-Bold.ttf",
}


def fetch(path: str) -> bytes:
    """
    Fetch via curl rather than urllib.

    Python installed from python.org on macOS ships without a usable CA
    bundle, so urllib fails every HTTPS request with CERTIFICATE_VERIFY_FAILED
    until someone runs Install Certificates.command. curl uses the system trust
    store and just works, on macOS and Linux alike.
    """
    url = f"{GF}/{urllib.parse.quote(path)}"
    result = subprocess.run(
        ["curl", "-sfL", "--max-time", "120", url],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        raise RuntimeError(f"could not download {url} (curl exit {result.returncode})")
    return result.stdout


def main() -> int:
    os.makedirs(OUT, exist_ok=True)

    for name, url_path in STATIC.items():
        dest = os.path.join(OUT, name)
        with open(dest, "wb") as f:
            f.write(fetch(url_path))
        print(f"  ok  {name} ({os.path.getsize(dest) // 1024}KB)")

    for family, (dirpath, filename, weights) in PLAN.items():
        tmp = os.path.join(OUT, f".{family}.var.ttf")
        with open(tmp, "wb") as f:
            f.write(fetch(f"{dirpath}/{filename}"))

        for w in weights:
            font = TTFont(tmp)
            axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
            lo, hi = axes.get("wght", (400, 400))
            target = max(lo, min(hi, w))
            loc = {"wght": target}
            # Inter's optical-size axis: pin to the display end, since this is
            # only ever used for headline-scale text in a design.
            if "opsz" in axes:
                loc["opsz"] = axes["opsz"][1]
            # Archivo carries a width axis; keep it normal so the catalogue's
            # width expectations hold.
            if "wdth" in axes:
                loc["wdth"] = 100
            instancer.instantiateVariableFont(
                font,
                loc,
                inplace=True,
                updateFontNames=False,
                # See the module docstring: without this, interpolated
                # contours overlap and nonzero SVG fill punches holes in them.
                overlap=instancer.OverlapMode.REMOVE,
            )
            dest = os.path.join(OUT, f"{family}-{int(target)}.ttf")
            font.save(dest)
            print(f"  ok  {family}-{int(target)}.ttf ({os.path.getsize(dest) // 1024}KB)")

        os.remove(tmp)

    print(f"\nWrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
