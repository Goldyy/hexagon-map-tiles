// Print-size math shared by the OBJ export and the live size readout in the
// sidebar. Detail fidelity is FIXED: the model always prints at PRINT_RATIO
// (1:2000, i.e. 0.5 mm per real-world meter), which keeps a 2 m detail at
// 1 mm — comfortably above the FDM nozzle width (~0.4 mm). Growing the Tile
// Span therefore grows the printed model; the readout shows how large it
// gets and whether it still fits a printer bed.
export const PRINT_RATIO = 2000;
/** mm of print per meter of real world — constant, for crisp detail. */
export const PRINT_SCALE_MM_PER_M = 1000 / PRINT_RATIO;
/** Width of the tray wall, measured on the corner radius. */
export const TRAY_WALL_MM = 6;
/** Sideways play between the map and the tray wall, per side. */
export const CLEARANCE_MM = 0.25;

/** mm per meter for the map (constant; kept as a function for call sites). */
export function printScale(_span: number): number {
  return PRINT_SCALE_MM_PER_M;
}

/** Corner-to-corner width of the printed map alone, in mm. */
export function mapWidthMm(span: number): number {
  return ((2 * span) / Math.sqrt(3)) * PRINT_SCALE_MM_PER_M;
}

/** Corner-to-corner width of the full print — map plus clearance and tray. */
export function totalWidthMm(span: number): number {
  return mapWidthMm(span) + 2 * (CLEARANCE_MM + TRAY_WALL_MM);
}

export type PrintFit = "any" | "standard" | "large" | "too-large";

export interface PrintSize {
  /** Corner-to-corner width of the printed model incl. tray, in mm. */
  widthMm: number;
  /** Map scale denominator (constant PRINT_RATIO). */
  ratio: number;
  fit: PrintFit;
}

/**
 * The live readout for a Tile Span: printed width plus a bed-fit verdict.
 * "any"       — ≤ 180 mm, fits practically every printer.
 * "standard"  — ≤ 256 mm, fits a common 256 mm bed (X1/P1/MK4 class).
 * "large"     — ≤ 350 mm, needs a large-format bed.
 * "too-large" — beyond common printers; reduce the Tile Span.
 */
export function printSize(span: number): PrintSize {
  const widthMm = totalWidthMm(span);
  const fit: PrintFit =
    widthMm <= 180 ? "any" : widthMm <= 256 ? "standard" : widthMm <= 350 ? "large" : "too-large";
  return { widthMm, ratio: PRINT_RATIO, fit };
}
