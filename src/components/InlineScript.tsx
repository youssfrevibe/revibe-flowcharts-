"use client";

/**
 * An inline script that runs while the browser parses the HTML — before first paint,
 * and before React is involved at all. This is what applies the saved theme without a
 * flash of the wrong one.
 *
 * React logs "Encountered a script tag while rendering React component" whenever a
 * component renders a `<script>` during a *client* render. Server-rendered scripts are
 * fine, and on a hard navigation this tag is part of the server HTML, so the browser
 * really does execute it.
 *
 * That warning used to fire on every load, and chasing it here was the wrong place to
 * look: it was a *symptom*. FlowCanvas seeded its state from localStorage inside
 * `useState` initialisers, so the client's first render disagreed with the server's;
 * React discarded the server DOM and re-rendered the whole tree on the client, and that
 * client render is what tripped the warning. Fixing the mismatch silenced both. Proven
 * by A/B in fresh tabs: with a cached document, hydration failure plus the warning; with
 * the cache cleared, silence.
 *
 * The type swap below (executable on the server, inert on the client) is Next's
 * documented belt-and-braces for the same warning and is kept, but it was not what
 * fixed it.
 *
 * See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
