# multiview playground: design system

Status: final. The page is built from this
file, `playground/web/css/tokens.css` and the experience spec. Where this file
gives a value, use that value. Where this file says "must", there is no choice.
Do not add a colour, a size or a duration that is not in `tokens.css`.

Contents:

1. Identity and principles
2. Colour
3. Typography
4. Spacing, layout and shape
5. Hierarchy rules
6. Components
7. Data visualisation
8. Iconography
9. Motion and accessibility
10. Theming contract
11. Implementation checklist
12. Mood board: handmade layer

## 1. Identity and principles

**The identity in one paragraph.** The page looks like a well typeset
technical article that you can edit, written in a cosy school notebook.
Cream paper (`#f7f0e1`, hue about 42°) with a faint graph-paper grid carries
the text, and the ink is a warm dark brown-green (`#2a2b1f`), not black. One
accent hue, a periwinkle indigo (`#4b53b8`, hue about 236°), marks the things
that belong to the container: the Run button, the fields in the code and the
insight callout. Everything else is ink on paper. A thin handmade layer lives
at the edges only (section 12): a hand-lettered display face for step titles,
wobbly corners, squiggles and four small mascots. The code editor, the run
log and the chart stay clean. There are no gradients, no glass, no colour
fills behind whole regions.

Why these choices:

- **Cream paper and brown-green ink.** A cool blue-grey page with a blue
  accent reads as a dashboard. Cream paper with olive ink reads as a
  notebook (mood board images 1 to 3) and makes the periwinkle look
  deliberate. The paper is light enough that every text pair keeps AA or
  better (section 2.7), so code and charts stay legible.
- **Periwinkle indigo as the single accent.** It is the marker colour of
  mood board image 4, dark enough for AA with white text (6.50:1) and on the
  page (5.73:1). It is far from the earthy semantic sage, leaf, mustard and
  terracotta, so a reader never confuses "brand" with "status", and it is
  not one of the three series colours.
- **Two self-hosted fonts and the system monospace.** Shantell Sans (a
  marker face) for the few display roles, Nunito (a rounded sans) for prose
  and UI, and the reader's own monospace for code. Both fonts come from the
  same origin, 86 KB in total (section 12.6). Hierarchy still comes from
  size and space; weight 600 is the only bold in prose.

### Principles

| # | Principle | Example of applying it |
|---|---|---|
| P1 | **The code is the object.** The editor is the only raised card in the main column, on the lightest paper (`--color-surface`); everything else sits on the page. | The lesson text has no card or border; the `code-editor` has `--shadow-1`, `--color-border` and `--color-surface`. |
| P2 | **One primary action per screen.** Only the `run-button` uses a filled accent background. | "Reset" and "Copy" are ghost buttons with `--color-text-secondary`, even when they sit in the same header strip as Run. |
| P3 | **Colour means something, or it is neutral.** A hue appears only when it names a kind: brand (the container), a semantic status, or a data series. | A `chip` for a field name is neutral; a `chip` for "index built" uses `--color-success`. A decorative coloured border is not allowed. The one exception is the handmade layer (section 12): the six `--decor-*` colours appear only on decoration in the places that 12.2 allows, and never carry meaning. |
| P4 | **Every colour has a second carrier.** Icon, text label, marker shape or dash pattern repeats what the colour says. | A `run-log` timing line has the clock icon and the unit "µs"; a series has a marker shape and a direct label. |
| P5 | **Numbers are honest and aligned.** Measured values use tabular figures, a unit, and say when they are under the clock resolution. | `0.00 µs` is never shown; the log says `< 1 µs (below clock resolution)` and the chart draws an outlined bar. |
| P6 | **Space before lines.** Separate groups with space from the scale first; add a 1 px border only when space cannot do it. | The gap between the goal line and the body is `--space-4`; there is no rule between them. |

## 2. Colour

All values below are in `tokens.css`. Section 2.7 has the contrast table.
The ratios use the WCAG 2.x relative luminance formula and were computed with
a script, not estimated.

### 2.1 Neutral ramp (light theme surfaces and text)

Cream paper and brown-green ink, hue about 42° for the paper steps and about
65° (olive) for the ink steps. Token prefix `--neutral-`.

| Step | Hex | Role in the light theme |
|---|---|---|
| 0 | `#fffcf5` | `--color-surface`, `--color-surface-raised`, `--color-surface-selected`: editor card, popovers (the lightest paper) |
| 25 | `#fdf8ee` | `--color-surface-inset`: code area, run log |
| 50 | `#f7f0e1` | `--color-bg`: the page (cream paper) |
| 100 | `#efe6d2` | `--color-surface-sunken`: segmented track, chip background, grid lines (`--color-grid`) |
| 200 | `#e0d4ba` | `--color-border`: card and divider borders |
| 300 | `#cbbd9e` | `--color-grid-strong`: chart axis line, editor resize grip |
| 400 | `#a89b7d` | reserved (disabled icon on surface) |
| 500 | `#877d63` | `--color-border-strong`, `--color-faint`: input borders, decorative icons (non-text only) |
| 600 | `#5f5a45` | `--color-text-muted`: captions, labels, line numbers |
| 700 | `#47432f` | `--color-text-secondary`: body text in callouts, secondary buttons |
| 800 | `#34322a` | light `--color-tooltip-bg` |
| 900 | `#2a2b1f` | `--color-text`, `--color-crayon`: headings, body, code identifiers, the crayon shadow |
| 950 | `#1b1d15` | reserved |

### 2.2 Night ramp (dark theme surfaces and text)

"Night forest": the cottage room of mood board image 1 at night. A deep warm
green-black, hue about 105°, with cream ink. Token prefix `--night-`.

| Step | Hex | Role in the dark theme |
|---|---|---|
| 950 | `#121611` | `--color-bg` |
| 900 | `#161b15` | `--color-surface-inset`: code area, run log |
| 850 | `#1a2019` | `--color-surface`: editor card |
| 800 | `#222920` | `--color-surface-raised`, `--color-surface-sunken`: popovers, segmented track, chips |
| 750 | `#283026` | `--color-grid` |
| 700 | `#323b30` | `--color-border`, `--color-surface-selected`, `--color-tooltip-bg` |
| 600 | `#435040` | `--color-grid-strong`, `--color-tooltip-border` |
| 500 | `#6f7a67` | `--color-border-strong`, `--color-faint` (non-text only) |
| 400 | `#9aa18e` | comments and punctuation in code |
| 300 | `#aab19c` | `--color-text-muted` |
| 200 | `#d0d3c1` | `--color-text-secondary` |
| 100 | `#eeeadb` | `--color-text` |

In the dark theme the surface order inverts: the editor card (`#1a2019`) is
lighter than the page (`#121611`), and the code area (`#161b15`) sits between
them. Elevation is shown with lightness and borders, not shadows (section 4.6).

### 2.3 Brand ramp

Periwinkle indigo, hue about 236°, from the marker lettering of mood board
image 4. Token prefix `--brand-`.

| Step | Hex | Use |
|---|---|---|
| 50 | `#eceefb` | light `--color-accent-subtle`, `--color-insight-bg` |
| 100 | `#dde0f8` | light selected row, hover tint on ghost buttons in accent context |
| 200 | `#c3c9f2` | light `--color-accent-border`, `--color-insight-border` |
| 300 | `#a3adf0` | dark `--color-accent`, `--color-insight`, `--color-focus` |
| 400 | `#8590e4` | reserved |
| 500 | `#6871d4` | reserved |
| 600 | `#4b53b8` | light `--color-accent`, `--color-insight`, `--color-focus`, `--tk-field` |
| 700 | `#3d4399` | light `--color-accent-hover` |
| 800 | `#2f3478` | light `--color-accent-active` |
| 900 | `#1f2340` | dark `--color-accent-subtle`, `--color-insight-bg` |

Four extra brand tints exist only as role values: dark `--color-accent-hover`
`#bfc6f5`, dark `--color-accent-active` `#cdd3f7`, dark `--tk-field`
`#b0b9f5`, and dark `--color-accent-border` and `--color-crayon` `#3d4688`.
Dark `--color-on-accent` is `#171a38` (dark indigo text on the light
periwinkle button). The brand is no longer a series colour: the series come
from the earthy set (2.6).

### 2.4 Semantic roles

The status colours come from the earthy set of mood board image 2 (the
painted grid): periwinkle, sage, mustard, terracotta and leaf green. Tip and
success are both green, so they differ in hue (tip is a blue-green sage, hue
about 160°; success is a yellow-green leaf, hue about 105°) and always in
icon and title word.

| Role | Light text / icon | Light bg | Light border | Dark text / icon | Dark bg | Dark border | Meaning |
|---|---|---|---|---|---|---|---|
| insight (periwinkle) | `#4b53b8` | `#eceefb` | `#c3c9f2` | `#a3adf0` | `#1f2340` | `#3d4688` | what the measurement means; the key point of a step |
| tip (sage) | `#3e6a5c` | `#e7f0e6` | `#b3cfb8` | `#8fc4ad` | `#15261f` | `#2d4e40` | something to try next |
| warning (mustard) | `#7d5a00` | `#f9eecb` | `#e2c46e` | `#e6bd5c` | `#2b2412` | `#5e4c1f` | the result may mislead (clock resolution, budget hit) |
| error (terracotta) | `#ac3f26` | `#fbe8df` | `#eeb6a2` | `#f39a7e` | `#331c15` | `#6c3524` | the script did not compile or run |
| success (leaf) | `#3b6d2c` | `#eaf1dc` | `#bad19e` | `#9ccf7f` | `#182613` | `#36552a` | a check passed; an index was built |
| highlight (sunflower) | `#f0c13a` (bar, decorative) | `#faecbd` | n/a | `#8f7530` (bar, decorative) | `#352f15` | n/a | the editor line that a step points at; `-bg` marks a cue in prose |

Rules:

- The text colour of a role is for the icon, the title and short labels. The
  body text of a callout is `--color-text-secondary` on the role background,
  so a long paragraph is never coloured text.
- The border of a role is decorative. The icon and the title carry the meaning.
- Insight and accent share one hue on purpose: an insight is a statement about
  what the container did.

### 2.5 Interactive roles

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-accent` | `#4b53b8` | `#a3adf0` | Run button fill, links, selected segment underline, current step |
| `--color-accent-hover` | `#3d4399` | `#bfc6f5` | Run button hover, link hover |
| `--color-accent-active` | `#2f3478` | `#cdd3f7` | Run button pressed |
| `--color-on-accent` | `#ffffff` | `#171a38` | text and icon on the accent fill |
| `--color-accent-subtle` | `#eceefb` | `#1f2340` | selected chip, current step background, autocomplete selection |
| `--color-accent-border` | `#c3c9f2` | `#3d4688` | border of selected chip |
| `--color-focus` | `#4b53b8` | `#a3adf0` | focus ring |

### 2.6 Data series

At most three series. Each series has a colour, a marker shape and a dash
pattern. The marker and the dash are mandatory, so the chart reads in
greyscale and for every colour-vision deficiency. The colours are the three
earth tones of mood board image 2: terracotta, dusty teal and mustard.

| Series | Light | Dark | Marker | Line dash (`stroke-dasharray`) | Bar fill cue | Typical meaning |
|---|---|---|---|---|---|---|
| `--series-1` (terracotta) | `#a8472a` | `#e0805c` | filled circle, r = 4 | solid (`none`) | solid fill | multiview (adaptive) |
| `--series-2` (dusty teal) | `#2f7783` | `#6fb8c4` | filled square, 8 × 8 | `6 4` | solid fill + label | a fixed alternative (scan only) |
| `--series-3` (mustard) | `#a87e00` | `#e3c25e` | filled triangle, 9 wide × 8 high | `2 3` | solid fill + label | a second alternative |

Distance check, CIE76 ΔE in Lab after a Machado 2009 simulation (severity 1.0),
pairs 1–2 / 1–3 / 2–3. Light: normal 75.3 / 41.7 / 78.9; protanopia 41.4 /
32.6 / 68.5; deuteranopia 55.2 / **22.5** / 75.8; tritanopia 88.9 / 30.9 /
61.1. Dark: normal 72.6 / 41.5 / 70.3; protanopia 42.1 / 32.3 / 65.9;
deuteranopia 54.5 / **20.5** / 69.9; tritanopia 90.0 / 34.5 / 59.8. The weak
pair is series 1 against series 3 (terracotta against mustard) for
deuteranopia (ΔE 22.5 light, 20.5 dark): the circle against the triangle and
the direct label carry that difference. Lightness also separates the series
(L* 43 / 46 / 55 light, 63 / 71 / 79 dark). Series 1 and 3 must never be the
only two series on a chart; use 1 and 2 for a two-series chart.

Series 1 is terracotta and the error role is terracotta too. They never meet:
an error is a run-log row or an editor squiggle, and the chart only draws
after a successful run.

Chart roles:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--chart-axis` | `#5f5a45` | `#aab19c` | axis labels and tick labels (text) |
| `--chart-axis-line` | `#cbbd9e` | `#435040` | baseline and axis line |
| `--chart-grid` | `#efe6d2` | `#283026` | vertical grid lines |
| `--chart-annotation` | `#47432f` | `#d0d3c1` | annotation text and its leader line |
| `--chart-hatch-bg` | `#fffcf5` | `#1a2019` | gap between hatch strokes of a below-resolution bar |

### 2.7 Contrast table

Text pairs must reach 4.5:1 (AA). Non-text pairs (borders that identify a
control, icons, focus ring, chart marks) must reach 3:1 (WCAG 1.4.11). Every
pair below passes. `--color-faint` and `--color-border-strong` must never
colour text; they pass only as non-text. All ratios were recomputed for the
mood-board palette with the same script (WCAG 2.x relative luminance).

**Light**

