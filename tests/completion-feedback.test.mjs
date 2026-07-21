import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repo = new URL("../", import.meta.url);

function read(relativePath) {
  return readFile(new URL(relativePath, repo), "utf8");
}

test("keeps full-line completion visible before showing its result", async () => {
  const client = await read("app/MetroTyping.tsx");

  assert.match(client, /type Screen = "home" \| "game" \| "completing" \| "result"/);
  assert.match(client, /type CompletionReason = "timed" \| "line"/);
  assert.match(client, /if \(stationIndexRef\.current >= stations\.length - 1\)/);
  assert.doesNotMatch(
    client,
    /modeRef\.current === "line" &&\s*stationIndexRef\.current >= stations\.length - 1/,
  );
  assert.match(client, /finishGame\("line", performance\.now\(\) - startedAtRef\.current\)/);
  assert.match(client, /finishGame\("timed", GAME_DURATION\)/);
  assert.match(client, /reason === "line" && !reducedMotion \? "completing" : "result"/);
  assert.match(client, /prefers-reduced-motion: reduce/);
  assert.match(client, /screen !== "completing"/);
  assert.match(client, /current === "completing" \? "result" : current/);
  assert.match(client, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(client, /screen === "game" \|\| screen === "completing"/);
  assert.match(client, /journeyVisible && selectedLine && currentStation/);
  assert.match(client, /if \(screen === "game"\) \{[\s\S]{0,160}inputRef\.current\?\.focus/);
});

test("renders a route-specific completion ceremony and persistent result", async () => {
  const [client, css] = await Promise.all([
    read("app/MetroTyping.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(client, /data-completing=\{completing \? "true" : "false"\}/);
  assert.match(client, /className="game-completion-line"/);
  assert.match(client, /className="terminal-completion-rings"/);
  assert.match(client, /\.\.\.journeyPoints, journeyPoints\[0\]/);
  assert.match(client, /key=\{completing \? "completion"/);
  assert.match(client, /FULL LINE COMPLETE/);
  assert.match(client, /LOOP LINE COMPLETE/);
  assert.match(client, /全线到达/);
  assert.match(client, /环线全站完成/);
  assert.match(client, /TIME UP/);
  assert.match(client, /时间到，这班车先停在这里/);
  assert.match(client, /completionReason === "line"/);
  assert.match(client, /headingRef\.current\?\.focus/);
  assert.match(client, /aria-describedby="result-summary"/);
  assert.match(client, /disabled=\{screen !== "game"\}/);
  assert.match(client, /COMPLETION_CHIME_NOTES/);
  assert.match(client, /playChime\(COMPLETION_CHIME_NOTES, false\)/);
  assert.match(client, /"--active-route-ink": getReadableTextColor\(line\.color\)/);
  assert.match(client, /"--result-route-ink": getReadableTextColor\(routeColor\)/);

  assert.match(css, /\.game-completion-line/);
  assert.match(css, /\.game-node\.completed/);
  assert.match(css, /\.terminal-completion-rings/);
  assert.match(css, /\.station-card\.completing/);
  assert.match(css, /\.completion-ticket/);
  assert.match(css, /\.result-route-summary/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
