import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMetroData } from "./metro-data-validation.mjs";

export const cityIds = ["hangzhou", "shanghai", "beijing", "shenzhen", "chengdu"];

export async function readMetroData(cityId, root = process.cwd()) {
  const file = path.join(root, "public", "data", "metro", `${cityId}.json`);
  return JSON.parse(await readFile(file, "utf8"));
}

export async function validateMetroDataFiles(root = process.cwd()) {
  const results = [];
  for (const cityId of cityIds) {
    const data = await readMetroData(cityId, root);
    results.push(validateMetroData(data, cityId));
  }
  return results;
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await validateMetroDataFiles();
  for (const result of results) {
    console.log(
      `${result.cityId}: ${result.lines} lines, ${result.stations} stations, ${result.districts} districts`,
    );
  }
}
