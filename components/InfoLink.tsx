import Link from "next/link";

// A tiny ⓘ that deep-links any headline stat to the matching /methodology section, so every
// number on the site is one tap from "how is this measured?". Presentational, server-safe.
export default function InfoLink({ anchor, label }: { anchor?: string; label?: string }) {
  const href = `/methodology${anchor ? `#${anchor}` : ""}`;
  return (
    <Link
      href={href}
      aria-label={label ?? "How this is measured (methodology)"}
      title={label ?? "How this is measured"}
      className="ml-1 inline-block align-middle text-xs text-slate-400 hover:text-sky-600 transition-colors"
    >
      ⓘ
    </Link>
  );
}
