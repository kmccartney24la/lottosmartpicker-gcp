'use client';
export default function Info({ tip, label = 'Info' }: { tip: string; label?: string }) {
  // Hover/focus-only tooltip. No click/toggle logic.
  // Accessibility:
  // - tabIndex=0 enables keyboard focus, which triggers your CSS :focus-visible tooltip.
  // - title provides a native tooltip and announces content for some screen readers.
  // - aria-label identifies the control in the tab order.
  return (
    <span
      className="help"
      data-tip={tip}
      aria-label={label}
      tabIndex={0}
      title={tip}
    >
      i
    </span>
  );
}