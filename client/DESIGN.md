# Design System

Source of truth for all UI tokens. Every color, type size, spacing value, and component pattern in this codebase must reference tokens defined here. If you need a token that does not exist, add it here first, then use it.

This file was created on 2026-06-21 as part of the UI cleanup pass. It captures both pre-existing tokens (extracted from the legacy `globals.css`) and the new tokens introduced by that pass. The pre-existing token map is preserved; the changes are:

- Slash-opacity (`bg-X/50`) now composes correctly with CSS variables in both themes.
- A real type scale replaces the old `font-sans: Segoe UI` (which silently overrode the loaded `Geist` font).
- A proper motion + radius + shadow scale replaces the ad-hoc `shadow-glow` style.
- `.light` overrides for `bg-white/*` were removed in favor of token-based surfaces.

---

## 1. Brand & direction

VPS Manager is a multi-tenant control plane for a fleet of Linux/Windows servers. The users are sysadmins and devops engineers who live in terminals and expect the dashboard to feel like a serious tool, not a consumer app.

**Mood**: technical, calm, dense-but-airy. Closer to a desktop IDE than a marketing site. Dark theme is the primary surface — light theme is a real secondary surface (not a "just invert it" afterthought).

**Reference influences** (orthogonal, not copied):
- Linear (motion + chrome density)
- Vercel (typography + restraint)
- Tailscale (status indicators, no fluff)
- Raycast (command palette ergonomics)

**Anti-references** (do not ship):
- Generic SaaS marketing pages with purple-blue gradients
- Three-card "feature" rows
- Tailwind UI default aesthetics
- "Elevate your workflow" copy

---

## 2. Color tokens

All color tokens are CSS custom properties that swap on `[data-theme="light"]` (or the legacy `.light` class which `next-themes` applies to `<html>` when `attribute="class"`). The dark values are the `:root` defaults; light values override.

### 2.1 Surface stack (backgrounds)

| Token | Dark | Light | Purpose |
|---|---|---|---|
| `--bg-base` | `hsl(240 6% 10%)` | `hsl(40 12% 97%)` | App background |
| `--bg-raised` | `hsl(240 5% 12%)` | `#ffffff` | Cards, modals, popovers |
| `--bg-sunken` | `hsl(240 6% 8%)` | `hsl(40 10% 94%)` | Inputs, code blocks, deep UI |
| `--bg-elevated` | `hsl(240 5% 14%)` | `hsl(40 8% 90%)` | Hover, selected rows |
| `--bg-overlay` | `hsl(240 5% 18%)` | `hsl(40 6% 84%)` | Borders, dividers, scrollbar |
| `--bg-strong` | `hsl(240 4% 22%)` | `hsl(240 4% 50%)` | Active state, strong hover |

Slash opacity is composed with `color-mix(in oklch, var(--token) N%, transparent)`, so `bg-raised/50` works in both themes without theme-specific overrides.

### 2.2 Text stack

| Token | Dark | Light | Purpose |
|---|---|---|---|
| `--text-primary` | `#FAFAFA` | `#0F0F12` | Headings, body |
| `--text-secondary` | `#A1A1AA` | `#3F3F46` | Labels, supporting copy |
| `--text-muted` | `#71717A` | `#71717A` | Placeholders, meta, timestamps |
| `--text-inverse` | `#0F0F12` | `#FAFAFA` | Text on brand fill |

### 2.3 Borders

| Token | Dark | Light |
|---|---|---|
| `--border-subtle` | `hsla(0 0% 100% / 0.06)` | `hsla(240 6% 12% / 0.06)` |
| `--border-default` | `hsla(0 0% 100% / 0.10)` | `hsla(240 6% 12% / 0.10)` |
| `--border-strong` | `hsla(0 0% 100% / 0.18)` | `hsla(240 6% 12% / 0.18)` |

### 2.4 Brand

Single accent. **Do not introduce a second accent** — that is the most common AI-slop fingerprint. Pick a hue that reads as "infrastructure, not marketing".

| Token | Dark | Light |
|---|---|---|
| `--brand` | `#7C3AED` (violet-600) | `#6D28D9` (violet-700) |
| `--brand-hover` | `#8B5CF6` | `#5B21B6` |
| `--brand-soft` | `hsla(258 90% 66% / 0.15)` | `hsla(258 90% 50% / 0.10)` |

