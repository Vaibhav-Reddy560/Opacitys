/**
 * The style vocabulary Identify reads a design against. Curated by hand,
 * not generated — the page's honesty claim ("classification is only as
 * good as this list") means every entry here has to be a real, documented
 * design movement or contemporary aesthetic label, not an invented one.
 * `tell` is the compact cue the model is asked to look for — it keeps the
 * read anchored to something concrete instead of a vibe.
 */
export interface StyleTaxonomyEntry {
  slug: string;
  name: string;
  era: string;
  tell: string;
}

export const STYLE_TAXONOMY: StyleTaxonomyEntry[] = [
  // Historical print & graphic design movements
  { slug: "swiss-international", name: "Swiss / International Typographic Style", era: "1950s-60s", tell: "Grid-based layout, sans-serif (Helvetica/Akzidenz), asymmetric balance, objective photography" },
  { slug: "bauhaus", name: "Bauhaus", era: "1919-1933", tell: "Geometric primitives, primary colors, geometric sans (Futura-like), form-follows-function" },
  { slug: "constructivism", name: "Russian Constructivism", era: "1920s", tell: "Diagonal composition, bold red/black, photomontage, propaganda-poster energy" },
  { slug: "de-stijl", name: "De Stijl", era: "1917-1931", tell: "Primary colors + black/white, strict horizontal/vertical grid, Mondrian-like blocks" },
  { slug: "art-deco", name: "Art Deco", era: "1920s-30s", tell: "Symmetric ornament, metallic gold/black, geometric sunbursts, elegant display serifs" },
  { slug: "art-nouveau", name: "Art Nouveau", era: "1890-1910", tell: "Organic flowing lines, floral motifs, whiplash curves, hand-lettered display type" },
  { slug: "futurism", name: "Italian Futurism", era: "1909-1930s", tell: "Fractured dynamic typography, speed/motion lines, words-in-freedom layout" },
  { slug: "dada-photomontage", name: "Dada / Photomontage", era: "1916-1924", tell: "Cut-and-paste collage, deliberately jarring type mixing, anti-composition" },
  { slug: "psychedelic", name: "Psychedelic (concert poster)", era: "1960s", tell: "Warped bubble lettering, clashing saturated color, illegible-on-purpose type" },
  { slug: "pop-art", name: "Pop Art", era: "1950s-60s", tell: "Ben-Day dots, flat bold color blocks, comic/advertising imagery quoted directly" },
  { slug: "op-art", name: "Op Art", era: "1960s", tell: "High-contrast geometric patterns creating optical vibration or illusion of movement" },
  { slug: "punk-diy", name: "Punk / DIY zine", era: "1976-80s", tell: "Ransom-note cut letters, xerox texture, deliberately ugly/rough collage" },
  { slug: "memphis", name: "Memphis Design", era: "1981-1987", tell: "Squiggles, confetti shapes, clashing pastels + primaries, playful geometric chaos" },
  { slug: "postmodern-deconstructed", name: "Postmodern / Deconstructed (Carson-era)", era: "late 1980s-90s", tell: "Layered, overlapping, intentionally hard-to-read type; grunge textures; broken grids" },
  { slug: "grunge-typography", name: "Grunge Typography", era: "1990s", tell: "Distressed/torn textures, decayed type, photocopied grime, dark desaturated palette" },
  { slug: "mid-century-modern", name: "Mid-Century Modern", era: "1945-1965", tell: "Warm flat color, organic abstract shapes, optimistic clean sans type" },
  { slug: "streamline-moderne", name: "Streamline Moderne", era: "1930s", tell: "Aerodynamic curves, horizontal speed lines, chrome/metallic sheen" },
  { slug: "victorian-ornamental", name: "Victorian Ornamental", era: "1837-1901", tell: "Dense decorative borders, wood-type display faces, cluttered symmetric layout" },
  { slug: "blackletter-revival", name: "Blackletter / Gothic Revival", era: "recurring", tell: "Heavy fractured blackletter type, often high-contrast, streetwear/metal-adjacent" },

  // Digital / interface design eras
  { slug: "skeuomorphism", name: "Skeuomorphism", era: "2000s-2012", tell: "Realistic textures (leather, brushed metal), drop shadows mimicking physical objects" },
  { slug: "flat-design", name: "Flat Design", era: "2012-2015", tell: "No shadows/gradients, solid color blocks, simplified iconography (post-iOS7)" },
  { slug: "material-design", name: "Material Design", era: "2014-ongoing", tell: "Layered paper metaphor, subtle elevation shadows, bold accent color, 8px grid rhythm" },
  { slug: "neumorphism", name: "Neumorphism / Soft UI", era: "2019-2021", tell: "Monochrome soft-extruded shapes, dual soft shadows, low-contrast surfaces" },
  { slug: "glassmorphism", name: "Glassmorphism", era: "2020-ongoing", tell: "Frosted-glass blur panels, translucent layering, thin light borders" },
  { slug: "corporate-memphis", name: "Corporate Memphis", era: "2018-2022", tell: "Flat disproportionate figures, limited palette, rounded friendly illustration style" },
  { slug: "neo-brutalist-web", name: "Neo-Brutalist Web Design", era: "2020s", tell: "Raw unstyled HTML look, thick black borders, harsh drop shadows, default system fonts" },
  { slug: "glassy-liquid-metal", name: "Chrome / Liquid Metal", era: "2023-ongoing", tell: "Hyper-reflective chrome render, iridescent gradients, 3D blob forms" },
  { slug: "gradient-mesh", name: "Trippy Gradient Mesh", era: "2020s", tell: "Soft multi-color mesh gradients, blurred organic color fields, dreamy blend" },
  { slug: "big-serif-editorial-web", name: "Big Serif Editorial Web", era: "2020s", tell: "Oversized display serif headlines, generous whitespace, magazine-style web layout" },

  // Retro-futurism & tech-adjacent aesthetics
  { slug: "vaporwave", name: "Vaporwave", era: "2010s", tell: "Pink/cyan gradients, Greco-Roman statuary, glitch, Windows-95-era UI chrome" },
  { slug: "y2k-frutiger-aero", name: "Y2K / Frutiger Aero", era: "1998-2008", tell: "Glossy bubble UI, blue skies + water droplets, aqua glass buttons, chrome bevels" },
  { slug: "seapunk", name: "Seapunk", era: "2011-2013", tell: "Aqua/teal palette, dolphins/pyramids/Roman busts, glitch texture, low-res render" },
  { slug: "cyberpunk-tech-noir", name: "Cyberpunk / Tech-Noir", era: "recurring since 1982", tell: "Neon magenta/cyan on black, kanji/glitch overlays, dense HUD-style information" },
  { slug: "retrofuturism", name: "Retrofuturism", era: "recurring", tell: "1950s-60s vision of 'the future' — atomic-age optimism, chrome rockets, bold sans" },
  { slug: "acid-graphics", name: "Acid Graphics / Rave Flyer", era: "1990s", tell: "3D-rendered chrome text, saturated neon, warped psychedelic patterns" },
  { slug: "indie-sleaze", name: "Indie Sleaze", era: "2006-2012 revival", tell: "Flash-photography grain, DIY collage, distressed lo-fi party aesthetic" },

  // Minimalism, craft & material honesty
  { slug: "swiss-minimalism-contemporary", name: "Contemporary Swiss Grid Revival", era: "2010s-ongoing", tell: "Modern take on Swiss grid: restrained type, lots of whitespace, one accent color" },
  { slug: "scandinavian-minimalism", name: "Scandinavian Minimalism", era: "recurring", tell: "Muted natural palette, generous negative space, humble sans-serif type" },
  { slug: "japanese-minimalism", name: "Japanese Minimalism (Muji-adjacent)", era: "recurring", tell: "Restraint, natural materials/tones, quiet typographic hierarchy, no ornament" },
  { slug: "wabi-sabi-textured", name: "Wabi-Sabi / Organic Texture", era: "recurring", tell: "Imperfect handmade textures, muted earthy palette, asymmetric organic layout" },
  { slug: "minimal-utility", name: "Minimal Utility", era: "contemporary", tell: "Purely functional layout, monospace or system type, no decoration at all" },
  { slug: "maximalist-collage", name: "Maximalist Collage", era: "contemporary", tell: "Dense layered imagery, clashing type scales, deliberately overwhelming composition" },
  { slug: "risograph-print", name: "Risograph / Zine Print", era: "recurring since 1980s", tell: "Limited spot-color layers, visible misregistration, grainy halftone texture" },

  // Contemporary internet-native aesthetics (documented cultural labels)
  { slug: "cottagecore", name: "Cottagecore", era: "2018-ongoing", tell: "Soft florals, handwritten/serif type, pastoral imagery, warm nostalgic palette" },
  { slug: "dark-academia", name: "Dark Academia", era: "2019-ongoing", tell: "Muted brown/burgundy palette, classic serif type, vintage-book/library imagery" },
  { slug: "barbiecore", name: "Barbiecore", era: "2022-ongoing", tell: "Saturated hot pink dominant, hyper-feminine, glossy plastic-toy sheen" },
  { slug: "blokecore", name: "Blokecore", era: "2022-ongoing", tell: "90s football-shirt graphics, retro sportswear branding, terrace-culture type" },
  { slug: "cluttercore", name: "Cluttercore / Maximalist Interiors", era: "2021-ongoing", tell: "Dense pattern-on-pattern layering, eclectic mixed motifs, no visual rest" },
  { slug: "coastal-grandmother", name: "Coastal Grandmother", era: "2022-ongoing", tell: "Linen neutrals, soft blue/white palette, relaxed serif type, breezy imagery" },

  // Broad structural/compositional categories (not tied to one era)
  { slug: "editorial-grid", name: "Editorial / Magazine Grid", era: "recurring", tell: "Multi-column grid, pull quotes, mixed image/text hierarchy, folio-style detail" },
  { slug: "brutalism", name: "Brutalism", era: "recurring since 1950s (arch.), 2015-ongoing (web)", tell: "Raw, deliberately unpolished; harsh contrast; system fonts; anti-decorative" },
  { slug: "neo-grotesque", name: "Neo-Grotesque", era: "1950s-ongoing", tell: "Helvetica/Akzidenz-Grotesk-family type, neutral tone, minimal stylistic flourish" },
  { slug: "corporate-minimalism", name: "Corporate Minimalism (SaaS)", era: "2015-ongoing", tell: "Blue/purple gradient accents, rounded sans type, generic friendly illustration" },
  { slug: "handmade-zine-revival", name: "Handmade Zine Revival", era: "contemporary", tell: "Photocopied texture, hand-cut collage, intentionally imperfect assembly" },
] as const;

