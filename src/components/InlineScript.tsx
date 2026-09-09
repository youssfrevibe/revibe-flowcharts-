/**
 * An inline script that runs while the browser parses the HTML — before first paint,
 * and before React is involved at all.
 *
 * React warns in development when a component renders a `<script>` tag, because scripts
 * inserted through DOM updates never execute. That warning is right in general and wrong
 * here: on a hard navigation this tag is part of the server-rendered HTML, so the browser
 * *does* run it, which is the only way to set the theme before anything is painted.
 *
 * The fix Next documents is to emit an executable type on the server and an inert one on
 * the client, so the client render produces nothing runnable and nothing to warn about.
 * `suppressHydrationWarning` covers the resulting type mismatch.
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