Avoid using `from-brand to-dataviz-blue` (purple→blue) gradients. They are the AI-slop tell.

### 2.5 Status

| Token | Value | Use |
|---|---|---|
| `--status-success` | `#10B981` | ONLINE, recovered, success toasts |
| `--status-warning` | `#F59E0B` | MAINTENANCE, approaching threshold |
| `--status-error` | `#EF4444` | OFFLINE, failed, destructive |
| `--status-info` | `#3B82F6` | Refresh, informational |

Status is **functional, not decorative** — never use it on text purely for emphasis.

---

## 3. Typography

### 3.1 Font families

| Family | Use | Source |
|---|---|---|
| `--font-sans` | UI body, headings, labels | `next/font/google` → Geist |
| `--font-mono` | IPs, ports, code, IDs, file sizes | `next/font/google` → Geist Mono |

**Rule**: never use system font fallbacks as the primary. Segoe UI is a fallback only.

### 3.2 Type scale

| Token | Size / line-height | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Meta, timestamps, helper text |
| `text-sm` | 13 / 18 | Body, form labels, table cells |
| `text-base` | 14 / 20 | Default body |
| `text-lg` | 16 / 24 | Card titles, dialog titles |
| `text-xl` | 18 / 26 | Section headers |
| `text-2xl` | 22 / 30 | Page titles (light) |
| `text-3xl` | 28 / 36 | Page titles (dense mode) |
| `text-4xl` | 36 / 42 | Marketing / hero (login only) |

### 3.3 Weight

- `400` — body
- `500` — labels, list items
- `600` — buttons, important inline text
- `700` — headings, KPI numbers
- **Do not use `800`/`900`** — they over-emphasize and feel heavy in a control plane.

### 3.4 Letter-spacing & case

- `tracking-tight` on `text-2xl` and above
- `tracking-wider` only for ALL-CAPS micro-labels (≤ 11px) used as section dividers (e.g. "SERVERS" in cmd+K)
- **Default to sentence case** in all UI copy. Avoid Title Case and ALL-CAPS in headings.

### 3.5 Tabular numerals

`font-variant-numeric: tabular-nums` is applied to any element rendering numbers in a list/table/grid (CPU%, RAM%, IP, file size). Implemented via the `.tabular-nums` utility class — not a global rule, because body text should not be tabular.

---

## 4. Spacing & layout

### 4.1 Spacing scale

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | Icon-to-text gap, hairline |
| `--space-2` | 8px | Form label gap, list item pad |
| `--space-3` | 12px | Card inner gap, input pad |
| `--space-4` | 16px | Standard pad |
| `--space-5` | 20px | Card pad (mobile) |
| `--space-6` | 24px | Card pad (desktop) |
| `--space-8` | 32px | Section break |
| `--space-10` | 40px | Page section |
| `--space-12` | 48px | Hero padding |

All padding / margin / gap values in the codebase should be a multiple of 4px. Arbitrary values like `p-3.5` are forbidden — they read as design-by-coincidence.

### 4.2 Container widths

| Token | Value | Use |
|---|---|---|
| Page max | 1600px | Dashboard grid |
| Dialog `sm` | 384px | Confirm dialogs |
| Dialog `md` | 448px | Forms |
| Dialog `lg` | 512px | VPS detail actions |
| Command palette | 576px | Fixed |
| Sidebar | 256px | Fixed |
| Topbar | 64px tall | Fixed |

### 4.3 Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Pills, status badges |
| `--radius-md` | 10px | Buttons, inputs |
| `--radius-lg` | 14px | Cards |
| `--radius-xl` | 20px | Modals, command palette |
| `--radius-full` | 9999px | Avatars, dot indicators |

Mix radii by context: tighter inside cards, softer on outer surfaces. **Uniform `--radius-xl` on everything is the AI-slop tell**.

---

## 5. Components

These patterns have been used 2+ times and are therefore part of the design system. New components that follow the same pattern are encouraged; new patterns must be added to this section before being used.

### 5.1 Button

