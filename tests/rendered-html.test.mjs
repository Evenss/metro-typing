import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const repo = new URL("../", import.meta.url);
const out = new URL("../out/", import.meta.url);

function read(relativePath) {
  return readFile(new URL(relativePath, repo), "utf8");
}

test("exports a static Hangzhou Metro Typing shell and metadata", async () => {
  const html = await read("out/index.html");

  assert.match(html, /HANGZHOU METRO TYPING/);
  assert.match(html, /杭州地铁站名打字练习/);
  assert.match(html, /用杭州真实地铁线路与站名练习中英文打字/);
  assert.match(html, /http:\/\/localhost:3000\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Starter Project/);
});

test("ships complete static assets without server-only templates", async () => {
  const [rawData, page, layout, client, css, packageJson, ogStats, nextAssets] =
    await Promise.all([
      read("public/data/hangzhou-metro.json"),
      read("app/page.tsx"),
      read("app/layout.tsx"),
      read("app/MetroTyping.tsx"),
      read("app/globals.css"),
      read("package.json"),
      stat(new URL("../out/og.png", import.meta.url)),
      readdir(new URL("_next/static/", out)),
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
  assert.ok(nextAssets.length > 0);
  assert.match(page, /<MetroTyping \/>/);
  assert.match(layout, /export const metadata/);
  assert.doesNotMatch(layout, /headers\(|generateMetadata/);
  assert.match(client, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(client, /30_000/);
  assert.match(client, /compositionEnd/i);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|drizzle|cloudflare|vite/);
  await access(new URL("data/hangzhou-metro.json", out));
  await assert.rejects(access(new URL("worker/", repo)));
  await assert.rejects(access(new URL("db/", repo)));
});
