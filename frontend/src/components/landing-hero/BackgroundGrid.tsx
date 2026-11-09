export function BackgroundGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        maskImage: "linear-gradient(to bottom, black 62%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 62%, transparent 100%)",
      }}
    />
  );
}