- **Primary**: `bg-brand text-text-inverse rounded-md px-4 py-2 font-medium hover:bg-brand-hover active:scale-[0.98]`
- **Secondary**: `bg-bg-elevated text-text-primary rounded-md px-4 py-2 font-medium border border-border-default hover:bg-bg-overlay`
- **Ghost**: `text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-md px-3 py-2`
- **Destructive**: `bg-status-error/15 text-status-error border border-status-error/30 hover:bg-status-error/25`
- All buttons: focus ring is 2px brand, 2px offset against `--bg-raised`. Disabled = 0.5 opacity + `cursor-not-allowed`.

### 5.2 Input

- Background `--bg-sunken`, border `--border-default`, radius `--radius-md`, height 40px.
- Focus: border `--brand`, ring 1px `--brand`.
- Icon prefix: `pl-10`, icon absolutely positioned `left-3.5` with `--text-muted`, `pointer-events-none`.
- Error: border `--status-error`, helper text in `--status-error` underneath.

### 5.3 Card

- Background `--bg-raised`, border `1px --border-default`, radius `--radius-lg`, padding `--space-6` desktop / `--space-5` mobile.
- Optional: `shadow-soft` (4px offset, 8px blur, 8% black) on hover.
- **No drop-shadow on every card by default** — borders + tonal separation are enough.

### 5.4 Modal

- Centered, max-width per size scale, background `--bg-raised`, radius `--radius-xl`, border `--border-default`.
- Backdrop: `bg-black/60 backdrop-blur-sm` in both themes (the darkening effect is what makes a modal "above" — inverting it in light theme breaks the depth contract).
- Close button: ghost, top-right, `aria-label="Close"`.
- Focus trap required (see `useFocusTrap`).
- Escape closes.

### 5.5 Command palette

- Width 576px, top-pad 15vh, radius `--radius-xl`.
- Input bar background `--bg-elevated/50` (so the slash opacity composes correctly — see §2.1).
- Selected item: `--brand-soft` background, `--text-primary` text.
- ESC key visible in input bar.

### 5.6 Status dot

- 8×8 circle, `--status-{kind}` fill, optional `animate-ping` halo for "live" indicators.
- Pair with a short label in `--text-secondary`, never alone.

### 5.7 Toast

- Top-right, fixed, max-width 360px, backdrop blur, border `--status-{kind}/30`, text in `--status-{kind}`.
- Auto-dismiss 3s for success, 5s for error.

### 5.8 Section label (cmd+K groups, settings sections)

- ALL-CAPS, `text-[11px]`, `font-semibold`, `tracking-wider`, `--text-muted`.
- This is the **one** place ALL-CAPS is allowed. Everywhere else = sentence case.

---

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120ms | Hover, focus, button press |
| `--motion-base` | 200ms | Modals, dropdowns |
| `--motion-slow` | 280ms | Page transitions |

Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) for entries, `cubic-bezier(0.7, 0, 0.84, 0)` for exits. **No linear easing on user-initiated motion** — it reads as broken.

Spring: `stiffness: 380, damping: 30` for layout-id transitions (active nav, modal mount).

`prefers-reduced-motion: reduce` disables all transforms and uses 0ms transitions (enforced in `globals.css`).

---

## 7. Iconography

Single source: `lucide-react`. Stroke width 1.75 across the app. Default size 16px in tight contexts, 18–20px in buttons/cards, 24px+ only in hero.

**Avoid**:
- 🚀 (rocket) for "launch"
- 🛡 (shield) for "security"
- 🪄 (sparkle) for "AI"

These are cliche metaphors. Use the verb (`Send`, `Verify`, `Build`).

---

## 8. Do not

- Do not introduce a second accent color.
- Do not animate `width`, `height`, `top`, `left`, `margin`, `padding` — only `transform` and `opacity` and `filter`.
- Do not use `bg-white/5`-style slash opacity against an opaque theme variable — it does not compose correctly and is the root cause of the cmd+K dark-in-light bug. Use `bg-bg-elevated/50` (a token-backed utility) instead.
- Do not write `hover:scale-105` on chrome elements. Scale-up on hover reads as toy UI. Tone-shift (background lighten) is correct.
- Do not add new ALL-CAPS headings outside of §5.8.
- Do not add a third font family.
- Do not add a marketing "scroll-triggered" hero — this is a control plane.
- Do not delete the light theme's `--bg-elevated` even if it looks unused — it composes into the modal/palette surfaces.
