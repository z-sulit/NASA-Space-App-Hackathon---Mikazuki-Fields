# Mikazuki Fields — UI Style Guide

**Owner:** Person 3 (Frontend + UI/UX) · **Status:** draft for team review · **Theme:** Field Olive × Mikazuki · **Tokens:** [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css)

Mikazuki Fields should feel like a premium farm brand, not a tech dashboard: an editorial olive-and-beige look in the spirit of the CropTab site (Awwwards Site of the Day, Feb 2026), with a quiet Mikazuki layer of crescent emblem, cockpit corner brackets and a Mars-rust warning color. Under the look, every screen still answers one farmer question — *"What should I plant for the next 3 years, and why?"* — and stays readable in sunlight on a cheap Android phone.

---

## 1. Principles

1. **Readable outdoors first.** The planner is light (beige cards, deep olive text), 16 px minimum body text, 44 px minimum touch targets. Only the landing hero uses the dark olive backdrop.
2. **Color carries meaning, never alone.** Every color-coded thing (plan, crop family, badge) also has a word or icon.
3. **One hero per screen.** Plan B (the recommended route) is the only thing outlined in field olive with a chartreuse **Recommended** tag. Everything else stays quiet.
4. **Motion with a job.** The landing gets the show: a short boot sequence, masked text reveals and scroll parallax. In the planner, motion only marks cause and effect, and the El Niño flip is the one big moment. No WebGL, no scroll-jacking, and the intro is under 2.5 s and skippable.
5. **Farmer words first, science second.** Show "Soil Thirst Level"; put `GWETROOT` in the tooltip.
6. **Theme, not franchise.** The Mikazuki layer uses original artwork only: no franchise logos, characters, mech art or names in the UI (the team name in the footer is the one exception).

---

## 2. Color

Light planner, dark olive hero. All text pairs pass WCAG AA (4.5:1); all meaningful graphics pass 3:1 against the card color. Ratios below were computed, not eyeballed.

### Base

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--background` (Beige) | `#F4EDE6` | Page background | — |
| `--card` | `#FCF9F5` | Cards, plan columns, popovers | — |
| `--foreground` (Deep olive) | `#26300F` | Body text, headings | 12.0:1 on background |
| `--muted-foreground` | `#5A5E45` | Secondary text, captions | 5.8:1 on background |
| `--olive` | `#636F3D` | Micro labels, section numbers ("01 / Input") | 4.7:1 on background |
| `--border` | `#E2D9CC` | Card and divider lines (decorative) | — |
| `--input` | `#8C8573` | Input and toggle outlines | 3.5:1 on card |
| `--primary` (Field olive) | `#404F1D` | Plan B, main buttons, focus ring, links | beige text on it 7.7:1 |
| `--chartreuse` | `#D4DE72` | Highlight fills: Recommended tag, hero call-to-action | olive text on it 9.6:1 |
| `--destructive` | `#9B2C1F` | Critical warnings | — |

### Hero backdrop

Radial gradient from `--hero-glow` `#7C914C` (center) through `--hero-mid` `#556332` to `--hero-dark` `#2F3A14` (edges). Beige text on it: 10.4:1 at the edges, 5.6:1 mid-way, 3.0:1 at the glow, so keep body-size text near the edges and only large display type near the center.

### Plans (charts and column accents)

| Plan | Token | Hex | Line style | Contrast vs card |
|---|---|---|---|---|
| A · Status Quo | `--plan-a` | `#8A8270` | **Dashed** (it is the baseline) | 3.6:1 |
| B · Balanced | `--plan-b` | `#404F1D` | Solid, 3 px | 8.5:1 |
| C · Drought-Safe | `--plan-c` | `#2C6E9B` | Solid, 2 px | 5.3:1 |

Plan A is always dashed and every line is labelled at its end. Never rely on color alone to tell plans apart.

### Climate stress (El Niño = Mars rust)

