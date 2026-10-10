# DESIGN.md: Club table

Task-zero design record. Values live in [design/tokens.css](design/tokens.css); rendered reference in [design/preview.html](design/preview.html). Decided 2026-10-07; the earlier alternates are archived in `gate1/`.

**The token rule, stated so it can actually be met.** Every colour, type size, weight, spacing step, radius, duration and easing in the UI comes from a token. So do the component dimensions the brief fixes by number: strip heights, the board badge, reserve slot sizes, the control tap target and the square floor. Three things are deliberately outside the token set, because CSS cannot express them as custom properties or because they are intrinsic to one component:

- **Breakpoints.** A media query cannot read a custom property. The two in use are **600 px** (side-by-side boards become stacked) and **1100 px** (full desktop layout). Changing either means changing it in every file that uses it; there is no way around that in plain CSS.
- **Sub-step geometry.** Values below the 4 px spacing step, such as a 2 px gap inside a reserve row or a 1 px rule, and percentage geometry inside a component (a piece at 92% of its square, the promoted mark at 26%).
- **One-off layout maxima**, such as the lobby's reading width. These are stated inline where they apply.

Anything else that is not a token is a defect. Deviations need explicit approval.

## Principle
Every visual device must say what it does for a bughouse player, or be cut. The player's real problem is divided attention across two boards; the design's job is to make four clocks, four reserves and two positions readable at a glance.

## Surfaces
Warm matte paper (`--page`), one slightly darker panel (`--panel`), 1 px rules (`--rule`). No shadows, no gradients, no translucency. Containers do not nest. Boards and panels have square corners; controls, badges and clocks use `--radius: 2px`.

## Colour
- **Board identity.** A is clay (`--a-accent`, squares `--a-sq-*`); B is deep teal (`--b-accent`, squares `--b-sq-*`). Each board also has a letter badge and a fixed position (A left, B right). Colour is never the only cue.
- **State.** `--alert` means *something needs your attention now*: check, pending, low time, a disconnected opponent, a rejected action, a form error, and an armed destructive button. It is never decoration, never a hover, and never used to identify a piece or a board. `--clock-run-bg` marks the seat whose clock is running.
- Contrast measured in BRIEF §7.3.

## Type
- **Atkinson Hyperlegible Next** for UI, body and clocks (tabular figures verified).
- **Zilla Slab** for the wordmark, page titles and the result line only.
- Scale: clock 36/28 px, title 28, body 15, small 13 (minimum). No monospace. No italics for emphasis.

## Components
- **Clock strip:** badge, name, seat colour, reserve, clock. The clock is the largest text on screen. Running: dark ground. Low: solid alert ground, weight 800. No pulsing.
- **Reserve:** pieces with count badges. Yours at `--reserve-slot` (40 px), because it is the row you drag from; the opponent's at `--reserve-slot-opp` (30 px); the glance board at `--reserve-slot-mini` (22 px). The piece you manipulate is the largest.
- **Promoted piece:** a two-tone corner wedge, so it reads on a black piece and a white one alike. Identification is shape, never colour.
- **Spine (44 px):** capture-transfer travel in 420 ms; static highlight under reduced motion.
- **Status line:** plain words per board.
- **Table name:** a table is named, not numbered. `The Rough Parlour`, derived from its id, shown in the heading, the topbar and the page title. The id stays in the URL and is never displayed.
- **Result:** one sentence, both final boards, action list. No confetti.

## Motion
120 ms for piece movement, 420 ms for the transfer, one easing curve (`--ease-out`). Zero under `prefers-reduced-motion`.

## Copy
Dry, concrete, second person. No slogans, exclamation marks, or "Not X. It's Y." constructions.

## Rejection checklist (reference: wpbeaverbuilder.com/avoid-ai-slop-in-web-design)
Reject any change containing: eyebrow labels or decorative monospace captions; italic-accent headlines, gradient text, three-beat slogans; glassmorphism, translucent panels, glows, floating gradients; nested containers without a function; three identical feature cards; decorative emoji or stock icons; values not in the tokens.

## Pieces and assets
Cburnett SVG set (`design/pieces/`), CC BY-SA 3.0, shown at 92% of the square. Fonts self-hosted in `design/fonts/` with their OFL texts. All licences are recorded and verified in `THIRD_PARTY.md`.
