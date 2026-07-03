/**
 * Ambient animated gradient blobs behind every screen. Pure CSS animation —
 * cheap, and automatically frozen by the reduced-motion media query.
 */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div
        className="animate-drift absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(191,165,239,0.55), transparent 65%)" }}
      />
      <div
        className="animate-drift absolute top-1/3 -right-48 h-[30rem] w-[30rem] rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,157,132,0.45), transparent 65%)",
          animationDelay: "-8s",
        }}
      />
      <div
        className="animate-drift absolute -bottom-48 left-1/4 h-[32rem] w-[32rem] rounded-full opacity-40 blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(127,220,178,0.4), transparent 65%)",
          animationDelay: "-16s",
        }}
      />
    </div>
  );
}