| Foreground | Background | Ratio | Level |
|---|---|---|---|
| `--color-text` #2a2b1f | `--color-bg` #f7f0e1 | 12.64:1 | AAA |
| `--color-text` #2a2b1f | `--color-surface` #fffcf5 | 14.00:1 | AAA |
| `--color-text` #2a2b1f | `--color-surface-inset` #fdf8ee | 13.55:1 | AAA |
| `--color-text-secondary` #47432f | `--color-bg` #f7f0e1 | 8.76:1 | AAA |
| `--color-text-muted` #5f5a45 | `--color-bg` #f7f0e1 | 6.10:1 | AA |
| `--color-text-muted` #5f5a45 | `--color-surface-sunken` #efe6d2 | 5.57:1 | AA |
| `--color-text-muted` #5f5a45 | `--color-surface-inset` #fdf8ee | 6.54:1 | AA |
| `--color-accent` #4b53b8 | `--color-bg` #f7f0e1 | 5.73:1 | AA |
| `--color-accent` #4b53b8 | `--color-surface` #fffcf5 | 6.35:1 | AA |
| `--color-on-accent` #ffffff | `--color-accent` #4b53b8 | 6.50:1 | AA |
| `--color-on-accent` #ffffff | `--color-accent-hover` #3d4399 | 8.53:1 | AAA |
| `--color-on-accent` #ffffff | `--color-accent-active` #2f3478 | 11.15:1 | AAA |
| `--color-accent` #4b53b8 | `--color-accent-subtle` #eceefb | 5.63:1 | AA |
| `--color-insight` #4b53b8 | `--color-insight-bg` #eceefb | 5.63:1 | AA |
| `--color-tip` #3e6a5c | `--color-tip-bg` #e7f0e6 | 5.26:1 | AA |
| `--color-warning` #7d5a00 | `--color-warning-bg` #f9eecb | 5.43:1 | AA |
| `--color-error` #ac3f26 | `--color-error-bg` #fbe8df | 5.07:1 | AA |
| `--color-success` #3b6d2c | `--color-success-bg` #eaf1dc | 5.31:1 | AA |
| `--color-text` #2a2b1f | `--color-warning-bg` #f9eecb | 12.38:1 | AAA |
| `--color-text` #2a2b1f | `--color-highlight-bg` #faecbd | 12.16:1 | AAA |
| `--color-success` #3b6d2c | `--color-surface-inset` #fdf8ee | 5.82:1 | AA |
| `--color-warning` #7d5a00 | `--color-surface-inset` #fdf8ee | 5.95:1 | AA |
| `--color-error` #ac3f26 | `--color-surface-inset` #fdf8ee | 5.68:1 | AA |
| `--color-tooltip-text` #f7f0e1 | `--color-tooltip-bg` #34322a | 11.31:1 | AAA |
| `--color-border-strong` #877d63 | `--color-surface` #fffcf5 | 3.98:1 | pass (non-text) |
| `--color-border-strong` #877d63 | `--color-bg` #f7f0e1 | 3.60:1 | pass (non-text) |
| `--color-faint` #877d63 | `--color-bg` #f7f0e1 | 3.60:1 | pass (non-text) |
| `--color-focus` #4b53b8 | `--color-bg` #f7f0e1 | 5.73:1 | pass (non-text) |
| `--series-1` #a8472a | `--color-surface` #fffcf5 | 5.69:1 | pass (non-text) |
| `--series-2` #2f7783 | `--color-surface` #fffcf5 | 5.01:1 | pass (non-text) |
| `--series-3` #a87e00 | `--color-surface` #fffcf5 | 3.63:1 | pass (non-text) |

**Dark**

| Foreground | Background | Ratio | Level |
|---|---|---|---|
| `--color-text` #eeeadb | `--color-bg` #121611 | 15.17:1 | AAA |
| `--color-text` #eeeadb | `--color-surface` #1a2019 | 13.78:1 | AAA |
| `--color-text-secondary` #d0d3c1 | `--color-surface` #1a2019 | 10.89:1 | AAA |
| `--color-text-muted` #aab19c | `--color-surface` #1a2019 | 7.50:1 | AAA |
| `--color-text-muted` #aab19c | `--color-surface-raised` #222920 | 6.74:1 | AA |
| `--color-accent` #a3adf0 | `--color-bg` #121611 | 8.53:1 | AAA |
| `--color-accent` #a3adf0 | `--color-surface` #1a2019 | 7.74:1 | AAA |
| `--color-on-accent` #171a38 | `--color-accent` #a3adf0 | 7.89:1 | AAA |
| `--color-on-accent` #171a38 | `--color-accent-hover` #bfc6f5 | 10.16:1 | AAA |
| `--color-on-accent` #171a38 | `--color-accent-active` #cdd3f7 | 11.49:1 | AAA |
| `--color-accent` #a3adf0 | `--color-accent-subtle` #1f2340 | 7.13:1 | AAA |
| `--color-insight` #a3adf0 | `--color-insight-bg` #1f2340 | 7.13:1 | AAA |
| `--color-tip` #8fc4ad | `--color-tip-bg` #15261f | 8.03:1 | AAA |
| `--color-warning` #e6bd5c | `--color-warning-bg` #2b2412 | 8.65:1 | AAA |
| `--color-error` #f39a7e | `--color-error-bg` #331c15 | 7.39:1 | AAA |
| `--color-success` #9ccf7f | `--color-success-bg` #182613 | 8.79:1 | AAA |
| `--color-text` #eeeadb | `--color-warning-bg` #2b2412 | 12.78:1 | AAA |
| `--color-text` #eeeadb | `--color-highlight-bg` #352f15 | 11.11:1 | AAA |
| `--color-success` #9ccf7f | `--color-surface-inset` #161b15 | 9.69:1 | AAA |
| `--color-warning` #e6bd5c | `--color-surface-inset` #161b15 | 9.82:1 | AAA |
| `--color-error` #f39a7e | `--color-surface-inset` #161b15 | 8.10:1 | AAA |
| `--color-tooltip-text` #eeeadb | `--color-tooltip-bg` #323b30 | 9.66:1 | AAA |
| `--color-border-strong` #6f7a67 | `--color-surface` #1a2019 | 3.68:1 | pass (non-text) |
| `--color-border-strong` #6f7a67 | `--color-bg` #121611 | 4.05:1 | pass (non-text) |
| `--color-faint` #6f7a67 | `--color-surface` #1a2019 | 3.68:1 | pass (non-text) |
| `--color-focus` #a3adf0 | `--color-bg` #121611 | 8.53:1 | pass (non-text) |
| `--series-1` #e0805c | `--color-surface` #1a2019 | 5.86:1 | pass (non-text) |
| `--series-2` #6fb8c4 | `--color-surface` #1a2019 | 7.38:1 | pass (non-text) |
| `--series-3` #e3c25e | `--color-surface` #1a2019 | 9.60:1 | pass (non-text) |

The body text of a callout is `--color-text-secondary` on the role
background: in light it is at least 8.39:1 on all five role backgrounds
(lowest: error), in dark at least 10.03:1 (lowest: insight).

**Pairs that failed during the re-tune and how they were fixed.** The first
draft of the mood-board palette had one text failure and one weak
colour-vision pair. Both are fixed in `tokens.css`:

| Pair | Draft value | Draft ratio | Fix | Final ratio |
|---|---|---|---|---|
| `--tk-str` on `--color-surface-sunken` (syntax-card chip) | `#4a7529` | 4.37:1 (fail) | darker olive `#456f26` | 4.76:1 |
| `--series-1` against `--series-3`, deuteranopia | `#b4532f` / `#9a7300` | ΔE 13.7 (too close) | darker terracotta `#a8472a`, lighter mustard `#a87e00` | ΔE 22.5 |

The old palette had no failing pair. The decoration colours (`--decor-*`,
`--paper-grid-line`, the mascot fills) are decorative and exempt from 1.4.11,
and no text ever sits on them (12.2).

### 2.8 Syntax highlighting

The editor (`css/editor.css`) colours tokens with `.tk-*` classes. The palette
is restrained: identifiers and query verbs stay ink, and colour goes to the
words that teach the API (fields, predicates, terminals, writes). Weight is set
by `editor.css` and is part of the meaning: `.tk-field`, `.tk-query` and
`.tk-write` are bold, `.tk-com` is italic. Ratios are against the code area
(`--color-surface-inset`: light `#fdf8ee`, dark `#161b15`). The hues follow
the mood board: olive strings, ochre numbers, plum keywords (image 5 purple),
periwinkle fields, dusty-teal predicates, raspberry terminals (image 5 pink)
and terracotta writes.

| Token class | Variable | What it marks | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|---|---|
| `.tk-com` | `--tk-com` | comments (italic) | `#6b6754` | 5.37:1 | `#9aa18e` | 6.54:1 |
| `.tk-str` | `--tk-str` | strings | `#456f26` | 5.58:1 | `#a8d088` | 10.02:1 |
| `.tk-num` | `--tk-num` | numbers | `#8e5c08` | 5.38:1 | `#e7be6a` | 9.96:1 |
| `.tk-kw` | `--tk-kw` | JS / C++ keywords (`for`, `const`, `struct`, `constexpr`) | `#874a9c` | 5.68:1 | `#d4abe8` | 8.98:1 |
| `.tk-field` | `--tk-field` | table fields (`customer`, `amount`, `day`), bold | `#4b53b8` | 6.14:1 | `#b0b9f5` | 9.24:1 |
| `.tk-pred` | `--tk-pred` | predicates (`eq`, `ge`, `between`) | `#2d6b73` | 5.73:1 | `#80c6cd` | 9.05:1 |
| `.tk-query` | `--tk-query` | query verbs (`where`, `orderBy`) and `mv::name` in C++, bold | `#2a2b1f` | 13.55:1 | `#eeeadb` | 14.50:1 |
| `.tk-term` | `--tk-term` | terminals (`count`, `first`, `exists`) | `#ad3659` | 5.75:1 | `#f39cb7` | 8.53:1 |
| `.tk-write` | `--tk-write` | writes (`update`, `churn`), bold | `#ab4520` | 5.50:1 | `#f5a27b` | 8.60:1 |
| `.tk-help` | `--tk-help` | helpers (`rnd`, `zipf`, `label`) | `#5b5746` | 6.85:1 | `#b8bba7` | 8.91:1 |
| `.tk-punct`, `.tk-op` | `--tk-punct` | punctuation and operators | `#6b6754` | 5.37:1 | `#9aa18e` | 6.54:1 |
| `.tk-id` | none (inherits `--color-text`) | other identifiers | `#2a2b1f` | 13.55:1 | `#eeeadb` | 14.50:1 |

**The C++ view** (`highlight(code, "cpp")`, the read-only `.ed-code` block)
uses the same variables with fewer classes: `.tk-kw` for C++ keywords,
`.tk-query` for every `mv::name` (so the library API is the bold ink word),
`.tk-com`, `.tk-num`, `.tk-str`, `.tk-punct`/`.tk-op` and `.tk-id`. It has no
field, predicate, terminal, write or helper colouring. The C++ view sits on
`--color-surface-inset` like the editor, so the ratios above apply.

The editor also reads `--color-highlight` through the alias `--highlight` for
the line a step points at: a 3 px inset bar plus a 22 % tint of the same
colour (both fixed in `editor.css`). The highlight values were chosen so that
every token colour keeps 4.5:1 on the tinted line. Light: `#f0c13a` at 22 %
over `#fdf8ee` gives `#faecc6`; the lowest token ratio on it is 4.84:1
(`--tk-com` and `--tk-punct`). Dark: `#8f7530` at 22 % over `#161b15` gives
`#312f1b`; the lowest token ratio on it is 5.06:1 (`--tk-com`). Do not make
the highlight more saturated or darker in light, or lighter in dark. The bar
itself is decorative: the lesson text names the line number too.

## 3. Typography

### 3.1 Font stacks

Two self-hosted web fonts, both from the same origin (`playground/web/fonts/`),
Latin subset only, 86 KB in total: Shantell Sans 700 for the display roles
and Nunito (variable, 400 to 700) for prose and UI. The monospace is the
reader's own. `tokens.css` holds the two `@font-face` rules with
`font-display: swap`; section 12.6 has the fetch list. Until the files exist,
each stack falls back to the next family and nothing else changes.

| Token | Stack | Use |
|---|---|---|
| `--font-display` | `"Shantell Sans", ui-rounded, "Chalkboard SE", "Segoe Print", system-ui, sans-serif` | only: step titles (`display`), the stat number, the stepper's current-step label (`hand-sm`), "Try this", the step-complete title and the run-log empty-state title (`hand`) |
| `--font-sans` | `"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif` | all other prose and UI text |
| `--font-mono` | `ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", "Cascadia Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace` | code, run log, numbers in the chart, file labels, key caps |

`JetBrains Mono` and `Cascadia Code` are listed because many readers have
them installed; the page never loads them. The display face never sets a
sentence longer than about 8 words, never sets code, and never appears
inside the code editor, the run log (except its empty state) or the chart. The editor sets
`font-variant-ligatures: none` itself, so `->` and `>=` stay two characters in
every font.

### 3.2 Type scale

Base: `html { font-size: 100% }`, so 1 rem = 16 px by default. Sizes are in
px in the tokens because the editor metrics are px. Each step has four tokens:
`--text-<step>-size`, `--text-<step>-lh`, `--text-<step>-weight`,
`--text-<step>-tracking`. The display-face steps also have
`--text-<step>-font`: `--text-display-font`, `--text-stat-font`,
`--text-hand-font`, `--text-hand-sm-font` (all `var(--font-display)`). A step
without a `-font` token uses `--font-sans` or, for `code` and `code-sm`,
`--font-mono`.

| Step | Size | Line height | Weight | Tracking | Font | Use |
|---|---|---|---|---|---|---|
| `display` | 32 px (26 px below 960 px) | 40 px (32 px) | 700 | 0 | display (`--text-display-font`) | the lesson heading (`h1`), one per screen, with the squiggle underline (12.4) |
| `title` | 20 px | 28 px | 600 | -0.01em | sans | chart title, free-play heading, end-of-path heading (`h2`) |
| `heading` | 16 px | 24 px | 600 | 0 | sans | "Try this" heading, callout title, drawer summary (`h3`) |
| `lead` | 18 px | 28 px | 400 | -0.005em | sans | the goal line under the lesson heading |
| `body` | 16 px | 26 px | 400 | 0 | sans | lesson body, "try this" items |
| `small` | 14 px | 22 px | 400 | 0 | sans | callout body, chart caption, tooltip, drawer body |
| `label` | 13 px | 18 px | 500 | 0.01em | sans | buttons, segmented, chips, status line, run-log second line |
| `overline` | 12 px | 16 px | 600 | 0.06em, uppercase | sans | step counter ("Step 3 of 9"), the code-editor file label prefix, stat label |
| `code` | 13 px | 20 px | 400 | 0 | mono | editor, run log, `.ed-code`, `annotated-code` (fixed by `editor.css`: do not change) |
| `code-sm` | 12 px | 16 px | 400 | 0 | mono | log timestamps, axis tick labels, key caps |
| `stat` | 40 px (32 px below 960 px) | 44 px (36 px) | 700 | 0 | display (`--text-stat-font`), `tabular-nums` | the number in a `stat` |
| `hand` | 18 px | 24 px | 700 | 0 | display (`--text-hand-font`) | "Try this" heading, step-complete title, run-log empty-state title |
| `hand-sm` | 15 px | 20 px | 700 | 0.005em | display (`--text-hand-sm-font`) | the stepper's current-step title |

The display face is chunky, so `display`, `stat`, `hand` and `hand-sm` use
weight 700 and zero tracking: negative tracking makes marker strokes touch.
Headings stay in sentence case (3.4); the capitals of mood board images 1
and 4 are not copied, because lowercase reads faster at 26 to 32 px. The
`stat` number is a single value, so its alignment does not depend on
tabular figures; the run log and the chart keep the mono stack for every
number that must align (3.4).

Inline code in prose (`<code>` inside `body` or `small`): `--font-mono` at
`0.875em`, no background box, colour `--color-text`, padding 0. A box around
every identifier breaks the reading line; the monospace face is enough.

### 3.3 Measure

- Lesson body text: `max-width: var(--measure)` = `66ch`. In the 400 px desktop
  column the column itself limits it to about 48 characters per line; in the
  stacked layout the 66ch limit applies.
- Callout and caption text: `max-width: var(--measure-narrow)` = `60ch`.
- Goal line: `max-width: 40ch`, so it breaks into at most two lines at 1280 px.

### 3.4 Rules

- **Headings:** sentence case, no full stop, no colon. Weight 600 (700 in
  the display face for `display` and `hand`). One `h1`
  per screen (the lesson heading). `text-wrap: balance` on `display` and
  `title`. No uppercase headings except the `overline` step.
- **Space around headings:** the space above a heading is twice the space
  below it (`title`: `--space-8` above, `--space-3` below; `heading`:
  `--space-6` above, `--space-2` below). The first child of a region has no
  space above.
