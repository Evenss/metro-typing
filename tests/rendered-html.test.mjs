import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cityIds,
  readMetroData,
  validateMetroDataFiles,
} from "../scripts/validate-metro-data.mjs";
import {
  getTypingDisplayText,
  getTypingDisplayTokens,
  getTypingTarget,
  normalizeTypingCharacter,
} from "../lib/metro/typing.js";
import {
  compressBeforeFocus,
  compressPointBeforeFocus,
  isPointInRing,
} from "../lib/metro/map-geometry.js";

const repo = new URL("../", import.meta.url);
const repoPath = fileURLToPath(repo);
const out = new URL("../out/", import.meta.url);

const cityExpectations = {
  hangzhou: { nameZh: "杭州", nameEn: "HANGZHOU", lines: 12, stations: 259 },
  shanghai: { nameZh: "上海", nameEn: "SHANGHAI", lines: 21, stations: 418 },
  beijing: { nameZh: "北京", nameEn: "BEIJING", lines: 27, stations: 410 },
  shenzhen: { nameZh: "深圳", nameEn: "SHENZHEN", lines: 16, stations: 351 },
  chengdu: { nameZh: "成都", nameEn: "CHENGDU", lines: 17, stations: 357 },
};

function read(relativePath) {
  return readFile(new URL(relativePath, repo), "utf8");
}

function readOutput(relativePath) {
  return readFile(new URL(relativePath, out), "utf8");
}

test("exports one canonical static page for every supported city", async () => {
  for (const cityId of cityIds) {
    const expected = cityExpectations[cityId];
    const html = await readOutput(`${cityId}/index.html`);
    assert.match(html, new RegExp(`${expected.nameEn} METRO TYPING`));
    assert.match(html, new RegExp(`${expected.nameZh}地铁站名打字练习`));
    assert.match(
      html,
      new RegExp(`用${expected.nameZh}真实地铁线路与站名练习英文或拼音打字`),
    );
    assert.match(
      html,
      new RegExp(`rel="canonical" href="http://localhost:3000/${cityId}/`),
    );
    assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Starter Project/);
    await access(new URL(`data/metro/${cityId}.json`, out));
  }

  const rootHtml = await readOutput("index.html");
  assert.match(rootHtml, /HANGZHOU METRO TYPING/);
  assert.match(
    rootHtml,
    /rel="canonical" href="http:\/\/localhost:3000\/hangzhou\//,
  );
});

test("ships five strict, internally consistent metro datasets", async () => {
  const results = await validateMetroDataFiles(repoPath);
  assert.deepEqual(
    results.map(({ cityId, lines, stations }) => ({ cityId, lines, stations })),
    cityIds.map((cityId) => ({ cityId, ...cityExpectations[cityId] })).map(
      ({ cityId, lines, stations }) => ({ cityId, lines, stations }),
    ),
  );
});

test("prepares and preserves the complete Hangzhou route map", async () => {
  const [packageJson, hangzhou, cityConfigs] = await Promise.all([
    read("package.json").then(JSON.parse),
    readMetroData("hangzhou", repoPath),
    read("lib/metro/cities.ts"),
  ]);
  const prepareCities = packageJson.scripts["prepare:cities"];
  const hangzhouConfig = cityConfigs.slice(
    cityConfigs.indexOf('id: "hangzhou"'),
    cityConfigs.indexOf('id: "shanghai"'),
  );

  assert.match(prepareCities, /prepare-hangzhou-data\.mjs/);
  assert.match(prepareCities, /prepare-city-data\.mjs/);
  assert.match(prepareCities, /validate-metro-data\.mjs/);
  assert.equal(packageJson.scripts["prepare:data"], "npm run prepare:cities");
  assert.match(
    hangzhouConfig,
    /excludedDistricts:\s*\["桐庐县", "淳安县", "建德市"\]/,
  );
  assert.match(
    hangzhouConfig,
    /districtContext:[\s\S]*districts: \["临安区", "富阳区"\]/,
  );
  assert.equal(hangzhou.lines.length, 12);
  assert.equal(
    hangzhou.lines.reduce((total, line) => total + line.mapPaths.length, 0),
    14,
  );
  assert.equal(
    hangzhou.lines
      .flatMap((line) => line.mapPaths)
      .reduce((total, mapPath) => total + mapPath.stationIds.length, 0),
    353,
  );
});

