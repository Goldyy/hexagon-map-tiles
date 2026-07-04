import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from "three";

/**
 * Preview-only custom shader helpers layered onto `MeshStandardMaterial` via
 * `onBeforeCompile`. None of this touches `src/export` — the downloaded GLB keeps
 * plain standard materials. Each helper composes with any previously installed
 * `onBeforeCompile` so several can stack on one material (buildings use both the
 * facade gradient and the rise reveal).
 */

type BeforeCompile = MeshStandardMaterial["onBeforeCompile"];

/** Render a number as a GLSL float literal (integers get a `.0` so they aren't ints). */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function compose(material: MeshStandardMaterial, next: BeforeCompile): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    next(shader, renderer);
  };
}

/**
 * Darken Building Massing toward its base: computes world-space Y in the vertex
 * stage and multiplies `diffuseColor` by `mix(darken, 1.0, clamp(vWorldY / height, 0, 1))`
 * so walls fade from `darken` at the ground to full colour by `height` metres up.
 */
export function applyFacadeGradient(
  material: MeshStandardMaterial,
  options?: { darken?: number; height?: number },
): void {
  const darken = glslFloat(options?.darken ?? 0.82);
  const height = glslFloat(options?.height ?? 30.0);
  compose(material, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vWorldY;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vWorldY;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\ndiffuseColor.rgb *= mix(${darken}, 1.0, clamp(vWorldY / ${height}, 0.0, 1.0));`,
      );
  });
}

/**
 * Reveal animation: scales each vertex's Y toward its final height as
 * `uRiseProgress` climbs 0→1. Per-vertex `aRise` (normalised distance from the
 * Tile Centre) staggers the reveal so central buildings finish before edge ones.
 */
export function applyRise(material: MeshStandardMaterial): { setProgress(value: number): void } {
  const uniform = { value: 0 };
  compose(material, (shader) => {
    shader.uniforms.uRiseProgress = uniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aRise;\nuniform float uRiseProgress;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.y *= clamp(smoothstep(0.0, 1.0, (uRiseProgress * 1.3 - aRise * 0.3) / 1.0), 0.0, 1.0);",
      );
  });
  return {
    setProgress(value: number) {
      uniform.value = value;
    },
  };
}

/**
 * Subtle animated ripple over Water Surfaces: modulates `diffuseColor` by a pair
 * of crossing sines in world space, advanced by `uTime`.
 */
export function applyWaterShimmer(material: MeshStandardMaterial): { setTime(seconds: number): void } {
  const uniform = { value: 0 };
  compose(material, (shader) => {
    shader.uniforms.uTime = uniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vWorldPos;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + 0.035 * sin(vWorldPos.x * 0.35 + uTime * 1.1) * sin(vWorldPos.z * 0.27 + uTime * 0.7);",
      );
  });
  return {
    setTime(seconds: number) {
      uniform.value = seconds;
    },
  };
}

export type { WebGLProgramParametersWithUniforms };