- **Numbers:** every measured number uses `font-variant-numeric: tabular-nums`
  and the mono stack: the run log, chart labels, the status line
  position. The one exception is the `stat` number, which uses the display
  face (3.2) and still sets `tabular-nums`. A number is followed by a narrow no-break space (`U+202F`) and its
  unit: `412 µs`, `2.4 MB`, `50 000 rows`. Group thousands with a thin space
  (`50 000`), never a comma, so the figures align in tabular columns.
- **Units:** `ns`, `µs` (with the micro sign `U+00B5`), `ms`, `s`, `B`, `KB`,
  `MB`. Pick the unit so that the number has 1 to 3 integer digits.
- **Emphasis in prose:** weight 600 for a term on first use; no italics except
  for the name of a book or a paper; no underline except links.
- **Links:** `--color-accent`, underline with `text-underline-offset: 3px` and
  `text-decoration-thickness: 1px`; hover: `--color-accent-hover` and 2 px
  thickness.

## 4. Spacing, layout and shape

### 4.1 Spacing scale

Base unit 4 px. Use only these steps.

| Token | Value | Typical use |
|---|---|---|
| `--space-0` | 0 | reset |
| `--space-1` | 4 px | icon to label inside a chip; gap between segmented buttons |
| `--space-2` | 8 px | icon to label in a button; heading to its paragraph (`heading` step) |
| `--space-3` | 12 px | padding of chips and log lines horizontally; gap between "try this" items |
| `--space-4` | 16 px | callout padding; paragraph spacing in lesson body; mobile page gutter |
| `--space-5` | 20 px | gap between the goal line and the body |
| `--space-6` | 24 px | gap between code-editor and run-log; page gutter 960 to 1199 px |
| `--space-8` | 32 px | gap between major regions in one column; page gutter from 1200 px |
| `--space-10` | 40 px | space above the chart block |
| `--space-12` | 48 px | column gap of the two-column layout from 1200 px |
| `--space-16` | 64 px | space above the page footer |
| `--space-20` | 80 px | bottom padding of the page |

### 4.2 Breakpoints

Custom properties cannot be used inside media queries, so these are fixed
numbers. Write them as literals in the page CSS.

| Name | Range | Layout |
|---|---|---|
| `compact` | below 600 px | stacked, 16 px gutter, top bar 48 px, stepper as a progress bar with "Step n of N" |
| `medium` | 600 to 959 px | stacked, 24 px gutter, content max 720 px centred |
| `wide` | 960 to 1199 px | two columns: text 340 px, gap 32 px, code column fills the rest |
| `full` | 1200 px and up | two columns: text 400 px, gap 48 px, code column fills the rest, content max 1280 px |

Touch targets do not depend on the width: use `@media (pointer: coarse)` for
the 44 px minimum (section 9.5).

### 4.3 Page grid

```
full (1280 px viewport)
+------------------------------------------------------------------+
| top bar 56 px: wordmark | stepper (inline)    | mode | share theme|
+------------------------------------------------------------------+
| 32 |  text column 400  | 48 |  code column 768                 |32|
|    |  overline         |    |  +-- code-editor ---------------+ |  |
|    |  lesson heading   |    |  | header: file label    [Run] | |  |
|    |  goal line        |    |  | gutter | code               | |  |
|    |  body             |    |  | status line                  | |  |
|    |  try this         |    |  +------------------------------+ |  |
|    |  callout          |    |  24                               |  |
|    |                   |    |  run-log                          |  |
|    |  prev / next      |    |  40                               |  |
|    |                   |    |  stat row / bar-chart (later)     |  |
|    |                   |    |  drawers (C++ view, details)      |  |
+------------------------------------------------------------------+
```

- `.mv-page`: `max-width: calc(var(--layout-max) + 2 * var(--layout-gutter))`,
  `margin-inline: auto`, `padding-inline: var(--layout-gutter)`.
  `--layout-max` is 1280 px. `--layout-gutter` is 32 px from 1200 px, 24 px
  from 600 px, 16 px below 600 px (set by media queries in `tokens.css`).
- `.mv-lesson-layout` (the two columns): `display: grid;
  grid-template-columns: var(--layout-text-col) minmax(0, 1fr);
  column-gap: var(--layout-col-gap); grid-template-areas: "intro work" "tasks work";
  align-items: start`. `--layout-text-col` is 400 px from 1200 px and 340 px
  from 960 px. `--layout-col-gap` is 48 px from 1200 px and 32 px from 960 px.
- The lesson-step has two parts, so the stacked order can put the editor
  between them: `.mv-lesson-step__intro` (overline, heading, goal, body) in area
  `intro`, `.mv-lesson-step__tasks` ("try this", callouts, prev/next) in area
  `tasks`, and `.mv-workbench` (code-editor, run-log, stat, bar-chart, drawers)
  in area `work`. The DOM order is intro, workbench, tasks, which is also the
  reading and tab order in both layouts.
- Below 960 px: `grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "intro" "work" "tasks"; row-gap: var(--space-8)`,
  `max-width: 720px; margin-inline: auto`.
- No horizontal page scroll at any width from 320 px. Every grid child has
  `min-width: 0`. The editor and the run log scroll horizontally inside
  themselves.

At 390 px (compact) the content is 358 px wide. The editor shows about 40
characters per line before it scrolls; the run log wraps its second line and
scrolls its first line.

### 4.4 Radii

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4 px | chips, key caps, tooltip, the inner segmented button |
| `--radius-xs` | 2 px | chart bar ends |
| `--radius-md` | 6 px | buttons, inputs, segmented track |
| `--radius-lg` | 8 px | code-editor, run-log, callout, drawer, syntax-card, popovers (matches `editor.css`) |
| `--radius-pill` | 999px | stepper dots, status badge |

Wobbly radii (section 12.3) replace these on the decorated components only:
`--radius-wobble-sm` (chips, the run button), `--radius-wobble-md` (segmented
track, step-complete action), `--radius-wobble-lg` (callouts, syntax-card,
step-complete, run-log empty state) and `--radius-wobble-blob` (stepper dots,
"try this" numbers). The code-editor, the run-log card, the drawer, inputs,
tooltips and chart bars keep the geometric radii above.

### 4.5 Borders

| Token | Value |
|---|---|
| `--border-width` | 1 px: all borders |
| `--border-width-strong` | 2 px: selected segmented underline, current step underline |
| `--border` | `1px solid var(--color-border)`: cards, dividers |
| `--border-control` | `1px solid var(--color-border-strong)`: text inputs, number inputs, checkboxes |
| `--border-width-hand` | 2 px: the hand-drawn stroke of callouts, the syntax-card, the step-complete card and the stepper dot ring (12.3) |
| `--border-hand` | `2px solid var(--color-border)`: syntax-card, step-complete card |

Buttons other than Run have no visible border at rest in the code-editor
header (ghost buttons); elsewhere secondary buttons use `--border`.

### 4.6 Elevation

| Token | Light | Dark | Use |
|---|---|---|---|
| `--shadow-0` | `none` | `none` | page-level items |
| `--shadow-1` | `0 1px 2px rgb(42 43 31 / 0.07), 0 2px 8px rgb(42 43 31 / 0.05)` | `none` | code-editor card |
| `--shadow-2` | `0 4px 16px rgb(42 43 31 / 0.12), 0 1px 3px rgb(42 43 31 / 0.08)` | `0 8px 24px rgb(0 0 0 / 0.45)` | autocomplete, tooltip, open menu |
| `--shadow-3` | `0 16px 40px rgb(42 43 31 / 0.18), 0 2px 8px rgb(42 43 31 / 0.08)` | `0 16px 48px rgb(0 0 0 / 0.55)` | drawer on compact screens (bottom sheet) |
| `--shadow-crayon` | `3px 3px 0 0 var(--color-crayon)` (`#2a2b1f`) | same, `--color-crayon` `#3d4688` | the run button at rest (12.3) |
| `--shadow-crayon-pressed` | `1px 1px 0 0 var(--color-crayon)` | same | the run button `:active`, with `translate: var(--crayon-press) var(--crayon-press)` |

In dark, a raised surface is lighter (`--color-surface` or
`--color-surface-raised`) and has `--border`. Never use a shadow alone in dark.

### 4.7 Density

- **Text column: airy.** Body `16/26`, paragraphs separated by `--space-4`.
- **Code column: compact.** Editor and run-log lines are 20 px. The run-log
  line has no vertical padding; groups of lines from one run are separated by
  `--space-2` and a 1 px `--color-grid` rule.
- **Controls:** 32 px high with a fine pointer, 44 px with a coarse pointer.
  The Run button is 36 px with a fine pointer.
- Never put more than three controls in the code-editor header (Run, Reset,
  Copy). Other actions go into the top bar or a drawer.

## 5. Hierarchy rules

The page must read in this order: 1 lesson heading, 2 goal line, 3 editor, 4
Run, 5 run log, 6 body and "try this", 7 callout, 8 chart, 9 drawers and
navigation. Size, weight, colour and space make that order.

| Region | Level | Size / weight | Colour role | Space | Why it reads at this level |
|---|---|---|---|---|---|
| Lesson heading | primary (read) | `display`, 700, display face | `--color-text`; squiggle underline in `--decor-coral` | `--space-2` below the overline, `--space-3` below | largest text on the page |
| Goal line | primary (read) | `lead`, 400 | `--color-text-secondary` | `--space-5` below | second largest text, directly under the heading |
| Code editor | primary (act) | `code` 13/20 | `--color-surface` card, `--shadow-1`, `--border` | top of the code column, aligned with the overline | the only raised card; the widest element |
| Run button | primary (act) | `label` 13/18, 600 | `--color-accent` fill, `--color-on-accent` text | right end of the editor header | the only filled accent element on the page |
| Run log | secondary (result) | `code` 13/20 | `--color-surface-inset`, `--border`, no shadow | `--space-6` below the editor | flat, inset: a result, not an input |
| Body text | secondary (read) | `body` 16/26 | `--color-text` | `--space-4` between paragraphs | plain prose on the page background |
| "Try this" list | secondary (act) | `heading` title + `body` items | `--color-text`; numbers in `--color-accent` | `--space-8` above | numbered tasks that point to the editor |
| Callout | secondary (note) | `heading` title + `small` body | role bg + role border, title in role colour | `--space-6` above | tinted, smaller text than body |
| Stat | secondary (result) | `stat` number, `overline` label, `small` comparison | `--color-text` number, `--color-text-muted` label | `--space-10` above the stat row | big number, but only appears after a run |
| Bar chart | secondary (result) | `title` title, `code-sm` ticks, `label` direct labels | series colours; axis `--chart-axis` | `--space-10` above | appears late in the path |
| Drawers | tertiary | `heading` summary 16/24, 600 | `--color-text-secondary` summary, chevron `--color-faint` | `--space-6` above, `--space-2` between | collapsed by default |
| Top bar / stepper | tertiary (navigate) | `label` 13/18; current-step title `hand-sm` 15/20 | `--color-text-muted`; current step `--color-text` + teal mascot | 56 px bar, `--border` bottom | small, quiet, always in the same place |
| Status line, captions | tertiary | `label` or `small` | `--color-text-muted` | `--space-2` from the thing they describe | small and muted |

Rules that keep the order:

- At most one element per screen uses `display`. At most one control uses an
  accent fill (the Run button). Links and the current step use accent text
  and rings, never an accent fill. Thin progress bars (2 px and 4 px) and the
  focused skip link are the only other accent fills.
- No callout above the editor on compact screens: callouts live in
  `.mv-lesson-step__tasks`, which comes after the workbench.
- The run log never uses a shadow and never uses `--color-surface`: it must
  look flatter than the editor.
- A secondary region never uses a text size larger than `body`, except the
  `stat` number and the chart `title`.

## 6. Components

Naming: prefix `mv-`, BEM. Block `mv-run-log`, element `mv-run-log__line`,
modifier `mv-run-log__line--timing`. State that comes from ARIA is styled from
the ARIA attribute (`[aria-pressed="true"]`, `[aria-current="step"]`,
`[aria-expanded="true"]`, `[aria-busy="true"]`), not from a duplicate class.
The editor keeps its own `.ed-*` and `.tk-*` classes; the page may override
them only inside `.mv-code-editor`, and only the overrides listed in 6.2.

Dark-mode notes say only what changes besides the token values. If a
component has no dark note, the tokens do all the work.

Common states for every interactive element:

| State | Rule |
|---|---|
| hover | colour or background change only, `--dur-instant` with `--ease-out`; no movement, no shadow change |
| focus-visible | `outline: var(--focus-width) solid var(--color-focus); outline-offset: var(--focus-offset)`; never removed without a replacement |
| active | the `-active` colour, no scale transform |
| disabled | `opacity: 0.5; cursor: not-allowed`; keep the element in the tab order only if a tooltip explains why it is disabled (use `aria-disabled="true"` then, not `disabled`) |

### 6.0 Button (shared base)

Not in the shared vocabulary, but every component below uses it.

| Class | Look | Use |
|---|---|---|
| `.mv-button` | height `--control-h` (32 px; 44 px coarse), padding `0 var(--space-3)`, `--radius-md`, `label` text weight 500, icon 16 px + `--space-2` gap | base |
| `.mv-button--secondary` | bg `--color-surface`, `--border`, text `--color-text`; hover bg `--color-surface-sunken` | Share, Theme, Next step |
| `.mv-button--ghost` | bg transparent, no border, text `--color-text-secondary`; hover bg `--color-surface-sunken`, text `--color-text` | Reset, Copy, Clear |
| `.mv-button--icon` | square, width = height, icon 18 px, needs `aria-label` | the theme toggle, the drawer close |

There is no `.mv-button--primary`. The only primary button is the
`run-button` (6.3).

### 6.1 lesson-step

The text column. Anatomy, in DOM order:

1. `.mv-lesson-step__intro` (grid area `intro`)
   1. `.mv-lesson-step__overline`: "Step 3 of 9", `overline`, `--color-text-muted`
   2. `.mv-lesson-step__heading` (`h1`, `tabindex="-1"` so focus can move to it on step change): `display`, `--color-text`
   3. `.mv-lesson-step__goal`: `lead`, `--color-text-secondary`, max 40ch
   4. `.mv-lesson-step__body`: `body`, `--color-text`, paragraphs with `--space-4` between, max `--measure`
2. `.mv-workbench` (grid area `work`, see 4.3; not part of this block)
3. `.mv-lesson-step__tasks` (grid area `tasks`)
   1. `.mv-lesson-step__try` (`section`, `aria-labelledby` its heading)
      - `.mv-lesson-step__try-heading` (`h2` styled as `heading`): "Try this"
      - `.mv-lesson-step__try-list` (`ol`)
      - `.mv-lesson-step__try-item`, with `.mv-lesson-step__try-num` (a 24 px circle, `--radius-pill`, `code-sm`, bg `--color-accent-subtle`, text `--color-accent`) and the item text in `body`
      - `.mv-lesson-step__try-item--done`: the number becomes the check icon (16 px) in `--color-success` on `--color-success-bg`; the text stays `--color-text` (no strike-through) and a visually hidden "done" is added
   2. callouts (6.6), `--space-6` above the first
   3. `.mv-lesson-step__nav`: `.mv-lesson-step__nav-prev` (ghost button, chevron rotated 180°) and `.mv-lesson-step__nav-next` (secondary button, chevron); `justify-content: space-between`; `--space-8` above

Spacing: overline to heading `--space-2`; heading to goal `--space-3`; goal to
body `--space-5`; try heading `--space-8` above, `--space-3` below; items
`--space-3` apart, number to text `--space-3`.

