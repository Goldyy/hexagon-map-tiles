import { describe, expect, it } from "vitest";

import {
  createGreenPreviewMaterial,
  createPathPreviewMaterial,
  createRailPreviewMaterial,
  createRoadPreviewMaterial,
  createTreesPreviewMaterial,
  createWaterPreviewMaterial,
} from "./materials";

describe("Road Surface preview material", () => {
  it("biases Road Surfaces toward the camera to prevent depth flicker", () => {
    const material = createRoadPreviewMaterial("#777267");

    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBeLessThan(0);
    expect(material.polygonOffsetUnits).toBeLessThan(0);
    material.dispose();
  });

  it("creates an opaque Water Surface material", () => {
    const material = createWaterPreviewMaterial("#4f8796");

    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.roughness).toBe(0.65);
    material.dispose();
  });
});

describe("enrichment layer preview materials", () => {
  it.each([
    ["green", createGreenPreviewMaterial, 0.95],
    ["path", createPathPreviewMaterial, 0.96],
    ["rail", createRailPreviewMaterial, 0.9],
    ["trees", createTreesPreviewMaterial, 0.85],
  ] as const)("%s material uses roughness %s and no metalness", (_name, factory, roughness) => {
    const material = factory("#6f8f5a");

    expect(material.roughness).toBe(roughness);
    expect(material.metalness).toBe(0);
    material.dispose();
  });
});
