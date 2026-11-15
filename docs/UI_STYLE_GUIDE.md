# Mikazuki Fields — UI Style Guide

**Owner:** Person 3 (Frontend + UI/UX) · **Status:** draft for team review · **Tokens:** [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css)

Mikazuki Fields should feel like a field notebook, not a tech dashboard: warm, plain, readable in sunlight on a cheap Android phone. Every screen answers one question for a farmer — *"What should I plant for the next 3 years, and why?"* — and shows NASA data only where it helps answer it.

---

## 1. Principles

1. **Readable outdoors first.** Light theme, high contrast, 16 px minimum body text, 44 px minimum touch targets. Dark, glossy "Awwwards" looks wash out in sunlight.
2. **Color carries meaning, never alone.** Every color-coded thing (plan, crop family, badge) also has a word or icon.
3. **One hero per screen.** Plan B (the recommended route) is the only thing in the accent green. Everything else stays quiet.
4. **Motion only for cause and effect.** The El Niño flip is the one big animated moment. No WebGL, no scroll-jacking, no long intros.
5. **Farmer words first, science second.** Show "Soil Thirst Level"; put `GWETROOT` in the tooltip.

---

## 2. Color

Light theme only for the MVP. All text pairs pass WCAG AA (4.5:1); all meaningful graphics pass 3:1 against white. Ratios below were computed, not eyeballed.

### Base

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--background` (Rice paper) | `#FAF6EE` | Page background | — |
| `--card` | `#FFFFFF` | Cards, plan columns, popovers | — |
| `--foreground` (Soil) | `#1F2A1E` | Body text, headings | 13.8:1 on background |
| `--muted-foreground` | `#5B6152` | Secondary text, captions | 5.9:1 on background |
| `--border` | `#E3DCCB` | Card and divider lines (decorative) | — |
| `--input` | `#8F8877` | Input and toggle outlines | 3.5:1 on white |
| `--primary` (Leaf) | `#2F6B3A` | Plan B, main buttons, focus ring, links | white text on it 6.4:1 |
| `--destructive` | `#9B2C1F` | Critical warnings | — |

### Plans (charts and column accents)

| Plan | Token | Hex | Line style | Contrast vs white |
|---|---|---|---|---|
| A · Status Quo | `--plan-a` | `#8A7F6E` | **Dashed** (it is the baseline) | 3.9:1 |
| B · Balanced | `--plan-b` | `#2F6B3A` | Solid, 3 px | 6.4:1 |
| C · Drought-Safe | `--plan-c` | `#2C6E9B` | Solid, 2 px | 5.5:1 |

Plan A and B are close in lightness (1.6:1), so Plan A is always dashed and every line is labelled at its end. Never rely on color alone to tell plans apart.

### Climate stress (El Niño)

| Token | Hex | Use |
|---|---|---|
| `--sun` | `#C8701E` | El Niño toggle fill, heat icons (3.4:1 on background) |
| `--sun-strong` | `#A4520F` | Any orange **text** (5.1:1 on background) |
| `--sun-tint` | `#FCEBD7` | Banner and KPI background while El Niño is on (body text 12.8:1 on it) |
| `--moon` | `#E3B341` | Crescent logo mark only — decorative, never for text |

### Crop families

The family color is the backbone of the rotation story: a monoculture reads as one flat color block, a good rotation as alternating colors, and every color change between neighbouring seasons earns a **Pest Cycle Broken** badge.

| Family | Crops | Token | Hex | vs white |
|---|---|---|---|---|
| Poaceae (grasses) | Corn, paddy rice, upland rice, sorghum | `--family-poaceae` | `#A87C0E` | 3.8:1 |
| Fabaceae (legumes) | Mungbean, peanut, cowpea | `--family-fabaceae` | `#3F8A45` | 4.3:1 |
| Convolvulaceae | Sweet potato | `--family-convolvulaceae` | `#8E5BA8` | 5.0:1 |
| Fallow (bare) | — | `--family-fallow` | `#9A8466` + diagonal hatch | 3.6:1 |

Use family colors as a 4 px left border or a thin strip, not as large fills, so they don't fight the Plan B accent.

### Badges and warnings

| Badge | Background | Text | Contrast | Icon (lucide) |
|---|---|---|---|---|
| Pest Cycle Broken | `#E3F1E1` | `#23592E` | 7.1:1 | `bug-off` |
| Bare-Soil Erosion Month | `#FBEBC8` | `#7A4B00` | 6.3:1 | `cloud-rain` |
| Critical (water/slope mismatch) | `#FBE3DF` | `#9B2C1F` | 6.2:1 | `triangle-alert` |

