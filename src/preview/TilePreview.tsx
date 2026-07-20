import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshStandardMaterial,
  Vector3,
} from "three";

import { FRAME_COLOR } from "../domain/print-palette";
import type { PreviewEnvironment } from "../domain/theme";
import type { TileColors } from "../export/export-glb";
import { printTrayGeometry } from "../export/export-obj";
import type { GeneratedTile, SerializedGeometry } from "../geometry/generate-tile";
import { resolvePreviewCameraRange } from "./camera";
import {
  createGreenPreviewMaterial,
  createPathPreviewMaterial,
  createRailPreviewMaterial,
  createRoadPreviewMaterial,
  createTreesPreviewMaterial,
  createWaterPreviewMaterial,
} from "./materials";
import { applyFacadeGradient, applyRise, applyWaterShimmer } from "./shaders";
import { useReducedMotion } from "./use-reduced-motion";

const REVEAL_DURATION_SECONDS = 1.2;

function hydrate(data: SerializedGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
  if (data.colors) geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
  if (data.rise) geometry.setAttribute("aRise", new BufferAttribute(data.rise, 1));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface RiseHandle {
  setProgress(value: number): void;
}
interface ShimmerHandle {
  setTime(seconds: number): void;
}

/**
 * Keeps the default camera's clipping range in sync with the Tile Span. The
 * Canvas `camera` prop only configures the camera when the Canvas is created,
 * and the Canvas survives regeneration — so without this, generating a larger
 * tile after a smaller one leaves `far` sized for the old span and the far
 * edge of the new tile clips at the horizon. On an actual span change (never
 * on mount, which would fight the fly-in) the camera also re-frames to the
 * resting position so the new tile is fully in view.
 */
function CameraSpanSync({
  span,
  restingCamera,
}: {
  span: number;
  restingCamera: Vector3;
}) {
  const camera = useThree((state) => state.camera);
  const framedSpan = useRef(span);

  useEffect(() => {
    const { near, far } = resolvePreviewCameraRange(span);
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    if (framedSpan.current !== span) {
      framedSpan.current = span;
      camera.position.copy(restingCamera);
    }
  }, [camera, span, restingCamera]);

  return null;
}

/**
 * Drives the per-frame preview motion from inside the Canvas: the building rise
 * reveal (0→1 smoothstepped over 1.2 s on each new Tile) and the water shimmer
 * clock. The idle camera spin is owned by OrbitControls (autoRotate). When the
 * viewer prefers reduced motion, the reveal is locked at 1 and the shimmer clock
 * is frozen at 0 (OrbitControls' autoRotate is likewise disabled).
 */
function PreviewAnimator({
  tile,
  riseHandle,
  shimmerHandle,
  reducedMotion,
}: {
  tile: GeneratedTile;
  riseHandle: RiseHandle;
  shimmerHandle: ShimmerHandle;
  reducedMotion: boolean;
}) {
  const revealStart = useRef<number | null>(null);

  // Restart the reveal whenever the Tile identity changes.
  useEffect(() => {
    if (reducedMotion) {
      riseHandle.setProgress(1);
      return;
    }
    revealStart.current = null;
    riseHandle.setProgress(0);
  }, [tile, reducedMotion, riseHandle]);

  useFrame((state) => {
    shimmerHandle.setTime(reducedMotion ? 0 : state.clock.elapsedTime);

    if (!reducedMotion) {
      if (revealStart.current === null) revealStart.current = state.clock.elapsedTime;
      const elapsed = state.clock.elapsedTime - revealStart.current;
      riseHandle.setProgress(smoothstep(0, REVEAL_DURATION_SECONDS, elapsed));
    }
  });

  return null;
}

/** Linear-sRGB vertex color painted onto marked buildings. */
const MARK_RED: [number, number, number] = [1, 0.04, 0.04];

/**
 * The brown display tray under and around the tile — the exact geometry the
 * OBJ print export emits (in world meters), with the map seated on its floor,
 * so the preview shows the assembled printed result.
 */
function FrameMesh({ span, color }: { span: number; color: string }) {
  const geometry = useMemo(() => hydrate(printTrayGeometry(span)), [span]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: new Color(color), roughness: 0.85, metalness: 0 }),
    [color],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

function TileMeshes({
  tile,
  colors,
  useOsmColors,
  reducedMotion,
  redBuildings,
  onBuildingClick,
}: {
  tile: GeneratedTile;
  colors: TileColors;
  useOsmColors: boolean;
  reducedMotion: boolean;
  redBuildings: ReadonlySet<string>;
  onBuildingClick?: (name: string) => void;
}) {
  const base = useMemo(() => hydrate(tile.base), [tile.base]);
  // The Buildings geometry always carries a color attribute (white when no OSM
  // colors are present) so click-marking can paint individual buildings red by
  // rewriting per-vertex colors without swapping materials.
  const buildings = useMemo(() => {
    const geometry = hydrate(tile.buildings);
    const position = geometry.getAttribute("position");
    if (position && !geometry.getAttribute("color")) {
      geometry.setAttribute(
        "color",
        new BufferAttribute(new Float32Array(position.count * 3).fill(1), 3),
      );
    }
    return geometry;
  }, [tile.buildings]);

  // Index ranges of each building inside the merged Buildings geometry.
  // mergeGeometries concatenates in part order, so cumulative index lengths
  // recover which building a raycast faceIndex belongs to.
  const buildingRanges = useMemo(() => {
    let start = 0;
    return tile.parts.buildings.map((part) => {
      const range = { name: part.name, start, end: start + part.geometry.indices.length };
      start = range.end;
      return range;
    });
  }, [tile.parts.buildings]);
  const roadSurfaces = useMemo(() => hydrate(tile.roadSurfaces), [tile.roadSurfaces]);
  const waterSurfaces = useMemo(() => hydrate(tile.waterSurfaces), [tile.waterSurfaces]);
  const greenSurfaces = useMemo(() => hydrate(tile.greenSurfaces), [tile.greenSurfaces]);
  const pathSurfaces = useMemo(() => hydrate(tile.pathSurfaces), [tile.pathSurfaces]);
  const railSurfaces = useMemo(() => hydrate(tile.railSurfaces), [tile.railSurfaces]);
  const trees = useMemo(() => hydrate(tile.trees), [tile.trees]);

  const baseMaterial = useMemo(
    () => new MeshStandardMaterial({ color: new Color(colors.base), roughness: 0.92, metalness: 0 }),
    [colors.base],
  );

  const buildingsHaveColors = Boolean(tile.buildings.colors && tile.buildings.colors.length > 0);
  const building = useMemo(() => {
    const osmColors = useOsmColors && buildingsHaveColors;
    // vertexColors is always on: the geometry always has a color attribute
    // (white unless OSM colors are active), so the theme color multiplies
    // through unchanged while marked buildings can be painted per vertex.
    const material = new MeshStandardMaterial({
      color: new Color(osmColors ? "#ffffff" : colors.buildings),
      roughness: 0.88,
      metalness: 0,
      vertexColors: true,
    });
    applyFacadeGradient(material);
    const riseHandle = applyRise(material);
    return { material, riseHandle };
  }, [colors.buildings, useOsmColors, buildingsHaveColors]);

  // Repaint per-vertex colors whenever the marked set changes: restore the
  // baseline (OSM colors or white), then flood each marked building's range.
  useEffect(() => {
    const attribute = buildings.getAttribute("color") as BufferAttribute | undefined;
    const index = buildings.getIndex();
    if (!attribute || !index) return;
    const array = attribute.array as Float32Array;
    if (useOsmColors && tile.buildings.colors) array.set(tile.buildings.colors);
    else array.fill(1);
    for (const range of buildingRanges) {
      if (!redBuildings.has(range.name)) continue;
      for (let item = range.start; item < range.end; item += 1) {
        const vertex = index.getX(item);
        array[vertex * 3] = MARK_RED[0];
        array[vertex * 3 + 1] = MARK_RED[1];
        array[vertex * 3 + 2] = MARK_RED[2];
      }
    }
    attribute.needsUpdate = true;
  }, [buildings, buildingRanges, redBuildings, useOsmColors, tile.buildings.colors]);

  // Map a click on the merged Buildings mesh back to the individual building
  // via the raycast faceIndex. `delta` filters out orbit drags that end on the
  // mesh — only genuine clicks toggle.
  const handleBuildingClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onBuildingClick || event.delta > 5 || event.faceIndex == null) return;
    event.stopPropagation();
    const position = event.faceIndex * 3;
    const range = buildingRanges.find((entry) => position >= entry.start && position < entry.end);
    if (range) onBuildingClick(range.name);
  };

  const water = useMemo(() => {
    const material = createWaterPreviewMaterial(colors.water);
    const shimmerHandle = applyWaterShimmer(material);
    return { material, shimmerHandle };
  }, [colors.water]);

  const roadMaterial = useMemo(() => createRoadPreviewMaterial(colors.roads), [colors.roads]);
  const greenMaterial = useMemo(() => createGreenPreviewMaterial(colors.green), [colors.green]);
  const pathMaterial = useMemo(() => createPathPreviewMaterial(colors.paths), [colors.paths]);
  const railMaterial = useMemo(() => createRailPreviewMaterial(colors.rail), [colors.rail]);
  const treesMaterial = useMemo(() => createTreesPreviewMaterial(colors.trees), [colors.trees]);

  useEffect(
    () => () => {
      base.dispose();
      buildings.dispose();
      roadSurfaces.dispose();
      waterSurfaces.dispose();
      greenSurfaces.dispose();
      pathSurfaces.dispose();
      railSurfaces.dispose();
      trees.dispose();
      baseMaterial.dispose();
      building.material.dispose();
      water.material.dispose();
      roadMaterial.dispose();
      greenMaterial.dispose();
      pathMaterial.dispose();
      railMaterial.dispose();
      treesMaterial.dispose();
    },
    [
      base,
      buildings,
      roadSurfaces,
      waterSurfaces,
      greenSurfaces,
      pathSurfaces,
      railSurfaces,
      trees,
      baseMaterial,
      building,
      water,
      roadMaterial,
      greenMaterial,
      pathMaterial,
      railMaterial,
      treesMaterial,
    ],
  );

  return (
    <group rotation={[0, 0, 0]}>
      <mesh geometry={base} material={baseMaterial} castShadow receiveShadow />
      {tile.waterSurfaces.positions.length > 0 && (
        <mesh geometry={waterSurfaces} material={water.material} receiveShadow />
      )}
      {tile.greenSurfaces.positions.length > 0 && (
        <mesh geometry={greenSurfaces} material={greenMaterial} receiveShadow />
      )}
      {tile.roadSurfaces.positions.length > 0 && (
        <mesh geometry={roadSurfaces} material={roadMaterial} receiveShadow />
      )}
      {tile.pathSurfaces.positions.length > 0 && (
        <mesh geometry={pathSurfaces} material={pathMaterial} receiveShadow />
      )}
      {tile.railSurfaces.positions.length > 0 && (
        <mesh geometry={railSurfaces} material={railMaterial} receiveShadow />
      )}
      {tile.trees.positions.length > 0 && (
        <mesh geometry={trees} material={treesMaterial} castShadow receiveShadow />
      )}
      {tile.buildings.positions.length > 0 && (
        <mesh
          geometry={buildings}
          material={building.material}
          castShadow
          receiveShadow
          onClick={handleBuildingClick}
        />
      )}
      <PreviewAnimator
        tile={tile}
        riseHandle={building.riseHandle}
        shimmerHandle={water.shimmerHandle}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}

