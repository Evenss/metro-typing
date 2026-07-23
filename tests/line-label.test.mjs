import assert from "node:assert/strict";
import test from "node:test";
import { getLineBadgeLabel } from "../lib/metro/line-label.js";

test("shortens long Chinese route badges to two characters", () => {
  assert.equal(getLineBadgeLabel("市域机场"), "市域");
  assert.equal(getLineBadgeLabel("大兴机场"), "大兴");
  assert.equal(getLineBadgeLabel("首都机场"), "首都");
  assert.equal(getLineBadgeLabel("轨道交通国博"), "轨道");
});

test("preserves compact numeric and Latin route identifiers", () => {
  assert.equal(getLineBadgeLabel("11"), "11");
  assert.equal(getLineBadgeLabel("APM"), "APM");
  assert.equal(getLineBadgeLabel("2/8"), "2/8");
  assert.equal(getLineBadgeLabel(" S3 "), "S3");
});