The token names keep "sun" so components didn't change; the color is now a Mars-rust red, the Mikazuki nod.

| Token | Hex | Use |
|---|---|---|
| `--sun` | `#A9452C` | El Niño toggle fill, heat icons, hazard stripe (5.1:1 on background) |
| `--sun-strong` | `#8F3A24` | Any rust **text** (6.5:1 on background) |
| `--sun-tint` | `#F5DED2` | Banner and KPI background while El Niño is on (body text 10.8:1 on it) |
| `--moon` | `#E3B341` | Crescent emblem only — decorative, never for text |

### Crop families

The family color is the backbone of the rotation story: a monoculture reads as one flat color block, a good rotation as alternating colors, and every color change between neighbouring seasons earns a **Pest Cycle Broken** badge.

| Family | Crops | Token | Hex | vs card |
|---|---|---|---|---|
| Poaceae (grasses) | Corn, paddy rice, upland rice, sorghum | `--family-poaceae` | `#A87C0E` | 3.6:1 |
| Fabaceae (legumes) | Mungbean, peanut, cowpea | `--family-fabaceae` | `#4D8B3A` | 4.0:1 |
| Convolvulaceae | Sweet potato | `--family-convolvulaceae` | `#8E5BA8` | 4.8:1 |
| Fallow (bare) | — | `--family-fallow` | `#9A8466` + diagonal hatch | 3.6:1 |

Use family colors as a 4 px left border or a thin strip, not as large fills, so they don't fight the Plan B accent.

### Badges and warnings

| Badge | Background | Text | Contrast | Icon (lucide) |
|---|---|---|---|---|
| Pest Cycle Broken | `#E6EDC9` | `#2F4A12` | 8.2:1 | `bug-off` |
| Bare-Soil Erosion Month | `#FBEBC8` | `#7A4B00` | 6.3:1 | `cloud-rain` |
| Critical (water/slope mismatch) | `#FBE3DF` | `#9B2C1F` | 6.2:1 | `triangle-alert` |

---

## 3. Typography

| Role | Font | Weights | Why |
|---|---|---|---|
| Role | Font | Weights | Why |
|---|---|---|---|
| Display (wordmark, headings, plan names, big numbers, micro labels) | **Inter Tight** | 400, 500, 600 | A free neo-grotesk close to CropTab's Aeonik: regular weight, tight tracking (−2%), editorial feel |
| Body (everything else) | **Inter** | 400, 600 | Very legible at small sizes; clear numbers with tabular figures |

Self-host both through Fontsource (`@fontsource/inter-tight`, `@fontsource/inter`) so the offline demo never falls back to system fonts. Headings use weight 400–500, never bold: the CropTab look comes from size and spacing, not weight.

| Step | Size / line height | Font | Use |
|---|---|---|---|
| Wordmark | clamp(52 px, 10vw, 128 px) / 0.9 | Display 400 | Hero only: "Mikazuki Fields" |
| Tagline | clamp(28 px, 4vw, 40 px) / 1.05 | Display 400 | Hero tagline |
| H2 | 28 / 32 | Display 500 | Section titles, under a micro "01 / Input" line |
| H3 | 24 / 28 | Display 500 | Plan names ("Plan B · Balanced") |
| Metric | 28 / 32 | Display 500, tabular numbers | Banner values, KPI numbers |
| Body | 16 / 24 | Body 400 | Default text (never smaller on phones) |
| Small | 14 / 20 | Body 400 | Captions, source tags, tooltip technical names |
| Micro (`.micro`) | 12 / 16 | Display 500, uppercase, +12% tracking | Corner labels, section numbers, season labels, buttons |

Always use tabular numbers (`tabular-nums`) for pesos, millimetres and percentages so columns line up as values change.

---

## 4. Space, shape and touch

