import { isNormalizedStationPinyin } from "./pinyin-normalization.mjs";

export function validateMetroData(data, expectedCityId = data?.city?.id) {
  const errors = [];
  const fail = (message) => errors.push(`${expectedCityId}: ${message}`);

  if (data?.schemaVersion !== 2) fail("schemaVersion must be 2");
  if (data?.city?.id !== expectedCityId) fail("city id does not match filename");
  if (!data?.city?.nameZh || !data?.city?.nameEn) fail("city names are required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.updatedAt ?? "")) {
    fail("updatedAt must use YYYY-MM-DD");
  }
  if (!data?.sources?.network?.url || !data?.sources?.boundary?.url) {
    fail("network and boundary sources are required");
  }

  const stationEntries = Object.entries(data?.stations ?? {});
  const stationIds = new Set(stationEntries.map(([id]) => id));
  if (!stationIds.size) fail("at least one station is required");

  for (const [id, station] of stationEntries) {
    if (station.id !== id) fail(`station key mismatch: ${id}`);
    if (!station.nameZh || !station.nameEn) fail(`station names missing: ${id}`);
    if (!isNormalizedStationPinyin(station.namePinyin)) {
      fail(`station pinyin missing or invalid: ${id}`);
    }
    if (!Number.isFinite(station.lon) || !Number.isFinite(station.lat)) {
      fail(`station coordinates invalid: ${id}`);
    }
  }

  const lineIds = new Set();
  for (const line of data?.lines ?? []) {
    if (lineIds.has(line.id)) fail(`duplicate line id: ${line.id}`);
    lineIds.add(line.id);
    if (!line.lineId || !line.lineName || !line.operatorName) {
      fail(`line metadata missing: ${line.id}`);
    }
    if (!/^#[0-9A-F]{6}$/.test(line.color)) fail(`line color invalid: ${line.id}`);
    if (!line.mapPaths?.length) fail(`line has no map paths: ${line.id}`);
    if (!line.runs?.length) fail(`line has no runs: ${line.id}`);
    if (new Set(line.stationIds).size !== line.stationIds.length) {
      fail(`line stationIds are not unique: ${line.id}`);
    }

    const references = [
      ...line.stationIds,
      ...(line.mapPaths ?? []).flatMap((metroPath) => metroPath.stationIds),
      ...(line.runs ?? []).flatMap((run) =>
        run.directions.flatMap((direction) => direction.stationIds),
      ),
    ];
    for (const reference of references) {
      if (!stationIds.has(reference)) fail(`${line.id} references missing ${reference}`);
    }

    for (const metroPath of line.mapPaths ?? []) {
      if (metroPath.stationIds.length < 2) fail(`map path too short: ${metroPath.id}`);
      if (
        metroPath.closed &&
        metroPath.stationIds[0] !== metroPath.stationIds.at(-1)
      ) {
        fail(`closed map path is not closed: ${metroPath.id}`);
      }
      const comparableIds = metroPath.closed
        ? metroPath.stationIds.slice(0, -1)
        : metroPath.stationIds;
      if (comparableIds.some((id, index) => index > 0 && id === comparableIds[index - 1])) {
        fail(`map path repeats adjacent station: ${metroPath.id}`);
      }
    }

    for (const run of line.runs ?? []) {
      if (!run.nameZh || !["linear", "loop"].includes(run.kind)) {
        fail(`run metadata invalid: ${run.id}`);
      }
      if (run.directions.length < 1) fail(`run has no directions: ${run.id}`);
      for (const direction of run.directions) {
        if (!direction.labelZh || direction.stationIds.length < 2) {
          fail(`direction invalid: ${direction.id}`);
        }
        if (
          direction.stationIds.some(
            (id, index) => index > 0 && id === direction.stationIds[index - 1],
          )
        ) {
          fail(`direction repeats adjacent station: ${direction.id}`);
        }
        if (
          run.kind === "loop" &&
          direction.stationIds[0] === direction.stationIds.at(-1)
        ) {
          fail(`loop direction should type each station once: ${direction.id}`);
        }
      }
    }
  }

  if (!lineIds.size) fail("at least one line is required");
  if (!data?.districts?.length) fail("at least one district is required");
  if (errors.length) throw new Error(errors.join("\n"));

  return {
    cityId: expectedCityId,
    lines: lineIds.size,
    stations: stationIds.size,
    districts: data.districts.length,
  };
}
