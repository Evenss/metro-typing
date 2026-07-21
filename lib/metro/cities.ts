import type { MapExtent } from "./types";

export const cityIds = [
  "hangzhou",
  "shanghai",
  "beijing",
  "shenzhen",
  "chengdu",
  "guangzhou",
  "wuhan",
  "nanjing",
  "chongqing",
  "suzhou",
] as const;

export type CityId = (typeof cityIds)[number];

export type CityConfig = {
  id: CityId;
  nameZh: string;
  nameEn: string;
  path: string;
  dataPath: string;
  operatorName: string;
  officialSourceUrl: string;
  boundarySourceUrl: string;
  excludedDistricts: string[];
  overviewExtent?: MapExtent;
  districtContext?: Array<{
    districts: string[];
    leftStationPadding: number;
    leftContextWidth: number;
    farContextYScale: number;
  }>;
};

const cityList: CityConfig[] = [
  {
    id: "hangzhou",
    nameZh: "杭州",
    nameEn: "Hangzhou",
    path: "/hangzhou/",
    dataPath: "/data/metro/hangzhou.json",
    operatorName: "杭州地铁",
    officialSourceUrl: "https://www.hzmetro.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/330100_full.json",
    excludedDistricts: ["桐庐县", "淳安县", "建德市"],
    districtContext: [
      {
        districts: ["临安区", "富阳区"],
        leftStationPadding: 32,
        leftContextWidth: 64,
        farContextYScale: 0.06,
      },
    ],
  },
  {
    id: "shanghai",
    nameZh: "上海",
    nameEn: "Shanghai",
    path: "/shanghai/",
    dataPath: "/data/metro/shanghai.json",
    operatorName: "上海轨道交通",
    officialSourceUrl: "https://www.shmetro.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/310000_full.json",
    excludedDistricts: ["崇明区"],
  },
  {
    id: "beijing",
    nameZh: "北京",
    nameEn: "Beijing",
    path: "/beijing/",
    dataPath: "/data/metro/beijing.json",
    operatorName: "北京轨道交通",
    officialSourceUrl: "https://www.bjsubway.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/110000_full.json",
    excludedDistricts: ["密云区", "怀柔区", "平谷区", "延庆区"],
  },
  {
    id: "shenzhen",
    nameZh: "深圳",
    nameEn: "Shenzhen",
    path: "/shenzhen/",
    dataPath: "/data/metro/shenzhen.json",
    operatorName: "深圳地铁",
    officialSourceUrl: "https://www.szmc.net/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/440300_full.json",
    excludedDistricts: [],
  },
  {
    id: "chengdu",
    nameZh: "成都",
    nameEn: "Chengdu",
    path: "/chengdu/",
    dataPath: "/data/metro/chengdu.json",
    operatorName: "成都轨道交通",
    officialSourceUrl: "https://www.chengdurail.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/510100_full.json",
    excludedDistricts: [
      "青白江区",
      "金堂县",
      "大邑县",
      "邛崃市",
      "崇州市",
      "都江堰市",
      "彭州市",
      "蒲江县",
    ],
  },
  {
    id: "guangzhou",
    nameZh: "广州",
    nameEn: "Guangzhou",
    path: "/guangzhou/",
    dataPath: "/data/metro/guangzhou.json",
    operatorName: "广州地铁",
    officialSourceUrl: "https://www.gzmtr.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/440100_full.json",
    excludedDistricts: [],
  },
  {
    id: "wuhan",
    nameZh: "武汉",
    nameEn: "Wuhan",
    path: "/wuhan/",
    dataPath: "/data/metro/wuhan.json",
    operatorName: "武汉地铁",
    officialSourceUrl: "https://www.wuhanrt.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/420100_full.json",
    excludedDistricts: [],
  },
  {
    id: "nanjing",
    nameZh: "南京",
    nameEn: "Nanjing",
    path: "/nanjing/",
    dataPath: "/data/metro/nanjing.json",
    operatorName: "南京地铁",
    officialSourceUrl: "https://www.njmetro.com.cn/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/320100_full.json",
    excludedDistricts: [],
  },
  {
    id: "chongqing",
    nameZh: "重庆",
    nameEn: "Chongqing",
    path: "/chongqing/",
    dataPath: "/data/metro/chongqing.json",
    operatorName: "重庆轨道交通",
    officialSourceUrl: "https://www.cqmetro.cn/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/500000_full.json",
    excludedDistricts: [
      "万州区",
      "涪陵区",
      "綦江区",
      "大足区",
      "黔江区",
      "长寿区",
      "合川区",
      "永川区",
      "南川区",
      "潼南区",
      "荣昌区",
      "开州区",
      "梁平区",
      "武隆区",
      "城口县",
      "丰都县",
      "垫江县",
      "忠县",
      "云阳县",
      "奉节县",
      "巫山县",
      "巫溪县",
      "石柱土家族自治县",
      "秀山土家族苗族自治县",
      "酉阳土家族苗族自治县",
      "彭水苗族土家族自治县",
    ],
  },
  {
    id: "suzhou",
    nameZh: "苏州",
    nameEn: "Suzhou",
    path: "/suzhou/",
    dataPath: "/data/metro/suzhou.json",
    operatorName: "苏州地铁",
    officialSourceUrl: "https://www.sz-mtr.com/",
    boundarySourceUrl:
      "https://geo.datav.aliyun.com/areas_v3/bound/320500_full.json",
    excludedDistricts: ["常熟市", "张家港市", "太仓市"],
  },
];

export const cities = cityList as readonly CityConfig[];

export const citiesById = Object.fromEntries(
  cities.map((city) => [city.id, city]),
) as Record<CityId, CityConfig>;

export function isCityId(value: string): value is CityId {
  return cityIds.includes(value as CityId);
}

export function getCityConfig(cityId: CityId) {
  return citiesById[cityId];
}

export function getCityTitle(city: CityConfig) {
  return `${city.nameEn.toUpperCase()} METRO TYPING｜${city.nameZh}地铁站名打字练习`;
}

export function getCityDescription(city: CityConfig) {
  return `用${city.nameZh}真实地铁线路与站名练习英文或拼音打字。`;
}
