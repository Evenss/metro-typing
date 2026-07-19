"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  cities,
  getCityConfig,
  type CityConfig,
  type CityId,
} from "../lib/metro/cities";
import type {
  MapExtent,
  MetroData,
  MetroLine,
  Point,
  Station,
} from "../lib/metro/types";
import {
  compressPointBeforeFocus,
  isPointInRing,
} from "../lib/metro/map-geometry";
import {
  getGameSafeRect,
  getMobileKeyboardViewport,
  getTrackingViewBox,
  interpolateViewBox,
} from "../lib/metro/map-camera";
import {
  getTypingDisplayText,
  getTypingDisplayTokens,
  getTypingTarget,
  normalizeTypingCharacter,
} from "../lib/metro/typing";

type Screen = "home" | "game" | "result";
type GameMode = "timed" | "line";
type TypingLanguage = "en" | "pinyin";

type MapModel = {
  districtPaths: Array<{ name: string; path: string }>;
  stationPoints: Map<string, Point>;
  lineSegments: Map<string, Point[][]>;
};

type ViewBox = [number, number, number, number];

type GameCameraLayout = {
  width: number;
  height: number;
  keyboardOpen: boolean;
  keyboardTight: boolean;
  keyboardInset: number;
  safeRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  ready: boolean;
};