test("generalizes remote district context without clipping its geometry", () => {
  const focus = 450;
  const contextWidth = 48;
  const remoteCoordinates = [50, 180, 320, 420];
  const compressed = remoteCoordinates.map((coordinate) =>
    compressBeforeFocus(coordinate, focus, contextWidth),
  );

  assert.ok(compressed.every((coordinate) => coordinate > focus - contextWidth));
  assert.deepEqual([...compressed].sort((a, b) => a - b), compressed);
  assert.equal(new Set(compressed).size, remoteCoordinates.length);
  assert.equal(compressBeforeFocus(focus, focus, contextWidth), focus);
  assert.equal(compressBeforeFocus(520, focus, contextWidth), 520);
  assert.ok(compressBeforeFocus(449.999, focus, contextWidth) < focus);
  assert.ok(compressBeforeFocus(449.999, focus, contextWidth) > 449.998);

  const remotePoint = compressPointBeforeFocus(
    [50, 700],
    focus,
    contextWidth,
    350,
    0.32,
  );
  assert.ok(remotePoint[0] > focus - contextWidth);
  assert.ok(remotePoint[1] > 350);
  assert.ok(remotePoint[1] < 470);
  assert.deepEqual(
    compressPointBeforeFocus([520, 700], focus, contextWidth, 350, 0.32),
    [520, 700],
  );

  const ring = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(isPointInRing([5, 5], ring), true);
  assert.equal(isPointInRing([15, 5], ring), false);
});

test("ships normalized pinyin for every station", async () => {
  for (const cityId of cityIds) {
    const data = await readMetroData(cityId, repoPath);
    for (const station of Object.values(data.stations)) {
      assert.match(
        station.namePinyin,
        /^[a-z0-9ü]+(?: [a-z0-9ü]+)*$/,
        `${station.id} should have normalized syllable-separated pinyin`,
      );
    }
  }

  const [hangzhou, shanghai, beijing, shenzhen] = await Promise.all([
    readMetroData("hangzhou", repoPath),
    readMetroData("shanghai", repoPath),
    readMetroData("beijing", repoPath),
    readMetroData("shenzhen", repoPath),
  ]);
  assert.equal(hangzhou.stations["hangzhou:受降"].namePinyin, "shou xiang");
  assert.equal(hangzhou.stations["hangzhou:绿汀路"].namePinyin, "lü ting lu");
  assert.equal(hangzhou.stations["hangzhou:闸弄口"].namePinyin, "zha long kou");
  assert.equal(hangzhou.stations["hangzhou:阳陂湖"].namePinyin, "yang bei hu");
  assert.equal(hangzhou.stations["hangzhou:枸桔弄"].namePinyin, "gou ju long");
  assert.equal(shanghai.stations["shanghai:陕西南路"].namePinyin, "shan xi nan lu");
  assert.equal(beijing.stations["beijing:朝阳门"].namePinyin, "chao yang men");
  assert.equal(shenzhen.stations["shenzhen:岗厦北"].namePinyin, "gang xia bei");
  assert.equal(shenzhen.stations["shenzhen:石厦"].namePinyin, "shi xia");
  assert.equal(shenzhen.stations["shenzhen:长岭陂"].namePinyin, "chang ling pi");
});

test("keeps displayed spaces optional in English and pinyin input", () => {
  const station = { nameEn: "Luting Road", namePinyin: "lü ting lu" };
  const punctuatedStation = {
    nameEn: "People's Square",
    namePinyin: "ren min guang chang",
  };
  assert.equal(getTypingDisplayText(station, "pinyin"), "lü ting lu");
  assert.equal(getTypingDisplayText(station, "en"), "luting road");
  assert.equal(getTypingTarget(station, "pinyin"), "lvtinglu");
  assert.equal(getTypingTarget(station, "en"), "lutingroad");
  assert.equal(normalizeTypingCharacter("v", "pinyin"), "v");
  assert.equal(normalizeTypingCharacter("ü", "pinyin"), "v");
  assert.equal(normalizeTypingCharacter(" ", "pinyin"), "");
  assert.equal(normalizeTypingCharacter(" ", "en"), "");
  assert.equal(
    getTypingTarget({ nameEn: "", namePinyin: "17 hao xian" }, "pinyin"),
    "17haoxian",
  );
  assert.deepEqual(
    getTypingDisplayTokens(getTypingDisplayText(station, "pinyin")).map(
      ({ characters, startIndex, visualSeparator }) => ({
        text: characters.join(""),
        startIndex,
        visualSeparator,
      }),
    ),
    [
      { text: "lü", startIndex: 0, visualSeparator: true },
      { text: "ting", startIndex: 2, visualSeparator: true },
      { text: "lu", startIndex: 6, visualSeparator: false },
    ],
  );
  assert.deepEqual(
    getTypingDisplayTokens(getTypingDisplayText(station, "en")).map(
      ({ characters, startIndex, visualSeparator }) => ({
        text: characters.join(""),
        startIndex,
        visualSeparator,
      }),
    ),
    [
      { text: "luting", startIndex: 0, visualSeparator: true },
      { text: "road", startIndex: 6, visualSeparator: false },
    ],
  );
  assert.equal(
    getTypingDisplayText(punctuatedStation, "en"),
    "peoples square",
  );
  assert.equal(getTypingTarget(punctuatedStation, "en"), "peoplessquare");
  assert.deepEqual(
    getTypingDisplayTokens(getTypingDisplayText(punctuatedStation, "en")).map(
      ({ characters, startIndex }) => ({
        text: characters.join(""),
        startIndex,
      }),
    ),
    [
      { text: "peoples", startIndex: 0 },
      { text: "square", startIndex: 7 },
    ],
  );
});

