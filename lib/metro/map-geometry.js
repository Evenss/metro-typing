/**
 * Preserve every coordinate while progressively compressing context that sits
 * before a focus boundary. The curve is continuous at the focus and remains
 * strictly monotonic, so it generalizes remote geography instead of clipping it.
 *
 * @param {number} value
 * @param {number} focus
 * @param {number} contextWidth
 */
export function compressBeforeFocus(value, focus, contextWidth) {
  if (value >= focus || contextWidth <= 0) return value;
  const distance = focus - value;
  return focus + contextWidth * Math.expm1(-distance / contextWidth);
}

/**
 * Apply the same focus transition to a point while gently gathering remote
 * context toward its serviced corridor. This avoids turning a large district
 * into a tall, artificial seam when its unused western area is compressed.
 *
 * @param {[number, number]} point
 * @param {number} focusX
 * @param {number} contextWidth
 * @param {number} contextCenterY
 * @param {number} farContextYScale
 * @returns {[number, number]}
 */
export function compressPointBeforeFocus(
  [x, y],
  focusX,
  contextWidth,
  contextCenterY,
  farContextYScale,
) {
  if (x >= focusX || contextWidth <= 0) return [x, y];

  const distance = focusX - x;
  const contextBlend = -Math.expm1(-distance / contextWidth);
  const yScale = 1 - contextBlend * (1 - farContextYScale);

  return [
    compressBeforeFocus(x, focusX, contextWidth),
    contextCenterY + (y - contextCenterY) * yScale,
  ];
}

/**
 * @param {[number, number]} point
 * @param {Array<[number, number]>} ring
 */
export function isPointInRing([x, y], ring) {
  let inside = false;

  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const crossesLatitude = (y1 > y) !== (y2 > y);
    if (crossesLatitude) {
      const intersectionX = ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
      if (x < intersectionX) inside = !inside;
    }
  }

  return inside;
}
