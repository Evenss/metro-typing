/**
 * Short low square-wave cue played for every incorrect character.
 * The shape mirrors the reference Guangzhou Metro Typing implementation.
 */
export const TYPING_ERROR_TONE = Object.freeze({
  frequency: 140,
  duration: 0.11,
  attack: 0.012,
  gain: 0.05,
  floorGain: 0.0001,
  stopTail: 0.05,
  type: "square",
});