Tokens: `--text-display-*`, `--text-lead-*`, `--text-body-*`,
`--text-overline-*`, `--color-text`, `--color-text-secondary`,
`--color-text-muted`, `--color-accent`, `--color-accent-subtle`,
`--color-success`, `--color-success-bg`, `--measure`.

States: the heading gets the focus ring only on `:focus-visible` (a
programmatic focus after a step change shows no ring in Chromium; that is
intended). Links in the body follow 3.4.

Handmade additions (12.4): the heading uses `--text-display-font` and gets
the squiggle underline (`.mv-lesson-step__heading::after`, the same rules as
`.mv-squiggle-underline`). The "Try this" heading uses the `hand` step. The
`.mv-lesson-step__try-num` circle uses `--radius-wobble-blob`. The text
column sits on the graph paper; it has no card.

### 6.2 code-editor

The chrome around the existing `.ed` widget. Anatomy:

1. `.mv-code-editor` (`section`, `aria-labelledby` the file label): bg
   `--color-surface`, `--border`, `--radius-lg`, `--shadow-1`,
   `overflow: clip` (so the corners clip the editor; popovers are inside
   `.ed` and use `position: absolute` within `.ed-body`, so `clip` must not hide
   them: use `overflow: visible` if a popover is cut off, and give the header
   and status line their own top and bottom radii)
2. `.mv-code-editor__header`: height 44 px, padding `0 var(--space-2) 0
   var(--space-4)`, flex, `align-items: center`, `gap: var(--space-2)`, bottom
   `--border`, bg `--color-surface`
   - `.mv-code-editor__file`: `overline` "SCRIPT" in `--color-text-muted`, then
     `--space-2`, then the file name in `--font-mono` `code` `--color-text`
     ("workload.js" or "query.cpp")
   - `.mv-code-editor__actions` (`margin-left: auto`, flex, gap `--space-1`):
     ghost buttons `.mv-code-editor__action` (Reset with the reset icon, Copy
     with the copy icon; text labels visible from 600 px, icon only with
     `aria-label` below)
   - the `.mv-run-button` (6.3), last in the header
3. `.mv-code-editor__progress`: 2 px high bar directly under the header, only
   while running (6.3)
4. `.mv-code-editor__body`: hosts `.ed`; the `.ed-gutter` is the gutter
   (44 px, line numbers in `--color-text-muted`, from `editor.css`)
5. the `.ed-status` line is the status line (from `editor.css`)

Overrides of `editor.css`, allowed only inside `.mv-code-editor`:

```css
.mv-code-editor .ed-main { border: 0; border-radius: 0; }
.mv-code-editor .ed-main:focus-within { outline: none; }
.mv-code-editor .ed-status { border: 0; border-top: var(--border); border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
```

The focus indication moves to the card:
`.mv-code-editor:has(.ed-input:focus-visible), .mv-code-editor:has(.ed-input:focus)`
gets `border-color: var(--color-focus); box-shadow: 0 0 0 1px var(--color-focus), var(--shadow-1)`.
This is a 2 px ring in the focus colour that does not shift layout.

Modifiers and states:

| Modifier / state | Look |
|---|---|
| default | as above |
| focus (typing) | the 2 px focus ring on the card |
| `.mv-code-editor--readonly` (the C++ view in a step) | header file label "C++" and `query.cpp`; no Run button; the `.ed-readonly` tint from `editor.css` |
| `.mv-code-editor--error` | status line message uses `.ed-msg-error`; the card border stays neutral (the squiggle, the gutter dot and the status message carry the error) |
| running (`aria-busy="true"` on the card) | progress bar visible; editor stays editable |

Height: the editor body is 360 px (from `editor.css`; 280 px below 768 px).
The resize grip in the status line changes it.

Compact screens: the header is `position: sticky; top: 48px` (under the top
bar) inside the workbench, so the Run button stays in view while the reader
scrolls the editor into view.

Dark: the card is `--color-surface` (`#1a2019`), lighter than the page, with
`--border` and no shadow; the code area is `--color-surface-inset`
(`#161b15`).

Handmade layer: none. The card keeps `--radius-lg`, a 1 px `--border` and a
solid `--color-surface`; the graph paper stops at its edge. The only
handmade element in the header is the run button's crayon shadow (6.3).

### 6.3 run-button

The one primary action. Anatomy: `.mv-run-button` (`button`, `type="button"`)
> `.mv-run-button__icon` (play, 16 px, filled) > `.mv-run-button__label`
("Run") > `.mv-run-button__kbd` (the shortcut, `code-sm`, from 600 px only:
"Ctrl ↵", or "⌘ ↵" on macOS).

Size: height 36 px (fine pointer), 44 px (coarse); padding `0 var(--space-4)
0 var(--space-3)`; `--radius-wobble-sm` (was `--radius-md`); `label` text
weight 600; `box-shadow: var(--shadow-crayon)` (12.3).

| State | Background | Text / icon | Other |
|---|---|---|---|
| default | `--color-accent` | `--color-on-accent` | `--shadow-crayon`. `__kbd` text is `--color-on-accent` at `opacity: 0.8` (the 80 % mix measures 4.84:1 light and 5.31:1 dark on the accent; 72 % would fall to 4.25:1 and 4.40:1, so do not go lower) |
| hover | `--color-accent-hover` | `--color-on-accent` | `--dur-instant`; the shadow does not change |
| active | `--color-accent-active` | `--color-on-accent` | `--shadow-crayon-pressed` and `translate: var(--crayon-press) var(--crayon-press)`, so the button meets its shadow; no scale |
| focus-visible | default | default | focus ring, offset 2 px, on the header background |
| disabled (wasm not loaded yet) | `--color-accent` at `opacity: 0.5` | `--color-on-accent` | `aria-disabled="true"`, tooltip "Loading the engine" |
| loading (`aria-busy="true"`) | `--color-accent` | label "Running", icon replaced by the stop icon if the run can be stopped, else by the clock icon | `.mv-code-editor__progress` shows an indeterminate bar: a 30 % wide `--color-accent` segment that moves left to right over 1200 ms, `linear`, infinite; with reduced motion, a static 100 % bar at 40 % opacity |

The keyboard shortcut Ctrl+Enter (⌘+Enter) runs from anywhere in the editor.

### 6.4 run-log

The plain-text console. It shows what happened in the order it happened.

Anatomy:

1. `.mv-run-log` (`section`, `aria-labelledby` its title): bg
   `--color-surface-inset`, `--border`, `--radius-lg`, no shadow
2. `.mv-run-log__header`: height 36 px, padding `0 var(--space-2) 0
   var(--space-4)`, bottom `--border`, flex
   - `.mv-run-log__title` (`h2` styled as `overline`, `--color-text-muted`): "Run log"
   - `.mv-run-log__count` (`code-sm`, `--color-text-muted`): "3 runs"
   - `.mv-run-log__clear` (ghost button, `margin-left: auto`): "Clear"
3. `.mv-run-log__body` (`role="log"`, `aria-live="polite"`,
   `aria-relevant="additions"`, `tabindex="0"` so a keyboard user can scroll
   it): padding `var(--space-2) 0`, `max-height: 320px` (240 px below 600
   px), `overflow: auto`, `overscroll-behavior: contain`; it scrolls to the
   newest line after each run unless the reader has scrolled up
4. `.mv-run-log__run` (one group per run, newest last): separated from the
   previous run by `--space-2` and a 1 px `--chart-grid` top rule
   - `.mv-run-log__run-head` (`code-sm`, `--color-text-muted`, padding `0
     var(--space-4)`): "Run 3 · 14:02:11 · 50 000 rows"
   - `.mv-run-log__line` (one per output line), with a modifier for its type
5. `.mv-run-log__empty`: when there is no run yet, one `small` line in
   `--color-text-muted`: "Press Run (Ctrl ↵). Output appears here." The
   empty state is the one place in the run log that has decoration: the
   sleepy mascot (`.mv-mascot--sleepy`, `--mascot-md`) to the left of the
   line, and an optional `hand` title "Nothing ran yet" (12.4). The first
   run removes the empty state and the mascot with it.

Line layout: `display: grid; grid-template-columns: 3ch 16px minmax(0, 1fr);
column-gap: var(--space-2); padding: 0 var(--space-4); min-height: 20px`.

- `.mv-run-log__num`: the line number within the run, `code-sm`,
  `--color-text-muted`, right-aligned, tabular. (Run time stamps go in the run
  head, not on every line.)
- `.mv-run-log__icon`: 16 px icon, vertically centred on the first 20 px line.
- `.mv-run-log__text`: `code` (13/20 mono), `white-space: pre`, scrolls with
  the body. Numbers are tabular and in weight 600.
- `.mv-run-log__note`: the optional plain-language second line, in column 3,
  `label` size but weight 400, `--font-sans`, `--color-text-secondary`,
  `white-space: normal`, padding-bottom `--space-1`.

Line types:

| Modifier | Icon | Icon colour | Text colour | Background | Example text | Example note |
|---|---|---|---|---|---|---|
| `--value` | chevron (right) | `--color-faint` | `--color-text` | none | `count = 18` | none |
| `--timing` | clock | `--color-text-muted` | `--color-text` | none | `412 µs  where(customer.eq(42)).count()` | `about 8 ns per row: every row was read` |
| `--plan` (scan) | scan | `--color-text-muted` | `--color-text-secondary` | none | `plan  scan 50 000 rows` | none |
| `--plan` + `--index` | index | `--color-accent` | `--color-text-secondary` | none | `plan  probe grouped index on customer (equality)` | none |
| `--event` + `--build` | index | `--color-success` | `--color-text` | none | `event built grouped index on customer · 3.1 ms · 0.9 MB` | `the scans cost more than building the index` |
| `--event` + `--drop` | cross | `--color-warning` | `--color-text` | none | `event dropped ordered index on day · unused 400 queries` | `it cost memory and write time and saved nothing` |
| `--event` + `--trial` | clock | `--color-accent` | `--color-text` | none | `event trial sorted array vs grouped on amount` | none |
| `--insight` | info | `--color-insight` | `--color-text`, `--font-sans` `label` weight 500 | `--color-insight-bg`, full row width | `The second query was 38× faster: it used the index built in run 2.` | none |
| `--warning` | warning | `--color-warning` | `--color-text` | `--color-warning-bg` | `< 1 µs  below clock resolution` | `the browser clock ticks in 5 µs steps here; run more queries` |
| `--error` | cross | `--color-error` | `--color-error` | `--color-error-bg` | `line 4: unknown field "custmer"` | `did you mean customer?` |

The first word of a plan or event line (`plan`, `event`) is a fixed-width
keyword in `--color-text-muted` (6ch, padded), so the eye can scan the column.
The second word of an event (`built`, `dropped`, `trial`) is weight 600: with
the icon it repeats what the colour says (P4).

New lines enter with the `log-in` motion (9.1). Only the lines of the newest
run animate.

Dark: the inset (`#161b15`) is darker than the editor card; the insight,
warning and error rows use the dark role backgrounds.

### 6.5 callout

Three variants: insight, tip, warning. Anatomy:

1. `.mv-callout` (`aside`, `role="note"`), plus one modifier
   `.mv-callout--insight`, `.mv-callout--tip` or `.mv-callout--warning`:
   `display: grid; grid-template-columns: 20px minmax(0, 1fr); column-gap:
   var(--space-3); padding: var(--space-4); border-radius: var(--radius-lg);
   border: 1px solid var(--color-<role>-border); background:
   var(--color-<role>-bg)`
2. `.mv-callout__icon`: 20 px, colour `--color-<role>`, row 1 column 1, aligned to the title's first line (`margin-top: 2px`)
3. `.mv-callout__title`: `heading` (16/24, 600), colour `--color-<role>`; the
   first word is the kind ("Insight", "Try", "Careful") so the meaning is in
   text too
4. `.mv-callout__body`: `small` (14/22), `--color-text-secondary`, column 2,
   `--space-1` below the title, max `--measure-narrow`
5. `.mv-callout__action` (optional): a link or a ghost button, column 2,
   `--space-3` above

| Variant | Icon | Title example |
|---|---|---|
| `--insight` | info | "Insight: the index paid for itself after 31 queries" |
| `--tip` | tip (light bulb) | "Try: change 42 to a customer that does not exist" |
| `--warning` | warning | "Careful: these timings are below the clock resolution" |

States: a callout is static. If it has an action, the action has the common
states. A callout that appears after a run (for example the insight after a
check passes) uses the `reveal` motion (9.1).

Dark: role tokens only. Do not add a glow or a shadow.

Handmade layer: `border-radius: var(--radius-wobble-lg)` and
`border-width: var(--border-width-hand)` (2 px) in the role border colour.
No texture and no squiggle inside a callout: its text is the content.

### 6.6 syntax-card

A compact reference card for the DSL: one line of grammar and grouped
vocabulary. Anatomy:

1. `.mv-syntax-card` (`section`, `aria-labelledby` its title): bg
   `--color-surface`, `--border`, `--radius-lg`, padding `var(--space-4)`, no
   shadow
2. `.mv-syntax-card__header`: `.mv-syntax-card__overline` ("Reference",
   `overline`, `--color-text-muted`) above `.mv-syntax-card__title` (`h3`,
   `heading`)
3. `.mv-syntax-card__grammar`: one line, `code` on `--color-surface-inset`,
   `--radius-md`, padding `var(--space-2) var(--space-3)`, highlighted with the
   `.tk-*` classes, `overflow-x: auto`, `white-space: pre`. Example:
   `where(field.pred(value), …).terminal()`; the placeholder words use the
   token colour of their kind and are italic
4. `.mv-syntax-card__groups`: grid, `--space-3` row gap
5. `.mv-syntax-card__group`: `.mv-syntax-card__group-label` (`overline`,
   `--color-text-muted`, width 80 px on the left from 400 px, above the chips
   below 400 px) and `.mv-syntax-card__chips` (flex wrap, gap `--space-1`) of
   `.mv-chip--code` chips. Groups: Fields, Predicates, Query, Terminals,
   Writes, Helpers

Chip text colour in the syntax card is the token colour of the group
(`--tk-field`, `--tk-pred`, ...) on `--color-surface-sunken`, so the card
teaches the colour code of the editor. All token colours pass 4.5:1 on
`--color-surface-sunken` (lowest: light `--tk-com` and `--tk-punct` 4.58:1;
dark `--tk-com` 5.59:1). The card uses `--radius-wobble-lg` and
`--border-hand`. Its grammar line holds code, so it stays geometric
(`--radius-md`) with no decoration; the chips follow 6.10. If the chips insert text into the editor, they are buttons with the
`--interactive` states of 6.10.

Dark: the card is `--color-surface` with `--border`; tokens only.

### 6.7 annotated-code

Code with numbered labels under its parts, used to explain one line. Anatomy:

1. `.mv-annotated-code` (`figure`)
2. `.mv-annotated-code__code` (`pre > code`): `code` on
   `--color-surface-inset`, `--border`, `--radius-lg`, padding `var(--space-3)
   var(--space-4)`, `.tk-*` highlighting; line height 20 px plus
   `padding-bottom: 28px` to leave room for the markers
3. `.mv-annotated-code__mark` (a `span` around one part of the code):
   `border-bottom: 2px solid var(--color-accent-border)`, `position:
   relative`; its `::after` is not used, the number is a real element:
4. `.mv-annotated-code__mark-num`: `position: absolute; top: calc(100% +
   4px); left: 50%; translate: -50% 0`; an 18 px circle, `--radius-pill`, bg
   `--color-accent-subtle`, text `--color-accent`, `code-sm` weight 600,
   `aria-hidden="true"`
