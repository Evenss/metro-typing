export const ARRIVAL_FEEDBACK_DURATION_MS = 460;
export const ARRIVAL_CHIME_COOLDOWN_MS = 450;

export const ARRIVAL_CHIME_NOTES = Object.freeze([
  Object.freeze({ frequency: 987.77, delay: 0, duration: 0.18, gain: 0.026 }),
  Object.freeze({ frequency: 987.77, delay: 0.24, duration: 0.19, gain: 0.029 }),
]);

export const ARRIVAL_CHIME_PARTIALS = Object.freeze([
  Object.freeze({ ratio: 1, level: 1, decay: 1, attack: 0.002, detune: 0 }),
  Object.freeze({ ratio: 1.62, level: 0.34, decay: 0.72, attack: 0.0015, detune: -3 }),
  Object.freeze({ ratio: 2.47, level: 0.2, decay: 0.46, attack: 0.001, detune: 4 }),
  Object.freeze({ ratio: 4.33, level: 0.07, decay: 0.22, attack: 0.0007, detune: -2 }),
]);

export const ARRIVAL_CHIME_STRIKE = Object.freeze({
  duration: 0.018,
  gain: 0.0055,
  attack: 0.001,
  highpass: 1800,
  bandpass: 4300,
  q: 0.8,
});

/**
 * Keep rapid station completions from stacking multiple chimes on top of one
 * another. Visual feedback still runs for every arrival.
 *
 * @param {number} lastPlayedAt
 * @param {number} now
 * @param {number} [cooldown]
 */
export function shouldPlayArrivalChime(
  lastPlayedAt,
  now,
  cooldown = ARRIVAL_CHIME_COOLDOWN_MS,
) {
  if (!Number.isFinite(now)) return false;
  if (!Number.isFinite(lastPlayedAt)) return true;
  return now - lastPlayedAt >= Math.max(cooldown, 0);
}
