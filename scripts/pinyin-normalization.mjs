const PINYIN_TOKEN_PATTERN = /^[a-z0-9ü]+(?: [a-z0-9ü]+)*$/;

const STATION_PINYIN_OVERRIDES = new Map([
  ["hangzhou:阳陂湖", "yang bei hu"],
  ["hangzhou:枸桔弄", "gou ju long"],
  ["shanghai:陕西南路", "shan xi nan lu"],
  ["beijing:朝阳门", "chao yang men"],
  ["shenzhen:岗厦北", "gang xia bei"],
  ["shenzhen:石厦", "shi xia"],
  ["shenzhen:长岭陂", "chang ling pi"],
  ["guangzhou:石碁", "shi qi"],
  ["guangzhou:柯木塱", "ke mu lang"],
  ["guangzhou:区庄", "ou zhuang"],
  ["guangzhou:长湴", "chang ban"],
  ["guangzhou:礌岗", "lei gang"],
  ["guangzhou:朝安", "chao an"],
  ["guangzhou:低涌", "di chong"],
  ["guangzhou:东涌", "dong chong"],
  ["guangzhou:大涌", "da chong"],
  ["wuhan:硚口路", "qiao kou lu"],
  ["wuhan:柏林", "bai lin"],
  ["wuhan:沌阳大道", "zhuan yang da dao"],
  ["nanjing:小行", "xiao hang"],
  ["chongqing:重光", "chong guang"],
  ["suzhou:唯亭", "wei ting"],
  ["suzhou:倪浜·阳澄数谷", "ni bang yang cheng shu gu"],
]);

export function normalizeStationPinyin(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/u:/gi, "ü")
    .replace(/([a-züv])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-züv])/g, "$1 $2")
    .replace(/([A-Za-züÜvV])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-züÜvV])/g, "$1 $2")
    .replace(/v/gi, "ü")
    .toLowerCase()
    .replace(/[^a-z0-9ü]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNormalizedStationPinyin(value) {
  return (
    typeof value === "string" &&
    PINYIN_TOKEN_PATTERN.test(value) &&
    normalizeStationPinyin(value) === value
  );
}

export function resolveStationPinyin(cityId, nameZh, rawValue) {
  return (
    STATION_PINYIN_OVERRIDES.get(`${cityId}:${nameZh}`) ??
    normalizeStationPinyin(rawValue)
  );
}