interface PreviewProps {
  tile: GeneratedTile;
  colors: TileColors;
  environment: PreviewEnvironment;
  span?: number;
  useOsmColors?: boolean;
  /** Buildings currently marked red (by part name); clicking toggles via onBuildingClick. */
  redBuildings?: ReadonlySet<string>;
  onBuildingClick?: (name: string) => void;
  /** Display-frame color; defaults to the theme brown. */
  frameColor?: string;
}

const NO_RED_BUILDINGS: ReadonlySet<string> = new Set();

export function TilePreview({
  tile,
  colors,
  environment,
  span = 500,
  useOsmColors = false,
  redBuildings = NO_RED_BUILDINGS,
  onBuildingClick,
  frameColor = FRAME_COLOR,
}: PreviewProps) {
  const cameraRange = resolvePreviewCameraRange(span);
  const reducedMotion = useReducedMotion();
  const restingCamera = useMemo(
    () => new Vector3(span * 0.95, span, span * 1.4),
    [span],
  );

  return (
    <div
      className="h-full w-full"
      style={{ background: `linear-gradient(${environment.skyTop}, ${environment.skyBottom})` }}
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{
          position: [span * 0.95, span, span * 1.4],
          fov: 32,
          near: cameraRange.near,
          far: cameraRange.far,
        }}
        gl={{ antialias: true, alpha: true }}
      >
        {/*
          drei's <SoftShadows> (the Task 9 brief's soft-shadow request) is
          incompatible with three@0.185: its string patches on
          THREE.ShaderChunk.shadowmap_pars_fragment no longer match the current
          chunk and inject invalid GLSL, silently breaking every shadow-receiving
          material (the whole tile renders blank). The Canvas `shadows` PCF soft
          shadow map plus <ContactShadows> already provide soft shadowing, so the
          component is omitted until a compatible drei/three pairing is available.
        */}
        <CameraSpanSync span={span} restingCamera={restingCamera} />
        <fog attach="fog" args={[environment.fog, span * 2.2, span * 4]} />
        <ambientLight intensity={environment.ambientIntensity} />
        <directionalLight
          castShadow
          position={[span, span * 1.7, span * 0.7]}
          intensity={environment.directionalIntensity}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={span * 5}
          shadow-camera-left={-span}
          shadow-camera-right={span}
          shadow-camera-top={span}
          shadow-camera-bottom={-span}
        />
        <TileMeshes
          tile={tile}
          colors={colors}
          useOsmColors={useOsmColors}
          reducedMotion={reducedMotion}
          redBuildings={redBuildings}
          onBuildingClick={onBuildingClick}
        />
        <FrameMesh span={span} color={frameColor} />
        <ContactShadows
          position={[0, -span * 0.011, 0]}
          opacity={0.32}
          scale={span * 2.1}
          blur={2.5}
          far={span}
        />
        <OrbitControls
          makeDefault
          target={[0, span * 0.04, 0]}
          minDistance={span * 0.35}
          maxDistance={span * 3}
          maxPolarAngle={Math.PI / 2.05}
          enableDamping
          // Gentle idle spin. OrbitControls.update() re-derives its orbit from the
          // live camera position each frame, so this composes with the fly-in and
          // the span re-frame instead of fighting them; it pauses while the user
          // drags (autoRotate only advances in the idle state) and honours the
          // viewer's reduced-motion preference.
          autoRotate={!reducedMotion}
          autoRotateSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}
