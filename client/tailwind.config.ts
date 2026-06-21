import type { Config } from "tailwindcss";

/**
 * Tailwind v4 config — used by `@config` directive in globals.css
 * to extend the v4 zero-config defaults with our design tokens.
 *
 * Token values live as CSS custom properties in globals.css so that
 * [data-theme="light"] overrides can swap them. The Tailwind config
 * only references the variable names — never inline hex codes.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Primary: Geist (loaded via next/font in layout.tsx, exposed as
        // --font-sans CSS var). Fallback chain is what the body uses
        // before the font is ready.
        sans: ['var(--font-sans)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Cascadia Code', 'monospace'],
      },

      colors: {
        // Canonical token names — use these in new code.
        brand: {
          DEFAULT: 'var(--brand)',
          hover:   'var(--brand-hover)',
          soft:    'var(--brand-soft)',
        },
        bg: {
          base:     'var(--bg-base)',
          raised:   'var(--bg-raised)',
          sunken:   'var(--bg-sunken)',
          elevated: 'var(--bg-elevated)',
          overlay:  'var(--bg-overlay)',
          strong:   'var(--bg-strong)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          inverse:   'var(--text-inverse)',
        },
        border: {
          subtle:  'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong:  'var(--border-strong)',
        },
        status: {
          success: 'var(--status-success)',
          warning: 'var(--status-warning)',
          error:   'var(--status-error)',
          info:    'var(--status-info)',
        },

        // Legacy aliases — kept so existing files (`bg-neutral-bg1` etc.)
        // still resolve to the right token. New code should use the
        // canonical `bg-*` / `text-*` / `border-*` names above.
        neutral: {
          bg1: 'var(--bg-base)',
          bg2: 'var(--bg-raised)',
          bg3: 'var(--bg-elevated)',
          bg4: 'var(--bg-overlay)',
          bg5: 'var(--bg-strong)',
          bg6: 'var(--bg-strong)',
        },
        // Old brand names → new tokens
        'brand-legacy': 'var(--brand)',
        'brand-light':  'var(--brand-hover)',

        // Dataviz palette (charts) — used by recharts on the dashboard.
        // These are intentionally stable across themes.
        dataviz: {
          purple: '#7C3AED',
          blue:   '#3B82F6',
          green:  '#10B981',
          yellow: '#F59E0B',
          red:    '#EF4444',
          pink:   '#EC4899',
          cyan:   '#06B6D4',
        },
      },

      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        DEFAULT: 'var(--radius-md)',
      },

      boxShadow: {
        soft:  'var(--shadow-soft)',
        raise: 'var(--shadow-raise)',
        glow:  'var(--shadow-glow)',
      },

      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '280ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-expo':  'cubic-bezier(0.7, 0, 0.84, 0)',
      },

      animation: {
        'fade-in':     'fadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':    'slideUp 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down':  'slideDown 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow':  'pulse 3s ease-in-out infinite',
        'shimmer':     'shimmer 1.6s linear infinite',
      },

      keyframes: {
        fadeIn:    { '0%': { opacity: '0' },     '100%': { opacity: '1' } },
        slideUp:   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },

      spacing: {
        'safe-top':    'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left':   'env(safe-area-inset-left)',
        'safe-right':  'env(safe-area-inset-right)',
      },
      minHeight: { 'touch': '44px' },
      minWidth:  { 'touch': '44px' },
    },
  },
  plugins: [],
};

export default config;
