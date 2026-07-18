import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateMetroData } from "./metro-data-validation.mjs";
import { resolveStationPinyin } from "./pinyin-normalization.mjs";

const AMAP_URL =
  "https://webapi.amap.com/subway/data/3301_drw_hangzhou.json";
const BOUNDARY_URL =
  "https://geo.datav.aliyun.com/areas_v3/bound/330100_full.json";

const split = (value) => value.split("|");

const routeSpecs = [
  {
    id: "1",
    lineId: "1",
    lineName: "1号线",
    color: "#FC0601",
    segments: [
      split(
        "湘湖|滨康路|西兴|滨和路|江陵路|近江|婺江路|城站|定安路|龙翔桥|凤起路|武林广场|西湖文化广场|打铁关|闸弄口|火车东站|彭埠|七堡|九和路|九堡|客运中心|下沙西|金沙湖|高沙路|文泽路|文海南路|云水|下沙江滨|杭州大会展中心|港城大道|南阳|向阳路|萧山国际机场",
      ),
    ],
  },
  {
    id: "2",
    lineId: "2",
    lineName: "2号线",
    color: "#EE782E",
    segments: [
      split(
        "朝阳|曹家桥|潘水|人民路|杭发厂|人民广场|建设一路|建设三路|振宁路|飞虹路|盈丰路|钱江世纪城|钱江路|庆春广场|庆菱路|建国北路|中河北路|凤起路|武林门|沈塘桥|下宁桥|学院路|古翠路|丰潭路|文新|三坝|虾龙圩|三墩|墩祥街|金家渡|白洋|杜甫村|良渚",
      ),
    ],
  },
  {
    id: "3",
    lineId: "3",
    lineName: "3号线",
    color: "#FFA500",
    segments: [
      split(
        "吴山前村|火车西站|龙舟北路|文一西路|绿汀路|全丰|高教路|联胜路|洪园|西溪湿地南|花坞|东岳|古墩路|古荡新村|古荡|黄龙体育中心|黄龙洞|武林门|武林广场|西湖文化广场|潮王路|香积寺|大关|善贤|新天地街|汽轮广场|华丰路|同协路|桃花湖公园|丁桥|华鹤街|黄鹤山|星桥",
      ),
      split(
        "石马|小和山|屏峰|留下|西溪湿地南|花坞|东岳|古墩路|古荡新村|古荡|黄龙体育中心|黄龙洞|武林门|武林广场|西湖文化广场|潮王路|香积寺|大关|善贤|新天地街|汽轮广场|华丰路|同协路|桃花湖公园|丁桥|华鹤街|黄鹤山|星桥",
      ),
    ],
  },
  {
    id: "4",
    lineId: "4",
    lineName: "4号线",
    color: "#00AB4F",
    segments: [
      split(
        "浦沿|杨家墩|中医药大学|联庄|水澄桥|复兴路|南星桥|甬江路|近江|城星路|市民中心|江锦路|钱江路|景芳|新塘|新风|火车东站|彭埠|明石路|黎明|笕桥老街|华中南路|新天地街|皋亭坝|桃源街|吴家角港|独城生态公园|平安桥|储运路|杭行路|好运街|金家渡|池华街",
      ),
    ],
  },
  {
    id: "5",
    lineId: "5",
    lineName: "5号线",
    color: "#008FA5",
    segments: [
      split(
        "南湖东|金星|绿汀路|葛巷|创景路|良睦路|杭师大仓前|永福|五常|蒋村|浙大紫金港|三坝|萍水街|和睦|大运河|拱宸桥东|善贤|西文街|东新园|杭氧|打铁关|宝善桥|建国北路|万安桥|城站|江城路|候潮门|南星桥|长河|聚才路|江晖路|滨康路|博奥路|金鸡路|人民广场|育才北路|通惠中路|火车南站|双桥|姑娘桥",
      ),
    ],
  },
  {
    id: "6",
    lineId: "6",
    lineName: "6号线",
    color: "#2249A3",
    segments: [
      split(
        "桂花西路|公望街|阳陂湖|高桥|富阳客运中心|受降|虎啸杏|银湖|野生动物园东|中村|音乐学院|美院象山|枫桦西路|之江文化中心|西浦路|中医药大学|伟业路|诚业路|建业路|长河|江汉路|江陵路|星民|奥体中心|博览中心|钱江世纪城|丰北|亚运村|三堡|昙花庵路|元宝塘|火车东站（东广场）|枸桔弄",
      ),
      split(
        "双浦|科海路|霞鸣街|美院象山|枫桦西路|之江文化中心|西浦路|中医药大学|伟业路|诚业路|建业路|长河|江汉路|江陵路|星民|奥体中心|博览中心|钱江世纪城|丰北|亚运村|三堡|昙花庵路|元宝塘|火车东站（东广场）|枸桔弄",
      ),
    ],
  },
  {
    id: "7",
    lineId: "7",
    lineName: "7号线",
    color: "#793E8C",
    segments: [
      split(
        "吴山广场|江城路|莫邪塘|观音塘|市民中心|奥体中心|兴议|明星路|建设三路|新兴路|新汉路|新街|合欢路|盈中|坎山|新港|萧山国际机场|永盛路|新镇路|义蓬|塘新线|青六中路|启成路|江东二路",
      ),
    ],
  },
  {
    id: "8",
    lineId: "8",
    lineName: "8号线",
    color: "#741D51",
    segments: [
      split(
        "文海南路|工商大学云滨|桥头堡|河庄路|青西三路|青六中路|仓北村|冯娄村|新湾路",
      ),
    ],
  },
  {
    id: "9",
    lineId: "9",
    lineName: "9号线",
    color: "#B35A1F",
    segments: [
      split(
        "观音塘|新业路|钱江路|江河汇|三堡|御道|五堡|六堡|红普南路|九睦路|客运中心|乔司南|乔司|翁梅|临平南高铁站|南苑|临平|邱山大街|荷禹路|五洲路|龙安",
      ),
    ],
  },
  {
    id: "10",
    lineId: "10",
    lineName: "10号线",
    color: "#D0970A",
    segments: [
      split(
        "黄龙体育中心|文三路|学院路|翠柏路|北大桥|和睦|花园岗|渡驾桥|祥园路|杭行路|金德路|逸盛路",
      ),
    ],
  },
  {
    id: "16",
    lineId: "16",
    lineName: "16号线",
    color: "#FCD600",
    segments: [
      split(
        "九州街|临安广场|农林大学|青山湖|八百里|青山湖科技城|南峰|南湖|中泰|禹航路|凤新路|绿汀路",
      ),
    ],
  },
  {
    id: "19",
    lineId: "19",
    lineName: "19号线",
    color: "#019AC3",
    segments: [
      split(
        "火车西站|创景路|海创园|荆长路|西溪湿地北|五联|文三路|沈塘桥|西湖文化广场|驿城路|火车东站（东广场）|御道|平澜路|耕文路|知行路|萧山国际机场|永盛路",
      ),
    ],
  },
];

