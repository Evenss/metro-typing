import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateMetroData } from "./metro-data-validation.mjs";
import { resolveStationPinyin } from "./pinyin-normalization.mjs";

const UPDATED_AT = "2026-07-18";

const citySpecs = {
  shanghai: {
    nameZh: "上海",
    nameEn: "Shanghai",
    operatorName: "上海轨道交通",
    amapUrl: "https://webapi.amap.com/subway/data/3100_drw_shanghai.json",
    boundaryUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/310000_full.json",
    excludedLines: [],
  },
  beijing: {
    nameZh: "北京",
    nameEn: "Beijing",
    operatorName: "北京轨道交通",
    amapUrl: "https://webapi.amap.com/subway/data/1100_drw_beijing.json",
    boundaryUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/110000_full.json",
    excludedLines: [],
  },
  shenzhen: {
    nameZh: "深圳",
    nameEn: "Shenzhen",
    operatorName: "深圳地铁",
    amapUrl: "https://webapi.amap.com/subway/data/4403_drw_shenzhen.json",
    boundaryUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/440300_full.json",
    excludedLines: ["坪山云巴1号线"],
    operatorOverrides: {
      "4号线/龙华线": "港铁（深圳）",
      "13号线/石岩线": "港铁（深圳）",
    },
  },
  chengdu: {
    nameZh: "成都",
    nameEn: "Chengdu",
    operatorName: "成都轨道交通",
    amapUrl: "https://webapi.amap.com/subway/data/5101_drw_chengdu.json",
    boundaryUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/510100_full.json",
    excludedLines: [],
    extraBoundaries: [
      {
        url: "https://geo.datav.aliyun.com/areas_v3/bound/512000_full.json",
        includedDistricts: ["雁江区"],
      },
    ],
  },
};

function normalizeName(value) {
  return value
    .normalize("NFKC")
    .trim()
    .replaceAll("(", "（")
    .replaceAll(")", "）");
}

function stationId(cityId, nameZh) {
  return `${cityId}:${normalizeName(nameZh)}`;
}

function normalizeEnglishName(station) {
  const official = station.en?.normalize("NFKC").trim();
  if (official) return official;

  const pinyin = station.sp?.normalize("NFKC").trim();
  if (!pinyin) return normalizeName(station.n);
  return pinyin
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function lineCode(lineName) {
  const numberedLines = [...lineName.matchAll(/(\d+)号线/g)].map(
    (match) => match[1],
  );
  if (numberedLines.length) {
    const code = numberedLines.join("/");
    return lineName.includes("支线") ? `${code}支` : code;
  }
  const letteredLine = lineName.match(/^([A-Z]+\d+)/i)?.[1];
  if (letteredLine) return letteredLine.toUpperCase();
  return lineName
    .replace(/地铁/g, "")
    .replace(/号线$/, "")
    .replace(/线$/, "")
    .trim();
}

function lineId(cityId, lineName) {
  const code = lineCode(lineName)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u3400-\u9fff-]/g, "");
  return `${cityId}-${code || "line"}`;
}

