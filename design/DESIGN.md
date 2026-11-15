---
name: Evocative Name
colors:
  surface: '#f2fbfb'
  surface-dim: '#d3dcdc'
  surface-bright: '#f2fbfb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ecf5f5'
  surface-container: '#e7f0ef'
  surface-container-high: '#e1eaea'
  surface-container-highest: '#dbe4e4'
  on-surface: '#151d1d'
  on-surface-variant: '#3a4a4a'
  inverse-surface: '#293232'
  inverse-on-surface: '#e9f2f2'
  outline: '#6a7a7a'
  outline-variant: '#b9caca'
  surface-tint: '#00696b'
  primary: '#00696b'
  on-primary: '#ffffff'
  primary-container: '#0bfbff'
  on-primary-container: '#007072'
  inverse-primary: '#00dce0'
  secondary: '#276869'
  on-secondary: '#ffffff'
  secondary-container: '#acebec'
  on-secondary-container: '#2c6c6d'
  tertiary: '#585d76'
  on-tertiary: '#ffffff'
  tertiary-container: '#dce1ff'
  on-tertiary-container: '#5e637d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#0dfbff'
  primary-fixed-dim: '#00dce0'
  on-primary-fixed: '#002020'
  on-primary-fixed-variant: '#004f51'
  secondary-fixed: '#afeeee'
  secondary-fixed-dim: '#93d1d2'
  on-secondary-fixed: '#002020'
  on-secondary-fixed-variant: '#004f51'
  tertiary-fixed: '#dce1ff'
  tertiary-fixed-dim: '#c0c5e2'
  on-tertiary-fixed: '#151a30'
  on-tertiary-fixed-variant: '#40465e'
  background: '#f2fbfb'
  on-background: '#151d1d'
  surface-variant: '#dbe4e4'
typography:
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The brand personality embodies athletic high performance, technical clarity, and club heritage. Engineered specifically for contemporary racquet sports ecosystems, the interface pairs the crisp, luminous atmosphere of competitive outdoor and glass-enclosed padel courts with rigorous SaaS information architecture. It eliminates visual fluff, unnecessary transparencies, and neon cliches in favor of an elite European/South American athletic editorial standard: luminous light backgrounds, surgical typography, high legibility under varying lighting conditions, purposeful cyan accents, and vibrant tertiary gold highlights.

The design movement is **Modern Functional Athletic / Precision Editorial**:
- Structural discipline anchored by crisp 1px hairpins and clean architectural cards over a bright, clean foundation.
- Kinetic clarity: visual hierarchy emphasizes speed of booking, match-making telemetry, decimal rating precision (e.g., 7.4), and clear financial ledgers.
- White-label elasticity: structured to maintain Club Carrasco Pádel's exclusive identity while allowing multi-tenant scalability across any partner club.

## Colors
The palette evokes clean tournament hard courts, lawn enclosures, and disciplined editorial print in a light environment:
- **Canvas & Surfaces**: The base canvas operates strictly on clean light foundations, generating soft ambient contrast without eye fatigue. All functional containers, interactive tiles, match cards, and modal sheets are crisp bright surfaces.
- **Primary Cyber Cyan (`#0BFBFF`)**: Used selectively for high-intent conversion actions (instant court reservation, match check-in, active state filters, and live score tags). Interactive hover transitions shift adaptively, with soft surface badges resting on clean tinted containers.
- **Secondary Muted Teal (`#438182`)**: The authority anchor. Used for primary typography, navigation rails, high-tier status badges, and tournament bracket headers.
- **Tertiary Soft Lavender (`#DCE1FF`)**: Used for special achievement badges, VIP tournament tags, and high-priority call-out elements.
- **Support & Dividers**: Hairline separation uses precise light borders for structural edges. Secondary text provides strict AA/AAA contrast ratios against light backdrops.

## Typography
A three-tier typographic engine delivers athletic presence, effortless legibility, and technical precision:
1. **Headlines (`Outfit`)**: Clean, aerodynamic, geometric forms. Used for tournament names, club branding titles, court designations (e.g., "Cancha Central 1"), and modal titles.
2. **Interface & Reading (`Plus Jakarta Sans`)**: Neutral humanist warmth for descriptive copy, player profiles, rule sets, chat dialogues, and operational notices.
3. **Data & Telemetry (`JetBrains Mono`)**: Unambiguous tabular alignment used for all court availability grids (`08:30 - 10:00`), player handicap/NTRP ratings (`7.4 / 10.0`), set scores (`6-4, 3-6, 7-6`), and billing in Uruguayan Pesos (`$ UYU 1.800`).