- **Grid:** 4 px base; use 8, 12, 16, 24, 32, 48.
- **Radius:** 12 px cards (`--radius`), 8 px inputs and segmented controls, full pill for buttons, badges and chips.
- **HUD brackets (`.hud`):** every section card and plan card gets two 14 px olive corner brackets (top-left, bottom-right), like a cockpit display frame. They are pseudo-elements, so card borders stay intact.
- **Elevation:** borders, not shadows. One soft shadow (`0 1px 2px rgb(31 42 30 / 0.08)`) for popovers only.
- **Touch targets:** 44 × 44 px minimum, 8 px apart. Slider thumbs 24 px.

---

## 5. Layout

The 4 regions from the build plan, at 3 breakpoints (Tailwind defaults):

| Breakpoint | Left sidebar (inputs) | Top banner (NASA) | Main canvas (3 plans) | Bottom (limitations) |
|---|---|---|---|---|
| Phone `< md` (768 px) | Collapsible "Your farm" card at the top; collapses to a one-line summary after "Plan my routes" | Horizontal scroll of metric chips | **Plan tabs A / B / C**, swipeable, B opens first; seasons as a vertical rail S1–S6 | Full-width card at the end |
| Tablet `md`–`lg` | Slide-over drawer from a "Your farm" button | One row of chips | Plan tabs, or 3 columns in landscape | Full width |
| Desktop `≥ lg` (1024 px) | Fixed 320 px column | Full row above the plans | 3 columns side by side + charts underneath | Full width |

Max content width 1280 px, centered.

---

## 6. Components

### Hero (landing, full-bleed)
The CropTab-style opener, built from original parts:
- **Backdrop:** the olive radial gradient (see Hero backdrop) with soft, blurred leaf shadows drifting across it (inline SVG, 9 s sway loop).
- **Top bar:** small crescent + "MIKAZUKI FIELDS" micro wordmark on the left; Demo planner badge and Language button as beige outline pills on the right.
- **Wordmark:** "Mikazuki Fields™" in Display 400, top-left; a 3-line micro spec ("A 3-route crop planner / built on 10 years / of NASA data") top-right.
- **Centerpiece:** the emblem tile (176 px, slow 6 s float, deep drop shadow) inside a thin cockpit targeting frame with micro callouts "UNIT 01 · MIKAZUKI" and the selected farm's coordinates.
- **Bottom row:** tagline "For your fields. / For the next 6 seasons.", the line "Named for a crescent moon, and for a pilot who only ever wanted to farm.", and a chartreuse pill CTA "PLAN MY 3 ROUTES ↓" that jumps to the planner; data sources and "Team Tekkadan · Space Apps 2026" bottom-right.

### Emblem
Original mark, from the team's sketch: a gold crescent that closes into a full ring (two circles, the inner one shifted to the upper right, so the ring is thick at the lower left and 4.5 units wide at its thinnest) with a small rust five-petal "iron flower" centered in the opening (`src/components/Emblem.tsx`). The closed ring and centered flower keep it from reading as a crescent-and-star. Used in the hero on a dark olive tile, bare in the top bar (30 px) and boot screen, and as the browser-tab icon. With `animated`, the ring strokes draw, the crescent fills, then the petals bloom one by one. Do not replace it with any franchise emblem or mech artwork.

### 3D pieces (CSS transforms only)
All three are built with CSS 3D transforms (`src/styles/three-d.css`), with no WebGL and no 3D library, so they run on budget phones and add nothing to the bundle.

| Piece | What it is | How you play with it | File |
|---|---|---|---|
| **Hero tile** | A slab 18 px thick (17 stacked slices between two faces): emblem on the front, a spec plate on the back, a highlight that slides across as it turns, a soft ground shadow. | Drag to spin (with a flick it keeps turning), tap or press Enter to flip. Left alone it sways, leans toward the mouse and springs back to a face. | `Tile3D.tsx` |
| **Crop tiles ("00 / Hangar")** | The 8 crops as small slabs edged in their family color. Front: unit code (MF-01…), family icon, name, and A/B/C dots for the routes that use it. Back: days to grow, water need, soil-nitrogen effect, heat limit, goal. | Tilts toward the pointer and lifts on hover; tap or Enter flips it. | `CropHangar.tsx` |
| **Soil terrain ("04")** | An isometric field: 3 routes × 6 seasons of blocks. Height = soil nitrogen after that season, color = crop family. Plan A sits in the front row so its sinking steps are never hidden. | Blocks rise from the ground on first view; drag sideways to turn the field; hover or tap a block for its numbers. | `Field3D.tsx` |

