import assert from "node:assert/strict";
import test from "node:test";
import { TYPING_ERROR_TONE } from "../lib/metro/typing-feedback.js";

test("defines the short low square-wave typing error cue", () => {
  assert.equal(TYPING_ERROR_TONE.frequency, 140);
  assert.equal(TYPING_ERROR_TONE.duration, 0.11);
  assert.equal(TYPING_ERROR_TONE.type, "square");
  assert.equal(TYPING_ERROR_TONE.gain, 0.05);
  assert.ok(TYPING_ERROR_TONE.attack > 0);
  assert.ok(TYPING_ERROR_TONE.attack < TYPING_ERROR_TONE.duration);
  assert.ok(TYPING_ERROR_TONE.floorGain > 0);
  assert.ok(TYPING_ERROR_TONE.floorGain < TYPING_ERROR_TONE.gain);
  assert.ok(TYPING_ERROR_TONE.stopTail >= 0);
});
