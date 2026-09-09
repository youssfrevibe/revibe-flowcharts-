"use client";

/**
 * An inline script that runs while the browser parses the HTML — before first paint,
 * and before React is involved at all. This is what applies the saved theme without a
 * flash of the wrong one.
 *
 * React logs "Encountered a script tag while rendering React component" in development
 * whenever a component renders a `<script>`. That warning is correct in general and
 * wrong here: on a hard navigation this tag is part of the server-rendered HTML, so the
 * browser really does execute it.
 *
 * **The warning is not suppressed.** Next documents a workaround — emit `text/javascript`
 * on the server and `text/plain` on the client so the client render produces nothing
 * runnable — and it is implemented below, including `"use client"` so the swap actually
 * re-evaluates in the browser. It does not silence this React version: verified from a
 * clean tab, the warning is present with the script and absent without it. So treat it
 * as dev-only noise with no production effect (React strips dev warnings from production
 * builds), not as something already handled.
 *
 * Removing the tag *would* silence it, at the cost of a visible theme flash on every
 * load for anyone whose saved theme differs from their OS setting. That trade is not
 * worth it. A hydration error also appears in the console on this page; it is unrelated
 * — it reproduces with this script removed entirely.
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