Rules: 3D never carries information alone (the terrain repeats what the line chart shows, and has a text summary for screen readers); every 3D control works by tap and keyboard, not only by drag or hover.

### Section title
Every section opens with a micro line in `--olive` ("00 / Hangar", "01 / Input", "02 / Satellite data", "03 / Routes", "04 / Soil terrain", "05 / Compare", "06 / Limits") and an H2 in Display 500. The numbering doubles as the cockpit-panel labelling of the Mikazuki layer.

### Language picker (first run)
A single centered card before the map: **English · Filipino · Cebuano · Ilocano**. Remember the choice in `localStorage`. Untranslated strings fall back to English.

### Map pin picker
Leaflet with OpenStreetMap tiles (keep the attribution visible). Preset farms are field-olive pins with names; a custom tap drops a rust pin labelled "Your farm", and the note under the map says how far it is from the preset whose slope and NDVI are borrowed.

### NASA metric chip (top banner)
```
┌──────────────────────────┐
│ SOIL THIRST LEVEL    ⓘ   │  ← Micro label, farmer term
│ Thirsty                  │  ← Metric font, word band first
│ 0.52 · Dec–May           │  ← Small, muted: number + season
└──────────────────────────┘
```
The ⓘ opens a tooltip on **tap and keyboard focus**, not hover only: plain-English sentence first, then the technical name in small mono (`GWETROOT · NASA POWER`).

### Plan card (main canvas)
Top to bottom: plan letter + name (H2), one-line promise ("Keeps profit, rebuilds soil"), 6 season cells, KPI strip, "Why this plan" (max 3 bullets), "Choose this plan" button. Plan B adds a chartreuse **Recommended** tag and a 2 px field-olive border; A and C get a 1 px border. All three carry the HUD corner brackets.

### Season cell
```
▌ S2 · DRY · Dec–May          ▲ (warning icon if any)
▌ [sprout icon] Mungbean
▌ ●●○○○○  bare months
```
The left bar (`▌`) is the family color. Between two cells of different families, show a small **Pest Cycle Broken** badge on the divider.

### KPI strip
Four values, icon + number + unit: Profit (₱, 3-year total), Soil N (end value + trend arrow), Water (mm used or saved), Erosion risk (Low / Medium / High). When El Niño is on, each shows its change in `--sun-strong` (for example "−X%", always computed by the engine, never typed).

### Badges
Pill, icon + words, never color-only. On phones, badges show the icon with the words in the accessible name and on tap.

### El Niño toggle
A large switch above the plans: **"Simulate El Niño / Dry Spell (−25% rain, +1.5 °C)"**. Off: neutral. On: switch fills Mars rust (`--sun`), banner and KPI strips take `--sun-tint`, a rust-and-beige hazard stripe (`.hazard`) runs down the left edge of the routes panel, and deltas appear. It is the demo's hero moment, so it gets the only staggered animation in the planner (see Motion).

### Priority sliders
Three sliders (Water Efficiency, Soil Restoration, Economic Yield) with the live share beside each: "Water 40% · Soil 35% · Profit 25%". Show the share, not the raw slider value.

### Ground-truth drawer
Collapsed by default ("I know something the satellite doesn't"). When used, a **Ground truth applied** chip appears in the banner listing what was replaced.

### Limitations box
Muted background (`--muted`), `info` icon, plain sentences, links to DA soil testing. Never collapsed: judges look for it.