function normalizeColor(value) {
  const color = String(value || "").replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(color) ? `#${color}` : "#777777";
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueAdjacent(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function squaredDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const ratio =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) {
      x = end[0];
      y = end[1];
    } else if (ratio > 0) {
      x += dx * ratio;
      y += dy * ratio;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyRing(points, tolerance = 0.003) {
  if (points.length <= 8) return points;
  const first = points[0];
  const last = points.at(-1);
  let maxDistance = 0;
  let index = 0;

  for (let cursor = 1; cursor < points.length - 1; cursor += 1) {
    const distance = squaredDistance(points[cursor], first, last);
    if (distance > maxDistance) {
      index = cursor;
      maxDistance = distance;
    }
  }

  if (maxDistance > tolerance * tolerance) {
    const left = simplifyRing(points.slice(0, index + 1), tolerance);
    const right = simplifyRing(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function collectRings(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) =>
    polygon
      .filter((ring) => ring.length > 3)
      .map((ring) => simplifyRing(ring)),
  );
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function makeStation(cityId, rawStation) {
  const nameZh = normalizeName(rawStation.n);
  const [lon, lat] = String(rawStation.sl).split(",").map(Number);
  if (!nameZh || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return {
    id: stationId(cityId, nameZh),
    nameZh,
    nameEn: normalizeEnglishName(rawStation),
    namePinyin: resolveStationPinyin(cityId, nameZh, rawStation.sp),
    lon,
    lat,
  };
}

function prepareNetwork(cityId, spec, amap) {
  const groupedLines = new Map();
  for (const rawLine of amap.l ?? []) {
    const name = normalizeName(rawLine.ln || rawLine.kn || "");
    if (!name || rawLine.su === "0" || spec.excludedLines.includes(name)) continue;
    const rawStations = (rawLine.st ?? []).filter(
      (station) => !station.su || station.su === "1",
    );
    if (rawStations.length < 2) continue;
    const group = groupedLines.get(name) ?? [];
    group.push({ ...rawLine, st: rawStations });
    groupedLines.set(name, group);
  }

  const stations = {};
  const lines = [];

  for (const [name, rawLines] of groupedLines) {
    const paths = [];

    for (const rawLine of rawLines) {
      const pathStations = rawLine.st
        .map((rawStation) => makeStation(cityId, rawStation))
        .filter(Boolean);
      for (const station of pathStations) {
        const current = stations[station.id];
        if (!current || (current.nameEn === current.nameZh && station.nameEn !== station.nameZh)) {
          stations[station.id] = station;
        }
      }

      const runStationIds = uniqueAdjacent(
        pathStations.map((station) => station.id),
      );
      const isLoop = rawLine.lo === "1";
      const mapStationIds = [...runStationIds];
      if (isLoop && mapStationIds[0] !== mapStationIds.at(-1)) {
        mapStationIds.push(mapStationIds[0]);
      }
      if (runStationIds.length < 2) continue;
      paths.push({
        id: String(rawLine.ls || `${lineId(cityId, name)}-${paths.length + 1}`),
        label: normalizeName(rawLine.la || ""),
        stationIds: mapStationIds,
        runStationIds,
        closed: isLoop,
      });
    }

    if (!paths.length) continue;
    const id = lineId(cityId, name);
    const isBranched = paths.length > 1;
    const runs = paths.map((metroPath, index) => {
      const first = stations[metroPath.runStationIds[0]];
      const second = stations[metroPath.runStationIds[1]];
      const last = stations[metroPath.runStationIds.at(-1)];
      const beforeLast = stations[metroPath.runStationIds.at(-2)];
      const isLoop = metroPath.closed;
      const defaultName = isLoop
        ? `${first.nameZh}环线`
        : `${first.nameZh}—${last.nameZh}`;
      const forwardLabel = isLoop ? `经${second.nameZh}` : "正向";
      const reverseLabel = isLoop ? `经${beforeLast.nameZh}` : "反向";

      return {
        id: `${id}-run-${index + 1}`,
        nameZh: metroPath.label || (isBranched ? defaultName : name),
        kind: isLoop ? "loop" : "linear",
        directions: [
          {
            id: `${id}-run-${index + 1}-forward`,
            labelZh: forwardLabel,
            stationIds: metroPath.runStationIds,
          },
          {
            id: `${id}-run-${index + 1}-reverse`,
            labelZh: reverseLabel,
            stationIds: [...metroPath.runStationIds].reverse(),
          },
        ],
      };
    });

    lines.push({
      id,
      lineId: lineCode(name),
      lineName: name,
      operatorName: spec.operatorOverrides?.[name] ?? spec.operatorName,
      color: normalizeColor(rawLines[0].cl),
      stationIds: unique(paths.flatMap((metroPath) => metroPath.stationIds)),
      mapPaths: paths.map((metroPath) => ({
        id: metroPath.id,
        stationIds: metroPath.stationIds,
        ...(metroPath.closed ? { closed: true } : {}),
      })),
      runs,
    });
  }

  if (cityId === "beijing") {
    const airportLine = lines.find((line) => line.lineName === "首都机场线");
    if (airportLine) {
      const northXinqiao = stationId(cityId, "北新桥");
      const dongzhimen = stationId(cityId, "东直门");
      const sanyuanqiao = stationId(cityId, "三元桥");
      const terminal3 = stationId(cityId, "3号航站楼");
      const terminal2 = stationId(cityId, "2号航站楼");
      const required = [northXinqiao, dongzhimen, sanyuanqiao, terminal3, terminal2];
      if (required.every((id) => stations[id])) {
        airportLine.stationIds = required;
        airportLine.mapPaths = [
          {
            id: `${airportLine.id}-city-path`,
            stationIds: [northXinqiao, dongzhimen, sanyuanqiao],
          },
          {
            id: `${airportLine.id}-airport-loop`,
            stationIds: [sanyuanqiao, terminal3, terminal2, sanyuanqiao],
            closed: true,
          },
        ];
        airportLine.runs = [
          {
            id: `${airportLine.id}-run-1`,
            nameZh: "市区—首都机场",
            kind: "linear",
            directions: [
              {
                id: `${airportLine.id}-outbound`,
                labelZh: "前往机场",
                stationIds: required,
              },
              {
                id: `${airportLine.id}-inbound`,
                labelZh: "返回市区",
                stationIds: [terminal2, sanyuanqiao, dongzhimen, northXinqiao],
              },
            ],
          },
        ];
      }
    }
  }

  return { stations, lines };
}

async function prepareCity(cityId) {
  const spec = citySpecs[cityId];
  if (!spec) throw new Error(`Unknown city: ${cityId}`);
  const [amap, boundary, ...extraBoundaries] = await Promise.all([
    getJson(spec.amapUrl),
    getJson(spec.boundaryUrl),
    ...(spec.extraBoundaries ?? []).map((extra) => getJson(extra.url)),
  ]);
  const { stations, lines } = prepareNetwork(cityId, spec, amap);
  const districts = (boundary.features ?? []).map((feature) => ({
    name: feature.properties.name,
    rings: collectRings(feature.geometry),
  }));
  for (const [index, extraBoundary] of extraBoundaries.entries()) {
    const included = new Set(spec.extraBoundaries[index].includedDistricts);
    districts.push(
      ...(extraBoundary.features ?? [])
        .filter((feature) => included.has(feature.properties.name))
        .map((feature) => ({
          name: feature.properties.name,
          rings: collectRings(feature.geometry),
        })),
    );
  }
  const data = {
    schemaVersion: 2,
    city: { id: cityId, nameZh: spec.nameZh, nameEn: spec.nameEn },
    updatedAt: UPDATED_AT,
    sources: {
      network: { label: "高德地铁图", url: spec.amapUrl },
      boundary: { label: "DataV", url: spec.boundaryUrl },
    },
    stations,
    lines,
    districts,
  };
  validateMetroData(data);

  const outputDir = path.join(process.cwd(), "public", "data", "metro");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, `${cityId}.json`),
    `${JSON.stringify(data)}\n`,
  );
  console.log(
    `${spec.nameZh}: ${lines.length} lines, ${Object.keys(stations).length} stations, ${districts.length} districts`,
  );
}

const requestedCities = process.argv.slice(2);
const targets = requestedCities.length ? requestedCities : Object.keys(citySpecs);
for (const cityId of targets) {
  await prepareCity(cityId);
}
