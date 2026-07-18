export type Point = [number, number];

export type MapExtent = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type Station = {
  id: string;
  nameZh: string;
  nameEn: string;
  namePinyin: string;
  lon: number;
  lat: number;
};

export type MetroRun = {
  id: string;
  nameZh: string;
  kind: "linear" | "loop";
  directions: Array<{
    id: string;
    labelZh: string;
    stationIds: string[];
  }>;
};

export type MetroLine = {
  id: string;
  lineId: string;
  lineName: string;
  operatorName: string;
  color: string;
  stationIds: string[];
  mapPaths: Array<{
    id: string;
    stationIds: string[];
    closed?: boolean;
  }>;
  runs: MetroRun[];
};

export type MetroSource = {
  label: string;
  url: string;
};

export type MetroData = {
  schemaVersion: 2;
  city: {
    id: string;
    nameZh: string;
    nameEn: string;
  };
  updatedAt: string;
  sources: {
    network: MetroSource;
    boundary: MetroSource;
  };
  stations: Record<string, Station>;
  lines: MetroLine[];
  districts: Array<{ name: string; rings: Point[][] }>;
};
