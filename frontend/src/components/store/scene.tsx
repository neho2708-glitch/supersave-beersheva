"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { ProductSummary } from "@/lib/types";
import { CEILING_HEIGHT, EYE_HEIGHT, moveWithCollision, pick, type Part, type Pick, type Sign, type StoreLayout } from "./layout";
import { buildCeilingTexture, buildFloorTexture, buildProductAtlas, buildSignTexture, buildTagAtlas, produceColor, wrapLabelUV, type Atlas } from "./textures";

export interface Controls {
  /** Set by keyboard or joystick: strafe, forward. */
  moveX: number;
  moveZ: number;
  run: boolean;
  yaw: number;
  pitch: number;
  fov: number;
  /** Aim point in screen space, from -1 to 1. (0,0) is the crosshair. */
  aimX: number;
  aimY: number;
  x: number;
  z: number;
  mode: "walk" | "focus" | "overview";
  tween: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromQuat: THREE.Quaternion; toQuat: THREE.Quaternion; t: number } | null;
  walkPose: { x: number; z: number; yaw: number; pitch: number } | null;
  current: Pick;
}

const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function Boxes({ items, color, emissive, metal = false }: { items: Part[]; color: string; emissive?: string; metal?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((p, i) => {
      tmpMatrix.compose(tmpPosition.set(p.x, p.y, p.z), tmpQuat.identity(), tmpScale.set(p.sx, p.sy, p.sz));
      mesh.setMatrixAt(i, tmpMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <boxGeometry />
      {metal ? (
        <meshLambertMaterial color={color} />
      ) : emissive ? (
        <meshBasicMaterial color={emissive} toneMapped={false} />
      ) : (
        <meshLambertMaterial color={color} />
      )}
    </instancedMesh>
  );
}

function atlasMaterial(texture: THREE.Texture) {
  const material = new THREE.MeshLambertMaterial({ map: texture });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec4 aRect;\n" +
      shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n  vMapUv = vMapUv * aRect.zw + aRect.xy;");
  };
  return material;
}

function InstancedPackages({
  geometry,
  items,
  atlas,
}: {
  geometry: THREE.BufferGeometry;
  items: { productId: string; x: number; y: number; z: number; rotY: number; sx: number; sy: number; sz: number }[];
  atlas: Atlas;
}) {
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry.clone(), atlasMaterial(atlas.texture), items.length);
    const rects = new Float32Array(items.length * 4);
    items.forEach((item, i) => {
      tmpQuat.setFromAxisAngle(up, item.rotY);
      tmpMatrix.compose(tmpPosition.set(item.x, item.y, item.z), tmpQuat, tmpScale.set(item.sx, item.sy, item.sz));
      instanced.setMatrixAt(i, tmpMatrix);
      const rect = atlas.rect.get(item.productId) ?? [0, 0, 0, 0];
      rects.set(rect, i * 4);
    });
    instanced.geometry.setAttribute("aRect", new THREE.InstancedBufferAttribute(rects, 4));
    instanced.instanceMatrix.needsUpdate = true;
    instanced.frustumCulled = false;
    return instanced;
  }, [geometry, items, atlas]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

function SignBoard({ sign }: { sign: Sign }) {
  const texture = useMemo(() => buildSignTexture(sign.label, sign.color), [sign.label, sign.color]);
  useEffect(() => () => texture.dispose(), [texture]);
  const height = sign.width * (200 / 1024);
  return (
    <group position={[sign.x, sign.y, sign.z]} rotation={[0, sign.rotY, 0]}>
      <mesh>
        <planeGeometry args={[sign.width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Shell({ layout, ceilingRef }: { layout: StoreLayout; ceilingRef: MutableRefObject<THREE.Group | null> }) {
  const { bounds } = layout;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const floor = useMemo(() => {
    const t = buildFloorTexture();
    t.repeat.set(width / 1.2, depth / 1.2);
    return t;
  }, [width, depth]);
  const ceiling = useMemo(() => {
    const t = buildCeilingTexture();
    t.repeat.set(width / 1.2, depth / 1.2);
    return t;
  }, [width, depth]);
  const lights = useMemo(() => {
    const parts: Part[] = [];
    for (let x = bounds.minX + 3; x < bounds.maxX - 1; x += 5) {
      for (let z = bounds.minZ + 2.5; z < bounds.maxZ; z += 4) {
        parts.push({ x, y: CEILING_HEIGHT - 0.02, z, sx: 0.6, sy: 0.03, sz: 2.4 });
      }
    }
    return parts;
  }, [bounds]);
  const walls: [number, number, number, number, number][] = [
    [cx, bounds.minZ, 0, width, CEILING_HEIGHT],
    [bounds.maxX, cz, -Math.PI / 2, depth, CEILING_HEIGHT],
    [bounds.minX, cz, Math.PI / 2, depth, CEILING_HEIGHT],
    [cx, bounds.maxZ, Math.PI, width, CEILING_HEIGHT],
  ];
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]}>
        <planeGeometry args={[width, depth]} />
        <meshLambertMaterial map={floor} />
      </mesh>
      <group ref={ceilingRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, CEILING_HEIGHT, cz]}>
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial map={ceiling} color="#dcded8" />
        </mesh>
        <Boxes items={lights} color="#ffffff" emissive="#fffdf0" />
      </group>
      {walls.map(([x, z, rot, w, h]) => (
        <group key={`${x}-${z}`}>
          <mesh position={[x, h / 2, z]} rotation={[0, rot, 0]}>
            <planeGeometry args={[w, h]} />
            <meshLambertMaterial color="#f2f4ef" />
          </mesh>
          <mesh position={[x, 0.15, z]} rotation={[0, rot, 0]}>
            <planeGeometry args={[w, 0.3]} />
            <meshLambertMaterial color="#14532d" />
          </mesh>
        </group>
      ))}
      {/* Entrance doors and daylight */}
      <mesh position={[-2.5, 1.5, bounds.maxZ - 0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[6, 3]} />
        <meshBasicMaterial color="#d8efff" toneMapped={false} />
      </mesh>
      <SignBoard sign={{ label: "SuperSave · באר שבע", color: "#14532d", x: -2.5, y: 3.4, z: bounds.maxZ - 0.05, rotY: Math.PI, width: 6 }} />
    </>
  );
}

function FridgeUnits({ layout }: { layout: StoreLayout }) {
  return (
    <>
      {layout.cabinets.map((c) => (
        <group key={`${c.x}-${c.z}`} position={[c.x, 0, c.z]} rotation={[0, c.rotY, 0]}>
          <mesh position={[0, 1.2, -0.45]}>
            <boxGeometry args={[c.width, 2.4, 0.04]} />
            <meshLambertMaterial color={c.frozen ? "#dbeafe" : "#e8f3ee"} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[c.width, 0.2, 0.9]} />
            <meshLambertMaterial color="#2f3a33" />
          </mesh>
          <mesh position={[0, 2.35, 0]}>
            <boxGeometry args={[c.width, 0.12, 0.9]} />
            <meshLambertMaterial color="#2f3a33" />
          </mesh>
          <mesh position={[0, 2.27, 0.3]}>
            <boxGeometry args={[c.width - 0.2, 0.03, 0.05]} />
            <meshBasicMaterial color="#f7fff9" toneMapped={false} />
          </mesh>
          {/* Glass doors with mullions */}
          <mesh position={[0, 1.27, 0.44]}>
            <planeGeometry args={[c.width, 2.14]} />
            <meshBasicMaterial color={c.frozen ? "#bfdbfe" : "#d1fae5"} transparent opacity={0.1} depthWrite={false} />
          </mesh>
          {Array.from({ length: Math.round(c.width / 1.2) + 1 }).map((_, i) => (
            <mesh key={i} position={[-c.width / 2 + (i * c.width) / Math.round(c.width / 1.2), 1.27, 0.44]}>
              <boxGeometry args={[0.035, 2.14, 0.035]} />
              <meshLambertMaterial color="#3e4640" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function ProduceBins({ layout }: { layout: StoreLayout }) {
  const crates = useMemo<Part[]>(
    () => layout.bins.map((b) => ({ x: b.x, y: 0.36, z: b.z, sx: 1.3, sy: 0.72, sz: 1.05 })),
    [layout.bins],
  );
  const mesh = useMemo(() => {
    const perBin = 34;
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshLambertMaterial();
    const instanced = new THREE.InstancedMesh(geometry, material, layout.bins.length * perBin);
    const color = new THREE.Color();
    layout.bins.forEach((bin, b) => {
      let seed = b * 97 + 13;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      color.set(produceColor(bin.productId));
      for (let i = 0; i < perBin; i++) {
        const radius = 0.075 + random() * 0.025;
        const x = bin.x + (random() - 0.5) * 1.12;
        const z = bin.z + (random() - 0.5) * 0.86;
        const edge = 1 - Math.abs(z - bin.z) / 0.5;
        const y = 0.72 + radius * 0.6 + random() * 0.08 + Math.max(edge, 0) * 0.06;
        tmpMatrix.compose(tmpPosition.set(x, y, z), tmpQuat.identity(), tmpScale.set(radius, radius * 0.92, radius));
        instanced.setMatrixAt(b * perBin + i, tmpMatrix);
        instanced.setColorAt(b * perBin + i, color.clone().offsetHSL(0, 0, (random() - 0.5) * 0.08));
      }
    });
    instanced.frustumCulled = false;
    return instanced;
  }, [layout.bins]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return (
    <>
      <Boxes items={crates} color="#a57a4c" />
      <primitive object={mesh} />
    </>
  );
}

function Highlight({ controls }: { controls: MutableRefObject<Controls> }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const current = controls.current.current;
    if (current?.kind === "product") {
      mesh.visible = true;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.22 + Math.sin(clock.elapsedTime * 5) * 0.06;
      if (current.slot) {
        const s = current.slot;
        mesh.position.set(s.x, s.y, s.z);
        mesh.rotation.set(0, s.rotY, 0);
        mesh.scale.set(s.w * 1.1, s.h * 1.06, s.d * 1.15);
      } else if (current.bin) {
        mesh.position.set(current.bin.x, 0.82, current.bin.z);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1.34, 0.26, 1.09);
      }
    } else {
      mesh.visible = false;
    }
  });
  return (
    <mesh ref={ref} visible={false}>
      <boxGeometry />
      <meshBasicMaterial color="#4ade80" transparent opacity={0.25} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Player({
  layout,
  controls,
  ceilingRef,
  onPick,
  onFrameStats,
}: {
  layout: StoreLayout;
  controls: MutableRefObject<Controls>;
  ceilingRef: MutableRefObject<THREE.Group | null>;
  onPick: (pick: Pick) => void;
  onFrameStats?: (fps: number) => void;
}) {
  const { camera } = useThree();
  const clockAccum = useRef(0);
  const frames = useRef(0);
  const fpsTime = useRef(0);
  const lastKey = useRef("");
  const direction = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const ndc = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const c = controls.current;
    const perspective = camera as THREE.PerspectiveCamera;

    if (Math.abs(perspective.fov - c.fov) > 0.05) {
      perspective.fov += (c.fov - perspective.fov) * Math.min(1, delta * 12);
      perspective.updateProjectionMatrix();
    }

    if (c.tween) {
      const tween = c.tween;
      // Uses real elapsed time, so a slow device finishes the move on time instead of crawling.
      tween.t = Math.min(1, tween.t + rawDelta / 0.7);
      const eased = tween.t * tween.t * (3 - 2 * tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
      camera.quaternion.slerpQuaternions(tween.fromQuat, tween.toQuat, eased);
      if (tween.t >= 1) {
        c.tween = null;
        if (c.mode === "walk") {
          c.x = camera.position.x;
          c.z = camera.position.z;
        }
      }
    } else if (c.mode === "walk") {
      const speed = (c.run ? 5.4 : 3.1) * delta;
      const sin = Math.sin(c.yaw);
      const cos = Math.cos(c.yaw);
      const dx = (c.moveX * cos - c.moveZ * sin) * speed;
      const dz = (-c.moveX * sin - c.moveZ * cos) * speed;
      if (dx !== 0 || dz !== 0) {
        const next = moveWithCollision(layout.colliders, c.x, c.z, dx, dz);
        c.x = next.x;
        c.z = next.z;
      }
      camera.position.set(c.x, EYE_HEIGHT, c.z);
      euler.set(c.pitch, c.yaw, 0);
      camera.quaternion.setFromEuler(euler);
    } else if (c.mode === "focus") {
      // Close-up: the camera stays put and only turns a little.
      euler.set(c.pitch, c.yaw, 0);
      camera.quaternion.setFromEuler(euler);
    }

    if (ceilingRef.current) ceilingRef.current.visible = c.mode !== "overview" || Boolean(c.tween);

    // Aiming runs ten times a second, which is enough to feel instant.
    clockAccum.current += delta;
    if (clockAccum.current > 0.1 && !c.tween) {
      clockAccum.current = 0;
      ndc.set(c.aimX, c.aimY, 0.5).unproject(camera);
      direction.copy(ndc).sub(camera.position).normalize();
      const reach = c.mode === "overview" ? 40 : 9;
      const hit = pick(layout, camera.position.x, camera.position.y, camera.position.z, direction.x, direction.y, direction.z, reach);
      c.current = hit;
      const key = hit?.kind === "product" ? hit.productId : hit?.kind === "shelf" ? `shelf:${hit.face.zoneId}` : "";
      if (key !== lastKey.current) {
        lastKey.current = key;
        onPick(hit);
      }
    }

    frames.current += 1;
    fpsTime.current += rawDelta;
    if (fpsTime.current >= 1) {
      onFrameStats?.(Math.round(frames.current / fpsTime.current));
      frames.current = 0;
      fpsTime.current = 0;
    }
  });
  return null;
}

export function StoreScene({
  layout,
  products,
  controls,
  onPick,
  onFps,
  atlasSize,
  onImages,
}: {
  layout: StoreLayout;
  products: ProductSummary[];
  controls: MutableRefObject<Controls>;
  onPick: (pick: Pick) => void;
  onFps?: (fps: number) => void;
  atlasSize: number;
  onImages?: (loaded: number, total: number) => void;
}) {
  const ceilingRef = useRef<THREE.Group | null>(null);
  const atlas = useMemo(() => buildProductAtlas(products, atlasSize, onImages), [products, atlasSize, onImages]);
  const tagAtlas = useMemo(() => buildTagAtlas(products), [products]);
  useEffect(
    () => () => {
      atlas.dispose();
      tagAtlas.dispose();
    },
    [atlas, tagAtlas],
  );

  const geometries = useMemo(() => {
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const canGeometry = wrapLabelUV(new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false));
    const profile = [
      [0.0, -0.5],
      [0.46, -0.5],
      [0.5, -0.46],
      [0.5, 0.12],
      [0.42, 0.24],
      [0.2, 0.38],
      [0.18, 0.5],
      [0.0, 0.5],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const bottleGeometry = wrapLabelUV(new THREE.LatheGeometry(profile, 12));
    const tagGeometry = new THREE.PlaneGeometry(1, 1);
    return { box: boxGeometry, can: canGeometry, bottle: bottleGeometry, tag: tagGeometry };
  }, []);

  const groups = useMemo(() => {
    const toItem = (s: StoreLayout["slots"][number]) => ({
      productId: s.productId,
      x: s.x,
      y: s.y,
      z: s.z,
      rotY: s.rotY,
      sx: s.w,
      sy: s.h,
      sz: s.d,
    });
    return {
      box: layout.slots.filter((s) => s.shape === "box").map(toItem),
      can: layout.slots.filter((s) => s.shape === "can").map(toItem),
      bottle: layout.slots.filter((s) => s.shape === "bottle").map(toItem),
      tag: layout.tags.map((t) => ({ productId: t.productId, x: t.x, y: t.y, z: t.z, rotY: t.rotY, sx: 0.16, sy: 0.08, sz: 1 })),
    };
  }, [layout]);

  return (
    <>
      <color attach="background" args={["#f4f6f2"]} />
      <hemisphereLight args={["#ffffff", "#c9cec3", 2.1]} />
      <directionalLight position={[6, 12, 4]} intensity={0.9} />
      <directionalLight position={[-8, 6, -6]} intensity={0.35} />
      <Shell layout={layout} ceilingRef={ceilingRef} />
      <Boxes items={layout.frames} color="#dfe3dd" />
      <Boxes items={layout.planks} color="#f4f5f2" />
      <Boxes items={layout.checkouts} color="#14532d" />
      <FridgeUnits layout={layout} />
      <ProduceBins layout={layout} />
      {groups.box.length > 0 && <InstancedPackages geometry={geometries.box} items={groups.box} atlas={atlas} />}
      {groups.can.length > 0 && <InstancedPackages geometry={geometries.can} items={groups.can} atlas={atlas} />}
      {groups.bottle.length > 0 && <InstancedPackages geometry={geometries.bottle} items={groups.bottle} atlas={atlas} />}
      {groups.tag.length > 0 && <InstancedPackages geometry={geometries.tag} items={groups.tag} atlas={tagAtlas} />}
      {layout.signs.map((sign, i) => (
        <SignBoard key={i} sign={sign} />
      ))}
      <Highlight controls={controls} />
      <Player layout={layout} controls={controls} ceilingRef={ceilingRef} onPick={onPick} onFrameStats={onFps} />
    </>
  );
}
