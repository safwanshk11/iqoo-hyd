export function Chakra() {
  return (
    <svg
      className="chakra-watermark"
      viewBox="0 0 240 240"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="120"
        cy="120"
        r="108"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
      />
      <circle cx="120" cy="120" r="15" fill="currentColor" />
      {Array.from({ length: 24 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 15} 120 120)`}>
          <path
            d="M120 104 L117.8 61 L120 15 L122.2 61 Z"
            fill="currentColor"
          />
          <circle cx="134" cy="14" r="2.5" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
