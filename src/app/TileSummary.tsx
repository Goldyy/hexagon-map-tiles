import { Check } from "lucide-react";

import type { TileColors } from "@/export/export-glb";
import type { GeneratedTile } from "@/geometry/generate-tile";

// One scannable chip per export layer: a colour dot (the layer's active theme
// colour, so the summary doubles as a legend), a count, and a label. Zero-count
// layers stay visible but dimmed, so it's obvious what a tile does and doesn't
// contain. The verbose estimated/skipped counts move into the Details disclosure.
interface LayerStat {
  key: keyof TileColors;
  label: string;
  count: number;
  detail?: string;
}

function detailLine(estimated: number, estimatedLabel: string, skipped: number): string | undefined {
  const parts: string[] = [];
  if (estimated > 0 && estimatedLabel) parts.push(`${estimated} ${estimatedLabel}`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function tileLayerStats(tile: GeneratedTile): LayerStat[] {
  return [
    {
      key: "buildings",
      label: "buildings",
      count: tile.metrics.generated,
      detail: detailLine(tile.metrics.fallback, "estimated height", tile.metrics.skipped),
    },
    {
      key: "roads",
      label: "roads",
      count: tile.roadMetrics.generated,
      detail: detailLine(tile.roadMetrics.fallback, "estimated width", tile.roadMetrics.skipped),
    },
    {
      key: "water",
      label: "water",
      count: tile.waterMetrics.generated,
      detail: detailLine(tile.waterMetrics.fallback, "estimated width", tile.waterMetrics.skipped),
    },
    {
      key: "green",
      label: "green",
      count: tile.greenMetrics.generated,
      detail: detailLine(0, "", tile.greenMetrics.skipped),
    },
    {
      key: "paths",
      label: "paths",
      count: tile.pathMetrics.generated,
      detail: detailLine(0, "", tile.pathMetrics.skipped),
    },
    {
      key: "rail",
      label: "rail",
      count: tile.railMetrics.generated,
      detail: detailLine(0, "", tile.railMetrics.skipped),
    },
    {
      key: "trees",
      label: "trees",
      count: tile.treeMetrics.mapped + tile.treeMetrics.scattered,
      detail: tile.treeMetrics.capped > 0 ? `${tile.treeMetrics.capped} capped` : undefined,
    },
  ];
}

export function TileSummary({ tile, colors }: { tile: GeneratedTile; colors: TileColors }) {
  const stats = tileLayerStats(tile);
  const total = stats.reduce((sum, stat) => sum + stat.count, 0);
  const details = stats.filter((stat) => stat.detail);

  return (
    <div className="rounded-[11px] border border-[#ececec] bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded-full bg-[#111] text-white">
          <Check size={12} strokeWidth={3} />
        </span>
        <strong className="text-[13px] font-semibold text-[#111]">Tile ready</strong>
        <span className="font-mono ml-auto text-[10px] uppercase tracking-[0.1em] text-[#a29e95]">
          {total} feature{total === 1 ? "" : "s"}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-2.5 text-[12px] leading-5 text-[#7c7569]">
          No mapped features found. Base-only export is available.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.map((stat) => (
              <span
                key={stat.key}
                className={
                  stat.count === 0
                    ? "inline-flex items-center gap-1.5 rounded-full border border-[#ececec] px-2 py-1 text-[11px] text-[#bdb9b0]"
                    : "inline-flex items-center gap-1.5 rounded-full border border-[#ececec] px-2 py-1 text-[11px] text-[#3f3b34]"
                }
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: colors[stat.key], opacity: stat.count === 0 ? 0.4 : 1 }}
                />
                {stat.count} {stat.label}
              </span>
            ))}
          </div>

          {details.length > 0 && (
            <details className="mt-2.5 text-[11px] text-[#a8a49b]">
              <summary className="cursor-pointer text-[#6f6a60]">Details</summary>
              <ul className="mt-1.5 space-y-0.5">
                {details.map((stat) => (
                  <li key={stat.key}>
                    <span className="capitalize">{stat.label}</span>: {stat.detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
