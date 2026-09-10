import { Actor } from "@/lib/types";

/**
 * Who-does-this icons, as SVG rather than emoji.
 *
 * Emoji were doing this job and doing it badly. They render in whatever the platform
 * ships — a different drawing on Windows, macOS, Android and in every screenshot — they
 * cannot take the actor's colour because the glyph carries its own, they sit on a
 * different baseline to the text beside them, and a screen reader announces the
 * Unicode name ("delivery truck") rather than the role ("Courier").
 *
 * These are stroke icons on a 24×24 grid drawn in `currentColor`, so one `color` on the
 * parent tints the icon, its label and its chip together, and the same file works on a
 * white card and a near-black one.
 */

const PATHS: Record<Actor, React.ReactNode> = {
  // Customer — a person.
  customer: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  // Revibe agent — a support headset.
  revibe: (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13h2.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M20 13h-2.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1z" />
      <path d="M20 19a3 3 0 0 1-3 3h-2" />
    </>
  ),
  // Seller / supplier — a storefront.
  seller: (
    <>
      <path d="M3.5 9.5 5 4.5h14l1.5 5" />
      <path d="M4 9.5h16v10a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5z" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  // Automation — a bolt.
  system: <path d="M13 2 5 13.5h6L11 22l8-11.5h-6z" />,
  // Courier — a delivery van.
  carrier: (
    <>
      <path d="M2.5 7.5h10v8h-10z" />
      <path d="M12.5 10.5h4l3 3v2h-7z" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
  // Lab / Naif — a beaker.
  lab: (
    <>
      <path d="M9.5 3v6.2L4.8 17.4A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 1.7-3.1L14.5 9.2V3" />
      <path d="M8.5 3h7" />
      <path d="M7 15h10" />
    </>
  ),
};

export default function ActorIcon({
  actor,
  size = 16,
  className,
}: {
  actor: Actor;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Decorative: the role is always written next to it in text, so announcing the
      // icon as well would just read the same thing twice.
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[actor]}
    </svg>
  );
}