test("models branches, loops, asymmetric services, and city exceptions", async () => {
  const [shanghai, beijing, shenzhen, chengdu] = await Promise.all([
    readMetroData("shanghai", repoPath),
    readMetroData("beijing", repoPath),
    readMetroData("shenzhen", repoPath),
    readMetroData("chengdu", repoPath),
  ]);

  assert.equal(shanghai.lines.find((line) => line.lineName === "10号线").runs.length, 2);
  assert.equal(shanghai.lines.find((line) => line.lineName === "4号线").runs[0].kind, "loop");

  assert.equal(beijing.lines.find((line) => line.lineName === "2号线").runs[0].kind, "loop");
  const airportDirections = beijing.lines.find(
    (line) => line.lineName === "首都机场线",
  ).runs[0].directions;
  assert.deepEqual(
    airportDirections.map((direction) => direction.stationIds.length),
    [5, 4],
  );

  assert.ok(!shenzhen.lines.some((line) => line.lineName.includes("云巴")));
  assert.equal(
    shenzhen.lines.find((line) => line.lineName.startsWith("4号线")).operatorName,
    "港铁（深圳）",
  );

  assert.equal(chengdu.lines.find((line) => line.lineName === "1号线").runs.length, 2);
  assert.equal(chengdu.lines.find((line) => line.lineName === "7号线").runs[0].kind, "loop");
  assert.equal(
    chengdu.lines.find((line) => line.lineName === "S3（资阳）线").stationIds.length,
    6,
  );
  assert.ok(chengdu.districts.some((district) => district.name === "雁江区"));
});

test("ships complete static assets and generic multi-city runtime", async () => {
  const [page, layout, client, css, packageJson, ogStats, nextAssets, sitemap] =
    await Promise.all([
      read("app/page.tsx"),
      read("app/layout.tsx"),
      read("app/MetroTyping.tsx"),
      read("app/globals.css"),
      read("package.json"),
      stat(new URL("../out/og.png", import.meta.url)),
      readdir(new URL("_next/static/", out)),
      readOutput("sitemap.xml"),
    ]);

  assert.ok(ogStats.size > 100_000);
  assert.ok(nextAssets.length > 0);
  assert.match(page, /cityId="hangzhou"/);
  assert.match(layout, /城市地铁站名打字练习/);
  assert.match(client, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(client, /city-switcher/);
  assert.match(client, /30_000/);
  assert.match(client, /compositionEnd/i);
  assert.match(client, /type TypingLanguage = "en" \| "pinyin"/);
  assert.match(client, /value: "pinyin", label: "拼音"/);
  assert.match(client, /KPM/);
  assert.doesNotMatch(client, /中文站名输入|使用输入法选字/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.city-menu/);
  assert.match(css, /\.typing-area\.has-hint/);
  assert.match(css, /\.typing-optional-space/);
  assert.match(packageJson, /"name": "metro-typing"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|drizzle|cloudflare|vite/);
  for (const cityId of cityIds) {
    assert.match(sitemap, new RegExp(`http://localhost:3000/${cityId}/`));
  }
  await assert.rejects(access(new URL("data/hangzhou-metro.json", out)));
  await assert.rejects(access(new URL("worker/", repo)));
  await assert.rejects(access(new URL("db/", repo)));
});

test("uses stable icons, accessible city controls, and page-wide themes", async () => {
  const [client, css] = await Promise.all([
    read("app/MetroTyping.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(client, /function MoonIcon\(\)/);
  assert.match(client, /function SunIcon\(\)/);
  assert.match(client, /function GitHubIcon\(\)/);
  assert.match(client, /function ChevronDownIcon\(\)/);
  assert.doesNotMatch(client, />⌄</);
  assert.match(client, /aria-label=\{themeLabel\}/);
  assert.match(client, /aria-current=/);
  assert.match(client, /https:\/\/github\.com\/Evenss\/metro-typing/);
  assert.match(client, /requestAnimationFrame/);
  assert.match(client, /ResizeObserver/);
  assert.match(client, /document\.fonts\.ready/);
  assert.match(css, /:root\.dark/);
  assert.match(css, /\.icon-button:focus-visible/);
  assert.match(css, /\.city-map\.intro/);
  assert.match(css, /\.city-switcher summary:focus-visible/);
});
