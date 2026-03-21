# WebLogAnalyzer Design System

## Direction & Feel

**Terminal-focused log inspector** for developers debugging production issues. Dark interface inspired by VS Code's output panel and terminal emulators. Every design choice reinforces "developer tool" not "SaaS dashboard."

**User:** Developer at 2am debugging prod issues, scanning thousands of log lines for errors
**Task:** Find needles in haystacks - filter noise, spot patterns, track down issues
**Feel:** Terminal/console environment. Data-dense. Precise. Professional. Like grep meets less meets code editor.

## Color World

Colors derived from debugging environments - terminals, consoles, log severity levels:

**Surfaces (elevation):**
- `--surface-0: #1a1a1a` - Base canvas, deepest dark (softer than pure black)
- `--surface-1: #212121` - Elevated (sidebar, cards)
- `--surface-2: #2a2a2a` - Floating (dropdowns, search)
- `--surface-3: #333333` - Modal, highest elevation

**Text hierarchy:**
- `--text-primary: #d4d4d4` - Main content (VS Code default, easier on eyes)
- `--text-secondary: #9ca3af` - Supporting text
- `--text-tertiary: #6b7280` - Metadata, labels
- `--text-muted: #4b5563` - Disabled, placeholder

**Borders:**
- `--border-quiet: rgba(255,255,255,0.06)` - Barely visible separation
- `--border-standard: rgba(255,255,255,0.10)` - Standard dividers
- `--border-emphasis: rgba(255,255,255,0.16)` - Important boundaries
- `--border-focus: rgba(6,182,212,0.40)` - Focus rings

**Semantic (log levels):**
- `--error: #ff5555` - Terminal red
- `--warning: #fb923c` - Alert amber
- `--info: #06b6d4` - Terminal cyan
- `--success: #10b981` - Success green

Plus muted versions (8% opacity) for backgrounds.

## Typography

**Data:** JetBrains Mono (fallback: Consolas, Monaco) - 12px, -0.01em letter-spacing
**UI labels:** System fonts - 11px, tight spacing, uppercase for labels
**Emphasis:** Use weight (600-700) not size for hierarchy

## Spacing Scale

Tight for data density:
- `--space-micro: 4px`
- `--space-xs: 6px`
- `--space-sm: 8px`
- `--space-md: 12px`
- `--space-lg: 16px`
- `--space-xl: 24px`

## Depth Strategy

**Surface elevation** - darker = deeper, lighter = higher. Whisper-quiet shifts (2-4% lightness jumps):
- Base: content area (#0a0a0a)
- +1: sidebar, table header (#141414)
- +2: search popup, dropdowns (#1e1e1e)
- +3: modals (#282828)

**Separation:**
- Use borders primarily, not shadows
- Quiet borders for soft separation
- Emphasis borders for structure
- Shadows only on elevated surfaces (search popup: multi-layer with glow)

## Signature Element

**Log table rows** feel like terminal output:
- Monospace throughout
- Focused row gets cyan left border + info-tinted background
- Selected items use info color (#06b6d4) not generic blue
- Table header uppercase, small, tertiary color

## Component Patterns

**Sidebar:**
- Same background as main (#141414), separated by standard border
- Hamburger icon uses secondary text color
- Tree nodes: monospace font, compact padding, info-tinted selection

**Search popup:**
- Surface-2 elevation (#1e1e1e)
- Strong shadow (multi-layer) for real lift
- Input: dark inset background (rgba(0,0,0,0.3))
- Focus: cyan border + glow

**Table:**
- Header: surface-1, uppercase labels, sticky position
- Rows: surface-0, quiet borders, subtle hover
- Focus: cyan left border, info-tinted background

**Inputs:**
- Dark inset: rgba(0,0,0,0.3)
- Standard border, monospace font
- Focus: cyan border + 3px glow

**Buttons:**
- Minimal: transparent with light background on hover
- Secondary: 8% white background + standard border
- Never bright colors except semantic actions

## States

**Interactive elements:**
- Default: secondary/tertiary text
- Hover: lighter background (2-4% white), primary text
- Focus: cyan border + glow
- Disabled: muted text

**Data states:**
- Loading: tertiary text
- Empty: tertiary text, monospace, centered
- Error: error color throughout section

## What NOT to do

- ❌ Bright white backgrounds
- ❌ Blue accent for everything (use semantic colors)
- ❌ Generic sans-serif for data (always monospace)
- ❌ High contrast borders (keep them subtle)
- ❌ Dramatic surface jumps (whisper-quiet elevation)
- ❌ Different hue per surface (same hue, shift lightness only)

## Validation Checklist

Before committing:
1. All data uses monospace
2. All surfaces on the elevation scale
3. All borders use defined tokens (no arbitrary rgba values)
4. Interactive states defined (hover, focus, disabled)
5. Colors reference semantic meaning (error red, info cyan)
6. No generic blue - use info cyan instead
