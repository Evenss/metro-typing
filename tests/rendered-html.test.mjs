import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Hangzhou Metro Typing shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /HANGZHOU METRO TYPING/);
  assert.match(html, /杭州地铁站名打字练习/);
  assert.match(html, /用杭州真实地铁线路与站名练习中英文打字/);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Starter Project/);
});

test("ships complete Hangzhou route data and removes starter assets", async () => {
  const [rawData, page, layout, client, css, packageJson, ogStats] =
    await Promise.all([
      readFile(new URL("../public/data/hangzhou-metro.json", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/MetroTyping.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      stat(new URL("../public/og.png", import.meta.url)),
    ]);

  const data = JSON.parse(rawData);
  assert.equal(data.lines.length, 12);
  assert.deepEqual(data.lines.map((line) => line.id), [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "16", "19",
  ]);
  assert.equal(
    new Set(data.lines.flatMap((line) => line.stations.map((station) => station.nameZh))).size,
    259,
  );
  assert.ok(ogStats.size > 100_000);
  assert.match(page, /<MetroTyping \/>/);
  assert.match(layout, /generateMetadata/);
  assert.match(client, /30_000/);
  assert.match(client, /compositionEnd/i);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