---

## 7. Motion

- Durations: 150 ms for hovers and presses, 220 ms for panels and tabs; easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- **El Niño flip:** season cells update one after another, 60 ms apart, S1 → S6, so Plan A visibly "breaks" season by season while Plan C holds. Total under 600 ms.
- KPI numbers count to their new value over 400 ms.
- Hero ambience: leaf shadows sway over 9 s and the emblem floats 8 px over 6 s, both slow, looping CSS keyframes.
- CSS and a few lines of JS only (no animation library, no WebGL or canvas). Everything is transform or opacity, so it stays smooth on budget phones.

### Motion sequence (CropTab-style reveals, cockpit details)

CropTab has an animated preloader, scroll-driven product animation and text that reveals as you scroll (per its Awwwards showcase). We mirror the structure with our own parts:

| Moment | What happens | Class / file |
|---|---|---|
| **Boot (≈1.7 s)** | A start-up check on the olive backdrop: the emblem draws itself, 6 status lines report in (NASA POWER, SRTM, MODIS, presets, "Pilot: farmer"), a counter runs 000–100%, then the screen lifts like a curtain. Tap or any key skips it. A source that is still a placeholder reports **Sample**, not OK. | `Boot.tsx`, `.boot`, `.boot-line`, `.boot-bar` |
| **Hero reveal** | As the curtain lifts: wordmark and tagline lines slide up from behind a mask, 110 ms apart; the emblem tile scales in; the targeting frame snaps on (lock-on); the two callouts decode from random glyphs (and re-decode when the farm changes). | `.line-mask` / `.line-rise`, `.pop-in`, `.lock-on`, `useScramble` |
| **Hero idle** | Dashed targeting ring turns once every 50 s; with a mouse, the emblem tilts toward the pointer and the frame drifts the other way. | `.spin-slow`, `--px` / `--py` |
| **Scroll out of hero** | Parallax: wordmark sinks, emblem shrinks slightly, leaf shadows rise, bottom row fades. | `--sy` |
| **Scroll into planner** | Each card fades and lifts in the first time it enters view (plan cards 110 ms apart); its HUD corner brackets then snap on. | `Reveal`, `.reveal` |
| **Buttons** | Pill buttons: a second color wipes up from below on hover or focus; the arrow nudges down. | `.btn-sweep` |
| **Planning** | A scan line sweeps over the plan cards while the planner runs. | `.scan-v` |
| **El Niño on** | Hazard stripe starts moving, one scan sweep crosses the routes panel, "CAUTION · DRY SPELL SIMULATION" blinks three times, season cells update one after another. | `.hazard-move`, `.scan-sweep`, `.blink-3` |

Rules: the boot never exceeds 2.5 s and is always skippable; nothing loops in the planner except the hazard stripe while El Niño is on; with reduced motion the boot is skipped and every reveal is instant.
- Respect `prefers-reduced-motion`: swap animations for instant changes (handled globally in `tokens.css`).

---

## 8. Accessibility checklist

- [ ] Body text ≥ 16 px; contrast ≥ 4.5:1 (all token pairs above pass).
- [ ] Every chart line labelled at its end; Plan A dashed.
- [ ] Badges and warnings have icon + text; nothing is color-only.
- [ ] Tooltips open on tap and focus, close on Escape.
- [ ] Visible focus ring: 2 px `--ring`, 2 px offset, on every interactive element.
- [ ] El Niño result announced in an `aria-live="polite"` region ("Status Quo profit falls X%; Drought-Safe falls Y%"), filled from the engine's numbers.
- [ ] Touch targets ≥ 44 px.
- [ ] Works at 360 px wide with no horizontal scroll.

---

## 9. Voice and copy

- Talk to the farmer: "Your field sits bare in August", not "Bare-soil period detected".
- Short sentences, one idea each. Numbers always with units (mm, °C, ₱, %).
- Lead with the action, then the reason: "Plant mungbean in the dry season — it needs half the water and feeds your soil."
- Never promise yields; say "expected" and point to the limitations box.

