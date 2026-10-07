# DESIGN.md: Club table

Task-zero design record. Values live in [design/tokens.css](design/tokens.css); rendered reference in [design/preview.html](design/preview.html). Nothing in the UI may use a colour, size, space, radius or easing that is not in the tokens. Deviations need explicit approval. Decided 2026-10-07; the earlier alternates are archived in `gate1/`.

## Principle
Every visual device must say what it does for a bughouse player, or be cut. The player's real problem is divided attention across two boards; the design's job is to make four clocks, four reserves and two positions readable at a glance.

## Surfaces
Warm matte paper (`--page`), one slightly darker panel (`--panel`), 1 px rules (`--rule`). No shadows, no gradients, no translucency. Containers do not nest. Boards and panels have square corners; controls, badges and clocks use `--radius: 2px`.

## Colour
- **Board identity.** A is clay (`--a-accent`, squares `--a-sq-*`); B is deep teal (`--b-accent`, squares `--b-sq-*`). Each board also has a letter badge and a fixed position (A left, B right). Colour is never the only cue.
- **State.** `--alert` appears only for check, pending and low time. `--clock-run-bg` marks the seat whose clock is running.
- Contrast measured in BRIEF §7.3.

## Type
- **Atkinson Hyperlegible Next** for UI, body and clocks (tabular figures verified).
- **Zilla Slab** for the wordmark, page titles and the result line only.
- Scale: clock 36/28 px, title 28, body 15, small 13 (minimum). No monospace. No italics for emphasis.

## Components
- **Clock strip:** badge, name, seat colour, reserve, clock. The clock is the largest text on screen. Running: dark ground. Low: solid alert ground, weight 800. No pulsing.
- **Reserve:** pieces with count badges; the opponent's at 24 px, yours at 30 px.
- **Spine (44 px):** capture-transfer travel in 420 ms; static highlight under reduced motion.
- **Status line:** plain words per board.
- **Result:** one sentence, both final boards, action list. No confetti.

## Motion
120 ms for piece movement, 420 ms for the transfer, one easing curve (`--ease-out`). Zero under `prefers-reduced-motion`.

## Copy
Dry, concrete, second person. No slogans, exclamation marks, or "Not X. It's Y." constructions.

## Rejection checklist (reference: wpbeaverbuilder.com/avoid-ai-slop-in-web-design)
Reject any change containing: eyebrow labels or decorative monospace captions; italic-accent headlines, gradient text, three-beat slogans; glassmorphism, translucent panels, glows, floating gradients; nested containers without a function; three identical feature cards; decorative emoji or stock icons; values not in the tokens.

## Pieces and assets
Cburnett SVG set (`design/pieces/`), CC BY-SA 3.0, shown at 92% of the square. Fonts self-hosted in `design/fonts/` with their OFL texts. All licences are recorded and verified in `THIRD_PARTY.md`.