const nameAliases = new Map([
  ["南湖东站", "南湖东"],
  ["荆长路站", "荆长路"],
  ["学院路站", "学院路"],
  ["火车东站(东广场)", "火车东站（东广场）"],
]);

function normalizeName(name) {
  const normalized = name
    .trim()
    .replaceAll("(", "（")
    .replaceAll(")", "）");
  return nameAliases.get(normalized) ?? normalized;
}

function stationLookup(amap) {
  const lookup = new Map();
  for (const line of amap.l) {
    if (["绍兴1号线", "杭海城际"].includes(line.ln)) continue;
    for (const station of line.st) {
      const name = normalizeName(station.n);
      const [lon, lat] = station.sl.split(",").map(Number);
      if (!lookup.has(name)) {
        lookup.set(name, {
          id: station.si,
          nameZh: name,
          nameEn: station.en || station.sp || name,
          namePinyin: resolveStationPinyin("hangzhou", name, station.sp),
          lon,
          lat,
        });
      }
    }
  }
  return lookup;
}

function squaredDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
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
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = squaredDistance(points[i], first, last);
    if (distance > maxDistance) {
      index = i;
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

const [amap, boundary] = await Promise.all([
  getJson(AMAP_URL),
  getJson(BOUNDARY_URL),
]);
const lookup = stationLookup(amap);
const missing = [];

const lines = routeSpecs.map((line) => {
  const stationNames = [...new Set(line.segments.flat())];
  const stations = stationNames.map((name) => {
    const station = lookup.get(name);
    if (!station) {
      missing.push(name);
      return null;
    }
    return station;
  });
  return {
    ...line,
    operatorName: "杭州地铁",
    stations: stations.filter(Boolean),
  };
});

if (missing.length) {
  throw new Error(`Missing stations: ${[...new Set(missing)].join(", ")}`);
}

const districts = boundary.features.map((feature) => ({
  name: feature.properties.name,
  rings: collectRings(feature.geometry),
}));

const canonicalStationId = (name) => `hangzhou:${normalizeName(name)}`;
const stations = {};
for (const line of lines) {
  for (const station of line.stations) {
    const id = canonicalStationId(station.nameZh);
    stations[id] ??= { ...station, id };
  }
}

const metroLines = lines.map((line) => {
  const id = `hangzhou-${line.id}`;
  const mapPaths = line.segments.map((segment, index) => ({
    id: `${id}-path-${index + 1}`,
    stationIds: segment.map(canonicalStationId),
  }));
  const hasBranches = mapPaths.length > 1;
  const runs = mapPaths.map((metroPath, index) => {
    const forward = metroPath.stationIds;
    const first = stations[forward[0]];
    const last = stations[forward.at(-1)];
    return {
      id: `${id}-run-${index + 1}`,
      nameZh: hasBranches ? `${first.nameZh}—${last.nameZh}` : line.lineName,
      kind: "linear",
      directions: [
        {
          id: `${id}-run-${index + 1}-forward`,
          labelZh: "正向",
          stationIds: forward,
        },
        {
          id: `${id}-run-${index + 1}-reverse`,
          labelZh: "反向",
          stationIds: [...forward].reverse(),
        },
      ],
    };
  });

  return {
    id,
    lineId: line.lineId,
    lineName: line.lineName,
    operatorName: line.operatorName,
    color: line.color,
    stationIds: [...new Set(mapPaths.flatMap((metroPath) => metroPath.stationIds))],
    mapPaths,
    runs,
  };
});

const output = {
  schemaVersion: 2,
  updatedAt: "2026-07-15",
  city: { id: "hangzhou", nameZh: "杭州", nameEn: "Hangzhou" },
  sources: {
    network: { label: "杭州地铁 / 高德地铁图", url: AMAP_URL },
    boundary: { label: "DataV", url: BOUNDARY_URL },
  },
  stations,
  lines: metroLines,
  districts,
};

const outputDir = path.join(process.cwd(), "public", "data", "metro");
validateMetroData(output, "hangzhou");
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "hangzhou.json"),
  `${JSON.stringify(output)}\n`,
);

console.log(
  `杭州: ${metroLines.length} lines, ${Object.keys(stations).length} stations, ${districts.length} districts`,
);
