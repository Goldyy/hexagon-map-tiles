export interface PreviewCameraRange {
  near: number;
  far: number;
}

export function resolvePreviewCameraRange(span: number): PreviewCameraRange {
  return {
    near: Math.max(0.1, span * 0.05),
    far: span * 5,
  };
}