## Layout & Spacing
The layout adheres to a strict responsive 12-column system (4 columns on mobile, 8 on tablet, 12 on desktop) centered within a maximum width of `1440px`.

- **Court Grid Schedule Engine**: Utilizes a horizontal time axis with fixed row heights (`48px` or `56px`), bound together by horizontal `1px` structural lines. Time indicators snap to columnar gutters.
- **Card Gaps & Rhythms**: Cards inside lists adhere to `space-sm` (8px) for compact match lists and `space-md` (16px) for club directory grids.
- **Mobile First Booking Flow**: Full-bleed bottom sheets on mobile devices transform into floating `560px` centered modals on desktop viewports.

## Elevation & Depth
Depth is created through clean surface borders and minimal, diffused contact shadows adapted for a light theme environment.

- **Flat Precision Baseline**: Level 0 components sit directly on the light canvas without borders.
- **Framed Tiles (Level 1)**: Bright cards receive an exact `1px` subtle border and a delicate atmospheric shadow for separation.
- **Interactive Hover & Drag (Level 2)**: For dragged schedule slots or hovered match cards: border color shifts adaptively with refined shadow dynamics.
- **Modals, Drawers & Flyouts (Level 3)**: Overlay backdrops employ neutral dark tones at 40% opacity with a light `backdrop-filter: blur(4px)`. Floating modal surfaces utilize elevated light shadow profiles.

## Shapes
Roundedness level `2` delivers tailored, contemporary sport geometry.
- Base interactive elements (buttons, inputs, court selection tiles): `0.5rem` (`8px`).
- Mid-sized groupings (match info cards, scoreboard wrappers): `1rem` (`16px`).
- Master dashboard sections and hero banners: `1.5rem` (`24px`).
- Status pills, level counters, and player avatar indicators retain fully circular or pill contours (`9999px`).

## Components

### Buttons
- **Primary Court Action**: Background `#0BFBFF`, text `#003825`, font `Plus Jakarta Sans` 600, height `44px` (touch-optimized), border radius `8px`. Hover: `#00d8db`. Active: transform scale `0.98`.
- **Secondary / Club Utility**: Background clean surface, text `#438182`, 1px subtle border. Hover: interactive light background state.
- **Destructive (Cancel Match/Reservation)**: Background light error tint, text alert red, 1px border.

### Court Status Chips & Match Badges
- **Status Pills**: `padding: 4px 10px`, typography `JetBrains Mono` 12px bold.
  - *Disponible*: Background light cyan tint, text `#008b8e`, subtle border.
  - *Reservada / En Juego*: Background light slate, text secondary, subtle border.
  - *Torneo Carrasco*: Background `#438182`, text `#FFFFFF`.
  - *VIP / Championship*: Background `#DCE1FF`, text `#151d1d` for high-priority call-out elements.
- **Player Level Chip**: Styled light pill with subtle border, typography `JetBrains Mono` bold (e.g., `CAT 3 • 7.4`).

### Court Schedule Grid Matrix
- Header displaying court numbers in `Outfit` Semibold.
- Time columns anchored with `JetBrains Mono` 13px.
- Open booking slots feature a translucent hover state with a cyan dashed preview border.

### Scorecards & Match Results
- Dual-row competitor list in light card container with subtle borders.
- Sets partitioned into discrete monospaced blocks (`JetBrains Mono` 16px bold) with winner sets highlighted in `#0BFBFF` tinted light backgrounds.

### Inputs & Date-Time Pickers
- Height `44px`, background light surface, subtle border, typography `Plus Jakarta Sans` 14px.
- Focus state: border `#0BFBFF`, ring glow.
- Numeric inputs (currency, duration, max players) strictly use `JetBrains Mono`.

### Checkboxes & Toggle Controls
- Custom `18px` rounded checkboxes (`4px` radius). Active state fills with `#0BFBFF` and a sharp dark check glyph.
- Switch toggles transition smoothly to `#0BFBFF` with a smooth pure white thumb and tactile micro-shadow.