type ResolvedRun = {
  id: string;
  nameZh: string;
  kind: "linear" | "loop";
  directions: Array<{
    id: string;
    labelZh: string;
    stations: Station[];
  }>;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const FULL_VIEWBOX = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
const GAME_DURATION = 30_000;
const DEFAULT_OVERVIEW_METRO_EXTENT: MapExtent = {
  left: 450,
  right: 950,
  top: 70,
  bottom: 630,
};

function longitudeRadians(lon: number) {
  return (lon * Math.PI) / 180;
}

function mercatorLatitude(lat: number) {
  const radians = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function createMetroProjection(
  stations: Station[],
  extent: MapExtent,
): (lon: number, lat: number) => Point {
  if (!stations.length) return () => [500, 350];

  const longitudes = stations.map((station) => station.lon);
  const latitudes = stations.map((station) => station.lat);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const lonPadding = (maxLon - minLon) * 0.08;
  const latPadding = (maxLat - minLat) * 0.12;
  const projectedMinX = longitudeRadians(minLon - lonPadding);
  const projectedMaxX = longitudeRadians(maxLon + lonPadding);
  const projectedMinY = mercatorLatitude(minLat - latPadding);
  const projectedMaxY = mercatorLatitude(maxLat + latPadding);
  const scale = Math.min(
    (extent.right - extent.left) /
      (projectedMaxX - projectedMinX),
    (extent.bottom - extent.top) /
      (projectedMaxY - projectedMinY),
  );
  const projectedCenterX = (projectedMinX + projectedMaxX) / 2;
  const projectedCenterY = (projectedMinY + projectedMaxY) / 2;
  const extentCenterX = (extent.left + extent.right) / 2;
  const extentCenterY = (extent.top + extent.bottom) / 2;

  return (lon: number, lat: number): Point => [
    extentCenterX + (longitudeRadians(lon) - projectedCenterX) * scale,
    extentCenterY - (mercatorLatitude(lat) - projectedCenterY) * scale,
  ];
}

function pointsToString(points: Point[]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function ringToPath(
  ring: Point[],
  project: (lon: number, lat: number) => Point,
) {
  if (!ring.length) return "";
  return `${ring
    .map(([lon, lat], index) => {
      const [x, y] = project(lon, lat);
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")} Z`;
}

function createDistrictProjector(
  rings: Point[][],
  stations: Station[],
  project: (lon: number, lat: number) => Point,
  context: NonNullable<CityConfig["districtContext"]>[number] | undefined,
) {
  if (!context) return project;

  const districtStations = stations.filter((station) =>
    rings.some((ring) => isPointInRing([station.lon, station.lat], ring)),
  );
  if (!districtStations.length) return project;

  const leftmostStationX = Math.min(
    ...districtStations.map((station) => project(station.lon, station.lat)[0]),
  );
  const focusX = leftmostStationX - context.leftStationPadding;
  const districtStationYs = districtStations.map(
    (station) => project(station.lon, station.lat)[1],
  );
  const contextCenterY =
    (Math.min(...districtStationYs) + Math.max(...districtStationYs)) / 2;

  return (lon: number, lat: number): Point => {
    return compressPointBeforeFocus(
      project(lon, lat),
      focusX,
      context.leftContextWidth,
      contextCenterY,
      context.farContextYScale,
    );
  };
}

function buildMapModel(data: MetroData, city: CityConfig): MapModel {
  const extent =
    city.overviewExtent ?? DEFAULT_OVERVIEW_METRO_EXTENT;
  const project = createMetroProjection(Object.values(data.stations), extent);
  const stationPoints = new Map<string, Point>();
  for (const station of Object.values(data.stations)) {
    stationPoints.set(station.id, project(station.lon, station.lat));
  }

  const excludedDistricts = new Set(city.excludedDistricts);
  const districtProjectors = new Map<
    string,
    (lon: number, lat: number) => Point
  >();

  for (const context of city.districtContext ?? []) {
    const contextDistricts = data.districts.filter((district) =>
      context.districts.includes(district.name),
    );
    const contextProject = createDistrictProjector(
      contextDistricts.flatMap((district) => district.rings),
      Object.values(data.stations),
      project,
      context,
    );

    for (const district of contextDistricts) {
      districtProjectors.set(district.name, contextProject);
    }
  }

  return {
    districtPaths: data.districts
      .filter((district) => !excludedDistricts.has(district.name))
      .map((district) => {
        const districtProject = districtProjectors.get(district.name) ?? project;

        return {
          name: district.name,
          path: district.rings
            .map((ring) => ringToPath(ring, districtProject))
            .join(" "),
        };
      }),
    stationPoints,
    lineSegments: new Map(
      data.lines.map((line) => [
        line.id,
        line.mapPaths.map((path) =>
          path.stationIds
            .map((stationId) => stationPoints.get(stationId))
            .filter((point): point is Point => Boolean(point)),
        ),
      ]),
    ),
  };
}

function getRouteViewBox(
  points: Point[],
  minimumWidth = 70,
  padding = 14,
  verticalOffsetRatio = 0,
) {
  if (!points.length) return FULL_VIEWBOX;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX + padding * 2, minimumWidth);
  const height = Math.max(maxY - minY + padding * 2, width * 0.72);
  return `${((minX + maxX - width) / 2).toFixed(2)} ${(
    (minY + maxY - height) / 2 +
    height * verticalOffsetRatio
  ).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;
}

function formatViewBox(viewBox: ViewBox) {
  return viewBox.map((value) => value.toFixed(3)).join(" ");
}

function viewBoxesEqual(first: ViewBox, second: ViewBox) {
  return first.every((value, index) => Math.abs(value - second[index]) < 0.001);
}

function cameraLayoutsEqual(first: GameCameraLayout, second: GameCameraLayout) {
  return (
    first.ready === second.ready &&
    first.keyboardOpen === second.keyboardOpen &&
    first.keyboardTight === second.keyboardTight &&
    Math.abs(first.width - second.width) < 0.5 &&
    Math.abs(first.height - second.height) < 0.5 &&
    Math.abs(first.keyboardInset - second.keyboardInset) < 0.5 &&
    Math.abs(first.safeRect.left - second.safeRect.left) < 0.5 &&
    Math.abs(first.safeRect.top - second.safeRect.top) < 0.5 &&
    Math.abs(first.safeRect.right - second.safeRect.right) < 0.5 &&
    Math.abs(first.safeRect.bottom - second.safeRect.bottom) < 0.5
  );
}

function createFallbackGameCameraLayout(): GameCameraLayout {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  const height = typeof window === "undefined" ? 720 : window.innerHeight;
  const mobile = width <= 620;
  const cardHeight = mobile ? 242 : 220;
  const cardBottom = mobile ? 10 : 28;
  const scoreBottom = cardHeight + (mobile ? 26 : 46);
  const scoreHeight = mobile ? 66 : 75;
  const overlays = {
    chromeBottom: mobile ? 62 : 76,
    scoreTop: height - scoreBottom - scoreHeight,
    cardTop: height - cardBottom - cardHeight,
  };

  return {
    width,
    height,
    keyboardOpen: false,
    keyboardTight: false,
    keyboardInset: 0,
    safeRect: getGameSafeRect({ width, height }, overlays),
    ready: false,
  };
}

function useGameCameraLayout() {
  const gameRef = useRef<HTMLElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<GameCameraLayout>(
    createFallbackGameCameraLayout,
  );

  useEffect(() => {
    const game = gameRef.current;
    const chrome = chromeRef.current;
    const score = scoreRef.current;
    const card = cardRef.current;
    if (!game || !chrome || !score || !card) return undefined;

    let measureFrame = 0;
    const measure = () => {
      measureFrame = 0;
      const gameRect = game.getBoundingClientRect();
      const chromeRect = chrome.getBoundingClientRect();
      const scoreRect = score.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const styles = window.getComputedStyle(game);
      const inset = (property: string) =>
        Number.parseFloat(styles.getPropertyValue(property)) || 0;
      const width = Math.max(gameRect.width, 1);
      const height = Math.max(gameRect.height, 1);
      const visualViewport = window.visualViewport;
      const gameTopDocument = gameRect.top + window.scrollY;
      const visualPageTop = visualViewport?.pageTop
        ?? window.scrollY + (visualViewport?.offsetTop ?? 0);
      const typingInputFocused =
        document.activeElement instanceof HTMLInputElement
        && document.activeElement.classList.contains("mobile-typing-input");
      const keyboardViewport = getMobileKeyboardViewport({
        layoutHeight: height,
        visualHeight: visualViewport?.height ?? height,
        visualOffsetTop: Math.max(visualPageTop - gameTopDocument, 0),
        visualScale: visualViewport?.scale ?? 1,
        mobile: typingInputFocused && window.matchMedia(
          "(max-width: 620px), (hover: none) and (pointer: coarse)",
        ).matches,
      });
      const overlayTop = (rect: DOMRect) =>
        rect.width > 0 && rect.height > 0
          ? rect.top - gameRect.top
          : undefined;
      const safeRect = getGameSafeRect(
        { width, height },
        {
          chromeBottom: chromeRect.bottom - gameRect.top,
          scoreTop: overlayTop(scoreRect),
          cardTop: overlayTop(cardRect),
        },
        {
          top: inset("--game-safe-area-top"),
          right: inset("--game-safe-area-right"),
          bottom: inset("--game-safe-area-bottom"),
          left: inset("--game-safe-area-left"),
        },
      );
      const nextLayout = {
        width,
        height,
        keyboardOpen: keyboardViewport.open,
        keyboardTight: keyboardViewport.tight,
        keyboardInset: keyboardViewport.inset,
        safeRect,
        ready: true,
      };
      setLayout((currentLayout) =>
        cameraLayoutsEqual(currentLayout, nextLayout)
          ? currentLayout
          : nextLayout,
      );
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(measureFrame);
      measureFrame = window.requestAnimationFrame(measure);
    };
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(game);
    resizeObserver.observe(chrome);
    resizeObserver.observe(score);
    resizeObserver.observe(card);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("focusin", scheduleMeasure);
    window.addEventListener("focusout", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);
    scheduleMeasure();

    return () => {
      window.cancelAnimationFrame(measureFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("focusin", scheduleMeasure);
      window.removeEventListener("focusout", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, []);

  return { gameRef, chromeRef, scoreRef, cardRef, layout };
}

function useAnimatedViewBox(target: ViewBox, duration = 340) {
  const [viewBox, setViewBox] = useState<ViewBox>(target);
  const [animating, setAnimating] = useState(false);
  const currentRef = useRef<ViewBox>(target);

  useEffect(() => {
    const from = currentRef.current;
    let frameId = 0;
    if (viewBoxesEqual(from, target)) {
      currentRef.current = target;
      frameId = window.requestAnimationFrame(() => {
        setViewBox(target);
        setAnimating(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      frameId = window.requestAnimationFrame(() => {
        currentRef.current = target;
        setViewBox(target);
        setAnimating(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const startedAt = performance.now();
    let animationStarted = false;

    const frame = (now: number) => {
      if (!animationStarted) {
        animationStarted = true;
        setAnimating(true);
      }
      if (motionQuery.matches) {
        currentRef.current = target;
        setViewBox(target);
        setAnimating(false);
        return;
      }
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const nextViewBox = interpolateViewBox(from, target, eased) as ViewBox;
      currentRef.current = nextViewBox;
      setViewBox(nextViewBox);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(frame);
      } else {
        setAnimating(false);
      }
    };

    frameId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(frameId);
  }, [duration, target]);

  return { viewBox, animating };
}

function useTypingTargetFit(target: string) {
  const targetRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const targetElement = targetRef.current;
    const trackElement = trackRef.current;
    if (!targetElement || !trackElement) return;

    let animationFrame = 0;
    let disposed = false;

    const fit = () => {
      animationFrame = 0;
      targetElement.classList.remove("is-wrapped");
      targetElement.style.removeProperty("font-size");

      const styles = window.getComputedStyle(targetElement);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft) +
        Number.parseFloat(styles.paddingRight);
      const verticalPadding =
        Number.parseFloat(styles.paddingTop) +
        Number.parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(
        targetElement.clientWidth - horizontalPadding,
        1,
      );
      const availableHeight = Math.max(
        targetElement.clientHeight - verticalPadding,
        1,
      );
      const maximumFontSize = Number.parseFloat(styles.fontSize);
      const minimumFontSize =
        Number.parseFloat(
          styles.getPropertyValue("--typing-min-font-size"),
        ) || 18;
      const naturalWidth = trackElement.getBoundingClientRect().width;

      if (!Number.isFinite(maximumFontSize) || naturalWidth <= 0) return;

      const oneLineFontSize = Math.min(
        maximumFontSize,
        maximumFontSize * (availableWidth / naturalWidth) * 0.98,
      );

      if (oneLineFontSize >= minimumFontSize) {
        targetElement.style.fontSize = `${oneLineFontSize.toFixed(2)}px`;
        return;
      }

      targetElement.classList.add("is-wrapped");
      let lowerBound = minimumFontSize;
      let upperBound = maximumFontSize;
      let fittedFontSize = minimumFontSize;

      for (let iteration = 0; iteration < 8; iteration += 1) {
        const candidate = (lowerBound + upperBound) / 2;
        targetElement.style.fontSize = `${candidate}px`;
        const trackRect = trackElement.getBoundingClientRect();
        const fits =
          trackElement.scrollWidth <= availableWidth + 1 &&
          trackRect.height <= availableHeight + 1;

        if (fits) {
          fittedFontSize = candidate;
          lowerBound = candidate;
        } else {
          upperBound = candidate;
        }
      }

      targetElement.style.fontSize = `${fittedFontSize.toFixed(2)}px`;
    };

    const scheduleFit = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(fit);
    };
    const resizeObserver = new ResizeObserver(scheduleFit);
    const handleFontsLoaded = () => {
      if (!disposed) scheduleFit();
    };

    resizeObserver.observe(targetElement);
    scheduleFit();
    void document.fonts.ready.then(handleFontsLoaded);
    document.fonts.addEventListener("loadingdone", handleFontsLoaded);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      document.fonts.removeEventListener("loadingdone", handleFontsLoaded);
      targetElement.classList.remove("is-wrapped");
      targetElement.style.removeProperty("font-size");
    };
  }, [target]);

  return { targetRef, trackRef };
}

function getRuns(
  line: MetroLine | null,
  stations: Record<string, Station> | undefined,
): ResolvedRun[] {
  if (!line) return [];
  if (!stations) return [];
  return line.runs
    .map((run) => ({
      ...run,
      directions: run.directions
        .map((direction) => ({
          ...direction,
          stations: direction.stationIds
            .map((stationId) => stations[stationId])
            .filter(Boolean),
        }))
        .filter((direction) => direction.stations.length > 1),
    }))
    .filter((run) => run.directions.length > 0);
}

function linePoints(model: MapModel, line: MetroLine | null) {
  if (!line) return [];
  return (model.lineSegments.get(line.id) ?? []).flat();
}

export function MetroTyping({ cityId }: { cityId: CityId }) {
  return <MetroTypingCity key={cityId} cityId={cityId} />;
}

function MetroTypingCity({ cityId }: { cityId: CityId }) {
  const city = getCityConfig(cityId);
  const [data, setData] = useState<MetroData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const [directionIndex, setDirectionIndex] = useState(0);
  const [mode, setMode] = useState<GameMode>("timed");
  const [typingLanguage, setTypingLanguage] =
    useState<TypingLanguage>("en");
  const [dark, setDark] = useState(false);
  const [gameStations, setGameStations] = useState<Station[]>([]);
  const [stationIndex, setStationIndex] = useState(0);
  const [typedIndex, setTypedIndex] = useState(0);
  const [correctChars, setCorrectChars] = useState(0);
  const [wrongChars, setWrongChars] = useState(0);
  const [completedStations, setCompletedStations] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shake, setShake] = useState(false);
  const [inputMethodWarning, setInputMethodWarning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const playingRef = useRef(false);
  const startedAtRef = useRef(0);
  const stationIndexRef = useRef(0);
  const typedIndexRef = useRef(0);
  const gameStationsRef = useRef<Station[]>([]);
  const modeRef = useRef<GameMode>(mode);
  const languageRef = useRef<TypingLanguage>(typingLanguage);
  const composingRef = useRef(false);
  const discardCompositionInputRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    playingRef.current = false;
    const dataUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${city.dataPath}`;
    fetch(dataUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`数据载入失败（${response.status}）`);
        return response.json() as Promise<MetroData>;
      })
      .then((loadedData) => {
        if (loadedData.schemaVersion !== 2 || loadedData.city.id !== city.id) {
          throw new Error("城市数据版本或标识不匹配");
        }
        setData(loadedData);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoadError(error.message);
      });
    return () => {
      playingRef.current = false;
      controller.abort();
    };
  }, [city]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.style.colorScheme = dark ? "dark" : "light";
    root.classList.toggle("dark", dark);
    body.classList.toggle("dark", dark);

    return () => {
      root.style.removeProperty("color-scheme");
      root.classList.remove("dark");
      body.classList.remove("dark");
    };
  }, [dark]);

  const mapModel = useMemo(
    () => (data ? buildMapModel(data, city) : null),
    [city, data],
  );
  const selectedLine =
    data?.lines.find((line) => line.id === selectedLineId) ?? null;
  const runs = useMemo(
    () => getRuns(selectedLine, data?.stations),
    [data?.stations, selectedLine],
  );
  const selectedRun = runs[runIndex] ?? runs[0] ?? null;
  const selectedDirection =
    selectedRun?.directions[directionIndex] ?? selectedRun?.directions[0] ?? null;
  const previewStations = selectedDirection?.stations ?? [];
  const currentStation = gameStations[stationIndex];
  const target = getTypingTarget(currentStation, typingLanguage);
  const targetCharacters = Array.from(target);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const remainingSeconds = Math.max(
    Math.ceil((GAME_DURATION - elapsedMs) / 1000),
    0,
  );
  const minutes = Math.max(elapsedMs, 2000) / 60_000;
  const speed =
    typingLanguage === "pinyin"
      ? Math.round(correctChars / minutes)
      : Math.round(correctChars / 5 / minutes);
  const accuracy =
    correctChars + wrongChars
      ? Math.round((correctChars / (correctChars + wrongChars)) * 100)
      : 100;

  const resetTypingInput = useCallback((blur = true) => {
    composingRef.current = false;
    discardCompositionInputRef.current = false;
    setInputMethodWarning(false);
    if (inputRef.current) {
      inputRef.current.value = "";
      if (blur) inputRef.current.blur();
    }
  }, []);

  const finishGame = useCallback((finalElapsed?: number) => {
    if (!playingRef.current) return;
    playingRef.current = false;
    const elapsed =
      finalElapsed ?? Math.max(performance.now() - startedAtRef.current, 0);
    setElapsedMs(Math.min(elapsed, modeRef.current === "timed" ? GAME_DURATION : elapsed));
    resetTypingInput();
    setScreen("result");
  }, [resetTypingInput]);

  const handleCharacter = useCallback(
    (character: string) => {
      if (!playingRef.current || Array.from(character).length !== 1) return;
      const stations = gameStationsRef.current;
      const current = stations[stationIndexRef.current];
      if (!current) return;
      const language = languageRef.current;
      const received = normalizeTypingCharacter(character, language);
      if (!received) return;
      const currentTarget = Array.from(getTypingTarget(current, language));
      const expected = currentTarget[typedIndexRef.current];

      if (received === expected) {
        setInputMethodWarning(false);
        setCorrectChars((value) => value + 1);
        const nextTypedIndex = typedIndexRef.current + 1;
        if (nextTypedIndex >= currentTarget.length) {
          setCompletedStations((value) => value + 1);
          if (
            modeRef.current === "line" &&
            stationIndexRef.current >= stations.length - 1
          ) {
            finishGame(performance.now() - startedAtRef.current);
            return;
          }
          const nextStationIndex = (stationIndexRef.current + 1) % stations.length;
          stationIndexRef.current = nextStationIndex;
          typedIndexRef.current = 0;
          setStationIndex(nextStationIndex);
          setTypedIndex(0);
        } else {
          typedIndexRef.current = nextTypedIndex;
          setTypedIndex(nextTypedIndex);
        }
      } else {
        setWrongChars((value) => value + 1);
        setShake(false);
        requestAnimationFrame(() => setShake(true));
        window.setTimeout(() => setShake(false), 170);
      }
    },
    [finishGame],
  );

  const consumeInput = useCallback(
    (input: HTMLInputElement) => {
      const value = input.value;
      input.value = "";
      for (const character of Array.from(value.normalize("NFKC"))) {
        handleCharacter(character);
      }
    },
    [handleCharacter],
  );

  useEffect(() => {
    if (screen !== "game") return;
    const timer = window.setInterval(() => {
      if (!playingRef.current) return;
      const elapsed = performance.now() - startedAtRef.current;
      setElapsedMs(
        modeRef.current === "timed" ? Math.min(elapsed, GAME_DURATION) : elapsed,
      );
      if (modeRef.current === "timed" && elapsed >= GAME_DURATION) {
        finishGame(GAME_DURATION);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [finishGame, screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        if (screen === "game") {
          playingRef.current = false;
          resetTypingInput();
          setScreen("home");
          setSelectedLineId(null);
        } else if (screen === "home" && selectedLineId) {
          setSelectedLineId(null);
          setRunIndex(0);
          setDirectionIndex(0);
        }
        return;
      }
      if (
        screen !== "game" ||
        event.target === inputRef.current ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.length !== 1
      ) {
        return;
      }
      event.preventDefault();
      handleCharacter(event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCharacter, resetTypingInput, screen, selectedLineId]);

  function selectLine(id: string) {
    setSelectedLineId(id);
    setRunIndex(0);
    setDirectionIndex(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetHome(clearLine = true) {
    playingRef.current = false;
    resetTypingInput();
    setScreen("home");
    if (clearLine) setSelectedLineId(null);
    setRunIndex(0);
    setDirectionIndex(0);
  }

  function startGame() {
    if (!selectedLine || !selectedDirection?.stations.length) return;
    resetTypingInput(false);
    const stations = [...selectedDirection.stations];
    gameStationsRef.current = stations;
    stationIndexRef.current = 0;
    typedIndexRef.current = 0;
    modeRef.current = mode;
    languageRef.current = typingLanguage;
    playingRef.current = true;
    startedAtRef.current = performance.now();
    setGameStations(stations);
    setStationIndex(0);
    setTypedIndex(0);
    setCorrectChars(0);
    setWrongChars(0);
    setCompletedStations(0);
    setElapsedMs(0);
    setScreen("game");
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    if (discardCompositionInputRef.current) {
      event.currentTarget.value = "";
      discardCompositionInputRef.current = false;
      return;
    }
    if (
      composingRef.current ||
      (event.nativeEvent as InputEvent).isComposing
    ) {
      return;
    }
    setInputMethodWarning(false);
    consumeInput(event.currentTarget);
  }

  return (
    <div className={`metro-app${dark ? " dark" : ""}`}>
      <input
        ref={inputRef}
        className="mobile-typing-input"
        type="text"
        inputMode="email"
        lang={typingLanguage === "pinyin" ? "zh-Latn-CN" : "en"}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={typingLanguage === "pinyin" ? "拼音站名输入" : "英文站名输入"}
        aria-describedby={screen === "game" ? "typing-instruction" : undefined}
        onInput={handleInput}
        onCompositionStart={() => {
          composingRef.current = true;
          setInputMethodWarning(true);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          discardCompositionInputRef.current = true;
          event.currentTarget.value = "";
          window.setTimeout(() => {
            discardCompositionInputRef.current = false;
            if (inputRef.current) inputRef.current.value = "";
          }, 0);
        }}
      />

      {screen !== "game" ? (
        <Header
          city={city}
          dark={dark}
          onHome={() => resetHome(true)}
          onToggleDark={() => setDark((value) => !value)}
        />
      ) : null}

      <main>
        {loadError ? <ErrorScreen message={loadError} /> : null}
        {!loadError && (!data || !mapModel) ? <LoadingScreen city={city} /> : null}
        {data && mapModel && screen === "home" ? (
          <HomeScreen
            city={city}
            data={data}
            mapModel={mapModel}
            selectedLine={selectedLine}
            runs={runs}
            runIndex={runIndex}
            directionIndex={directionIndex}
            mode={mode}
            typingLanguage={typingLanguage}
            previewStations={previewStations}
            onSelectLine={selectLine}
            onReset={() => resetHome(true)}
            onRunChange={(index) => {
              setRunIndex(index);
              setDirectionIndex(0);
            }}
            onDirectionChange={setDirectionIndex}
            onModeChange={setMode}
            onTypingLanguageChange={setTypingLanguage}
            onStart={startGame}
          />
        ) : null}
        {data && mapModel && screen === "game" && selectedLine && currentStation ? (
          <GameScreen
            city={city}
            data={data}
            mapModel={mapModel}
            line={selectedLine}
            stations={gameStations}
            stationIndex={stationIndex}
            typedIndex={typedIndex}
            targetCharacters={targetCharacters}
            language={typingLanguage}
            inputMethodWarning={inputMethodWarning}
            completedStations={completedStations}
            elapsedSeconds={elapsedSeconds}
            remainingSeconds={remainingSeconds}
            speed={speed}
            accuracy={accuracy}
            mode={mode}
            shake={shake}
            onBack={() => resetHome(true)}
            onFocusTyping={() => inputRef.current?.focus({ preventScroll: true })}
          />
        ) : null}
        {screen === "result" ? (
          <ResultScreen
            elapsedSeconds={elapsedSeconds}
            completedStations={completedStations}
            speed={speed}
            speedUnit={typingLanguage === "pinyin" ? "KPM" : "WPM"}
            accuracy={accuracy}
            routeColor={selectedLine?.color ?? "#f08c4a"}
            onBack={() => resetHome(true)}
            onRetry={startGame}
          />
        ) : null}
      </main>

      {screen !== "game" ? <Footer city={city} data={data} /> : null}
    </div>
  );
}

function Header({
  city,
  dark,
  onHome,
  onToggleDark,
}: {
  city: CityConfig;
  dark: boolean;
  onHome: () => void;
  onToggleDark: () => void;
}) {
  const themeLabel = dark ? "切换为浅色模式" : "切换为深色模式";

  return (
    <header className="topbar">
      <div className="topbar-primary">
        <button className="brand" type="button" onClick={onHome} aria-label="回到当前城市首页">
          METRO TYPING
        </button>
        <details className="city-switcher">
          <summary aria-label={`当前城市：${city.nameZh}，切换城市`}>
            <span>{city.nameZh}</span>
            <ChevronDownIcon />
          </summary>
          <nav className="city-menu" aria-label="选择城市">
            {cities.map((option) => (
              <Link
                key={option.id}
                href={option.path}
                aria-current={option.id === city.id ? "page" : undefined}
              >
                <span>{option.nameZh}</span>
                <small>{option.nameEn.toUpperCase()}</small>
              </Link>
            ))}
          </nav>
        </details>
      </div>
      <div className="top-actions">
        <button
          className="icon-button"
          type="button"
          aria-pressed={dark}
          aria-label={themeLabel}
          title={themeLabel}
          onClick={onToggleDark}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <GitHubStarButton />
      </div>
    </header>
  );
}

const GITHUB_REPOSITORY_URL = "https://github.com/Evenss/metro-typing";
const GITHUB_REPOSITORY_API =
  "https://api.github.com/repos/Evenss/metro-typing";
const GITHUB_STAR_CACHE_KEY = "metro-typing:github-stars";
const GITHUB_STAR_CACHE_TTL = 6 * 60 * 60 * 1000;

function GitHubStarButton() {
  const [starCount, setStarCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);

    try {
      const cached = JSON.parse(
        window.localStorage.getItem(GITHUB_STAR_CACHE_KEY) || "null",
      ) as { stars?: number; fetchedAt?: number } | null;
      if (
        Number.isSafeInteger(cached?.stars) &&
        typeof cached?.stars === "number" &&
        cached.stars >= 0 &&
        typeof cached.fetchedAt === "number" &&
        Date.now() - cached.fetchedAt < GITHUB_STAR_CACHE_TTL
      ) {
        const cachedStars = cached.stars;
        queueMicrotask(() => {
          if (!controller.signal.aborted) setStarCount(cachedStars);
        });
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    fetch(GITHUB_REPOSITORY_API, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
        return response.json() as Promise<{ stargazers_count?: number }>;
      })
      .then(({ stargazers_count: count }) => {
        if (count === undefined || !Number.isSafeInteger(count) || count < 0) return;
        setStarCount(count);
        try {
          window.localStorage.setItem(
            GITHUB_STAR_CACHE_KEY,
            JSON.stringify({ stars: count, fetchedAt: Date.now() }),
          );
        } catch {
          // The count still renders when storage is unavailable.
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <a
      className="github-star-button"
      href={GITHUB_REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`在 GitHub 为 METRO TYPING 点赞，当前 ${starCount ?? "未知"} 个 Star`}
    >
      <span className="github-star-action">
        <GitHubIcon />
        <span>Star</span>
      </span>
      <strong className="github-star-count">
        {starCount === null ? "—" : starCount.toLocaleString("en-US")}
      </strong>
    </a>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      className="city-switcher-chevron"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m3.5 6 4.5 4 4.5-4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7.4A5.8 5.8 0 0 0 19.3 3 5.4 5.4 0 0 0 19.1.1S17.9-.3 15 1.6a13.4 13.4 0 0 0-7 0C5.1-.3 3.9.1 3.9.1A5.4 5.4 0 0 0 3.7 3a5.8 5.8 0 0 0-1.5 4.1c0 5.8 3.5 7 6.8 7.4A4.8 4.8 0 0 0 8 18v4" />
      <path d="M8 19c-3 .9-3-1.5-4-2" />
    </svg>
  );
}

function HomeScreen({
  city,
  data,
  mapModel,
  selectedLine,
  runs,
  runIndex,
  directionIndex,
  mode,
  typingLanguage,
  previewStations,
  onSelectLine,
  onReset,
  onRunChange,
  onDirectionChange,
  onModeChange,
  onTypingLanguageChange,
  onStart,
}: {
  city: CityConfig;
  data: MetroData;
  mapModel: MapModel;
  selectedLine: MetroLine | null;
  runs: ResolvedRun[];
  runIndex: number;
  directionIndex: number;
  mode: GameMode;
  typingLanguage: TypingLanguage;
  previewStations: Station[];
  onSelectLine: (id: string) => void;
  onReset: () => void;
  onRunChange: (index: number) => void;
  onDirectionChange: (directionIndex: number) => void;
  onModeChange: (mode: GameMode) => void;
  onTypingLanguageChange: (language: TypingLanguage) => void;
  onStart: () => void;
}) {
  const uniqueStationCount = Object.keys(data.stations).length;
  const selectedRun = runs[runIndex] ?? runs[0] ?? null;
  const targetViewBox = selectedLine
    ? getRouteViewBox(linePoints(mapModel, selectedLine))
    : FULL_VIEWBOX;
  const cityMapRef = useRef<SVGSVGElement>(null);
  const [mapIntro, setMapIntro] = useState(true);

  useEffect(() => {
    const maxSegments = Math.max(
      1,
      ...data.lines.map((line) => mapModel.lineSegments.get(line.id)?.length ?? 0),
    );
    const introDuration =
      (0.25 + data.lines.length * 0.14 + maxSegments * 0.45 + 1.9) * 1000;
    const timer = window.setTimeout(() => setMapIntro(false), introDuration);
    return () => window.clearTimeout(timer);
  }, [data.lines, mapModel]);

  useEffect(() => {
    const svg = cityMapRef.current;
    if (!svg) return undefined;

    const from = (svg.getAttribute("viewBox") ?? FULL_VIEWBOX)
      .split(/\s+/)
      .map(Number);
    const to = targetViewBox.split(/\s+/).map(Number);
    const startedAt = performance.now();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 1
      : 680;
    let frameId = 0;

    const frame = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      svg.setAttribute(
        "viewBox",
        from
          .map((value, index) => value + (to[index] - value) * eased)
          .join(" "),
      );
      if (progress < 1) frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [targetViewBox]);

  const selectLine = (id: string) => {
    setMapIntro(false);
    onSelectLine(id);
  };

  return (
    <section className={`home-map-screen${selectedLine ? " focused" : ""}`}>
      <svg
        ref={cityMapRef}
        className={`city-map${mapIntro ? " intro" : ""}`}
        viewBox={FULL_VIEWBOX}
        role="img"
        aria-label={`${city.nameZh}地铁运营线路与都市区轮廓图`}
      >
        <defs>
          <filter id="city-shadow" x="-30%" y="-30%" width="170%" height="180%">
            <feDropShadow dx="0" dy="13" stdDeviation="14" floodColor="#39352c" floodOpacity=".12" />
          </filter>
          <pattern id="map-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="currentColor" strokeOpacity=".055" strokeWidth="1" />
          </pattern>
        </defs>
        <rect className="map-grid" x="-500" y="-300" width="2100" height="1500" fill="url(#map-grid)" />
        <g className="districts" filter="url(#city-shadow)">
          {mapModel.districtPaths.map((district) => (
            <path
              key={district.name}
              d={district.path}
              aria-label={district.name}
            />
          ))}
        </g>
        <g className="home-routes">
          {data.lines.map((line, lineIndex) => {
            const selected = selectedLine?.id === line.id;
            const segments = mapModel.lineSegments.get(line.id) ?? [];
            return (
              <g
                key={line.id}
                className={`home-route${selected ? " selected" : ""}${selectedLine && !selected ? " muted" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`选择${line.lineName}`}
                style={{ "--route-delay": `${0.25 + lineIndex * 0.14}s` } as CSSProperties}
                onClick={() => selectLine(line.id)}
                onKeyDown={(event: ReactKeyboardEvent<SVGGElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectLine(line.id);
                  }
                }}
              >
                {segments.map((segment, index) => (
                  <g
                    key={index}
                    style={{
                      "--segment-delay": `${(0.25 + lineIndex * 0.14 + index * 0.45).toFixed(2)}s`,
                    } as CSSProperties}
                  >
                    <polyline className="route-hit" points={pointsToString(segment)} />
                    <polyline className="route-casing" points={pointsToString(segment)} pathLength="1" />
                    <polyline
                      className="route-line"
                      points={pointsToString(segment)}
                      pathLength="1"
                      stroke={line.color}
                    />
                  </g>
                ))}
                {selected
                  ? line.stationIds.map((stationId) => {
                      const point = mapModel.stationPoints.get(stationId);
                      return point ? (
                        <circle key={stationId} className="route-node" cx={point[0]} cy={point[1]} r="0.45" />
                      ) : null;
                    })
                  : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="home-copy" aria-hidden={selectedLine ? "true" : undefined}>
        <div className="eyebrow"><span /> THE CITY · ONE LINE AT A TIME</div>
        <h1>今天，<em>想坐哪一条线？</em></h1>
        <p className="lede">
          挑选城市、线路和行驶方向，然后输入沿途站名。你的每次完成，都会让这趟列车继续前行。
        </p>
        <div className="home-instruction"><b>01</b><span>在地图上挑选线路</span></div>
        <span className="data-status">{data.lines.length} 条线路 · {uniqueStationCount} 座运营车站</span>
      </div>

      {selectedLine ? (
        <>
          <button className="map-reset" type="button" onClick={onReset}>← 返回线路总览 <kbd>ESC</kbd></button>
          <div className="route-focus-card" aria-live="polite">
            <span className="focus-kicker">SELECTED ROUTE</span>
            <div className="focus-route-title">
              <span className="focus-line-code" style={{ "--focus-color": selectedLine.color } as CSSProperties}>
                {selectedLine.lineId}
              </span>
              <div>
                <h2>{selectedLine.lineName}</h2>
                <p>{selectedLine.operatorName} · {previewStations.length} 站</p>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="home-control-deck">
        <div className="route-carousel" aria-label="可选择的地铁线路">
          {data.lines.map((line) => (
            <button
              key={line.id}
              className={`route-button${selectedLine?.id === line.id ? " selected" : ""}`}
              type="button"
              style={{ "--route": line.color } as CSSProperties}
              onClick={() => selectLine(line.id)}
            >
              <span className="route-symbol">{line.lineId}</span>
              <span><strong>{line.lineName}</strong><small>{line.operatorName} · {line.stationIds.length} 站</small></span>
            </button>
          ))}
        </div>

        {selectedLine ? (
          <div className="focus-actions" style={{ "--focus-color": selectedLine.color } as CSSProperties}>
            {runs.length > 1 ? (
              <div className="run-picker" aria-label="选择行驶区间">
                <span className="control-label">区间</span>
                <div className="run-options">
                  {runs.map((run, index) => {
                    const stations = run.directions[0]?.stations ?? [];
                    return (
                      <label key={run.id} className={`run-option${runIndex === index ? " selected" : ""}`}>
                        <input type="radio" name="run" value={index} checked={runIndex === index} onChange={() => onRunChange(index)} />
                        <span><b>{run.nameZh || `${stations[0]?.nameZh} → ${stations.at(-1)?.nameZh}`}</b><small>{stations.length} 站</small></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {previewStations.length ? (
              <div className="direction-picker" role="radiogroup" aria-label="行驶方向">
                <span className="control-label">方向</span>
                <div className="direction-options">
                  {(selectedRun?.directions ?? []).map((option, index) => {
                    const origin = option.stations[0];
                    const destination = option.stations.at(-1);
                    return (
                      <label key={option.id} className={`direction-option${directionIndex === index ? " selected" : ""}`}>
                        <input type="radio" name="direction" value={option.id} checked={directionIndex === index} onChange={() => onDirectionChange(index)} />
                        <span><small>{option.labelZh} · 从 {origin?.nameZh}</small><b>往 {destination?.nameZh} →</b></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="option-toolbar">
              <SegmentedControl
                label="站名"
                name="typing-language"
                value={typingLanguage}
                options={[{ value: "en", label: "英文" }, { value: "pinyin", label: "拼音" }]}
                onChange={(value) => onTypingLanguageChange(value as TypingLanguage)}
              />
              <SegmentedControl
                label="玩法"
                name="mode"
                value={mode}
                options={[{ value: "timed", label: "30 秒" }, { value: "line", label: "全线" }]}
                onChange={(value) => onModeChange(value as GameMode)}
              />
              <button className="start-button" type="button" onClick={onStart}><span>开始这条线路</span><b>→</b></button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SegmentedControl({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      <span className="control-label">{label}</span>
      <div className="segmented-options">
        {options.map((option) => (
          <label key={option.value} className={`segment-option${value === option.value ? " selected" : ""}`}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function GameScreen({
  city,
  data,
  mapModel,
  line,
  stations,
  stationIndex,
  typedIndex,
  targetCharacters,
  language,
  inputMethodWarning,
  completedStations,
  elapsedSeconds,
  remainingSeconds,
  speed,
  accuracy,
  mode,
  shake,
  onBack,
  onFocusTyping,
}: {
  city: CityConfig;
  data: MetroData;
  mapModel: MapModel;
  line: MetroLine;
  stations: Station[];
  stationIndex: number;
  typedIndex: number;
  targetCharacters: string[];
  language: TypingLanguage;
  inputMethodWarning: boolean;
  completedStations: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  speed: number;
  accuracy: number;
  mode: GameMode;
  shake: boolean;
  onBack: () => void;
  onFocusTyping: () => void;
}) {
  const current = stations[stationIndex];
  const next = stations[stationIndex + 1] ?? null;
  const { gameRef, chromeRef, scoreRef, cardRef, layout: cameraLayout } =
    useGameCameraLayout();
  const displayText = getTypingDisplayText(current, language);
  const targetLabel = language === "pinyin" ? current.namePinyin : current.nameEn;
  const targetWords = useMemo(
    () => getTypingDisplayTokens(displayText),
    [displayText],
  );
  const { targetRef, trackRef } = useTypingTargetFit(displayText);
  const currentPoint = useMemo<Point>(
    () => mapModel.stationPoints.get(current.id) ?? [0, 0],
    [current.id, mapModel],
  );
  const nextPoint = useMemo<Point>(
    () => next
      ? mapModel.stationPoints.get(next.id) ?? currentPoint
      : currentPoint,
    [currentPoint, mapModel, next],
  );
  const trainProgress = targetCharacters.length ? typedIndex / targetCharacters.length : 0;
  const trainPoint: Point = [
    currentPoint[0] + (nextPoint[0] - currentPoint[0]) * trainProgress,
    currentPoint[1] + (nextPoint[1] - currentPoint[1]) * trainProgress,
  ];
  const journeyPoints = useMemo(
    () =>
      stations
        .map((station) => mapModel.stationPoints.get(station.id))
        .filter((point): point is Point => Boolean(point)),
    [mapModel, stations],
  );
  const progressPoints = journeyPoints.slice(0, stationIndex + 1);
  if (trainProgress > 0) progressPoints.push(trainPoint);
  const cameraFocusPoints = useMemo(
    () =>
      stations
        .slice(
          Math.max(0, stationIndex - 1),
          Math.min(stations.length, stationIndex + 3),
        )
        .map((station) => mapModel.stationPoints.get(station.id))
        .filter((point): point is Point => Boolean(point)),
    [mapModel, stationIndex, stations],
  );
  const cameraTargetViewBox = useMemo(() => {
    const minimumWidth =
      cameraLayout.width <= 620
        ? 260
        : Math.min(Math.max(cameraLayout.width / 4, 340), 420);
    const options = {
      anchorPoint: currentPoint,
      headingPoint: next ? nextPoint : null,
      minimumWidth,
      padding: 30,
      forwardBias: 0.14,
    };
    const segmentTarget = getTrackingViewBox(
      next ? [currentPoint, nextPoint] : [currentPoint],
      cameraLayout,
      cameraLayout.safeRect,
      options,
    ) as ViewBox;
    const contextTarget = getTrackingViewBox(
      cameraFocusPoints,
      cameraLayout,
      cameraLayout.safeRect,
      options,
    ) as ViewBox;
    const contextSoftMaximum =
      cameraLayout.width <= 620
        ? 420
        : Math.min(Math.max(cameraLayout.width / 2, 560), 720);
    return contextTarget[2] <= contextSoftMaximum
      ? contextTarget
      : segmentTarget;
  }, [cameraFocusPoints, cameraLayout, currentPoint, next, nextPoint]);
  const { viewBox: cameraViewBox, animating: cameraAnimating } =
    useAnimatedViewBox(cameraTargetViewBox);
  const mapPixelsPerUnit =
    cameraLayout.width / Math.max(cameraViewBox[2], 1);
  const trainGlyphScale = Math.min(
    Math.max(36 / Math.max(20 * mapPixelsPerUnit, 1), 0.2),
    4,
  );
  const routeEnd = stations.at(-1);
  const passedStationIds = new Set(
    stations.slice(0, stationIndex).map((station) => station.id),
  );
  const showTypingHint = language === "pinyin" || inputMethodWarning;

  return (
    <section
      ref={gameRef}
      className="game"
      data-camera-ready={cameraLayout.ready ? "true" : "false"}
      data-camera-state={cameraAnimating ? "reframing" : "tracking"}
      data-keyboard-open={cameraLayout.keyboardOpen ? "true" : "false"}
      data-keyboard-tight={cameraLayout.keyboardTight ? "true" : "false"}
      style={{
        "--active-route": line.color,
        "--game-keyboard-inset": `${cameraLayout.keyboardInset}px`,
      } as CSSProperties}
    >
      <p className="screen-reader-status" aria-live="polite" aria-atomic="true">
        当前车站 {current.nameZh}，请输入 {targetLabel}
      </p>
      <svg
        className="game-map"
        viewBox={formatViewBox(cameraViewBox)}
        aria-hidden="true"
      >
        <g className="game-districts">
          {mapModel.districtPaths.map((district) => <path key={district.name} d={district.path} />)}
        </g>
        {data.lines.flatMap((networkLine) =>
          (mapModel.lineSegments.get(networkLine.id) ?? []).map((segment, index) => (
            <polyline key={`${networkLine.id}-${index}`} className="game-line network" points={pointsToString(segment)} stroke={networkLine.color} />
          )),
        )}
        {journeyPoints.length > 1 ? <polyline className="game-casing" points={pointsToString(journeyPoints)} /> : null}
        {journeyPoints.length > 1 ? <polyline className="game-line selected" points={pointsToString(journeyPoints)} stroke={line.color} /> : null}
        {progressPoints.length > 1 ? <polyline className="game-progress" points={pointsToString(progressPoints)} stroke={line.color} /> : null}
        {stations.map((station) => {
          const point = mapModel.stationPoints.get(station.id);
          if (!point) return null;
          const state = station.id === current.id
            ? " current"
            : station.id === next?.id
              ? " next"
              : passedStationIds.has(station.id)
                ? " passed"
                : "";
          return <circle key={station.id} data-station-id={station.id} className={`game-node${state}`} cx={point[0]} cy={point[1]} r="2.4" />;
        })}
        <g
          className="map-train"
          data-station-index={stationIndex}
          style={{ transform: `translate(${trainPoint[0]}px, ${trainPoint[1]}px)` }}
        >
          <g className="train-glyph" transform={`scale(${trainGlyphScale})`}>
            <circle className="train-halo" r="14" />
            <rect className="train-body" x="-10" y="-7" width="20" height="14" rx="4" />
            <rect className="train-window" x="-6" y="-3.5" width="4" height="4" rx="1" />
            <rect className="train-window" x="2" y="-3.5" width="4" height="4" rx="1" />
          </g>
        </g>
      </svg>

      <div ref={chromeRef} className="game-chrome">
        <button className="back-button" type="button" onClick={onBack}>← 返回选线 <kbd>ESC</kbd></button>
        <div className="route-pill" style={{ background: line.color }}>{line.lineName} · 往 {routeEnd?.nameZh}</div>
      </div>

      <div ref={scoreRef} className="scorebar">
        <Metric label={mode === "timed" ? "剩余" : "经过"} value={mode === "timed" ? remainingSeconds : elapsedSeconds} unit="秒" />
        <Metric label="到站" value={completedStations} unit="站" />
        <Metric label="速度" value={speed} unit={language === "pinyin" ? "KPM" : "WPM"} />
        <Metric label="正确率" value={accuracy} unit="%" />
      </div>

      <article ref={cardRef} className={`station-card${shake ? " shake" : ""}`} onClick={onFocusTyping}>
        <div className="station-meta"><span>{String(stationIndex + 1).padStart(2, "0")}</span><span>{city.nameZh}市 · {line.lineName} · 数据 {data.updatedAt}</span></div>
        <div className="station-main">
          <div><p>NOW ARRIVING</p><h2>{current.nameZh}</h2></div>
          <div className="next-station"><span>{next ? "下一站" : "终点站"}</span><strong>{next?.nameZh ?? "本线终点"}</strong>{next ? <b>→</b> : null}</div>
        </div>
        <div className="keyboard-typing-meta">
          <strong>{current.nameZh}</strong>
          <span>
            {mode === "timed" ? `剩余 ${remainingSeconds} 秒` : `经过 ${elapsedSeconds} 秒`}
            {` · ${stationIndex + 1}/${stations.length} 站`}
          </span>
        </div>
        <div className={`typing-area${showTypingHint ? " has-hint" : ""}`}>
          <div ref={targetRef} className="typing-target" aria-label={`请输入 ${targetLabel}`}>
            <span ref={trackRef} className="typing-track">
              {targetWords.map(({ characters, startIndex, visualSeparator }) => (
                <span className="typing-token" key={`${startIndex}-${characters.join("")}`}>
                  <span className="typing-word">
                    {characters.map((character, offset) => {
                      const index = startIndex + offset;
                      return (
                        <span key={`${character}-${index}`} className={`typing-character${index < typedIndex ? " typed" : index === typedIndex ? " current" : ""}`}>
                          {character}
                        </span>
                      );
                    })}
                  </span>
                  {visualSeparator ? <span className="typing-optional-space" aria-hidden="true">{"\u00a0"}</span> : null}
                </span>
              ))}
            </span>
          </div>
          {showTypingHint ? (
            <p
              id="typing-instruction"
              className={`typing-hint${inputMethodWarning ? " is-warning" : ""}`}
              role="status"
              aria-live="polite"
            >
              {inputMethodWarning
                ? "检测到中文输入法，请先切换到英文键盘"
                : "英文键盘直输 · 不选字，空格/声调免输 · ü 按 v"}
            </p>
          ) : (
            <span id="typing-instruction" className="screen-reader-status">直接输入画面上的英文站名，空格可输入或省略</span>
          )}
        </div>
        <div className="line-strip"><i /><span>{line.lineName}</span></div>
      </article>
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div><small>{label}</small><strong>{value}</strong><span>{unit}</span></div>;
}

function ResultScreen({
  elapsedSeconds,
  completedStations,
  speed,
  speedUnit,
  accuracy,
  routeColor,
  onBack,
  onRetry,
}: {
  elapsedSeconds: number;
  completedStations: number;
  speed: number;
  speedUnit: string;
  accuracy: number;
  routeColor: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="results" style={{ "--result-route": routeColor } as CSSProperties}>
      <div className="result-card">
        <span className="result-kicker">JOURNEY COMPLETE</span>
        <h2>这班车，跑得很顺。</h2>
        <p>你在 {elapsedSeconds} 秒内通过了 {completedStations} 个车站。</p>
        <div className="result-metrics">
          <div><strong>{completedStations}</strong><span>通过站数</span></div>
          <div><strong>{speed}</strong><span>平均 {speedUnit}</span></div>
          <div><strong>{accuracy}%</strong><span>正确率</span></div>
        </div>
        <div className="result-actions">
          <button className="secondary-button" type="button" onClick={onBack}>重新选线</button>
          <button className="start-button" type="button" onClick={onRetry}><span>再跑一次</span><b>↻</b></button>
        </div>
      </div>
    </section>
  );
}

function LoadingScreen({ city }: { city: CityConfig }) {
  return <div className="loading"><span />正在载入{city.nameZh}地铁线网…</div>;
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="data-error">
      <strong>地图数据载入失败</strong><span>{message}</span>
      <button type="button" onClick={() => location.reload()}>重新载入</button>
    </div>
  );
}

function Footer({ city, data }: { city: CityConfig; data: MetroData | null }) {
  const networkSource = data?.sources?.network ?? {
    label: city.operatorName,
    url: city.officialSourceUrl,
  };
  const boundarySource = data?.sources?.boundary ?? {
    label: "DataV",
    url: city.boundarySourceUrl,
  };

  return (
    <footer>
      <div className="footer-brand">
        <span className="footer-wordmark">{city.nameEn.toUpperCase()} METRO TYPING</span>
        <span className="footer-lines" aria-hidden="true">
          {(data?.lines ?? []).map((line) => <i key={line.id} style={{ background: line.color }} />)}
        </span>
      </div>
      <div className="footer-meta">
        <p><span className="footer-label">DATA</span>线路与站名参考 <a href={networkSource.url} target="_blank" rel="noreferrer">{networkSource.label}</a><span className="footer-sep">·</span>地图边界 <a href={boundarySource.url} target="_blank" rel="noreferrer">{boundarySource.label}</a></p>
        <p>设计参考 <a href="https://tw-metro-typing.yencheng.dev/" target="_blank" rel="noreferrer">Taiwan Metro Typing</a></p>
      </div>
    </footer>
  );
}
