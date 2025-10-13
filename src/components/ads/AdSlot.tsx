import React, { useEffect, useRef } from 'react';

/**
 * Reusable AdSense ad slot.
 * Usage:
 * <AdSlot
 *   slot="YOUR_AD_SLOT_ID"
 *   format="auto"
 *   layout="in-article" // optional
 *   style={{ display: 'block', minHeight: 90 }}
 * />
 *
 * Notes:
 * - Ensure the AdSense loader is present in index.html (client=ca-pub-...)
 * - Use data-adtest="on" during development to avoid policy issues.
 */
export type AdSlotProps = {
  slot: string;
  format?: string; // e.g., 'auto'
  layout?: string; // e.g., 'in-article', 'fluid'
  className?: string;
  style?: React.CSSProperties;
  test?: boolean; // if true, sets data-adtest="on"
};

declare global {
  interface Window { adsbygoogle?: Array<unknown> }
}

export const AdSlot: React.FC<AdSlotProps> = ({ slot, format = 'auto', layout, className, style, test }) => {
  const ref = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    // Attempt to fill ad once the element is in the DOM
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ads] adsbygoogle push failed', e);
    }
  }, [slot, format, layout]);

  return (
    <ins
      className={`adsbygoogle ${className || ''}`.trim()}
      style={{ display: 'block', minHeight: 90, ...(style || {}) }}
      data-ad-client="ca-pub-1785729756154322"
      data-ad-slot={slot}
      data-ad-format={format}
      {...(layout ? { 'data-ad-layout': layout } : {})}
      {...(test ? { 'data-adtest': 'on' } : {})}
      ref={ref as any}
    />
  );
};

export default AdSlot;