5. `.mv-annotated-code__legend` (`ol` in the `figcaption`): `--space-3` above,
   items `--space-2` apart
6. `.mv-annotated-code__legend-item`: `.mv-annotated-code__legend-num` (the
   same 18 px circle) and the text in `small`, `--color-text-secondary`; the
   code part named first in `--font-mono`, `--color-text`

States: hover or focus on a legend item (it has `tabindex="0"`) adds
`.mv-annotated-code__mark--active` to the matching mark: background
`--color-accent-subtle`, border colour `--color-accent`. The link between the
two is `aria-describedby` from the mark to the legend item.

Brackets: when a part spans several tokens, the mark is one span around all of
them; marks never overlap or nest. At most 5 marks per block.

Dark: tokens only.

### 6.8 stepper

Progress through 8 to 10 steps. Lives in the top bar from 960 px, and under
the top bar as a progress bar below 960 px.

Anatomy (wide and full):

1. `.mv-stepper` (`nav`, `aria-label="Lesson steps"`)
2. `.mv-stepper__list` (`ol`, flex, `align-items: center`, gap 0)
3. `.mv-stepper__item` (`li`); between items a 12 px wide, 1 px high
   connector (`::before` of every item but the first) in `--color-border`
4. `.mv-stepper__link` (`a` or `button`, 32 × 32 hit area): contains
   `.mv-stepper__dot` (24 px circle, `--radius-pill`) with
   `.mv-stepper__num` (`code-sm`, tabular) inside, and `.mv-stepper__title`
   (visually hidden except for the current step, where it shows in `label`,
   `--color-text`, weight 600, `--space-2` from the dot, max 24ch with ellipsis)

| State | Dot | Number / icon | Title |
|---|---|---|---|
| upcoming | 1 px `--color-border-strong` ring, bg transparent | number, `--color-text-muted` | hidden, `title` in tooltip on hover/focus |
| done (`.mv-stepper__item--done`) | bg `--color-surface-sunken` | check icon 14 px, `--color-text-secondary`, plus visually hidden "completed" | hidden |
| current (`aria-current="step"` on the link) | bg `--color-accent-subtle`, 2 px `--color-accent` ring | number, `--color-accent`, weight 600 | visible |
| hover | bg `--color-surface-sunken` (upcoming and done); current unchanged | | tooltip after 400 ms |
| focus-visible | focus ring around the 32 px hit area, `--radius-pill` | | tooltip immediately |

Anatomy (below 960 px): `.mv-stepper--compact` replaces the list with
`.mv-stepper__count` ("Step 3 of 9", `overline`, `--color-text-muted`),
`.mv-stepper__current-title` (`label`, `--color-text`, weight 600) and
`.mv-stepper__progress` (`role="progressbar"`, `aria-valuemin="1"`,
`aria-valuemax="9"`, `aria-valuenow="3"`, `aria-valuetext="Step 3 of 9:
<title>"`): a 4 px track in `--color-surface-sunken`, `--radius-pill`, with a
fill in `--color-accent` of width `n / N`. A `.mv-button--icon` pair (chevrons)
on the right moves back and forward. The full list opens in a `drawer`.

Dark: tokens only. The current dot is never an accent fill: the Run button keeps that role (P2).

**Hand-drawn stepper (12.5).** The states above keep their meaning and their
ARIA; the look changes as follows. Class names stay the same; the faces are
CSS backgrounds, so the markup does not change.

| Part | Hand-drawn look |
|---|---|
| connector (`.mv-stepper__item + .mv-stepper__item::before`) | 16 px wide, 8 px high, a squiggle: `background: var(--color-faint); mask: var(--img-squiggle-underline) left center / auto 100% repeat-x`. After a done item it is `--color-success` |
| upcoming dot | 24 px, `--radius-wobble-blob`, ring `inset 0 0 0 var(--border-width-hand) var(--color-border-strong)`, number in `--color-text-muted` (the "plain dot") |
| done dot (`.mv-stepper__item--done`) | `--mascot-sm` (28 px), no ring, no fill, `background: var(--img-face-sun) center / contain no-repeat`; `.mv-stepper__check` and `.mv-stepper__num` hidden (`visibility: hidden`); the visually hidden "completed" stays |
| current dot (`aria-current="step"`) | `--mascot-sm` (28 px), `background: var(--img-face-teal) center / contain no-repeat`, no ring, no fill; number visually hidden. The title shows in the `hand-sm` step, `--color-text` |
| hover | upcoming: ring colour `--color-text-muted`; done and current: unchanged (no movement) |
| compact `.mv-stepper__progress` | 8 px high; track and `.mv-stepper__progress-fill` both masked with `--img-squiggle-underline` (repeat-x), track `--color-surface-sunken`, fill `--color-accent` |

### 6.9 stat

One large number with a label and a plain-language comparison. Anatomy:

1. `.mv-stat` (`div` with `role="group"` and `aria-labelledby` its label):
   top `--border`, padding-top `--space-3`, no card, no background
2. `.mv-stat__label`: `overline`, `--color-text-muted`: "Index probe"
3. `.mv-stat__value`: `stat` (40/44, display face `--text-stat-font`, 700, tabular), `--color-text`,
   `--space-1` above; contains the number and `.mv-stat__unit` (`title` size
   20 px, weight 400, `--color-text-muted`, a narrow no-break space before it)
4. `.mv-stat__comparison`: `small`, `--color-text-secondary`, `--space-1`
   above, max 32ch: "38× faster than reading every row"

`.mv-stat-row` holds 2 or 3 stats: `display: grid; grid-template-columns:
repeat(auto-fit, minmax(160px, 1fr)); column-gap: var(--space-6); row-gap:
var(--space-4)`.

Modifier `.mv-stat--series-1|2|3`: a 10 px marker of the series (circle,
square or triangle) before the label, in the series colour, so the stat links
to the chart. Never colour the number itself.

Modifier `.mv-stat--below-res`: the value reads `< 1` with unit `µs`, and the
comparison says "below the clock resolution". The marker becomes an outlined
shape (7.3).

States: static. A new value after a run replaces the old one with the
`reveal` fade (9.1). Numbers never count up.

### 6.10 chip

Small label, 24 px high. Anatomy: `.mv-chip` > optional `.mv-chip__icon`
(14 px) or `.mv-chip__dot` (6 px circle in the role colour) > `.mv-chip__label`.

Base: `display: inline-flex; align-items: center; gap: var(--space-1);
height: 24px; padding: 0 var(--space-2); border-radius: var(--radius-wobble-sm) (was --radius-sm);
border: 1px solid transparent; label` text (13/18, weight 500); bg
`--color-surface-sunken`; text `--color-text-secondary`.

| Modifier | Background | Text | Border |
|---|---|---|---|
| (neutral) | `--color-surface-sunken` | `--color-text-secondary` | transparent |
| `--code` | `--color-surface-sunken` | the `.tk-*` colour of its kind; `--font-mono` `code-sm` 12/16 | transparent |
| `--insight` | `--color-insight-bg` | `--color-insight` | `--color-insight-border` |
| `--success` | `--color-success-bg` | `--color-success` | `--color-success-border` |
| `--warning` | `--color-warning-bg` | `--color-warning` | `--color-warning-border` |
| `--series-1|2|3` | `--color-surface-sunken` | `--color-text` with a marker shape in the series colour | transparent |

`--interactive` (a `button`): hover border `--color-border-strong`; active bg
`--color-border`; focus-visible ring with offset 1 px; selected
(`aria-pressed="true"`) bg `--color-accent-subtle`, border
`--color-accent-border`, text `--color-accent`; disabled opacity 0.5. Height
stays 24 px; with a coarse pointer the hit area grows to 44 px with a
transparent `::before` (`inset: -10px 0`), not the visible chip.

A coloured chip always has a word that says the kind ("built", "dropped",
"index"), never only a colour.

### 6.11 segmented

A tab-like control with 2 to 4 options (Lessons / Free play; DSL / C++).
Anatomy: `.mv-segmented` (`role="group"` with `aria-label`, buttons with
`aria-pressed`; or `role="tablist"` with `role="tab"` and `aria-selected` when
it switches a panel) > `.mv-segmented__option` (`button`).

Track: `display: inline-flex; padding: 2px; gap: 2px; background:
var(--color-surface-sunken); border-radius: var(--radius-md)`. Total height
32 px (44 px coarse). Option: height 28 px (40 px coarse), padding `0
var(--space-3)`, `--radius-sm`, `label` text, bg transparent, text
`--color-text-muted`.

| State | Option look |
|---|---|
| default | as above |
| hover | text `--color-text` |
| selected (`aria-pressed="true"` / `aria-selected="true"`) | bg `--color-surface-selected`, text `--color-text`, weight 600, `box-shadow: var(--shadow-segment)` |
| focus-visible | focus ring, offset 1 px |
| disabled | opacity 0.5 |

Keyboard: as a group, each option is a tab stop. As a tablist, one tab stop
and Left/Right arrows move the selection.

Dark: `--color-surface-selected` is `#323b30` (text 9.66:1) and
`--shadow-segment` is `none`; the lighter fill alone shows the selection.

### 6.12 bar-chart

The one visual. Anatomy: `.mv-bar-chart` (`figure`) >
`.mv-bar-chart__title` (`h3`, `title` size) > `.mv-bar-chart__plot` (inline
`svg`, `role="img"`, `aria-labelledby` the title and a visually hidden
`.mv-bar-chart__desc` with the values as a sentence) > the marks >
`.mv-bar-chart__caption` (`figcaption`, below the plot). A visually hidden
`table` (`.mv-bar-chart__table`) repeats the data.

SVG classes: `.mv-bar-chart__axis` (baseline line), `.mv-bar-chart__grid`
(vertical grid lines), `.mv-bar-chart__tick-label`,
`.mv-bar-chart__category` (row label), `.mv-bar-chart__bar` with
`.mv-bar-chart__bar--s1|s2|s3`, `.mv-bar-chart__bar--below-res`,
`.mv-bar-chart__marker` (the series shape at the bar end),
`.mv-bar-chart__value` (direct value label), `.mv-bar-chart__annotation`
(text) and `.mv-bar-chart__annotation-line`.

Section 7 gives the drawing rules. States: a bar has hover and focus only if
the chart is interactive; then hover darkens nothing and shows a tooltip, and
focus (bars get `tabindex="0"` in data order) draws a 2 px `--color-focus`
outline around the bar with 2 px offset.

Dark: series and chart tokens switch; bars have no border; the hatch
background is `--chart-hatch-bg`.

### 6.13 drawer

A collapsible panel for secondary content (the C++ view, the full plan, all
indexes). Anatomy: `.mv-drawer` (`details`) > `.mv-drawer__summary`
(`summary`, min height 44 px, flex, `gap: var(--space-2)`) containing
`.mv-drawer__chevron` (16 px chevron, `--color-faint`), `.mv-drawer__title`
(`heading` style, `--color-text-secondary`) and `.mv-drawer__meta`
(`label`, `--color-text-muted`, `margin-left: auto`: "12 lines") >
`.mv-drawer__body` (padding `var(--space-2) 0 var(--space-4) var(--space-6)`,
`small` text).

Look: no card. A top `--border` separates drawers; consecutive drawers share
one border. Remove the default marker (`summary { list-style: none }` and
`::-webkit-details-marker { display: none }`).

| State | Look |
|---|---|
| closed | chevron points right |
| open (`[open]`) | chevron rotates 90° (points down), `--dur-fast`, `--ease-out`; title `--color-text` |
| hover | title `--color-text`, chevron `--color-text-muted` |
| focus-visible | focus ring on the summary, `--radius-sm` |

Dark: tokens only.

### 6.14 tooltip

Anatomy: `.mv-tooltip` (`role="tooltip"`, referenced by `aria-describedby`
from the trigger), max width 280 px, padding `var(--space-1)
var(--space-2)`, `--radius-sm`, `label` size at weight 400, bg
`--color-tooltip-bg`, text `--color-tooltip-text`, `--shadow-2`,
`z-index: var(--z-tooltip)`. No arrow. Offset 6 px from the trigger, above it
by default, below it if there is no room.

Behaviour: show after 400 ms of hover, at once on keyboard focus; hide on
pointer leave, blur and Escape. Never put interactive content or the only copy
of important information in a tooltip.

Colours: light is inverse (`#34322a` bg, `#f7f0e1` text, 11.31:1). Dark is a
raised surface (`#323b30` bg, `#eeeadb` text, 9.66:1) with `--border`
(`--color-tooltip-border`; transparent in light), because an inverse light
tooltip on a dark page is too bright.

### 6.15 Top bar (page frame, for completeness)

`.mv-topbar`: height 56 px (48 px below 600 px), `position: sticky; top: 0;
z-index: var(--z-sticky)`, bg `--color-bg` at full opacity, bottom `--border`.
Inside the `.mv-page` width: `.mv-topbar__brand` (the word "multiview" in
`--font-mono` 15 px weight 600 `--color-text`, then "playground" in
`--font-sans` 15 px weight 400 `--color-text-muted`), the `stepper`, then
`.mv-topbar__tools` (`segmented` mode switch, Share and theme buttons as
secondary and icon buttons). A skip link `.mv-skip-link` is the first
focusable element: hidden above the viewport, at `top: var(--space-2)` on
focus, bg `--color-accent`, text `--color-on-accent`.

## 7. Data visualisation

There is one chart type: the bar chart. It appears at most once per step and
only after the reader has run code.

### 7.1 Two orientations

| Modifier | Use | Axis |
|---|---|---|
| `.mv-bar-chart--rows` (horizontal bars) | compare alternatives for one query: multiview, scan only, a fixed index | categories on the left, time on a linear x axis from 0 |
| `.mv-bar-chart--columns` (vertical bars) | the same query over consecutive runs, to show the moment an index appears | run number on x, time on a linear y axis from 0 |

### 7.2 Geometry

- Width: 100 % of the code column. Height: `--rows` = number of bars × 32 px
  + 32 px for the axis; `--columns` = 200 px plot (160 px below 600 px) + 24
  px annotation band above + 32 px axis below.
- Bar thickness 20 px in `--rows`; in `--columns` the bar width is 60 % of the
  slot, at most 32 px. End radius `--radius-xs` (2 px) on the value end only.
- Axis: linear, starts at 0, 4 to 6 ticks at round values (1, 2, 5 × 10ⁿ).
  Tick labels `code-sm` in `--chart-axis`. Grid lines 1 px `--chart-grid`
  at every tick, behind the bars. Baseline 1 px `--chart-axis-line`. No axis
  line on the value side. The unit appears once, in the last tick label
  (`400 µs`), not in an axis title.
- Category labels (`--rows`): left of the bars, right-aligned, `label` size,
  `--color-text`, max width 160 px (96 px below 600 px; truncate with
  ellipsis and give the full name in the hidden table). The series marker
  (circle, square, triangle; 8 px) sits before the label in the series
  colour.
- Direct value labels: 6 px after the bar end (`--rows`) or 4 px above the
  bar (`--columns`), `code-sm`, weight 600, tabular, `--color-text`. If a
  value label does not fit inside the plot, it goes inside the bar end in
  `--color-on-accent` only for series 1; for other series, shorten the axis
  domain to fit (extend the domain by 15 % beyond the largest value from the
  start).
- No legend box. The marker and the label at each bar are the legend. With
  `--columns` and two series, the series name is written once next to the
  last bar of each series.

### 7.3 Below the clock resolution

The browser clock has a resolution (for example 5 µs in a cross-origin
isolated page, 100 µs otherwise). A value under it is not zero and not known.

