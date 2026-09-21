export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

// A geometric sensor, explicitly separate from pixel vision.
export function cursorSense(pointer, previous, fly, dt) {
  if (!pointer) return { left: 0, right: 0, strength: 0, bearing: fly.heading, distance: null };
  const dx = pointer.x - fly.x, dy = pointer.y - fly.y, distance = Math.hypot(dx, dy);
  const vx = previous ? (pointer.x - previous.x) / Math.max(dt, 0.001) : 0;
  const vy = previous ? (pointer.y - previous.y) / Math.max(dt, 0.001) : 0;
  const approach = distance > 1 ? -(vx * dx + vy * dy) / distance : 0;
  const strength = clamp((1 - distance / 170) * (0.30 + clamp(approach / 700)))
    + 0.65 * clamp(1 - distance / 50);
  const bearing = Math.atan2(dy, dx);
  const side = Math.sin(bearing - fly.heading);
  return { left: clamp(strength * (side < 0 ? 1 : 0.35)),
    right: clamp(strength * (side >= 0 ? 1 : 0.35)), strength: clamp(strength), bearing, distance };
}

// Coarse binocular hex sampling of screen pixels, not reconstructed biological retina.
export function retinaSample({ bitmap, width, height, bounds, fly, previous = [] }) {
  const values = [], eyes = { left: [], right: [] };
  let change = 0, luminance = 0;
  for (const [eye, angle] of [['left', -0.6], ['right', 0.6]]) {
    for (let row = 0; row < 7; row++) for (let col = 0; col < 9; col++) {
      const localX = 45 + (col - 4) * 14;
      const localY = (row - 3) * 14 + (col % 2) * 7;
      const heading = fly.heading + angle;
      const sx = fly.x + localX * Math.cos(heading) - localY * Math.sin(heading);
      const sy = fly.y + localX * Math.sin(heading) + localY * Math.cos(heading);
      const x = Math.floor(clamp((sx - bounds.x) / bounds.width) * (width - 1));
      const y = Math.floor(clamp((sy - bounds.y) / bounds.height) * (height - 1));
      const k = (y * width + x) * 4; // Electron toBitmap: BGRA on Windows.
      const lum = (0.0722 * bitmap[k] + 0.7152 * bitmap[k + 1] + 0.2126 * bitmap[k + 2]) / 255;
      change += Math.abs(lum - (previous[values.length] ?? lum));
      luminance += lum; values.push(lum); eyes[eye].push(lum);
    }
  }
  return { values, eyes, change: change / values.length, luminance: luminance / values.length };
}