export const TAXONOMY_NAMES = STYLE_TAXONOMY.map((s) => s.name);

const BY_NAME = new Map(STYLE_TAXONOMY.map((s) => [s.name, s] as const));
const BY_LOWER_NAME = new Map(STYLE_TAXONOMY.map((s) => [s.name.toLowerCase(), s] as const));

/**
 * The model is instructed to copy a taxonomy name verbatim, but a vision
 * model given a list formatted as "Name (era): tell" sometimes folds the
 * era into its answer (e.g. returns "Flat Design (2012-2015)" instead of
 * "Flat Design") — verified live. Exact match first (so entries that
 * genuinely have a parenthetical in their real name, like "Corporate
 * Minimalism (SaaS)", aren't broken by stripping); only falls back to
 * trimming a trailing parenthetical, then a case-insensitive match, before
 * giving up.
 */
export function findTaxonomyEntry(rawName: string): StyleTaxonomyEntry | undefined {
  const exact = BY_NAME.get(rawName);
  if (exact) return exact;

  const withoutParenthetical = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const stripped = BY_NAME.get(withoutParenthetical);
  if (stripped) return stripped;

  return BY_LOWER_NAME.get(rawName.toLowerCase()) ?? BY_LOWER_NAME.get(withoutParenthetical.toLowerCase());
}
