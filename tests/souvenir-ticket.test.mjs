import assert from "node:assert/strict";
import test from "node:test";
import {
  createSouvenirTicketFileName,
  createSouvenirTicketShareText,
  shouldCreateSouvenirTicket,
} from "../lib/metro/souvenir-ticket.js";

test("only full-line mode completion earns a souvenir ticket", () => {
  assert.equal(shouldCreateSouvenirTicket("line", "line"), true);
  assert.equal(shouldCreateSouvenirTicket("timed", "line"), false);
  assert.equal(shouldCreateSouvenirTicket("timed", "timed"), false);
  assert.equal(
    shouldCreateSouvenirTicket("line", "timed"),
    false,
    "a timed run that reaches the final station must not create a ticket",
  );
});

test("creates a portable PNG filename for lines with aliases", () => {
  assert.equal(
    createSouvenirTicketFileName("深圳", "1号线/罗宝线"),
    "地铁打字-深圳-1号线-罗宝线-全线纪念票.png",
  );
  assert.doesNotMatch(
    createSouvenirTicketFileName("重庆", '环线:*?"'),
    /[\\/:*?"<>|]/,
  );
});

test("share copy carries every required ticket fact", () => {
  const text = createSouvenirTicketShareText({
    cityName: "北京",
    lineName: "2号线",
    direction: "经鼓楼大街 · 从积水潭出发",
    stationCount: 18,
  });

  assert.match(text, /北京/);
  assert.match(text, /2号线/);
  assert.match(text, /经鼓楼大街/);
  assert.match(text, /18 站/);
  assert.match(text, /全线通关纪念票/);
});
