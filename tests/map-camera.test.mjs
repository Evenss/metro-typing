import assert from "node:assert/strict";
import test from "node:test";
import {
  getDepartureCameraFraming,
  getGameSafeRect,
  getJourneyCameraMinimumWidth,
  getMobileKeyboardViewport,
  getTrackingViewBox,
  interpolateViewBox,
  projectPointToViewport,
} from "../lib/metro/map-camera.js";

function assertPointInside(point, rect, message) {
  assert.ok(point[0] >= rect.left, `${message}: x should clear left edge`);
  assert.ok(point[0] <= rect.right, `${message}: x should clear right edge`);
  assert.ok(point[1] >= rect.top, `${message}: y should clear top edge`);
  assert.ok(point[1] <= rect.bottom, `${message}: y should clear bottom edge`);
}

test("derives desktop and mobile safe rectangles from measured overlays", () => {
  assert.deepEqual(
    getGameSafeRect(
      { width: 1280, height: 720 },
      { chromeBottom: 76, scoreTop: 379, cardTop: 472 },
    ),
    { left: 24, top: 92, right: 1256, bottom: 359 },
  );
  assert.deepEqual(
    getGameSafeRect(
      { width: 390, height: 844 },
      { chromeBottom: 62, scoreTop: 510, cardTop: 592 },
    ),
    { left: 12, top: 74, right: 378, bottom: 498 },
  );
  assert.deepEqual(
    getGameSafeRect(
      { width: 390, height: 844 },
      { chromeBottom: 62, scoreTop: 510, cardTop: 592 },
      { top: 47, right: 8, bottom: 34, left: 8 },
    ),
    { left: 20, top: 74, right: 370, bottom: 498 },
  );
});

test("detects only a mobile software keyboard obstruction", () => {
  assert.deepEqual(
    getMobileKeyboardViewport({
      layoutHeight: 844,
      visualHeight: 430,
      mobile: true,
    }),
    { open: true, tight: false, inset: 414 },
  );
  assert.deepEqual(
    getMobileKeyboardViewport({
      layoutHeight: 844,
      visualHeight: 430,
      visualOffsetTop: 120,
      mobile: true,
    }),
    { open: true, tight: false, inset: 294 },
  );
  assert.deepEqual(
    getMobileKeyboardViewport({
      layoutHeight: 390,
      visualHeight: 210,
      mobile: true,
    }),
    { open: true, tight: true, inset: 180 },
  );
  assert.deepEqual(
    getMobileKeyboardViewport({
      layoutHeight: 844,
      visualHeight: 774,
      mobile: true,
    }),
    { open: false, tight: false, inset: 0 },
  );
  assert.deepEqual(
    getMobileKeyboardViewport({
      layoutHeight: 844,
      visualHeight: 430,
      mobile: false,
    }),
    { open: false, tight: false, inset: 0 },
  );
  assert.deepEqual(
    getMobileKeyboardViewport({
      layoutHeight: 844,
      visualHeight: 430,
      visualScale: 2,
      mobile: true,
    }),
    { open: false, tight: false, inset: 0 },
  );
});

test("zooms compact short journeys without over-zooming distant short lines", () => {
  const compactJourney = [
    [600.9, 317.3],
    [604, 323.5],
    [605, 328.4],
    [605, 332],
  ];
  const distantShortJourney = [
    [693.4, 371.4],
    [700.1, 439.4],
    [724.3, 576.1],
  ];

  const compactDeparture = getDepartureCameraFraming(compactJourney);
  const distantDeparture = getDepartureCameraFraming(distantShortJourney);
  assert.equal(compactDeparture.minimumWidth, 120);
  assert.equal(compactDeparture.padding, 24);
  assert.equal(distantDeparture.minimumWidth, 440);
  assert.ok(distantDeparture.padding > compactDeparture.padding);

  assert.equal(getJourneyCameraMinimumWidth(compactJourney, 2560), 170);
  assert.equal(
    getJourneyCameraMinimumWidth(compactJourney, 2560, true),
    210,
  );
  assert.equal(getJourneyCameraMinimumWidth(compactJourney, 390), 150);
  assert.equal(getJourneyCameraMinimumWidth(distantShortJourney, 2560), 420);
});

