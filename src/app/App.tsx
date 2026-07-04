import { Download, LoaderCircle, RotateCcw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { parseCoordinates, type Coordinates } from "@/domain/location";
import { DEFAULT_THEME, THEMES, themeById } from "@/domain/theme";
import { parseTileUrl, serializeTileUrl } from "@/domain/tile-url";
import type { TileColors } from "@/export/export-glb";
import { searchAddress, type PlaceResult } from "@/geocoding/nominatim";
import { DEFAULT_LAYERS, type GeneratedTile, type LayerToggles } from "@/geometry/generate-tile";
import { normalizeMapData } from "@/osm/normalize";
import { fetchMapData } from "@/osm/overpass";
import { generateInWorker } from "@/workers/generate";
import { TileSummary, tileLayerStats } from "./TileSummary";

type Status = "idle" | "resolving" | "fetching" | "generating" | "ready" | "error";

// The single hexagon silhouette reused for the wordmark, the Generate glyph, and
// the empty-state mark — pure CSS, no image asset (see handoff "Assets").
const HEX_CLIP = "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)";

// Advanced-colors surface list: TileColors key, visible label, and the exact
// aria-label the v1 colour inputs used (preserved for share-URL round-trips).
const COLOR_FIELDS: readonly { key: keyof TileColors; label: string; aria: string }[] = [
  { key: "base", label: "Tile base", aria: "Tile base color" },
  { key: "buildings", label: "Buildings", aria: "Building color" },
  { key: "roads", label: "Road surfaces", aria: "Road surface color" },
  { key: "water", label: "Water surfaces", aria: "Water surface color" },
  { key: "green", label: "Green surfaces", aria: "Green surface color" },
  { key: "paths", label: "Paths", aria: "Path color" },
  { key: "rail", label: "Rail", aria: "Rail color" },
  { key: "trees", label: "Trees", aria: "Tree color" },
];

const LAYER_FIELDS: readonly { key: keyof LayerToggles; label: string }[] = [
  { key: "green", label: "Green spaces" },
  { key: "pathsRail", label: "Paths & rail" },
  { key: "trees", label: "Trees" },
];

// The Custom theme is an App-level concept layered over the preset + colour-override
// URL model: a share URL still carries `theme=<preset>` (the seed, for the preview
// environment) plus the edited colours as params. A URL with any colour param opens
// in Custom mode; a preset URL carries no colour params.
const CUSTOM_THEME_ID = "custom";

const TilePreview = lazy(() =>
  import("@/preview/TilePreview").then((module) => ({ default: module.TilePreview })),
);

export function App() {
  const shared = useMemo(() => parseTileUrl(window.location.search), []);
  const [location, setLocation] = useState(
    shared ? `${shared.center.latitude}, ${shared.center.longitude}` : "52.5200, 13.4050",
  );
  const [span, setSpan] = useState(shared?.span ?? 500);
  // A shared URL carrying colour overrides reopens in Custom mode, seeded from the
  // preset it named (which supplies the preview environment).
  const sharedIsCustom = shared ? Object.keys(shared.overrides).length > 0 : false;
  const [themeId, setThemeId] = useState(
    sharedIsCustom ? CUSTOM_THEME_ID : (shared?.themeId ?? DEFAULT_THEME.id),
  );
  // The preset a Custom palette derives from — drives its preview environment and
  // the "Reset colors" target. Kept separate so Custom edits persist when you
  // toggle back to a preset and return.
  const [customSourceId, setCustomSourceId] = useState(shared?.themeId ?? DEFAULT_THEME.id);
  // The editable Custom palette; null until Custom is first entered.
  const [customColors, setCustomColors] = useState<TileColors | null>(
    sharedIsCustom ? { ...themeById(shared!.themeId).colors, ...shared!.overrides } : null,
  );
  const [layers, setLayers] = useState<LayerToggles>(shared?.layers ?? DEFAULT_LAYERS);
  const [useOsmColors, setUseOsmColors] = useState(shared?.useOsmColors ?? false);
  const isCustom = themeId === CUSTOM_THEME_ID;
  const activeEnvironment = themeById(isCustom ? customSourceId : themeId).environment;
  const colors: TileColors = isCustom ? (customColors ?? DEFAULT_THEME.colors) : themeById(themeId).colors;
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [tile, setTile] = useState<GeneratedTile | null>(null);
  // Span the displayed tile was generated with. The preview must scale from
  // this, not the live slider value — dragging the slider after generation
  // would otherwise shrink the fog/camera range around a still-visible tile.
  const [tileSpan, setTileSpan] = useState(shared?.span ?? 500);
  const [center, setCenter] = useState<Coordinates | null>(shared?.center ?? null);
  const [sourceTimestamp, setSourceTimestamp] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const sharedStarted = useRef(false);

  const markStale = () => {
    if (status === "ready") setStatus("idle");
  };

  // Enter Custom mode. On first entry, seed the palette (and its environment
  // source) from the preset currently shown; later entries keep prior edits.
  const selectCustom = () => {
    if (customColors === null) {
      setCustomColors({ ...themeById(themeId).colors });
      setCustomSourceId(themeId);
    }
    setThemeId(CUSTOM_THEME_ID);
  };
  const resetCustomColors = () => setCustomColors({ ...themeById(customSourceId).colors });

  const generateAt = useCallback(
    async (nextCenter: Coordinates) => {
      const current = ++generation.current;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setError(null);
      setPlaces([]);
      try {
        setStatus("fetching");
        const raw = await fetchMapData(nextCenter, span, controller.signal);
        if (current !== generation.current) return;
        const normalized = normalizeMapData(raw as Parameters<typeof normalizeMapData>[0]);
        setStatus("generating");
        const generated = await generateInWorker(
          { center: nextCenter, span, layers, useOsmColors },
          {
            buildings: normalized.buildings,
            roads: normalized.roads,
            water: normalized.water,
            green: normalized.green,
            paths: normalized.paths,
            rail: normalized.rail,
            trees: normalized.trees,
          },
        );
        if (current !== generation.current) return;
        setTile(generated);
        setTileSpan(span);
        setCenter(nextCenter);
        setSourceTimestamp(normalized.sourceTimestamp);
        setStatus("ready");
      } catch (cause) {
        if (current !== generation.current) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Tile generation failed.");
        setStatus("error");
      }
    },
    [span, layers, useOsmColors],
  );

  const submit = async () => {
    const coordinates = parseCoordinates(location);
    if (coordinates) {
      await generateAt(coordinates);
      return;
    }
    setStatus("resolving");
    setError(null);
    try {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const results = await searchAddress(location, controller.signal);
      setPlaces(results);
      setStatus("idle");
      if (results.length === 0) setError("No matching address found.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Address search failed.");
      setStatus("error");
    }
  };

  const download = async () => {
    if (!tile || !center) return;
    try {
      const { exportGlb } = await import("@/export/export-glb");
      const buffer = await exportGlb(tile, colors, { center, span, sourceTimestamp }, { useOsmColors });
      const url = URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hex-tile-${center.latitude.toFixed(4)}-${center.longitude.toFixed(4)}-${span}m.glb`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GLB export failed.");
      setStatus("error");
    }
  };

  // Copy the current share URL (already kept live via serializeTileUrl below) to
  // the clipboard — a surface affordance over the existing round-trip, no new state.
  const shareLink = () => {
    void navigator.clipboard?.writeText(window.location.href);
  };

  useEffect(() => {
    if (shared && !sharedStarted.current) {
      sharedStarted.current = true;
      void generateAt(shared.center);
    }
  }, [generateAt, shared]);

  useEffect(() => {
    if (status !== "ready" || !center) return;
    // In Custom mode the URL carries the seed preset as `theme` plus the edited
    // colours; serializeTileUrl drops any colour equal to that preset's palette.
    const search = serializeTileUrl({
      center,
      span,
      themeId: isCustom ? customSourceId : themeId,
      overrides: isCustom && customColors ? customColors : {},
      layers,
      useOsmColors,
    });
    window.history.replaceState(null, "", search);
  }, [center, span, themeId, isCustom, customSourceId, customColors, layers, useOsmColors, status]);

  const busy = status === "resolving" || status === "fetching" || status === "generating";
  // Layers actually present in the current tile — drives the in-scene legend.
  const presentLayers = tile ? tileLayerStats(tile).filter((stat) => stat.count > 0) : [];

  const themeButtons: readonly { id: string; label: string; active: boolean; onClick: () => void }[] = [
    ...THEMES.map((preset) => ({
      id: preset.id,
      label: preset.label,
      active: themeId === preset.id,
      onClick: () => setThemeId(preset.id),
    })),
    { id: CUSTOM_THEME_ID, label: "Custom", active: isCustom, onClick: selectCustom },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-[#111]">
      {/* ===== top bar ===== */}
      <header className="flex h-[60px] flex-none items-center justify-between border-b border-[#ececec] px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="block flex-none" style={{ width: 20, height: 23, background: "#111", clipPath: HEX_CLIP }} />
          <div className="flex flex-col leading-none">
            <span className="text-[14px] font-bold tracking-[-0.01em]">Hexagon Map Tiles</span>
            <span className="lbl mt-1">OSM → 3D GLB</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" className="gap-[7px] font-medium text-[#444]" onClick={shareLink}>
            <span className="font-mono text-[11px]">↗</span> Share link
          </Button>
          {status === "ready" && tile && (
            <Button onClick={() => void download()}>
              <Download size={14} /> Download GLB
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ===== left rail ===== */}
        <aside className="flex w-[326px] flex-none flex-col gap-[26px] overflow-auto border-r border-[#ececec] px-[26px] pb-6 pt-7">
          {/* location */}
          <div>
            <div className="lbl mb-2.5">Location</div>
            <div className="flex h-[46px] items-center gap-2.5 rounded-[11px] border border-[#e0ded8] px-3.5 focus-within:border-[#d4d1c9]">
              <span className="size-1.5 flex-none rounded-full bg-[#111]" aria-hidden />
              <Input
                id="location"
                aria-label="Location"
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  markStale();
                }}
                onKeyDown={(event) => event.key === "Enter" && void submit()}
                placeholder="Address or latitude, longitude"
              />
            </div>
            <p className="mt-[9px] px-0.5 text-[11.5px] leading-[1.5] text-[#a8a49b]">
              Type an address or paste <span className="font-mono text-[#6f6a60]">lat, lon</span>.
            </p>
            {places.length > 0 && (
              <div className="mt-2 space-y-1 rounded-[11px] border border-[#e0ded8] p-1" aria-label="Address results">
                {places.map((place) => (
                  <button
                    key={`${place.latitude}-${place.longitude}`}
                    className="w-full rounded-lg px-3 py-2 text-left text-[13px] leading-5 transition-colors hover:bg-[#faf9f7]"
                    onClick={() => {
                      setLocation(`${place.latitude}, ${place.longitude}`);
                      void generateAt(place);
                    }}
                  >
                    {place.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* tile span */}
          <div>
            <div className="mb-[15px] flex items-baseline justify-between">
              <span className="lbl">Tile span</span>
              <output htmlFor="tile-span" className="font-mono text-[12.5px] text-[#111]">{span} m</output>
            </div>
            <Slider
              id="tile-span"
              aria-label="Tile Span"
              min={100}
              max={2000}
              step={50}
              value={[span]}
              onValueChange={([value]) => {
                setSpan(value);
                markStale();
              }}
            />
            <div className="mt-2.5 flex justify-between font-mono text-[9px] tracking-[0.1em] text-[#c2beb5]">
              <span>100 M</span><span>2000 M</span>
            </div>
          </div>

          {/* theme */}
          <div>
            <div className="lbl mb-3">Theme</div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Theme preset">
              {themeButtons.map((preset) => (
                <Button
                  key={preset.id}
                  variant={preset.active ? "default" : "outline"}
                  aria-pressed={preset.active}
                  className={preset.active ? "w-full" : "w-full text-[#555]"}
                  onClick={preset.onClick}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* layers */}
          <div>
            <div className="lbl mb-3.5">Layers</div>
            <div className="flex flex-col gap-[13px]">
              {LAYER_FIELDS.map((field) => (
                <Checkbox
                  key={field.key}
                  id={`layer-${field.key}`}
                  label={field.label}
                  checked={layers[field.key]}
                  onChange={(event) => {
                    setLayers((prev) => ({ ...prev, [field.key]: event.target.checked }));
                    markStale();
                  }}
                />
              ))}
              <Checkbox
                id="use-osm-colors"
                label="Use OSM colors"
                checked={useOsmColors}
                onChange={(event) => {
                  setUseOsmColors(event.target.checked);
                  markStale();
                }}
              />
            </div>
          </div>

          {/* colors */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="lbl">Colors</span>
              {isCustom && (
                <button
                  type="button"
                  onClick={resetCustomColors}
                  className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#8a857b] hover:underline"
                >
                  Reset to {themeById(customSourceId).label}
                </button>
              )}
            </div>
            {isCustom ? (
              <div className="grid grid-cols-2 gap-3">
                {COLOR_FIELDS.map((field) => (
                  <label key={field.key} className="text-[12px] font-medium text-[#555]">
                    <span className="mb-2 block">{field.label}</span>
                    <span className="flex items-center gap-2 font-mono text-[10px] uppercase text-[#8a857b]">
                      <input
                        aria-label={field.aria}
                        className="size-7 cursor-pointer rounded-full border-0 bg-transparent"
                        type="color"
                        value={colors[field.key]}
                        onChange={(event) =>
                          setCustomColors((prev) => ({ ...(prev ?? colors), [field.key]: event.target.value }))
                        }
                      />
                      {colors[field.key]}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[12px] leading-5 text-[#a8a49b]">
                Preset palettes are fixed. Select <span className="font-medium text-[#555]">Custom</span> to edit
                individual colors.
              </p>
            )}
          </div>

          {/* generate */}
          <Button
            className="h-[50px] w-full flex-none gap-[9px] rounded-[12px] text-[14px]"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <span aria-hidden className="block flex-none" style={{ width: 14, height: 16, background: "#fff", clipPath: HEX_CLIP }} />
            )}
            {status === "resolving"
              ? "Finding address…"
              : status === "fetching"
                ? "Fetching map data…"
                : status === "generating"
                  ? "Building tile…"
                  : "Generate tile"}
          </Button>

          <div aria-live="polite">
            {error && (
              <p className="rounded-[11px] border border-red-900/12 bg-red-700/[0.06] p-3 text-[12px] leading-5 text-red-900">
                {error}
              </p>
            )}
            {status === "ready" && tile && <TileSummary tile={tile} colors={colors} />}
          </div>

          <p className="mt-auto pt-2 text-[10px] leading-[1.5] text-[#bdb9b0]">
            Map data ©{" "}
            <a
              className="text-[#8a857b] underline underline-offset-2"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>{" "}
            · ODbL.
          </p>
        </aside>

        {/* ===== preview ===== */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(circle at 50% 40%,#ffffff 0%,#f4f2ec 78%)" }}
          />

          {/* status pill */}
          <div className="font-mono absolute left-6 top-[22px] z-10 flex items-center gap-2 rounded-full border border-[#ececec] bg-white px-3.5 py-2 text-[9px] uppercase tracking-[0.16em] text-[#4a463e] shadow-[0_1px_3px_rgba(0,0,0,.04)]">
            <span className={`size-[7px] rounded-full ${status === "ready" ? "bg-[#111]" : "bg-[#aaa190]"}`} />
            {status === "ready" ? "Live model" : "Preview studio"}
          </div>

          {/* reset view */}
          <button
            type="button"
            aria-label="Reset preview view"
            onClick={() => setPreviewRevision((value) => value + 1)}
            className="absolute right-6 top-[22px] z-10 grid size-9 place-items-center rounded-[10px] border border-[#ececec] bg-white text-[#8a857b] shadow-[0_1px_3px_rgba(0,0,0,.04)] transition-colors hover:bg-[#faf9f7]"
          >
            <RotateCcw size={15} />
          </button>

          {tile ? (
            <Suspense
              fallback={
                <div className="grid h-full place-items-center font-mono text-[11px] uppercase tracking-[0.16em] text-[#8f887c]">
                  Preparing preview…
                </div>
              }
            >
              <TilePreview
                key={previewRevision}
                tile={tile}
                colors={colors}
                environment={activeEnvironment}
                span={tileSpan}
                useOsmColors={useOsmColors}
              />
            </Suspense>
          ) : (
            <div className="relative z-0 grid h-full place-items-center px-8 text-center">
              <div>
                <span
                  aria-hidden
                  className="mx-auto mb-6 block"
                  style={{ width: 72, height: 82, background: "#ece9e3", clipPath: HEX_CLIP }}
                />
                <p className="text-[28px] font-semibold text-[#111]">Your place, in miniature.</p>
                <p className="mx-auto mt-2 max-w-sm text-[14px] leading-6 text-[#7c7569]">
                  Enter an address or <span className="font-mono text-[#6f6a60]">latitude, longitude</span>, pick a
                  Tile Span, then generate a browser-built GLB.
                </p>
              </div>
            </div>
          )}

          {/* In-scene legend of the layers actually present in this tile. */}
          {status === "ready" && presentLayers.length > 0 && (
            <div className="absolute bottom-[22px] left-6 z-10 flex max-w-[70%] flex-wrap gap-2">
              {presentLayers.map((stat) => (
                <span
                  key={stat.key}
                  className="inline-flex items-center gap-[7px] rounded-full border border-[#ececec] bg-white px-3 py-[7px] text-[11px] text-[#3f3b34]"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: colors[stat.key] }} />
                  {stat.count} {stat.label}
                </span>
              ))}
            </div>
          )}

          {/* Progress overlay while resolving/fetching/generating. */}
          {busy && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-white/55">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#ececec] bg-white px-7 py-6 shadow-[0_1px_3px_rgba(0,0,0,.04)]">
                <LoaderCircle size={26} className="animate-spin text-[#111]" />
                <p className="text-[13px] font-medium text-[#4a463e]">
                  {status === "resolving"
                    ? "Finding address…"
                    : status === "fetching"
                      ? "Fetching map data…"
                      : "Building your tile…"}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
