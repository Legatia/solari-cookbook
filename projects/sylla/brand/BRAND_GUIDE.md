# Sylla brand kit

Sylla is infrastructure for an intimate personal agent: something that learns a person with permission, represents them privately, and remains portable across AI hosts. The identity should feel like a trusted presence, not an AI dashboard.

## Core idea

**A private counterpart.**

The mark is built from two fitted forms surrounding a protected center. One form represents the person, one their agent, and the opening represents the boundary neither crosses without permission. The meaning should stay implicit; do not describe the symbol as a lock, link, chat bubble, or network.

## Logo

Use `sylla-mark-primary.svg` on Paper or similarly warm neutral surfaces. Use the Ink version when reproduction must be one color, and the Ivory version on Obsidian.

- Minimum digital size: 20 px high.
- Clear space: at least one quarter of the mark's visible width on every side.
- Keep the mark upright.
- Preserve the center opening.
- Never add glow, gradients, shadows, outlines, or an enclosing circle.
- Never recolor it green or use a saturated “AI accent” palette.
- Do not place the primary two-tone mark on photography or patterned backgrounds.

The symbol may appear without the name. When the name is required, typeset **Sylla** in Newsreader Medium or Regular; do not fuse text to the symbol into a permanent lockup.

## Color

| Role | Name | Hex | Use |
| --- | --- | --- | --- |
| Primary ink | Obsidian | `#0B0B0A` | Dark surfaces, text, Ink mark |
| Primary light | Bone | `#F4F0E8` | Light text, Ivory mark, quiet emphasis |
| Canvas | Paper | `#EAE7E0` | Brand backgrounds and app icon |
| Secondary ink | Graphite | `#32302C` | Raised dark surfaces and secondary controls |
| Muted text | Mist | `#B8B3AA` | Supporting copy and metadata |
| Highlight light | Warm White | `#FFFDF8` | High-contrast details only |

The core system is monochrome. Meaning is expressed through typography, spacing, motion, and contrast—not an accent color.

## Typography

- **Newsreader** is the emotional voice. Use it for headlines, intimate questions, names, and brief reflective statements. Italic is welcome; avoid all caps.
- **Geist** is the practical voice. Use it for body copy, product UI, controls, and documentation.
- **Geist Mono** is the system voice. Use it sparingly for provenance, permissions, timestamps, connection states, and other machine-readable context.

Use sentence case by default. Uppercase is reserved for short system labels with generous letter spacing.

## Voice

Sylla sounds observant, candid, calm, and specific.

- Speak beside the user, never down to them.
- Prefer one natural question over an onboarding questionnaire.
- State permissions and uncertainty plainly.
- Do not claim to know a person better than they know themselves.
- Avoid “unlock,” “revolutionize,” “AI-powered,” “supercharge,” and companion-as-servant language.

Examples:

- “Want me to remember that, or was it only true today?”
- “I found someone you may genuinely like. I can explain why before either of you is revealed.”
- “I can decline this quietly for you.”
- “This stays private unless you choose otherwise.”

## Photography and illustration

Use close, unperformed human details: hands at a table, an unfinished note, two chairs after a conversation, light in a lived-in room. Favor grain, shallow depth, warm neutrals, and imperfect framing. Avoid humanoid robots, glowing brains, network diagrams, floating chat bubbles, and synthetic stock-photo intimacy.

## Motion

Movement should feel attentive rather than energetic. Use slow reveals, soft settling, and one response at a time. The two parts of the mark may approach and align, but they should never merge or pulse like a notification.

## Product principles

1. Private by permission.
2. Portable by design.
3. Agent first; social is a flagship use case.
4. The user can inspect, correct, export, or delete what the agent knows.
5. A connection is proposed by agents and chosen by humans.

## Asset index

All production assets live in `public/brand/`.

- `sylla-mark-primary.svg` — two-tone master mark for warm light surfaces.
- `sylla-mark-ink.svg` — one-color mark for light surfaces.
- `sylla-mark-ivory.svg` — one-color mark for dark surfaces.
- `sylla-app-icon.svg` — safe-area app icon master.
- `sylla-social-card.svg` — 1200 × 630 social sharing template.
- `sylla-mark-1024.png`, `sylla-mark-512.png`, `sylla-mark-180.png`, `sylla-mark-32.png` — raster exports.
- `sylla-app-icon-1024.png` — raster app icon master.
- `sylla-social-card.png` — raster social card.

Color and typography variables live in `brand/tokens.css`.