- Draw the bar from 0 to the resolution value, not to the measured value.
- Fill: a 45° hatch in the series colour, 1 px lines every 4 px, over
  `--chart-hatch-bg`, defined once as an SVG `pattern` per series
  (`id="mv-hatch-s1"` and so on). Outline: 1 px dashed (`3 2`) in the series
  colour.
- Value label: `< 5 µs` (with the actual resolution), weight 400, never a
  number with false precision such as `0.31 µs`.
- The marker becomes outlined (stroke in the series colour, fill
  `--chart-hatch-bg`).
- The caption adds one sentence: "Hatched bars are below the clock resolution
  of 5 µs: the true time is somewhere inside the hatched range."
- The run log shows the same value as a `--warning` line (6.4).

### 7.4 Annotation: "the index was built here"

- Only in `--columns`. A vertical 1 px dashed (`4 3`) line in
  `--chart-annotation`, placed between the last run without the index and
  the first run with it, from the top of the annotation band to the baseline.
- Label: in the 24 px band above the plot, left-aligned to the line with a
  4 px gap: the index icon (14 px, `--color-success`) and the text "index
  built" in `label` size, weight 500, `--chart-annotation`. If the line is in
  the right third of the plot, the label goes to the left of the line,
  right-aligned.
- At most two annotations per chart ("index built", "index dropped"; the
  second uses the cross icon in `--color-warning`). Annotation text never
  overlaps a bar or a value label.

### 7.5 Caption and title

- The title (`title` size) states the measure and the unit context: "Time per
  query, 50 000 rows".
- The caption (`figcaption`) sits below the plot, `--space-3` above it,
  `small`, `--color-text-secondary`, max `--measure-narrow`. Its first sentence
  says what to look at: "Run 4 is the first run that used the index." Then the
  measurement note: "Median of 200 queries per run."

### 7.6 Forbidden

- Logarithmic axes. If one value dwarfs the others, say so in text and show the
  ratio as a `stat`; do not compress the axis.
- An axis that does not start at 0, broken axes.
- A legend away from the data, or any legend box.
- More than three series; series 1 and 3 as the only two series (section
  2.6).
- Dual axes.
- 3D, perspective, shadows on bars, gradients, rounded "pill" bars, animated
  idle states.
- Pie, donut, gauge, area, radar charts.
- Colour as the only difference between series.

## 8. Iconography

Fourteen inline SVG icons (the list in the brief has 14 names; all are
needed: the run-log line types use scan, index, clock and chevron). Draw them
inline, not from a sprite file, so `currentColor` works without a fetch.

Shared attributes on every `svg`:

```html
<svg class="mv-icon" viewBox="0 0 24 24" width="16" height="16" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round"
     stroke-linejoin="round" aria-hidden="true" focusable="false">…</svg>
```

Rules:

- Grid 24 × 24, live area 3 to 21 (2 px padding on every side except the
  rounded warning triangle and the circle icons, which use r = 9).
- Stroke width 2 at every size (`--stroke-hand`; it was 1.75 before the
  handmade layer, 12.3); round caps and round joins. Do not scale the stroke
  with `vector-effect`.
- Sizes: 14 px (chips, stepper check), 16 px (buttons, run log, drawer
  chevron), 20 px (callouts). Never larger than 24 px.
- Colour: `currentColor`; the parent sets the colour from a role token.
- An icon next to a text label is `aria-hidden="true"`. An icon-only button
  has `aria-label` on the button, not a `title` in the SVG.
- `play` is the only filled icon: `fill="currentColor"` and
  `stroke="none"` on its path.

| Name | Class | SVG content |
|---|---|---|
| play | `.mv-icon--play` | `<path fill="currentColor" stroke="none" d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/>` |
| stop | `.mv-icon--stop` | `<rect x="6" y="6" width="12" height="12" rx="2"/>` |
| reset | `.mv-icon--reset` | `<path d="M4 12a8 8 0 1 0 2.34-5.66L4 9"/><path d="M4 4v5h5"/>` |
| check | `.mv-icon--check` | `<path d="M5 12.5l4.5 4.5L19 7.5"/>` |
| cross | `.mv-icon--cross` | `<path d="M6 6l12 12M18 6L6 18"/>` |
| info | `.mv-icon--info` | `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>` |
| tip | `.mv-icon--tip` | `<path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M9.5 18.5h5M10.5 21h3"/>` |
| warning | `.mv-icon--warning` | `<path d="M10.3 4.2L2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>` |
| scan | `.mv-icon--scan` | `<path d="M4 6h10M4 12h10M4 18h10"/><path d="M19 4v14M16 15l3 3 3-3"/>` |
| index | `.mv-icon--index` | `<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>` |
| clock | `.mv-icon--clock` | `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>` |
| copy | `.mv-icon--copy` | `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>` |
| share | `.mv-icon--share` | `<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>` |
| chevron | `.mv-icon--chevron` | `<path d="M9 6l6 6-6 6"/>` (points right; rotate with `transform: rotate(90deg)` for down, `180deg` for left) |

The `M12 8h.01` segments are dots: with round caps a 0.01 px line renders as
a round dot of the stroke width.

## 9. Motion and accessibility

### 9.1 Motion

Motion explains a change of state. Nothing moves when nothing changed.

| Name | Purpose | Duration token | Easing token | What animates |
|---|---|---|---|---|
| `hover` | colour feedback | `--dur-instant` (80 ms) | `--ease-out` | `color`, `background-color`, `border-color` |
| `press` | drawer chevron, segmented selection, tooltip in | `--dur-fast` (120 ms) | `--ease-out` | `transform: rotate`, `background-color`, `opacity` |
| `log-in` | a new run-log line | `--dur-base` (200 ms) | `--ease-out` | `opacity` 0 to 1 and `translate` from `0 var(--motion-distance)` (4 px) to 0; each line starts `--stagger-log` (30 ms) after the previous one; only the first 8 lines of a run are staggered, the rest start with the 8th |
| `reveal` | a callout, a stat or the chart appears after a run | `--dur-base` (200 ms) | `--ease-out` | `opacity` 0 to 1, `translate` 4 px to 0 |
| `bar-grow` | bars after a run | `--dur-chart` (480 ms) | `--ease-out` | `transform: scaleX` (rows) or `scaleY` (columns) from 0 to 1 with `transform-origin` at the baseline; `--stagger-bar` (40 ms) per bar; value labels fade in with `--dur-fast` after their bar ends |
| `step` | step transition | out: `--dur-fast` (120 ms); in: `--dur-slow` (280 ms) | out: `--ease-in`; in: `--ease-out` | out: lesson intro and tasks `opacity` 1 to 0; in: `opacity` 0 to 1 and `translate` 8 px (`--motion-distance-lg`) to 0. The editor card does not animate; only its content changes |
| `progress` | indeterminate run progress | 1200 ms (`--dur-progress`) | `--ease-linear` | the 30 % segment moves left to right, infinite |
| `wiggle` | the step-complete mascot, once (12.5) | `--dur-wiggle` (640 ms) | `--ease-in-out` | `rotate` 0 to -6° to 6° to 0 (`--wiggle-angle`), one iteration; never on hover, never looped |

Easings: `--ease-out` `cubic-bezier(0.2, 0, 0, 1)`, `--ease-in`
`cubic-bezier(0.4, 0, 1, 1)`, `--ease-in-out` `cubic-bezier(0.4, 0, 0.2, 1)`,
`--ease-linear` `linear`.

**prefers-reduced-motion: reduce.** `tokens.css` sets every `--dur-*` and
`--stagger-*` to `0ms` and both `--motion-distance*` to `0px`. Components must
use the tokens, so they stop moving with no extra code. `base.css` must add the
global guard for anything outside the tokens:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

The indeterminate progress bar becomes a static full-width bar at 40 %
opacity. Scrolling to the lesson top on a step change uses `behavior: "auto"`.

### 9.2 Focus ring

- `outline: var(--focus-width) solid var(--color-focus); outline-offset:
  var(--focus-offset)`: 2 px wide, 2 px offset. Inside tight groups (chip,
  segmented option, stepper dot) the offset is `--focus-offset-tight` (1 px).
- The ring colour reaches 5.73:1 (light) and 8.53:1 (dark) against the page,
  above the 3:1 minimum, and also on the editor card (6.35:1, 7.74:1).
- Style only `:focus-visible`. Never `outline: none` without the replacement
  in the same rule. The editor textarea is the exception that is already
  handled: its ring is on the card (6.2).
- On the accent Run button the ring sits outside the button on the header
  background, so it stays visible against the fill.

### 9.3 Keyboard order

DOM order = tab order = reading order:

1. skip link ("Skip to the editor", target the editor textarea) and a second
   skip link ("Skip to the lesson", target the lesson heading)
2. top bar: stepper links (or the compact back and forward buttons), mode
   segmented, Share, theme
3. lesson intro: links in the body (the heading takes focus only
   programmatically, after a step change)
4. workbench: code-editor header (Reset, Copy, Run), the editor textarea
   (Tab indents inside it; Escape then Tab leaves it, as the editor already
   says in its hint), the resize grip, run-log Clear, the run-log body
   (scrollable, `tabindex="0"`), chart bars (only if interactive), drawers
5. lesson tasks: links and actions in "try this" and callouts, previous, next

Shortcuts: Ctrl+Enter / ⌘+Enter runs (`aria-keyshortcuts="Control+Enter
Meta+Enter"` on the Run button). Alt+Left and Alt+Right are not used (the
browser owns them).

### 9.4 ARIA

