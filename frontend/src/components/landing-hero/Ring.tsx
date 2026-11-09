export function Ring() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-1/2 h-[1000px] w-[1000px] -translate-x-1/2 translate-y-[42%]"
    >
      <svg
        width="1000"
        height="1000"
        viewBox="0 0 1000 1000"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#2E8BFF" />
            <stop offset="50%" stopColor="#34E08F" />
            <stop offset="100%" stopColor="#2E8BFF" />
          </linearGradient>
          <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* Glow — blurred copy */}
        <circle
          cx="500"
          cy="500"
          r="400"
          stroke="url(#ring-grad)"
          strokeWidth="22"
          fill="none"
          opacity="0.75"
          filter="url(#ring-glow)"
        />

        {/* Sharp ring */}
        <circle
          cx="500"
          cy="500"
          r="400"
          stroke="url(#ring-grad)"
          strokeWidth="4"
          fill="none"
        />

        {/* Inner circle */}
        <circle
          cx="500"
          cy="500"
          r="340"
          stroke="#33C5C4"
          strokeWidth="1"
          fill="none"
          opacity="0.35"
        />

        {/* Dot upper right — green */}
        <g>
          <circle cx="760" cy="280" r="10" fill="#34E08F" opacity="0.18" />
          <circle cx="760" cy="280" r="4" fill="#34E08F" />
        </g>

        {/* Dot upper left — orange */}
        <g>
          <circle cx="240" cy="280" r="10" fill="#FF7A45" opacity="0.18" />
          <circle cx="240" cy="280" r="4" fill="#FF7A45" />
        </g>
      </svg>
    </div>
  );
}
