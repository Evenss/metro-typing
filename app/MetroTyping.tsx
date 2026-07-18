"use client";

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

type Screen = "home" | "game" | "result";
type Direction = "forward" | "reverse";
type GameMode = "timed" | "line";
type TypingLanguage = "en" | "zh";
type Point = [number, number];

type Station = {
  id: string;
  nameZh: string;
  nameEn: string;
  lon: number;
  lat: number;
};

type MetroLine = {
  id: string;
  lineId: string;
  lineName: string;
  operatorName: string;
  color: string;
  segments: string[][];
  stations: Station[];
};

type MetroData = {
  city: string;
  updatedAt: string;
  lines: MetroLine[];
  districts: Array<{ name: string; rings: Point[][] }>;
};

type MapModel = {
  districtPaths: Array<{ name: string; path: string }>;
  stationPoints: Map<string, Point>;
  lineSegments: Map<string, Point[][]>;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const MAP_RATIO = MAP_WIDTH / MAP_HEIGHT;
const FULL_VIEWBOX = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
const GAME_DURATION = 30_000;
const GEO_BOUNDS = {
  minLon: 118.344957,
  maxLon: 120.721946,
  minLat: 29.188757,
  maxLat: 30.566516,
};

function project(lon: number, lat: number): Point {
  const x =
    50 +
    ((lon - GEO_BOUNDS.minLon) /
      (GEO_BOUNDS.maxLon - GEO_BOUNDS.minLon)) *
      900;
  const y =
    35 +
    ((GEO_BOUNDS.maxLat - lat) /
      (GEO_BOUNDS.maxLat - GEO_BOUNDS.minLat)) *
      630;
  return [x, y];
}

function pointsToString(points: Point[]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function ringToPath(ring: Point[]) {
  if (!ring.length) return "";
  return `${ring
    .map(([lon, lat], index) => {
      const [x, y] = project(lon, lat);
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")} Z`;
}

function buildMapModel(data: MetroData): MapModel {
  const stationPoints = new Map<string, Point>();
  for (const line of data.lines) {
    for (const station of line.stations) {
      stationPoints.set(
        station.nameZh,
        project(station.lon, station.lat),
      );
    }
  }

  return {
    districtPaths: data.districts.map((district) => ({
      name: district.name,
      path: district.rings.map(ringToPath).join(" "),
    })),
    stationPoints,
    lineSegments: new Map(
      data.lines.map((line) => [
        line.id,
        line.segments.map((segment) =>
          segment
            .map((name) => stationPoints.get(name))
            .filter((point): point is Point => Boolean(point)),
        ),
      ]),
    ),
  };
}

function fitViewBox(points: Point[], padding = 46, minimumWidth = 280) {
  if (!points.length) return FULL_VIEWBOX;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  let width = Math.max(Math.max(...xs) - Math.min(...xs) + padding * 2, minimumWidth);
  let height = Math.max(Math.max(...ys) - Math.min(...ys) + padding * 2, 210);
  if (width / height > MAP_RATIO) height = width / MAP_RATIO;
  else width = height * MAP_RATIO;
  return `${(centerX - width / 2).toFixed(2)} ${(centerY - height / 2).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;
}

function normalizeTarget(station: Station | undefined, language: TypingLanguage) {
  if (!station) return "";
  if (language === "zh") {
    return station.nameZh.normalize("NFKC").replace(/[^\p{Letter}\p{Number}]/gu, "");
  }
  return station.nameEn
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getRuns(line: MetroLine | null) {
  if (!line) return [];
  const lookup = new Map(line.stations.map((station) => [station.nameZh, station]));
  return line.segments
    .map((segment) => segment.map((name) => lookup.get(name)).filter(Boolean) as Station[])
    .filter((run) => run.length > 1);
}

function linePoints(model: MapModel, line: MetroLine | null) {
  if (!line) return [];
  return (model.lineSegments.get(line.id) ?? []).flat();
}

export function MetroTyping() {
  const [data, setData] = useState<MetroData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>("forward");
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
  const [compositionText, setCompositionText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const playingRef = useRef(false);
  const startedAtRef = useRef(0);
  const stationIndexRef = useRef(0);
  const typedIndexRef = useRef(0);
  const gameStationsRef = useRef<Station[]>([]);
  const modeRef = useRef<GameMode>(mode);
  const languageRef = useRef<TypingLanguage>(typingLanguage);
  const composingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/hangzhou-metro.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`数据载入失败（${response.status}）`);
        return response.json() as Promise<MetroData>;
      })
      .then(setData)
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoadError(error.message);
      });
    return () => controller.abort();
  }, []);

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

  const mapModel = useMemo(() => (data ? buildMapModel(data) : null), [data]);
  const selectedLine =
    data?.lines.find((line) => line.id === selectedLineId) ?? null;
  const runs = useMemo(() => getRuns(selectedLine), [selectedLine]);
  const selectedRun = runs[runIndex] ?? runs[0] ?? [];
  const previewStations =
    direction === "reverse" ? [...selectedRun].reverse() : selectedRun;
  const currentStation = gameStations[stationIndex];
  const target = normalizeTarget(currentStation, typingLanguage);
  const targetCharacters = Array.from(target);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const remainingSeconds = Math.max(
    Math.ceil((GAME_DURATION - elapsedMs) / 1000),
    0,
  );
  const minutes = Math.max(elapsedMs, 2000) / 60_000;
  const speed =
    typingLanguage === "zh"
      ? Math.round(correctChars / minutes)
      : Math.round(correctChars / 5 / minutes);
  const accuracy =
    correctChars + wrongChars
      ? Math.round((correctChars / (correctChars + wrongChars)) * 100)
      : 100;

  const finishGame = useCallback((finalElapsed?: number) => {
    if (!playingRef.current) return;
    playingRef.current = false;
    const elapsed =
      finalElapsed ?? Math.max(performance.now() - startedAtRef.current, 0);
    setElapsedMs(Math.min(elapsed, modeRef.current === "timed" ? GAME_DURATION : elapsed));
    setCompositionText("");
    inputRef.current?.blur();
    setScreen("result");
  }, []);

  const handleCharacter = useCallback(
    (character: string) => {
      if (!playingRef.current || Array.from(character).length !== 1) return;
      const stations = gameStationsRef.current;
      const current = stations[stationIndexRef.current];
      if (!current) return;
      const language = languageRef.current;
      const currentTarget = Array.from(normalizeTarget(current, language));
      const expected = currentTarget[typedIndexRef.current];
      const received =
        language === "zh"
          ? character.normalize("NFKC").replaceAll("臺", "台")
          : character.toLowerCase();
      const normalizedExpected =
        language === "zh" ? expected?.replaceAll("臺", "台") : expected;

      if (received === normalizedExpected) {
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
      setCompositionText("");
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
          setScreen("home");
          setSelectedLineId(null);
        } else if (screen === "home" && selectedLineId) {
          setSelectedLineId(null);
          setRunIndex(0);
          setDirection("forward");
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
        event.key.length !== 1 ||
        languageRef.current === "zh"
      ) {
        return;
      }
      event.preventDefault();
      handleCharacter(event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCharacter, screen, selectedLineId]);

  function selectLine(id: string) {
    setSelectedLineId(id);
    setRunIndex(0);
    setDirection("forward");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetHome(clearLine = true) {
    playingRef.current = false;
    inputRef.current?.blur();
    setCompositionText("");
    setScreen("home");
    if (clearLine) setSelectedLineId(null);
    setRunIndex(0);
    setDirection("forward");
  }

  function startGame() {
    if (!selectedLine || !selectedRun.length) return;
    const stations =
      direction === "reverse" ? [...selectedRun].reverse() : [...selectedRun];
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
    setCompositionText("");
    setScreen("game");
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    if (
      composingRef.current ||
      (event.nativeEvent as InputEvent).isComposing
    ) {
      setCompositionText(event.currentTarget.value);
      return;
    }
    consumeInput(event.currentTarget);
  }

  return (
    <div className={`metro-app${dark ? " dark" : ""}`}>
      <input
        ref={inputRef}
        className="mobile-typing-input"
        type="text"
        inputMode="text"
        lang={typingLanguage === "zh" ? "zh-CN" : "en"}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={typingLanguage === "zh" ? "中文站名输入" : "英文站名输入"}
        aria-describedby={screen === "game" ? "typing-instruction" : undefined}
        onInput={handleInput}
        onCompositionStart={(event) => {
          composingRef.current = true;
          setCompositionText(event.currentTarget.value);
        }}
        onCompositionUpdate={(event) => {
          setCompositionText(event.data || event.currentTarget.value || "");
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          setCompositionText("");
          consumeInput(event.currentTarget);
        }}
      />

      {screen !== "game" ? (
        <Header
          dark={dark}
          onHome={() => resetHome(true)}
          onToggleDark={() => setDark((value) => !value)}
        />
      ) : null}

      <main>
        {loadError ? <ErrorScreen message={loadError} /> : null}
        {!loadError && (!data || !mapModel) ? <LoadingScreen /> : null}
        {data && mapModel && screen === "home" ? (
          <HomeScreen
            data={data}
            mapModel={mapModel}
            selectedLine={selectedLine}
            runs={runs}
            runIndex={runIndex}
            direction={direction}
            mode={mode}
            typingLanguage={typingLanguage}
            previewStations={previewStations}
            onSelectLine={selectLine}
            onReset={() => resetHome(true)}
            onRunChange={(index) => {
              setRunIndex(index);
              setDirection("forward");
            }}
            onDirectionChange={setDirection}
            onModeChange={setMode}
            onTypingLanguageChange={setTypingLanguage}
            onStart={startGame}
          />
        ) : null}
        {data && mapModel && screen === "game" && selectedLine && currentStation ? (
          <GameScreen
            data={data}
            mapModel={mapModel}
            line={selectedLine}
            stations={gameStations}
            stationIndex={stationIndex}
            typedIndex={typedIndex}
            targetCharacters={targetCharacters}
            language={typingLanguage}
            compositionText={compositionText}
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
            speedUnit={typingLanguage === "zh" ? "CPM" : "WPM"}
            accuracy={accuracy}
            routeColor={selectedLine?.color ?? "#f08c4a"}
            onBack={() => resetHome(true)}
            onRetry={startGame}
          />
        ) : null}
      </main>

      {screen !== "game" ? <Footer data={data} /> : null}
    </div>
  );
}

function Header({
  dark,
  onHome,
  onToggleDark,
}: {
  dark: boolean;
  onHome: () => void;
  onToggleDark: () => void;
}) {
  const themeLabel = dark ? "切换为浅色模式" : "切换为深色模式";

  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome} aria-label="回到首页">
        HANGZHOU METRO TYPING
      </button>
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
    </header>
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
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 6.8c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  );
}

function HomeScreen({
  data,
  mapModel,
  selectedLine,
  runs,
  runIndex,
  direction,
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
  data: MetroData;
  mapModel: MapModel;
  selectedLine: MetroLine | null;
  runs: Station[][];
  runIndex: number;
  direction: Direction;
  mode: GameMode;
  typingLanguage: TypingLanguage;
  previewStations: Station[];
  onSelectLine: (id: string) => void;
  onReset: () => void;
  onRunChange: (index: number) => void;
  onDirectionChange: (direction: Direction) => void;
  onModeChange: (mode: GameMode) => void;
  onTypingLanguageChange: (language: TypingLanguage) => void;
  onStart: () => void;
}) {
  const uniqueStationCount = new Set(
    data.lines.flatMap((line) => line.stations.map((station) => station.nameZh)),
  ).size;
  const viewBox = selectedLine
    ? fitViewBox(linePoints(mapModel, selectedLine), 42, 300)
    : FULL_VIEWBOX;

  return (
    <section className={`home-map-screen${selectedLine ? " focused" : ""}`}>
      <svg
        className="city-map"
        viewBox={viewBox}
        role="img"
        aria-label="杭州行政区与地铁运营线路图"
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
            <path key={district.name} d={district.path} aria-label={district.name} />
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
                style={{ "--route-delay": `${0.18 + lineIndex * 0.08}s` } as CSSProperties}
                onClick={() => onSelectLine(line.id)}
                onKeyDown={(event: ReactKeyboardEvent<SVGGElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectLine(line.id);
                  }
                }}
              >
                {segments.map((segment, index) => (
                  <g key={index}>
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
                  ? line.stations.map((station) => {
                      const point = mapModel.stationPoints.get(station.nameZh);
                      return point ? (
                        <circle key={station.id} className="route-node" cx={point[0]} cy={point[1]} r="2.2" />
                      ) : null;
                    })
                  : null}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="home-copy" aria-hidden={selectedLine ? "true" : undefined}>
        <div className="eyebrow"><span /> REAL ROUTES · REAL STATIONS</div>
        <h1>一站一站，<em>越打越顺。</em></h1>
        <p className="lede">
          在真实杭州地图上选择路线，沿着运营站序完成英文或中文站名。每打对一个字，列车就会向下一站前进一步。
        </p>
        <div className="home-instruction"><b>01</b><span>从地图或下方路线列选择线路</span></div>
        <span className="data-status">{data.lines.length} 条线路 · {uniqueStationCount} 座运营车站</span>
      </div>

      {selectedLine ? (
        <>
          <button className="map-reset" type="button" onClick={onReset}>← 返回杭州全图 <kbd>ESC</kbd></button>
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
              onClick={() => onSelectLine(line.id)}
            >
              <span className="route-symbol">{line.lineId}</span>
              <span><strong>{line.lineName}</strong><small>{line.operatorName} · {line.stations.length} 站</small></span>
            </button>
          ))}
        </div>

        {selectedLine ? (
          <div className="focus-actions" style={{ "--focus-color": selectedLine.color } as CSSProperties}>
            {runs.length > 1 ? (
              <div className="run-picker" aria-label="选择行驶区间">
                <span className="control-label">区间</span>
                <div className="run-options">
                  {runs.map((run, index) => (
                    <label key={`${run[0]?.nameZh}-${run.at(-1)?.nameZh}`} className={`run-option${runIndex === index ? " selected" : ""}`}>
                      <input type="radio" name="run" value={index} checked={runIndex === index} onChange={() => onRunChange(index)} />
                      <span><b>{run[0]?.nameZh} → {run.at(-1)?.nameZh}</b><small>{run.length} 站</small></span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {previewStations.length ? (
              <div className="direction-picker" role="radiogroup" aria-label="行驶方向">
                <span className="control-label">方向</span>
                <div className="direction-options">
                  {(["forward", "reverse"] as Direction[]).map((value) => {
                    const run = runs[runIndex] ?? runs[0] ?? [];
                    const origin = value === "forward" ? run[0] : run.at(-1);
                    const destination = value === "forward" ? run.at(-1) : run[0];
                    return (
                      <label key={value} className={`direction-option${direction === value ? " selected" : ""}`}>
                        <input type="radio" name="direction" value={value} checked={direction === value} onChange={() => onDirectionChange(value)} />
                        <span><small>从 {origin?.nameZh}</small><b>往 {destination?.nameZh} →</b></span>
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
                options={[{ value: "en", label: "英文" }, { value: "zh", label: "中文" }]}
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
  data,
  mapModel,
  line,
  stations,
  stationIndex,
  typedIndex,
  targetCharacters,
  language,
  compositionText,
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
  data: MetroData;
  mapModel: MapModel;
  line: MetroLine;
  stations: Station[];
  stationIndex: number;
  typedIndex: number;
  targetCharacters: string[];
  language: TypingLanguage;
  compositionText: string;
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
  const currentPoint = mapModel.stationPoints.get(current.nameZh) ?? [0, 0];
  const nextPoint = next ? mapModel.stationPoints.get(next.nameZh) ?? currentPoint : currentPoint;
  const trainProgress = targetCharacters.length ? typedIndex / targetCharacters.length : 0;
  const trainPoint: Point = [
    currentPoint[0] + (nextPoint[0] - currentPoint[0]) * trainProgress,
    currentPoint[1] + (nextPoint[1] - currentPoint[1]) * trainProgress,
  ];
  const progressPoints = stations
    .slice(0, stationIndex + 1)
    .map((station) => mapModel.stationPoints.get(station.nameZh))
    .filter((point): point is Point => Boolean(point));
  if (trainProgress > 0) progressPoints.push(trainPoint);
  const gameViewBox = fitViewBox(linePoints(mapModel, line), 58, 370);
  const routeEnd = stations.at(-1);

  return (
    <section className="game" style={{ "--active-route": line.color } as CSSProperties}>
      <p className="screen-reader-status" aria-live="polite" aria-atomic="true">
        当前车站 {current.nameZh}，请输入 {language === "zh" ? current.nameZh : current.nameEn}
      </p>
      <svg className="game-map" viewBox={gameViewBox} aria-hidden="true">
        <g className="game-districts">
          {mapModel.districtPaths.map((district) => <path key={district.name} d={district.path} />)}
        </g>
        {data.lines.flatMap((networkLine) =>
          (mapModel.lineSegments.get(networkLine.id) ?? []).map((segment, index) => (
            <polyline key={`${networkLine.id}-${index}`} className={`game-line${networkLine.id === line.id ? " selected" : " network"}`} points={pointsToString(segment)} stroke={networkLine.color} />
          )),
        )}
        {(mapModel.lineSegments.get(line.id) ?? []).map((segment, index) => (
          <polyline key={`casing-${index}`} className="game-casing" points={pointsToString(segment)} />
        ))}
        {(mapModel.lineSegments.get(line.id) ?? []).map((segment, index) => (
          <polyline key={`active-${index}`} className="game-line selected" points={pointsToString(segment)} stroke={line.color} />
        ))}
        {progressPoints.length > 1 ? <polyline className="game-progress" points={pointsToString(progressPoints)} stroke={line.color} /> : null}
        {line.stations.map((station) => {
          const point = mapModel.stationPoints.get(station.nameZh);
          if (!point) return null;
          const index = stations.findIndex((item) => item.nameZh === station.nameZh);
          const state = index < stationIndex && index >= 0 ? " passed" : index === stationIndex ? " current" : index === stationIndex + 1 ? " next" : "";
          return <circle key={station.id} className={`game-node${state}`} cx={point[0]} cy={point[1]} r="2.4" />;
        })}
        <g className="map-train" style={{ transform: `translate(${trainPoint[0]}px, ${trainPoint[1]}px)` }}>
          <circle className="train-halo" r="14" />
          <rect className="train-body" x="-10" y="-7" width="20" height="14" rx="4" />
          <rect className="train-window" x="-6" y="-3.5" width="4" height="4" rx="1" />
          <rect className="train-window" x="2" y="-3.5" width="4" height="4" rx="1" />
        </g>
      </svg>

      <div className="game-chrome">
        <button className="back-button" type="button" onClick={onBack}>← 返回选线 <kbd>ESC</kbd></button>
        <div className="route-pill" style={{ background: line.color }}>{line.lineName} · 往 {routeEnd?.nameZh}</div>
      </div>

      <div className="scorebar">
        <Metric label={mode === "timed" ? "剩余" : "经过"} value={mode === "timed" ? remainingSeconds : elapsedSeconds} unit="秒" />
        <Metric label="到站" value={completedStations} unit="站" />
        <Metric label="速度" value={speed} unit={language === "zh" ? "CPM" : "WPM"} />
        <Metric label="正确率" value={accuracy} unit="%" />
      </div>

      <article className={`station-card${shake ? " shake" : ""}`} onClick={onFocusTyping}>
        <div className="station-meta"><span>{String(stationIndex + 1).padStart(2, "0")}</span><span>杭州市 · {line.lineName} · 数据 {data.updatedAt}</span></div>
        <div className="station-main">
          <div><p>NOW ARRIVING</p><h2>{current.nameZh}</h2></div>
          <div className="next-station"><span>{next ? "下一站" : "终点站"}</span><strong>{next?.nameZh ?? "本线终点"}</strong>{next ? <b>→</b> : null}</div>
        </div>
        <div className={`typing-area${language === "zh" ? " is-chinese" : ""}`}>
          <div className="typing-target" aria-label={`请输入 ${language === "zh" ? current.nameZh : current.nameEn}`}>
            {targetCharacters.map((character, index) => (
              <span key={`${character}-${index}`} className={index < typedIndex ? "typed" : index === typedIndex ? "current" : ""}>{character === " " ? "\u00a0" : character}</span>
            ))}
          </div>
          {language === "zh" ? (
            <p id="typing-instruction" className={`composition-status${compositionText ? " is-composing" : ""}`}>
              {compositionText ? <>选字中 · <strong>{compositionText}</strong></> : "使用输入法选字"}
            </p>
          ) : (
            <span id="typing-instruction" className="screen-reader-status">直接输入画面上的英文站名</span>
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

function LoadingScreen() {
  return <div className="loading"><span />正在载入杭州地铁线网…</div>;
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="data-error">
      <strong>地图数据载入失败</strong><span>{message}</span>
      <button type="button" onClick={() => location.reload()}>重新载入</button>
    </div>
  );
}

function Footer({ data }: { data: MetroData | null }) {
  return (
    <footer>
      <div className="footer-brand">
        <span className="footer-wordmark">HANGZHOU METRO TYPING</span>
        <span className="footer-lines" aria-hidden="true">
          {(data?.lines ?? []).map((line) => <i key={line.id} style={{ background: line.color }} />)}
        </span>
      </div>
      <div className="footer-meta">
        <p><span className="footer-label">DATA</span>线路与站名参考 <a href="https://www.hzmetro.com/" target="_blank" rel="noreferrer">杭州地铁</a><span className="footer-sep">·</span>地图边界 <a href="https://geo.datav.aliyun.com/areas_v3/bound/330100_full.json" target="_blank" rel="noreferrer">DataV</a></p>
        <p>
          设计参考 <a href="https://tw-metro-typing.yencheng.dev/" target="_blank" rel="noreferrer">Taiwan Metro Typing</a>
          <span className="footer-sep">·</span>
          <a
            className="footer-github"
            href="https://github.com/Evenss/metro-typing"
            target="_blank"
            rel="noreferrer"
            aria-label="在 GitHub 上查看项目"
          >
            <GitHubIcon />
            <span>github.com/Evenss/metro-typing</span>
          </a>
        </p>
      </div>
    </footer>
  );
}
