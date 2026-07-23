const MOBILE_BREAKPOINT = 620;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function positiveDimension(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function finiteInset(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getPointExtent(points) {
  const validPoints = points.filter(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
  if (validPoints.length < 2) {
    return { count: validPoints.length, width: 0, height: 0, diagonal: 0 };
  }

  const xs = validPoints.map(([x]) => x);
  const ys = validPoints.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return {
    count: validPoints.length,
    width,
    height,
    diagonal: Math.hypot(width, height),
  };
}

/**
 * Keep compact routes legible in the departure interlude without over-zooming
 * short airport or intercity lines whose stations are geographically distant.
 *
 * @param {Array<[number, number]>} points
 * @returns {{ minimumWidth: number, padding: number }}
 */
export function getDepartureCameraFraming(points) {
  const extent = getPointExtent(points);
  if (extent.count < 2) return { minimumWidth: 440, padding: 72 };

  const widthForHorizontalPresence = extent.width / 0.42;
  const widthForVerticalPresence = extent.height / (0.25 * 0.72);
  return {
    minimumWidth: clamp(
      Math.max(widthForHorizontalPresence, widthForVerticalPresence),
      120,
      440,
    ),
    padding: clamp(extent.diagonal * 0.34, 24, 72),
  };
}

/**
 * Lower the tracking camera floor only when the complete journey is spatially
 * compact. Point fitting still widens the final viewBox for long station gaps.
 *
 * @param {Array<[number, number]>} points
 * @param {number} viewportWidth
 * @param {boolean} [completing]
 * @returns {number}
 */
export function getJourneyCameraMinimumWidth(
  points,
  viewportWidth,
  completing = false,
) {
  const width = positiveDimension(viewportWidth);
  const mobile = width <= MOBILE_BREAKPOINT;
  const standardMinimum = completing
    ? mobile ? 300 : 420
    : mobile
      ? 260
      : clamp(width / 4, 340, 420);
  const extent = getPointExtent(points);
  if (extent.count < 2) return standardMinimum;

  const compactFloor = completing
    ? mobile ? 180 : 210
    : mobile
      ? 150
      : 170;
  return clamp(extent.diagonal * 4.8, compactFloor, standardMinimum);
}

/**
 * Derive the part of the layout viewport covered by a mobile software
 * keyboard. Mobile Safari keeps the layout viewport tall while shrinking the
 * visual viewport, so CSS viewport units alone cannot reveal this obstruction.
 *
 * @param {{
 *   layoutHeight: number,
 *   visualHeight: number,
 *   visualOffsetTop?: number,
 *   visualScale?: number,
 *   mobile?: boolean,
 * }} viewport
 * @returns {{ open: boolean, tight: boolean, inset: number }}
 */
export function getMobileKeyboardViewport(viewport) {
  const layoutHeight = positiveDimension(viewport.layoutHeight);
  const visualHeight = positiveDimension(viewport.visualHeight);
  const visualOffsetTop = finiteInset(viewport.visualOffsetTop);
  const visualScale = Number.isFinite(viewport.visualScale)
    ? Math.max(viewport.visualScale, 0.01)
    : 1;
  const visibleBottom = Math.min(
    visualOffsetTop + visualHeight,
    layoutHeight,
  );
  const coveredBottom = Math.max(layoutHeight - visibleBottom, 0);
  const openingThreshold = Math.max(
    96,
    Math.min(layoutHeight * 0.18, 140),
  );
  const open = Boolean(viewport.mobile)
    && visualScale <= 1.05
    && coveredBottom >= openingThreshold;

  return {
    open,
    tight: open && visualHeight < 360,
    inset: open ? coveredBottom : 0,
  };
}

/**
 * Convert the measured game overlays into the unobstructed rectangle that the
 * tracking camera may use. All coordinates are CSS pixels relative to the
 * game container.
 *
 * @param {{ width: number, height: number }} viewport
 * @param {{ chromeBottom?: number, scoreTop?: number, cardTop?: number }} overlays
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }} [insets]
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
export function getGameSafeRect(viewport, overlays, insets = {}) {
  const width = positiveDimension(viewport.width);
  const height = positiveDimension(viewport.height);
  const mobile = width <= MOBILE_BREAKPOINT;
  const sideMargin = mobile ? 12 : 24;
  const topGap = mobile ? 12 : 16;
  const bottomGap = mobile ? 12 : 20;
  const insetTop = finiteInset(insets.top);
  const insetRight = finiteInset(insets.right);
  const insetBottom = finiteInset(insets.bottom);
  const insetLeft = finiteInset(insets.left);

  const left = clamp(insetLeft + sideMargin, 0, Math.max(width - 1, 0));
  const right = clamp(
    width - insetRight - sideMargin,
    Math.min(left + 1, width),
    width,
  );
  const chromeBottom = Number.isFinite(overlays.chromeBottom)
    ? overlays.chromeBottom
    : insetTop;
  const top = clamp(
    Math.max(insetTop, chromeBottom) + topGap,
    0,
    Math.max(height - 1, 0),
  );
  const overlayTops = [overlays.scoreTop, overlays.cardTop].filter(
    (value) => Number.isFinite(value),
  );
  const unobstructedBottom = overlayTops.length
    ? Math.min(...overlayTops) - bottomGap
    : height - insetBottom - sideMargin;
  const bottom = clamp(
    unobstructedBottom,
    Math.min(top + 1, height),
    height,
  );

  return { left, top, right, bottom };
}

/**
 * Fit ordered journey points into the measured safe rectangle while anchoring
 * the train slightly behind center in its direction of travel. The returned
 * viewBox always matches the viewport aspect ratio, so its coordinates map
 * directly to CSS pixels without SVG letterboxing.
 *
 * @param {Array<[number, number]>} points
 * @param {{ width: number, height: number }} viewport
 * @param {{ left: number, top: number, right: number, bottom: number }} safeRect
 * @param {{
 *   anchorPoint?: [number, number],
 *   headingPoint?: [number, number] | null,
 *   minimumWidth?: number,
 *   padding?: number,
 *   forwardBias?: number,
 * }} [options]
 * @returns {[number, number, number, number]}
 */
export function getTrackingViewBox(
  points,
  viewport,
  safeRect,
  options = {},
) {
  const width = positiveDimension(viewport.width);
  const height = positiveDimension(viewport.height);
  const validPoints = points.filter(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
  const fallbackPoint = options.anchorPoint ?? [500, 350];
  const cameraPoints = validPoints.length ? validPoints : [fallbackPoint];
  const anchorPoint =
    options.anchorPoint &&
    Number.isFinite(options.anchorPoint[0]) &&
    Number.isFinite(options.anchorPoint[1])
      ? options.anchorPoint
      : cameraPoints[0];
  const headingPoint =
    options.headingPoint &&
    Number.isFinite(options.headingPoint[0]) &&
    Number.isFinite(options.headingPoint[1])
      ? options.headingPoint
      : null;
  const rawSafeLeft = clamp(safeRect.left, 0, width);
  const rawSafeRight = clamp(safeRect.right, rawSafeLeft, width);
  const rawSafeTop = clamp(safeRect.top, 0, height);
  const rawSafeBottom = clamp(safeRect.bottom, rawSafeTop, height);
  const rawSafeWidth = Math.max(rawSafeRight - rawSafeLeft, 1);
  const rawSafeHeight = Math.max(rawSafeBottom - rawSafeTop, 1);
  const requestedPadding = Number.isFinite(options.padding)
    ? Math.max(options.padding, 0)
    : 30;
  const horizontalPadding = Math.min(requestedPadding, rawSafeWidth * 0.22);
  const verticalPadding = Math.min(requestedPadding, rawSafeHeight * 0.22);
  const safeLeft = rawSafeLeft + horizontalPadding;
  const safeRight = rawSafeRight - horizontalPadding;
  const safeTop = rawSafeTop + verticalPadding;
  const safeBottom = rawSafeBottom - verticalPadding;
  const safeWidth = Math.max(safeRight - safeLeft, 1);
  const safeHeight = Math.max(safeBottom - safeTop, 1);
  const safeCenterX = (safeLeft + safeRight) / 2;
  const safeCenterY = (safeTop + safeBottom) / 2;
  const forwardBias = Number.isFinite(options.forwardBias)
    ? clamp(options.forwardBias, 0, 0.3)
    : 0.14;
  const headingX = headingPoint ? headingPoint[0] - anchorPoint[0] : 0;
  const headingY = headingPoint ? headingPoint[1] - anchorPoint[1] : 0;
  const headingLength = Math.hypot(headingX, headingY);
  const directionX = headingLength ? headingX / headingLength : 0;
  const directionY = headingLength ? headingY / headingLength : 0;
  const anchorScreenX = clamp(
    safeCenterX - directionX * safeWidth * forwardBias,
    safeLeft,
    safeRight,
  );
  const anchorScreenY = clamp(
    safeCenterY - directionY * safeHeight * forwardBias,
    safeTop,
    safeBottom,
  );

  let requiredViewBoxWidth = Number.isFinite(options.minimumWidth)
    ? Math.max(options.minimumWidth, 1)
    : 260;

  for (const [pointX, pointY] of cameraPoints) {
    const deltaX = pointX - anchorPoint[0];
    const horizontalRoom =
      deltaX < 0
        ? anchorScreenX - safeLeft
        : safeRight - anchorScreenX;
    if (Math.abs(deltaX) > 0) {
      requiredViewBoxWidth = Math.max(
        requiredViewBoxWidth,
        (Math.abs(deltaX) * width) / Math.max(horizontalRoom, 1),
      );
    }

    const deltaY = pointY - anchorPoint[1];
    const verticalRoom =
      deltaY < 0 ? anchorScreenY - safeTop : safeBottom - anchorScreenY;
    if (Math.abs(deltaY) > 0) {
      requiredViewBoxWidth = Math.max(
        requiredViewBoxWidth,
        (Math.abs(deltaY) * width) / Math.max(verticalRoom, 1),
      );
    }
  }

  const viewBoxHeight = (requiredViewBoxWidth * height) / width;
  const viewBoxX =
    anchorPoint[0] - (anchorScreenX / width) * requiredViewBoxWidth;
  const viewBoxY =
    anchorPoint[1] - (anchorScreenY / height) * viewBoxHeight;

  return [viewBoxX, viewBoxY, requiredViewBoxWidth, viewBoxHeight];
}

/**
 * @param {[number, number, number, number]} from
 * @param {[number, number, number, number]} to
 * @param {number} progress
 * @returns {[number, number, number, number]}
 */
export function interpolateViewBox(from, to, progress) {
  const amount = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  return /** @type {[number, number, number, number]} */ (
    from.map((value, index) => value + (to[index] - value) * amount)
  );
}

/**
 * Project a map point into CSS pixels. Tracking viewBoxes share the viewport
 * aspect ratio, so no preserveAspectRatio correction is required.
 *
 * @param {[number, number]} point
 * @param {[number, number, number, number]} viewBox
 * @param {{ width: number, height: number }} viewport
 * @returns {[number, number]}
 */
export function projectPointToViewport(point, viewBox, viewport) {
  const width = positiveDimension(viewport.width);
  const height = positiveDimension(viewport.height);
  return [
    ((point[0] - viewBox[0]) / viewBox[2]) * width,
    ((point[1] - viewBox[1]) / viewBox[3]) * height,
  ];
}