---

## 10. Icons

[lucide-react](https://lucide.dev) (ships with shadcn/ui), 20 px, 1.75 stroke.

| Meaning | Icon |
|---|---|
| Rain, Bare-Soil Erosion Month | `cloud-rain` |
| Soil thirst / water | `droplets` |
| Heat / El Niño | `sun`, `thermometer` |
| Slope | `mountain` |
| Grasses (corn, rice, sorghum) | `wheat` |
| Legumes, sweet potato, growth | `sprout` |
| Pest Cycle Broken | `bug-off` |
| Warning | `triangle-alert` |
| Info / limitations | `info` |
| Logo mark | `moon` (crescent) |

---

## 11. Inspiration (Awwwards)

| Site | What we took |
|---|---|
| [Farm Minerals · CropTab](https://www.awwwards.com/sites/farm-minerals) (main reference) | Olive-and-beige palette with a chartreuse accent, full-bleed olive hero with leaf shadows, large regular-weight grotesk wordmark, tiny uppercase corner labels, a centered "product" object (our emblem tile). Their photos, 3D product, copy and Aeonik font are not used. |
| [Maserati Trident Stars](https://www.awwwards.com/sites/maserati-trident-stars) (3D collection) | Real data you can turn and explore in 3D: our rotatable soil terrain |
| [Anduril Industries](https://www.awwwards.com/sites/anduril-industries-1) (3D collection) | Hardware presented as clean 3D objects with spec callouts: the hero tile's spec plate and the crop "units" |
| [Konk Electrical](https://www.awwwards.com/sites/konk-electrical) (3D collection) | 3D done with CSS and JavaScript rather than WebGL |
| [Climate TRACE](https://www.awwwards.com/sites/climate-trace) | One big number per metric in the NASA banner |
| [Harvesting for Seed](https://www.awwwards.com/sites/harvesting-for-seed) | Vertical rail for the 6 seasons on phones |
| [Agrumea Farm](https://www.awwwards.com/sites/agrumea-farm) | Warm, food-and-soil palette instead of tech blue |
| [fromearth / 2050](https://www.awwwards.com/sites/fromearth-2050) | Language picker card on first run |
| [Covid-19 Data Dashboard](https://www.awwwards.com/sites/covid-19-data-dashboard) | Small, identical charts per plan for instant comparison |
| [Where Opportunity Takes Root](https://www.awwwards.com/sites/where-opportunity-takes-root) | Step-by-step reveal for the El Niño flip |
| [Butter Weather](https://www.awwwards.com/sites/butter-weather) | Small, friendly micro-animation on the weather toggle |

**What we deliberately did not take:** WebGL hero scenes, a dark planner and long intro animations. In testing, the CropTab page itself rendered blank in a basic browser (its 3D needs WebGL) and another winner took about 20 seconds before anything usable appeared; both would fail on a budget phone in a rural area. Our hero gets the same look from CSS gradients and inline SVG.

---

## 12. Using the tokens

1. Scaffold the frontend (React + Vite + Tailwind v4) and run `npx shadcn@latest init`.
2. In `src/index.css`, keep `@import "tailwindcss";` (and shadcn's other imports and its `@theme inline` block), add `@import "./styles/tokens.css";` right after them, and delete the `:root { … }` color block shadcn generated.
3. Use shadcn's names for base colors (`bg-background`, `text-muted-foreground`, `bg-primary`) and ours for project colors (`border-family-fabaceae`, `stroke-plan-c`, `bg-sun-tint`, `bg-chartreuse`, `text-olive`, `font-display`).
4. Theme helpers live in `src/index.css`: `.micro` (corner labels), `.hud` (cockpit corner brackets), `.hazard` (El Niño stripe), `.hero-bg`, `.leaf-sway`, `.float`.