| Component | Roles and attributes |
|---|---|
| run-log body | `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`, `aria-label="Run log"`. Append one run as one `.mv-run-log__run` node, so a screen reader reads the run once, not line by line in fragments. Icons are `aria-hidden`; the type is in the text (`plan`, `event built`) |
| run status | a visually hidden `role="status"` element in the code-editor header announces "Running" and "Run 3 finished: 12 lines, 1 index built" |
| run-button | `aria-busy="true"` while running; `aria-disabled="true"` before the engine loads; `aria-keyshortcuts` |
| stepper | `nav` with `aria-label="Lesson steps"`, an `ol`, `aria-current="step"` on the current link, a visually hidden "completed" in done items; compact: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext` |
| lesson heading | `h1`, `tabindex="-1"`, receives focus after a step change |
| segmented | `role="group"` + `aria-pressed`, or `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls` |
| callout | `aside` with `role="note"`; never `role="alert"` (a callout is not urgent) |
| bar-chart | `figure`; the `svg` has `role="img"` and `aria-labelledby` (title + hidden description); a visually hidden `table` holds the values |
| stat | `role="group"` with `aria-labelledby` the label |
| drawer | native `details` / `summary` (no extra ARIA) |
| tooltip | `role="tooltip"`, linked by `aria-describedby` |
| editor | its own ARIA from `editor.js` (combobox, listbox); do not add more |

### 9.5 Target sizes

- Minimum hit area 24 × 24 px for every control (WCAG 2.2, 2.5.8 AA).
- `--control-h`: 32 px for a fine pointer, 44 px under `@media (pointer:
  coarse)` (set in `tokens.css`). The Run button is 36 px fine, 44 px coarse
  (`--run-h`).
- Chips and stepper dots keep their visible size and grow their hit area with
  a transparent pseudo-element under `pointer: coarse`.

### 9.6 Colour is never the only carrier

| Meaning | Colour | Second carrier |
|---|---|---|
| callout kind | role colour | icon and the first word of the title |
| run-log line type | icon colour | icon shape and the keyword (`plan`, `event built`) |
| index built / dropped | success / warning | the words "built" / "dropped", index / cross icon |
| series | series colour | marker shape, dash pattern, direct label |
| below the clock resolution | none | hatch, dashed outline, `<` in the label, caption text |
| current step | teal mascot in the dot | `aria-current`, the visible title in the `hand-sm` step |
| done step / task | sun mascot (stepper), success fill (task) | a face instead of a number (stepper), check icon (task), hidden "completed" text |
| editor error | terracotta squiggle (the only squiggle inside the editor, 12.2) | gutter dot, status-line text, `aria-describedby` message |
| selected chip or segment | accent / raised fill | weight 600, `aria-pressed` |
| link | accent text | underline |

## 10. Theming contract

Every custom property that the page CSS and `editor.css` may read. All are
defined in `tokens.css`. A property marked **(themed)** has a light value in
`:root` and a dark value in both dark selectors, with identical keys in the
two dark blocks (73 keys: the 64 original ones and 9 of the handmade layer). The page CSS must not define any custom property
of its own except component-local ones that start with `--_` (for example
`--_bar-delay` inside the chart).

**Palette (raw ramps; components should prefer the roles):**
`--neutral-0`, `--neutral-25`, `--neutral-50`, `--neutral-100`,
`--neutral-200`, `--neutral-300`, `--neutral-400`, `--neutral-500`,
`--neutral-600`, `--neutral-700`, `--neutral-800`, `--neutral-900`,
`--neutral-950`; `--night-950`, `--night-900`, `--night-850`, `--night-800`,
`--night-750`, `--night-700`, `--night-600`, `--night-500`, `--night-400`,
`--night-300`, `--night-200`, `--night-100`; `--brand-50`, `--brand-100`,
`--brand-200`, `--brand-300`, `--brand-400`, `--brand-500`, `--brand-600`,
`--brand-700`, `--brand-800`, `--brand-900`.

**Surfaces (themed):** `--color-bg`, `--color-surface`,
`--color-surface-inset`, `--color-surface-sunken`, `--color-surface-raised`,
`--color-surface-selected`.

**Text and lines (themed):** `--color-text`, `--color-text-secondary`,
`--color-text-muted`, `--color-faint`, `--color-border`,
`--color-border-strong`, `--color-grid`, `--color-grid-strong`.

**Interactive (themed):** `--color-accent`, `--color-accent-hover`,
`--color-accent-active`, `--color-on-accent`, `--color-accent-subtle`,
`--color-accent-border`, `--color-focus`.

**Status (themed):** `--color-insight`, `--color-insight-bg`,
`--color-insight-border`, `--color-tip`, `--color-tip-bg`,
`--color-tip-border`, `--color-warning`, `--color-warning-bg`,
`--color-warning-border`, `--color-error`, `--color-error-bg`,
`--color-error-border`, `--color-success`, `--color-success-bg`,
`--color-success-border`, `--color-highlight`, `--color-highlight-bg`.

**Tooltip (themed):** `--color-tooltip-bg`, `--color-tooltip-text`,
`--color-tooltip-border`.

**Data (themed):** `--series-1`, `--series-2`, `--series-3`, `--chart-axis`,
`--chart-axis-line`, `--chart-grid`, `--chart-annotation`, `--chart-hatch-bg`.

**Handmade layer, themed (section 12):** `--paper-grid-line`,
`--color-crayon`, `--decor-coral`, `--decor-sun`, `--decor-leaf`,
`--decor-periwinkle`, `--decor-plum`, `--decor-blush`,
`--squiggle-pattern-opacity`. The `--decor-*` colours are for decoration only
(12.2).

**Elevation:** `--shadow-0`; themed: `--shadow-1`, `--shadow-2`,
`--shadow-3`, `--shadow-segment`.

**Syntax (themed, read by `editor.css`):** `--tk-com`, `--tk-str`,
`--tk-num`, `--tk-kw`, `--tk-field`, `--tk-pred`, `--tk-query`,
`--tk-term`, `--tk-write`, `--tk-help`, `--tk-punct`.

**Fonts:** `--font-display`, `--font-sans`, `--font-mono`, `--font-weight-regular`,
`--font-weight-medium`, `--font-weight-semibold`, `--font-weight-bold`.

**Type scale** (each of `display`, `title`, `heading`, `lead`, `body`,
`small`, `label`, `overline`, `code`, `code-sm`, `stat`, `hand`, `hand-sm` has
four tokens): `--text-<step>-size`, `--text-<step>-lh`,
`--text-<step>-weight`, `--text-<step>-tracking`; the display-face steps add
`--text-display-font`, `--text-stat-font`, `--text-hand-font`,
`--text-hand-sm-font`; plus `--measure`, `--measure-narrow`. `display` and
`stat` change below 960 px.

**Spacing:** `--space-0`, `--space-1`, `--space-2`, `--space-3`,
`--space-4`, `--space-5`, `--space-6`, `--space-8`, `--space-10`,
`--space-12`, `--space-16`, `--space-20`.

**Layout** (responsive): `--layout-max`, `--layout-gutter`,
`--layout-text-col`, `--layout-col-gap`, `--layout-stacked-max`,
`--topbar-h`.

**Shape:** `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`,
`--radius-pill`, `--border-width`, `--border-width-strong`, `--border`,
`--border-control`.

**Controls and focus:** `--control-h`, `--run-h`, `--target-min`
(`--control-h` and `--run-h` change under `pointer: coarse`),
`--focus-width`, `--focus-offset`, `--focus-offset-tight`.

**Motion** (zero under reduced motion): `--dur-instant`, `--dur-fast`,
`--dur-base`, `--dur-slow`, `--dur-chart`, `--dur-progress`,
`--stagger-log`, `--stagger-bar`, `--motion-distance`,
`--motion-distance-lg`; easings (not changed): `--ease-out`, `--ease-in`,
`--ease-in-out`, `--ease-linear`.

**Layers:** `--z-sticky`, `--z-drawer`, `--z-popover`, `--z-tooltip`,
`--z-skip`.

**Handmade layer, theme-independent (section 12):** paper: `--paper-grid`,
`--paper-grid-size`; shape: `--radius-wobble-sm`, `--radius-wobble-md`,
`--radius-wobble-lg`, `--radius-wobble-blob`, `--border-width-hand`,
`--border-hand`, `--stroke-hand`; crayon: `--shadow-crayon`,
`--shadow-crayon-pressed`, `--crayon-press`; images: `--img-squiggle-underline`,
`--img-squiggle-divider`, `--img-squiggle-pattern`, `--img-face-sun`,
`--img-face-teal`, `--img-face-coral`, `--img-face-sleepy` (each a `url()`
relative to `css/`, so use them only from stylesheets in `css/`); sizes:
`--squiggle-underline-h`, `--squiggle-underline-w`, `--squiggle-divider-w`,
`--squiggle-divider-h`, `--squiggle-band-h`, `--squiggle-tile`,
`--mascot-sm`, `--mascot-md`, `--mascot-lg`; motion (zero under reduced
motion): `--dur-wiggle`, `--wiggle-angle`.

**Font faces:** `tokens.css` also holds the two `@font-face` rules (Shantell
Sans 700 and Nunito 400 to 700, 12.6). They are not custom properties.

**Run log** (resolve through the roles): `--log-value`, `--log-timing`,
`--log-plan`, `--log-keyword`, `--log-icon`, `--log-icon-index`,
`--log-build`, `--log-drop`, `--log-trial`.

**Editor aliases** (defined once in `:root` as `var()` of a role, so they
follow the theme; `editor.css` reads them and must keep working unchanged):
`--bg`, `--panel`, `--panel-2`, `--ink`, `--muted`, `--line`,
`--grid-strong`, `--accent`, `--focus`, `--bad`, `--warn`, `--good`,
`--highlight`, `--sans`, `--mono`. `editor.css` also reads `--ed-pad-x` and
`--ed-pad-y`, which it defines itself on `.ed`; `tokens.css` does not define
them.

The new page CSS must use the role names (`--color-*`), not the aliases. The
aliases exist only for `editor.css`.

How I checked completeness: a script parsed `tokens.css` and `editor.css`. It
found 280 properties in `:root` (228 before the handmade layer), 73 in each dark block, identical keys and
values in the two dark blocks, every dark key present in `:root`, and every
`var(--…)` in `editor.css` defined (except the two `--ed-*` locals). Run the
same check after any change (item 18 in section 11).

## 11. Implementation checklist

The lead verifies these in a browser at 1280 × 800 and 390 × 844, in light
and dark, unless an item says otherwise.

1. The page loads no font, image or stylesheet from another origin (DevTools
   Network: all requests same origin). Filter "Font": exactly two files,
   `fonts/shantell-sans-700-latin.woff2` and `fonts/nunito-400-700-latin.woff2`,
   86 KB together.
2. At 1280 px the lesson column is 400 px wide, the column gap is 48 px, and
   the editor card's left edge is at 32 + 400 + 48 = 480 px from the content
   start. No horizontal scroll bar at 1280, 1024, 768, 390 and 320 px.
3. At 390 px the order from the top is: top bar, compact stepper, overline,
   heading, goal, body, code-editor, run-log, "Try this", callouts, prev/next.
4. Exactly one control has an accent fill on any screen: the Run button.
   The only other accent fills allowed are the 4 px compact progress bar, the
   2 px run progress bar and the skip link while it has focus.
5. Exactly one `h1` per screen, in `display` size (32 px at 1280, 26 px at
   390), in Shantell Sans 700 (DevTools, Computed, "Rendered Fonts").
6. The editor card has a shadow in light and no shadow in dark; the run log
   has no shadow in either theme and is visibly flatter than the editor.
7. Syntax colours in light and dark match the table in 2.8 (inspect one token
   of each class with DevTools). With a step that highlights a line, the
   comment text on that line still reads (contrast tool: at least 4.5:1).
8. Toggle the theme button and the system preference: `data-theme="light"`
   on `<html>` forces light even when the system is dark; `data-theme="dark"`
   forces dark; no attribute follows the system.
9. Run a script: lines appear in the run log with a short fade and 4 px rise,
   staggered; a screen reader (NVDA or VoiceOver) reads the run once as a
   whole, and the hidden status says "Run n finished".
10. Each run-log line type shows its icon and keyword: plan (scan or index
    icon), event built (index icon, leaf green, the word "built"), event dropped
    (cross icon, mustard, "dropped"), timing (clock), insight (info icon on the
    tinted row), error (cross, terracotta row).
11. The three callouts show icon + title word ("Insight", "Try", "Careful")
    and pass a greyscale check (DevTools Rendering, emulate achromatopsia):
    every callout kind is still identifiable.
12. In the bar chart: the axis starts at 0, is linear, has direct labels at
    each bar and no legend box; a value under the clock resolution is a
    hatched, dashed-outline bar labelled `< 5 µs` (or the actual
    resolution); emulate deuteranopia, protanopia and tritanopia: the series
    are told apart by marker and label.
13. Tab from the address bar: the first stop is the skip link; the order then
    follows 9.3. Every focused element shows a 2 px ring in `--color-focus`;
    the editor shows the ring on the card while typing.
14. Ctrl+Enter (⌘+Enter on macOS) in the editor runs the script; the Run
    button shows "Running" with `aria-busy="true"` and the 2 px progress bar.
15. With `prefers-reduced-motion: reduce` emulated, nothing moves: log lines,
    bars, step changes and the drawer chevron change at once; the progress bar
    is static.
16. With touch emulation (`pointer: coarse`), buttons, segmented options and
    the Run button are 44 px high; chips keep 24 px visible height with a 44
    px hit area.
17. Stepper: the current step has `aria-current="step"` and
    its title visible in the display face and the teal mascot in its dot (never a solid accent fill); done steps show the sun mascot and "completed" for screen
    readers; at 390 px the progress bar has `role="progressbar"` with correct
    `aria-valuenow`.
18. Token completeness: no `var(--x)` in any page CSS file refers to a
    property that `tokens.css` does not define (DevTools shows no "invalid
    variable" or grep `var\(--` against section 10), and no hex colour
    appears in any CSS file other than `tokens.css` and the fallbacks in
    `editor.css`.
19. Numbers in the run log, stats and chart use tabular figures (a column of
    times aligns on the last digit) and carry a unit with a narrow no-break
    space.
20. Zoom to 200 % at 1280 px: the layout becomes stacked, no text is cut
    off, nothing overlaps.

Items 21 to 30, for the handmade layer, are in section 12.8.

## 12. Mood board: handmade layer

The owner gave five mood board images and asked for a working design system
that keeps the existing work. This section records the translation. It is
additive: no token or class name changed or disappeared. Existing tokens got
new values (sections 2 and 3), and the new tokens and `mv-*` classes below
are new names. The common thread of the five images is handmade, cosy and
warm: cream paper, wobbly shapes, chunky hand lettering, playful scribbles,
friendly characters, and muted earth colours with a few saturated accents.

### 12.1 Translation rationale

| Image | What it shows | Decisions it drove |
|---|---|---|
| 1. "Nature bedroom" | sage and olive walls, deep teal-green bedding, amber fairy lights, wood, plants; hand-lettered cream capitals with a dark green outline | brown-green ink `#2a2b1f` instead of black; sage tip and leaf success roles; the dark theme "night forest" (`#121611` green-black, cream ink `#eeeadb`, amber warning `#e6bd5c`); the crayon shadow in dark ink |
| 2. Hand-painted grid wall | wobbly squares in terracotta, mustard, sage, dusty teal and blush on cream | the series colours (terracotta, dusty teal, mustard); warning mustard and error terracotta; the wobbly radii (`--radius-wobble-*`); the cream page `#f7f0e1` |
| 3. Graph-paper notebook | fine tan grid, pencil maths doodles, smiling circle characters in yellow, teal and coral with crayon fills, stars | the graph-paper page (`--paper-grid`); the four mascots and their crayon hatching; the sun, teal and coral faces; sparkles on the coral face |
| 4. "RABBIT WISHING" | chunky periwinkle marker lettering on cream, small accents in yellow, pink, purple and coral | the periwinkle accent `#4b53b8` and insight role; the display face Shantell Sans (a marker hand); the squiggle underline under display titles |
| 5. Squiggle pattern | thick rounded loops, coils and flowers in coral, sunflower, green, periwinkle, purple and pink on white | the six `--decor-*` colours; `squiggle-pattern.svg` for the footer band; the squiggle divider and the stepper connectors; plum keywords and raspberry terminals in the syntax palette |

What was not taken: the capitals of images 1 and 4 (sentence case reads
faster), the outline lettering of image 1 (it fails at 26 px), saturated
colour behind text, and anything inside the code, the log or the chart.

### 12.2 Restraint rule

**This is still a precise engineering tool.** Decoration lives at the edges
of the page: the headings, the stepper, empty states and the
step-complete moment. It never sits behind or inside code, run-log lines,
chart marks or any text a reader must parse, and it never carries meaning:
an element that tells the reader something (a status, a series, a control
state) keeps the colour roles, icons and words of sections 2 to 9. The
`--decor-*` colours appear only on decoration. The hierarchy of section 5
does not change: the display face only replaces the sans in elements that
were already at their level, and no decoration is larger or louder than the
element it belongs to. If in doubt, use no
decoration.

| Component | Decoration allowed here | Forbidden here |
|---|---|---|
| page (`.mv-page`, `body`) | the graph paper (`--paper-grid`) behind everything that has no card | the graph paper on any card, inset, popover or the top bar |
| top bar (6.15) | the stepper below; nothing else | paper, mascots outside the stepper, display face on the brand |
| lesson heading (6.1) | display face, squiggle underline | mascots, pattern |
| goal line and body (6.1) | none (they sit on the paper) | display face, squiggles, mascots |
| "Try this" (6.1) | `hand` heading, `--radius-wobble-blob` numbers | squiggles under items |
| code-editor (6.2) | the run button's crayon shadow and wobble radius only | paper, texture, wobble on the card, display face, mascots, any decorative squiggle (the editor's terracotta error squiggle must stay the only squiggle in the editor) |
| run-log (6.4) | the empty state only: sleepy mascot and `hand` title | anything on or between log lines, paper, wobble on the card, pattern |
| callout (6.5) | wobble radius, 2 px border | texture, squiggles, mascots, display face in the body |
| syntax-card (6.6) | wobble radius, 2 px border, wobbly chips | decoration in the grammar line |
| annotated-code (6.7) | none | anything |
| stepper (6.8) | squiggle connectors, blob dots, teal and sun mascots, `hand-sm` title, squiggle progress bar | pattern, wiggle |
| stat (6.9) | display face for the number | mascots, squiggles, colour on the number |
| chip (6.10) | `--radius-wobble-sm` | decor colours |
| segmented (6.11) | `--radius-wobble-md` on the track | display face |
| bar-chart (6.12, 7) | none | display face, squiggles, mascots, paper, wobbly bars, decor colours |
| drawer (6.13), tooltip (6.14) | none | anything |
| step-complete (12.5) | coral mascot with one wiggle, `hand` title, squiggle divider, wobble radius | more than one per screen |
| page footer | none: plain text only (the owner removed the pattern band and the divider) | pattern band, divider, mascots, any decoration |

### 12.3 Paper, shape and crayon

**Graph paper.** `--paper-grid` is two `repeating-linear-gradient` layers
(0° and 90°) that draw a 1 px `--paper-grid-line` every `--paper-grid-size`
(24 px, a multiple of the 4 px spacing base):

```css
--paper-grid:
  repeating-linear-gradient(0deg, var(--paper-grid-line) 0 1px, transparent 1px var(--paper-grid-size)),
  repeating-linear-gradient(90deg, var(--paper-grid-line) 0 1px, transparent 1px var(--paper-grid-size));
```

`--paper-grid-line` is `rgb(150 120 70 / 0.11)` in light (a tan rule,
`#ece3d0` on the page) and `rgb(190 210 170 / 0.06)` in dark. Apply it as
`.mv-paper { background-color: var(--color-bg); background-image: var(--paper-grid); }`
on `body` (or `.mv-page`). Every card already has a solid background, so the
grid stops at its edge. Text on the paper keeps AA even where two rules
cross (the darkest pixel): light `--color-text-muted` 4.86:1, `--color-text`
10.08:1, link `--color-accent` 4.57:1; dark `--color-text-muted` 6.47:1,
`--color-accent` 6.68:1. Do not make the rule darker than this.

**Wobbly radii.** Each `--radius-wobble-*` is an 8-value `border-radius`
(four horizontal radii, a slash, four vertical radii) with no two corners
alike, so a box looks drawn by hand:

| Token | Value | Use |
|---|---|---|
| `--radius-wobble-sm` | `5px 8px 6px 9px / 8px 5px 9px 6px` | chips, the run button |
| `--radius-wobble-md` | `8px 12px 9px 13px / 12px 8px 13px 9px` | segmented track, step-complete action button |
| `--radius-wobble-lg` | `14px 10px 16px 11px / 11px 15px 10px 14px` | callouts, syntax-card, step-complete, run-log empty state |
| `--radius-wobble-blob` | `52% 48% 55% 45% / 47% 55% 45% 53%` | stepper dots, "try this" numbers |

A focus ring follows the radius (`outline` follows `border-radius` in all
current engines), so no extra rule is needed.

**Hand strokes.** `--border-width-hand` (2 px) for the decorated cards and
the stepper ring, `--border-hand` (`2px solid var(--color-border)`), and
`--stroke-hand` (2 px) for squiggles and the 24 px icons (section 8, was
1.75). Structural 1 px borders (`--border`) stay on the editor, the run log,
drawers and dividers.

