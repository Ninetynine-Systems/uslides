/** The uslides logo: a white slide with the Greek letter mu (micro) on a purple tile. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect width="100" height="100" rx="22" fill="#5753d6" />
      <rect x="14" y="26" width="72" height="48" rx="6" fill="#ffffff" />
      <path
        d="M30 88 V24 M30 54 a20 20 0 0 0 40 0 V24 M70 54 v8 q0 10 9 10"
        transform="translate(25 23) scale(0.5)"
        fill="none"
        stroke="#5753d6"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
