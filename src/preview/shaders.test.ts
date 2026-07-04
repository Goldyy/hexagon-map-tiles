import { MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import { applyFacadeGradient, applyRise, applyWaterShimmer } from "./shaders";

interface FakeShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: number }>;
}

function fakeShader(): FakeShader {
  return {
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <color_fragment>\n}",
    uniforms: {},
  };
}

function compile(material: MeshStandardMaterial, shader: FakeShader): void {
  // onBeforeCompile does not use the renderer argument in these helpers.
  (material.onBeforeCompile as (shader: FakeShader, renderer: unknown) => void)(shader, null);
}

describe("facade gradient shader", () => {
  it("injects vWorldY into both shaders and darkens toward the base", () => {
    const material = new MeshStandardMaterial();
    applyFacadeGradient(material);
    const shader = fakeShader();
    compile(material, shader);

    expect(shader.vertexShader).toContain("varying float vWorldY");
    expect(shader.vertexShader).toContain("vWorldY =");
    expect(shader.fragmentShader).toContain("varying float vWorldY");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb *= mix(0.82, 1.0");
    material.dispose();
  });

  it("respects custom darken and height options", () => {
    const material = new MeshStandardMaterial();
    applyFacadeGradient(material, { darken: 0.5, height: 12 });
    const shader = fakeShader();
    compile(material, shader);

    expect(shader.fragmentShader).toContain("mix(0.5, 1.0");
    expect(shader.fragmentShader).toContain("/ 12");
    material.dispose();
  });
});

describe("rise reveal shader", () => {
  it("injects aRise + uRiseProgress and setProgress updates the live uniform", () => {
    const material = new MeshStandardMaterial();
    const handle = applyRise(material);
    const shader = fakeShader();
    compile(material, shader);

    expect(shader.vertexShader).toContain("attribute float aRise");
    expect(shader.vertexShader).toContain("uniform float uRiseProgress");
    expect(shader.vertexShader).toContain("transformed.y *=");
    expect(shader.uniforms.uRiseProgress.value).toBe(0);

    handle.setProgress(0.5);
    expect(shader.uniforms.uRiseProgress.value).toBe(0.5);
    material.dispose();
  });
});

describe("water shimmer shader", () => {
  it("injects uTime + vWorldPos and setTime updates the live uniform", () => {
    const material = new MeshStandardMaterial();
    const handle = applyWaterShimmer(material);
    const shader = fakeShader();
    compile(material, shader);

    expect(shader.vertexShader).toContain("varying vec3 vWorldPos");
    expect(shader.fragmentShader).toContain("uniform float uTime");
    expect(shader.fragmentShader).toContain("varying vec3 vWorldPos");
    expect(shader.uniforms.uTime.value).toBe(0);

    handle.setTime(2);
    expect(shader.uniforms.uTime.value).toBe(2);
    material.dispose();
  });
});