---

## 3. Typography

| Role | Font | Weights | Why |
|---|---|---|---|
| Display (headings, plan names, big numbers) | **Barlow Condensed** | 600, 700 | Condensed and bold: fits plan names and numbers in narrow columns |
| Body (everything else) | **Atkinson Hyperlegible** | 400, 700 | Designed for low-vision readability; clear 1/l/I and 0/O for numbers |

Self-host both through Fontsource (`@fontsource/barlow-condensed`, `@fontsource/atkinson-hyperlegible`) so the offline demo never falls back to system fonts.

| Step | Size / line height | Font | Use |
|---|---|---|---|
| Display XL | 40 / 44 | Display 700 | App title, El Niño headline delta |
| H1 | 32 / 36 | Display 700 | Section titles |
| H2 | 24 / 28 | Display 600 | Plan names ("Plan B · Balanced") |
| Metric | 28 / 32 | Display 700, tabular numbers | Banner values, KPI numbers |
| Body | 16 / 24 | Body 400 | Default text (never smaller on phones) |
| Small | 14 / 20 | Body 400 | Captions, source tags, tooltip technical names |
| Micro | 12 / 16 | Body 700, uppercase, +4% tracking | Season labels ("S1 · WET"), badge text on desktop only |

Always use tabular numbers (`tabular-nums`) for pesos, millimetres and percentages so columns line up as values change.

---

## 4. Space, shape and touch

- **Grid:** 4 px base; use 8, 12, 16, 24, 32, 48.
- **Radius:** 12 px cards (`--radius`), 8 px inputs and buttons, full pill for badges and chips.
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

### Language picker (first run)
A single centered card before the map: **English · Filipino · Cebuano · Ilocano**. Remember the choice in `localStorage`. Untranslated strings fall back to English.

### Map pin picker
Leaflet with OpenStreetMap tiles (keep the attribution visible). Preset farms are leaf-green pins with names; a custom tap drops an orange pin labelled "Your farm (nearest data: Bukidnon preset)" when slope and NDVI are borrowed.

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
Top to bottom: plan letter + name (H2), one-line promise ("Keeps profit, rebuilds soil"), 6 season cells, KPI strip, "Why this plan" (max 3 bullets), "Choose this plan" button. Plan B adds a **Recommended** ribbon and a 2 px leaf border; A and C get a 1 px border.

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
A large switch above the plans: **"Simulate El Niño / Dry Spell (−25% rain, +1.5 °C)"**. Off: neutral. On: switch fills `--sun`, banner and KPI strips take `--sun-tint`, deltas appear. It is the demo's hero moment, so it gets the only staggered animation (see Motion).

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
- CSS transitions or Framer Motion only. No WebGL, canvas backgrounds, parallax or intro animations.
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
| [Climate TRACE](https://www.awwwards.com/sites/climate-trace) | One big number per metric in the NASA banner |
| [Harvesting for Seed](https://www.awwwards.com/sites/harvesting-for-seed) | Vertical rail for the 6 seasons on phones; condensed bold headings |
| [Agrumea Farm](https://www.awwwards.com/sites/agrumea-farm) | Warm cream, leaf and harvest-gold palette |
| [fromearth / 2050](https://www.awwwards.com/sites/fromearth-2050) | Language picker card on first run |
| [Covid-19 Data Dashboard](https://www.awwwards.com/sites/covid-19-data-dashboard) | Small, identical charts per plan for instant comparison |
| [Where Opportunity Takes Root](https://www.awwwards.com/sites/where-opportunity-takes-root) | Step-by-step reveal for the El Niño flip |
| [Butter Weather](https://www.awwwards.com/sites/butter-weather) | Small, friendly micro-animation on the weather toggle |

**What we deliberately did not take:** dark themes, WebGL hero scenes and long intro animations. In testing, two winning sites rendered blank or took about 20 seconds before anything usable appeared, which would fail on a budget phone in a rural area.

---

## 12. Using the tokens

1. Scaffold the frontend (React + Vite + Tailwind v4) and run `npx shadcn@latest init`.
2. In `src/index.css`, keep `@import "tailwindcss";` (and shadcn's other imports and its `@theme inline` block), add `@import "./styles/tokens.css";` right after them, and delete the `:root { … }` color block shadcn generated.
3. Use shadcn's names for base colors (`bg-background`, `text-muted-foreground`, `bg-primary`) and ours for project colors (`border-family-fabaceae`, `stroke-plan-c`, `bg-sun-tint`, `font-display`).
