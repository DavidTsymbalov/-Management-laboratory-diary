# Management Laboratory interface

## Direction

A classroom journal with a cinematic entrance and a compact working area. The existing blue films and owl identify the product; the rest of the interface stays quiet. No invented statistics, decorative step numbers, motivational copy, or repeated role labels.

## Tokens

- Midnight `#091422`: page and navigation.
- Deep blue `#11233a`: working surfaces.
- Ink blue `#173251`: selected surfaces and identity panel.
- Slate `#314760`: dividers and control outlines.
- Paper blue `#e0e8f2`: primary text.
- Mist blue `#abc8e8`: actions and focus.

Inter for Russian text and controls. Existing Aktiv Grotesk Extended for the English wordmark. Headings use regular/medium weight, sentence case, and a restrained size scale. Supporting text stays below 70 characters per line.

## Layout

Shared content edges: 1280 px maximum width, 32 px desktop / 20 px mobile gutters. Spacing uses 4, 8, 12, 16, 24, 32, 48, and 64 px. Labels sit 8 px above controls; related controls use 12–24 px gaps; sections use 32 px gaps. Inputs and primary actions are 48 px tall.

```
Entrance                         Classroom
wordmark               home      wordmark              home
┌─────────────────────────┐      identity              sign out
│ Journal title     film  │      class / awards / statistics / staff
│                         │      page title            primary action
├─────────────────────────┤      compact class summary
│ pupil entry  staff entry│      search                sort
└─────────────────────────┘      pupil list
```

The entrance uses one full-width film frame and a two-role entry dock. Authentication uses a narrow form with a branded film still, rather than a second landing page. Working screens replace the old left sidebar with a horizontal navigation rail; mobile navigation wraps into a fixed grid without horizontal page scrolling.

## Motion and interaction

Keep the square transition at entry points. Use one brief entrance for the film/title, then only animate explicit changes: tab crossfades, identity-preserving list sorting and disclosure. Background refreshes stay quiet. Video has pause and scene controls, stops in hidden tabs, and respects reduced motion. No perpetual decorative movement beyond the user-controllable films.

## Review against the brief

Rejected the initial idea of four equal dashboard tiles: these are different kinds of information, not four destinations. Class totals are a compact strip; the pupil balance is a single focal panel with rank and awards alongside it. Rejected repeated label/heading/description stacks and numbered role links: neither helps choose a role. The two existing films are the distinctive visual element; do not add a second illustration system.
