import assert from "node:assert/strict";
import test from "node:test";
import {
  ARRIVAL_CHIME_COOLDOWN_MS,
  ARRIVAL_CHIME_NOTES,
  ARRIVAL_CHIME_PARTIALS,
  ARRIVAL_CHIME_STRIKE,
  ARRIVAL_FEEDBACK_DURATION_MS,
  COMPLETION_CHIME_NOTES,
  shouldPlayArrivalChime,
} from "../lib/metro/arrival-feedback.js";

test("defines the selected short vintage double strike", () => {
  assert.equal(ARRIVAL_CHIME_NOTES.length, 2);
  assert.equal(ARRIVAL_CHIME_NOTES[1].frequency, ARRIVAL_CHIME_NOTES[0].frequency);
  assert.equal(ARRIVAL_CHIME_NOTES[0].frequency, 987.77);
  assert.equal(ARRIVAL_CHIME_NOTES[1].delay, 0.24);
  assert.ok(ARRIVAL_CHIME_NOTES[1].gain > ARRIVAL_CHIME_NOTES[0].gain);

  const totalDuration = Math.max(
    ...ARRIVAL_CHIME_NOTES.map((note) => note.delay + note.duration),
  );
  assert.ok(totalDuration <= 0.43);
  assert.ok(ARRIVAL_FEEDBACK_DURATION_MS * 0.001 > totalDuration);
  assert.ok(
    ARRIVAL_CHIME_COOLDOWN_MS
      >= Math.round((totalDuration + 0.01) * 1000),
  );

  assert.equal(ARRIVAL_CHIME_PARTIALS[0].ratio, 1);
  assert.ok(ARRIVAL_CHIME_PARTIALS.some((partial) => partial.ratio % 1 !== 0));
  assert.ok(ARRIVAL_CHIME_PARTIALS.at(-1).ratio > 4);
  assert.ok(ARRIVAL_CHIME_PARTIALS.some((partial) => partial.detune !== 0));
  assert.ok(
    ARRIVAL_CHIME_PARTIALS.at(-1).decay < ARRIVAL_CHIME_PARTIALS[0].decay,
  );
  for (const partial of ARRIVAL_CHIME_PARTIALS) {
    assert.ok(partial.ratio > 0);
    assert.ok(partial.level > 0);
    assert.ok(partial.decay > 0 && partial.decay <= 1);
    assert.ok(partial.attack > 0);
  }
  const highestFrequency = Math.max(
    ...ARRIVAL_CHIME_NOTES.flatMap((note) =>
      ARRIVAL_CHIME_PARTIALS.map((partial) => note.frequency * partial.ratio),
    ),
  );
  assert.ok(highestFrequency < 6000);

  assert.ok(ARRIVAL_CHIME_STRIKE.duration <= 0.02);
  assert.ok(ARRIVAL_CHIME_STRIKE.attack < ARRIVAL_CHIME_STRIKE.duration);
  assert.ok(ARRIVAL_CHIME_STRIKE.gain < ARRIVAL_CHIME_NOTES[0].gain);
  assert.ok(ARRIVAL_CHIME_STRIKE.highpass > ARRIVAL_CHIME_NOTES[0].frequency);
  assert.ok(ARRIVAL_CHIME_STRIKE.bandpass > ARRIVAL_CHIME_STRIKE.highpass);
  assert.ok(ARRIVAL_CHIME_STRIKE.bandpass <= 6000);
  assert.ok(ARRIVAL_CHIME_STRIKE.q >= 0.5 && ARRIVAL_CHIME_STRIKE.q <= 2);

  const maximumToneGain = Math.max(...ARRIVAL_CHIME_NOTES.map((note) => note.gain));
  const theoreticalPeak = maximumToneGain
    * ARRIVAL_CHIME_PARTIALS.reduce((sum, partial) => sum + partial.level, 0)
    + ARRIVAL_CHIME_STRIKE.gain;
  assert.ok(theoreticalPeak < 0.08);
});

test("prevents overlapping arrival chimes without suppressing later stations", () => {
  assert.equal(shouldPlayArrivalChime(Number.NEGATIVE_INFINITY, 1000), true);
  assert.equal(shouldPlayArrivalChime(1000, 1000 + ARRIVAL_CHIME_COOLDOWN_MS - 1), false);
  assert.equal(shouldPlayArrivalChime(1000, 1000 + ARRIVAL_CHIME_COOLDOWN_MS), true);
  assert.equal(shouldPlayArrivalChime(1000, Number.NaN), false);
});

test("defines a distinct ascending full-line completion cadence", () => {
  assert.equal(COMPLETION_CHIME_NOTES.length, 3);
  assert.ok(
    COMPLETION_CHIME_NOTES.every((note, index, notes) =>
      index === 0 || note.frequency > notes[index - 1].frequency,
    ),
  );
  assert.ok(
    COMPLETION_CHIME_NOTES.every((note, index, notes) =>
      index === 0 || note.delay > notes[index - 1].delay,
    ),
  );

  const totalDuration = Math.max(
    ...COMPLETION_CHIME_NOTES.map((note) => note.delay + note.duration),
  );
  assert.ok(totalDuration <= 0.85);
  assert.notDeepEqual(COMPLETION_CHIME_NOTES, ARRIVAL_CHIME_NOTES);

  const maximumToneGain = Math.max(
    ...COMPLETION_CHIME_NOTES.map((note) => note.gain),
  );
  const theoreticalPeak = maximumToneGain
    * ARRIVAL_CHIME_PARTIALS.reduce((sum, partial) => sum + partial.level, 0)
    + ARRIVAL_CHIME_STRIKE.gain;
  assert.ok(theoreticalPeak < 0.08);
});