test("keeps an entire typed segment inside the unobstructed mobile area", () => {
  const viewport = { width: 390, height: 844 };
  const safeRect = getGameSafeRect(
    viewport,
    { chromeBottom: 62, scoreTop: 510, cardTop: 592 },
  );
  const current = [0, 0];
  const next = [72, 18];
  const lookahead = [126, 46];
  const viewBox = getTrackingViewBox(
    [current, next, lookahead],
    viewport,
    safeRect,
    {
      anchorPoint: current,
      headingPoint: next,
      minimumWidth: 260,
      padding: 30,
    },
  );

  for (const [label, point] of [
    ["current", current],
    ["halfway", [36, 9]],
    ["next", next],
    ["lookahead", lookahead],
  ]) {
    assertPointInside(
      projectPointToViewport(point, viewBox, viewport),
      safeRect,
      label,
    );
  }

  const currentOnScreen = projectPointToViewport(current, viewBox, viewport);
  assert.ok(
    currentOnScreen[0] < (safeRect.left + safeRect.right) / 2,
    "the train should sit behind center when travelling to the right",
  );
  assert.ok(
    Math.abs(viewBox[2] / viewBox[3] - viewport.width / viewport.height) <
      Number.EPSILON,
  );
});

test("reversing a journey focuses its opposite origin without full-line bounds", () => {
  const viewport = { width: 1280, height: 720 };
  const safeRect = getGameSafeRect(
    viewport,
    { chromeBottom: 76, scoreTop: 379, cardTop: 472 },
  );
  const forwardPoints = [[0, 0], [55, 8], [110, 20]];
  const reversePoints = [[1000, 120], [945, 112], [890, 100]];
  const options = { minimumWidth: 340, padding: 30 };
  const forwardViewBox = getTrackingViewBox(
    forwardPoints,
    viewport,
    safeRect,
    {
      ...options,
      anchorPoint: forwardPoints[0],
      headingPoint: forwardPoints[1],
    },
  );
  const reverseViewBox = getTrackingViewBox(
    reversePoints,
    viewport,
    safeRect,
    {
      ...options,
      anchorPoint: reversePoints[0],
      headingPoint: reversePoints[1],
    },
  );

  assert.ok(Math.abs(forwardViewBox[0] - reverseViewBox[0]) > 500);
  assert.ok(forwardViewBox[2] < 500, "a remote line end must not zoom out the origin");
  assert.ok(reverseViewBox[2] < 500, "the reversed origin remains a local view");
  assertPointInside(
    projectPointToViewport(forwardPoints[0], forwardViewBox, viewport),
    safeRect,
    "forward origin",
  );
  assertPointInside(
    projectPointToViewport(reversePoints[0], reverseViewBox, viewport),
    safeRect,
    "reverse origin",
  );
});

test("widens safely for unusually long station gaps", () => {
  const viewport = { width: 390, height: 844 };
  const safeRect = getGameSafeRect(
    viewport,
    { chromeBottom: 62, scoreTop: 510, cardTop: 592 },
  );
  const current = [500, 100];
  const next = [500, 500];
  const viewBox = getTrackingViewBox(
    [current, next],
    viewport,
    safeRect,
    {
      anchorPoint: current,
      headingPoint: next,
      minimumWidth: 260,
      padding: 30,
    },
  );

  assert.ok(viewBox[2] > 260);
  assert.ok(viewBox.every(Number.isFinite));
  assertPointInside(
    projectPointToViewport(current, viewBox, viewport),
    safeRect,
    "long-gap origin",
  );
  assertPointInside(
    projectPointToViewport(next, viewBox, viewport),
    safeRect,
    "long-gap destination",
  );
});

test("interpolates viewBoxes monotonically and supports interruption", () => {
  const first = [0, 0, 300, 180];
  const second = [100, 80, 420, 260];
  const third = [-40, 200, 360, 220];

  assert.deepEqual(interpolateViewBox(first, second, -1), first);
  assert.deepEqual(interpolateViewBox(first, second, 0), first);
  assert.deepEqual(interpolateViewBox(first, second, 1), second);
  assert.deepEqual(interpolateViewBox(first, second, 2), second);

  let previousDistance = Number.POSITIVE_INFINITY;
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const value = interpolateViewBox(first, second, progress);
    const distance = value.reduce(
      (total, component, index) => total + Math.abs(second[index] - component),
      0,
    );
    assert.ok(distance <= previousDistance);
    previousDistance = distance;
  }

  const interruptedAt = interpolateViewBox(first, second, 0.4);
  assert.deepEqual(interpolateViewBox(interruptedAt, third, 0), interruptedAt);
  assert.deepEqual(interpolateViewBox(interruptedAt, third, 1), third);
});