**Crayon shadow.** A hard offset shadow with no blur, like a crayon outline
that slipped: `--shadow-crayon` (`3px 3px 0 0 var(--color-crayon)`) on the
run button only. On `:active` it becomes `--shadow-crayon-pressed` (1 px)
and the button moves by `--crayon-press` (2 px) so it meets its shadow. The
change is instant (no transition), so it is not motion in the sense of 9.1.
`--color-crayon` is ink `#2a2b1f` in light and periwinkle `#3d4688` in dark
(black would not show on the night-forest header). The current stepper dot
gets no shadow: its mascot already marks it, and a second hard shadow in the
top bar would compete with the run button (P2).

### 12.4 Squiggles

Three SVG files in `playground/web/img/`. The two line files are drawn in
black and used as CSS masks, so the colour comes from a token and follows
the theme. The pattern is multi-coloured and used as a background image.

| File | Size | Use | How |
|---|---|---|---|
| `squiggle-underline.svg` | 48 × 12 tile, stroke 2.6, seamless (start and end at the same height and slope) | under display titles; stepper connectors; compact stepper progress | `mask: var(--img-squiggle-underline) left center / auto 100% repeat-x` |
| `squiggle-divider.svg` | 240 × 24, one line with a loop in the middle | `.mv-squiggle-divider` | `mask: var(--img-squiggle-divider) center / 100% 100% no-repeat` |
| `squiggle-pattern.svg` | 160 × 160 tile, six board colours, every mark inside 6 to 154 so the tile repeats without seams | `.mv-squiggle-band` (page footer, empty states other than the run log) | `background: var(--img-squiggle-pattern) center / var(--squiggle-tile) repeat` |

Classes:

```css
/* under a display title; also applied to .mv-lesson-step__heading::after */
.mv-squiggle-underline::after {
  content: "";
  display: block;
  width: min(100%, var(--squiggle-underline-w));   /* 9em */
  height: var(--squiggle-underline-h);             /* 10px */
  margin-top: var(--space-1);
  background: var(--_squiggle-color, var(--decor-coral));
  -webkit-mask: var(--img-squiggle-underline) left center / auto 100% repeat-x;
          mask: var(--img-squiggle-underline) left center / auto 100% repeat-x;
}
.mv-squiggle-underline--sun { --_squiggle-color: var(--decor-sun); }
.mv-squiggle-underline--leaf { --_squiggle-color: var(--decor-leaf); }
.mv-squiggle-underline--periwinkle { --_squiggle-color: var(--decor-periwinkle); }

/* an <hr> */
.mv-squiggle-divider {
  height: var(--squiggle-divider-h);
  width: min(100%, var(--squiggle-divider-w));
  margin: var(--space-6) auto;
  border: 0;
  background: var(--color-faint);
  -webkit-mask: var(--img-squiggle-divider) center / 100% 100% no-repeat;
          mask: var(--img-squiggle-divider) center / 100% 100% no-repeat;
}

/* an empty, aria-hidden strip; never behind text */
.mv-squiggle-band {
  height: var(--squiggle-band-h);                  /* 80px */
  background: var(--img-squiggle-pattern) center / var(--squiggle-tile) repeat;
  opacity: var(--squiggle-pattern-opacity);        /* 1 light, 0.7 dark */
}
```

The underline under the lesson heading does not change the spacing of 6.1:
`--space-3` from heading to goal is measured from the bottom of the
underline. The page footer carries no decoration (the owner removed the pattern band and
the divider).

### 12.5 Mascots, the stepper and the step-complete moment

Four SVG faces in `playground/web/img/`, each a 64 × 64 viewBox: a sketchy,
slightly uneven circle (a Catmull-Rom curve through 9 jittered points, with
the stroke running a little past its start like a pencil), crayon hatching
inside, a smile, pink cheeks, tiny arms and legs. The ink strokes have a
cream underlay (`#fffaf0`, 6 px), so the mascot reads as a sticker on both
the cream page and the night-forest page. Each file is under 3 KB.

| File | Body | Expression | Where it appears (only here) | Size |
|---|---|---|---|---|
| `face-teal.svg` | dusty teal `#7fb3ae` | calm smile, one arm waves | the current step dot in the stepper | `--mascot-sm` 28 px |
| `face-sun.svg` | sunflower `#f5c842`, four rays | happy closed eyes, open grin, arms up | done step dots in the stepper | `--mascot-sm` 28 px |
| `face-sleepy.svg` | periwinkle `#a9b1ea` | closed eyes, small "o" mouth, "z z" | the run-log empty state | `--mascot-md` 48 px |
| `face-coral.svg` | coral `#ef8a6b`, three sparkles | happy closed eyes, open grin, arms up | the step-complete moment | `--mascot-lg` 72 px |

A mascot is always decorative: `aria-hidden="true"`, and the meaning it
decorates is also in text (the visually hidden "completed", the current
step title, the empty-state line, the step-complete title). Outside the
stepper, at most one mascot is visible per screen.

```css
.mv-mascot { display: inline-block; flex: none; width: var(--mascot-md); height: var(--mascot-md); background: center / contain no-repeat; }
.mv-mascot--sm { width: var(--mascot-sm); height: var(--mascot-sm); }
.mv-mascot--lg { width: var(--mascot-lg); height: var(--mascot-lg); }
.mv-mascot--teal { background-image: var(--img-face-teal); }
.mv-mascot--sun { background-image: var(--img-face-sun); }
.mv-mascot--sleepy { background-image: var(--img-face-sleepy); }
.mv-mascot--coral { background-image: var(--img-face-coral); }
.mv-mascot--wiggle { animation: mv-wiggle var(--dur-wiggle) var(--ease-in-out) 1; }
@keyframes mv-wiggle {
  0%, 100% { rotate: 0deg; }
  25% { rotate: calc(-1 * var(--wiggle-angle)); }
  75% { rotate: var(--wiggle-angle); }
}
```

Markup: `<span class="mv-mascot mv-mascot--sleepy" aria-hidden="true"></span>`.
A CSS background keeps the image path in `css/` and needs no `alt`.

**Stepper.** The hand-drawn stepper is specified in the table at the end of
6.8: squiggle connectors, plain blob dots with numbers for upcoming steps,
`face-teal` for the current step and `face-sun` for done steps. The dot of
the current and done steps grows from 24 px to 28 px inside the unchanged
32 px hit area, so the top bar does not change height. The connector grows
from 12 px to 16 px; ten steps need 10 × 32 + 9 × 16 = 464 px.

**Run-log empty state.** `.mv-run-log__empty` becomes a flex row: the sleepy
mascot (48 px), `--space-3` gap, then an optional `hand` title "Nothing ran
yet" above the existing `small` line. Padding `var(--space-4)`. No pattern,
no paper.

**Step complete.** A new block that appears once, when the experience spec
marks the step done (its check passes or all "try this" items are done). It
sits in `.mv-lesson-step__tasks`, above `.mv-lesson-step__nav`, with
`--space-6` above it. Its level is the same as a callout (secondary, note).

1. `.mv-step-complete` (`section`, `role="status"` so a screen reader reads
   the title once): `display: grid; grid-template-columns: var(--mascot-lg) minmax(0, 1fr);
   column-gap: var(--space-4); align-items: center; padding: var(--space-4);
   background: var(--color-surface); border: var(--border-width-hand) solid
   var(--color-success-border); border-radius: var(--radius-wobble-lg)`
2. `.mv-step-complete__mascot`: `.mv-mascot mv-mascot--coral mv-mascot--lg mv-mascot--wiggle`
3. `.mv-step-complete__title`: `hand` step, `--color-text`: "Step 3 done"
4. `.mv-step-complete__text`: `small`, `--color-text-secondary`, max
   `--measure-narrow`: one sentence that says what the step showed
5. `.mv-step-complete__action` (optional, column 2): the next-step button
   (`.mv-button--secondary` with `--radius-wobble-md`), `--space-3` above

Motion: the block enters with `reveal` (9.1); the mascot wiggles once
(`--dur-wiggle` 640 ms, ±`--wiggle-angle` 6°, `--ease-in-out`). It never
loops and never wiggles again on hover. Under `prefers-reduced-motion:
reduce` both tokens are zero (`tokens.css`), so the mascot does not move and
the global guard of 9.1 stops the animation too.

### 12.6 Fonts: choice and fetch list

**Display: Shantell Sans 700.** A marker handwriting face (Arrow Type, from
the hand of the artist Shantell Martin), SIL Open Font License 1.1. It is the
closest to the chunky marker lettering of image 4 and the hand-lettered
title of image 1: round, slightly irregular strokes and a friendly
lowercase, yet it was drawn for reading, so it stays clear at 26 to 40 px.
Rejected: Gochi Hand and Patrick Hand (too thin and slanted at 32 px),
Chewy (cartoon weight, weak lowercase), Fredoka and Baloo 2 (friendly but
geometric: no hand). Only the `wght` axis at 700 is fetched (static
instance), which keeps it at 47 KB; the informal and bounce axes stay at
their defaults.

**Body: Nunito, variable 400 to 700.** A balanced sans with rounded
terminals, OFL 1.1. The rounded ends echo the marker face, the apertures are
open, and it reads well at 13 to 18 px. Fallback is the old system stack, so
the page still works if the file is missing.

**Code** stays the system monospace (3.1). Nothing changes in the editor.

| Save as | Google Fonts CSS2 URL (open with a current Chrome user agent; take the `/* latin */` block) | woff2 source (the `src` of that block, checked 2026-10-29) | Bytes |
|---|---|---|---|
| `playground/web/fonts/shantell-sans-700-latin.woff2` | `https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@700&display=swap` | `https://fonts.gstatic.com/s/shantellsans/v13/FeUaS0pCoLIo-lcdY7kjvNoQqWVWB0qWpl29ajppTuUTu_kJKmHesPOL-maYi4xZeHCNQ09eBlmv2QcUzJ39-rAISYSbTFixwv0.woff2` | 47 224 |
| `playground/web/fonts/nunito-400-700-latin.woff2` | `https://fonts.googleapis.com/css2?family=Nunito:wght@400..700&display=swap` | `https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2` | 39 128 |
| `playground/web/fonts/OFL-ShantellSans.txt` | n/a | `https://raw.githubusercontent.com/google/fonts/main/ofl/shantellsans/OFL.txt` | 4 397 |
| `playground/web/fonts/OFL-Nunito.txt` | n/a | `https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt` | 4 385 |

Total font weight: 86 352 bytes (84 KiB), under the 150 KB budget. The OFL
requires the licence to travel with the font files, so keep the two text
files next to them.

Unicode range (Latin only, the same for both files; it covers `µ`, `×`, the
narrow no-break space U+202F and the thin space U+2009 that 3.4 needs):
`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
U+2215, U+FEFF, U+FFFD`.

`font-display: swap` for both: the text shows at once in the fallback and
swaps when the file arrives (same origin, so in well under a second). The
`@font-face` rules are at the top of `tokens.css`; their `src` is
`url("../fonts/…")`, relative to `css/`. Fallback stacks are the
`--font-display` and `--font-sans` values in 3.1.

### 12.7 What the implementation adds

New tokens (all in `tokens.css`, section "handmade layer"): themed
`--paper-grid-line`, `--color-crayon`, `--decor-coral`, `--decor-sun`,
`--decor-leaf`, `--decor-periwinkle`, `--decor-plum`, `--decor-blush`,
`--squiggle-pattern-opacity`; theme-independent `--font-display`,
`--text-display-font`, `--text-stat-font`, `--text-hand-*` (5),
`--text-hand-sm-*` (5), `--paper-grid`, `--paper-grid-size`,
`--radius-wobble-sm`, `--radius-wobble-md`, `--radius-wobble-lg`,
`--radius-wobble-blob`, `--border-width-hand`, `--border-hand`,
`--stroke-hand`, `--shadow-crayon`, `--shadow-crayon-pressed`,
`--crayon-press`, `--img-squiggle-underline`, `--img-squiggle-divider`,
`--img-squiggle-pattern`, `--img-face-sun`, `--img-face-teal`,
`--img-face-coral`, `--img-face-sleepy`, `--squiggle-underline-h`,
`--squiggle-underline-w`, `--squiggle-divider-w`, `--squiggle-divider-h`,
`--squiggle-band-h`, `--squiggle-tile`, `--mascot-sm`, `--mascot-md`,
`--mascot-lg`, `--dur-wiggle`, `--wiggle-angle`.

New classes: `.mv-paper`, `.mv-squiggle-underline` (+ `--sun`, `--leaf`,
`--periwinkle`), `.mv-squiggle-divider`, `.mv-squiggle-band`, `.mv-mascot`
(+ `--sm`, `--lg`, `--teal`, `--sun`, `--sleepy`, `--coral`, `--wiggle`),
`.mv-step-complete` (+ `__mascot`, `__title`, `__text`, `__action`), and the
keyframes `mv-wiggle`.

Changed rules on existing classes (names unchanged):
`.mv-lesson-step__heading` (display face, `::after` underline),
`.mv-lesson-step__try-heading` (`hand`), `.mv-lesson-step__try-num`
(blob radius), `.mv-run-button` (wobble radius, crayon shadow, pressed
state), `.mv-run-log__empty` (sleepy mascot, optional `hand` title),
`.mv-callout` (wobble radius, 2 px border), `.mv-syntax-card` (wobble
radius, `--border-hand`), `.mv-stepper__item::before`, `.mv-stepper__dot`,
`.mv-stepper__title`, `.mv-stepper__progress`, `.mv-stepper__progress-fill`
(6.8), `.mv-stat__value` (display face), `.mv-chip` (wobble radius),
`.mv-segmented` (wobble radius), `.mv-page__footer` (plain text), every `.mv-icon` (stroke 2), and `body` (`.mv-paper`).

### 12.8 Checklist additions

21. The page background shows the graph-paper grid; the code-editor card,
    the run log, the tooltip, the autocomplete and the top bar show none
    (zoom a screenshot to 400 % at their edges).
22. No decoration inside the code editor, the run-log lines or the chart:
    the only squiggle in the editor is the error squiggle, and the chart has
    no display face, mascot or decor colour.
23. Shantell Sans appears only in the lesson heading, the stat number, the
    stepper's current-step title, "Try this", the step-complete title and
    the run-log empty-state title (DevTools, "Rendered Fonts" on each text
    node in a full step).
24. With the two font files removed, the page still renders in the fallback
    stacks with no layout break and no console error other than the two
    404s.
25. The lesson heading has the coral squiggle underline in both themes,
    and the gap from the underline to the goal line is 12 px.
26. Stepper at 1280 px: upcoming steps are blob rings with numbers, the
    current step shows the teal face, done steps show the sun face, and the
    connectors are squiggles (green after a done step). The top bar stays
    56 px high.
27. The run button has a 3 px hard offset shadow at rest; pressed, it moves
    2 px and the shadow shrinks to 1 px; the focus ring still shows outside
    the button.
28. Before the first run the run log shows the sleepy face and the empty
    line; the first run removes both.
29. Completing a step shows one step-complete card with the coral face; the
    face wiggles once. With `prefers-reduced-motion: reduce` emulated, the
    card appears without movement and the face does not wiggle.
30. Run the token check of section 10 again: 280 properties in `:root`, 73
    identical keys in both dark blocks, and every `var(--…)` in `base.css`,
    `components.css` and `editor.css` defined.
