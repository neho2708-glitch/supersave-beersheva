"use client";

import { formatPrice } from "@backend/pricing";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useApp } from "../providers";
import { TrustBadge } from "../ui";
import type { ProductSummary } from "@/lib/types";
import { buildLayout, EYE_HEIGHT, type Pick, type StoreLayout } from "./layout";
import { StoreScene, type Controls } from "./scene";

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const MAX_PITCH = 1.25;
const CANVAS_DPR: [number, number] = [1, 1.5];

function MiniMap({ layout, controls, onTeleport }: { layout: StoreLayout; controls: React.RefObject<Controls>; onTeleport: (x: number, z: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { bounds } = layout;
  const width = 210;
  const scale = width / (bounds.maxX - bounds.minX);
  const height = (bounds.maxZ - bounds.minZ) * scale;
  // Seen from above with north at the top. Mirrored like the real world, not flipped for RTL.
  const px = useCallback((x: number) => (x - bounds.minX) * scale, [bounds.minX, scale]);
  const py = useCallback((z: number) => (z - bounds.minZ) * scale, [bounds.minZ, scale]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const timer = setInterval(() => {
      const c = controls.current;
      if (!c) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.fillRect(0, 0, width, height);
      for (const zone of layout.zones) {
        ctx.fillStyle = `${zone.color}55`;
        ctx.fillRect(px(zone.minX), py(zone.minZ), (zone.maxX - zone.minX) * scale, (zone.maxZ - zone.minZ) * scale);
      }
      ctx.fillStyle = "#3e4640";
      for (const collider of layout.colliders) {
        if (collider.maxY > 2.5) continue;
        const w = (collider.maxX - collider.minX) * scale;
        const h = (collider.maxZ - collider.minZ) * scale;
        if (w < 40 * scale && h < 40 * scale) ctx.fillRect(px(collider.minX), py(collider.minZ), Math.max(w, 1), Math.max(h, 1));
      }
      const x = px(c.x);
      const y = py(c.z);
      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.moveTo(x - Math.sin(c.yaw) * 8, y - Math.cos(c.yaw) * 8);
      ctx.lineTo(x + Math.cos(c.yaw) * 4, y - Math.sin(c.yaw) * 4);
      ctx.lineTo(x - Math.cos(c.yaw) * 4, y + Math.sin(c.yaw) * 4);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }, 90);
    return () => clearInterval(timer);
  }, [layout, controls, height, px, py, scale]);

  return (
    <div className="pointer-events-auto absolute left-3 top-3 overflow-hidden rounded-xl shadow-lg" dir="ltr">
      <canvas
        ref={ref}
        width={width}
        height={height}
        aria-label="מפת הסופר. לחיצה מעבירה למקום במפה"
        className="block h-auto w-32 cursor-pointer sm:w-[210px]"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const worldX = bounds.minX + ((event.clientX - rect.left) / rect.width) * (bounds.maxX - bounds.minX);
          const worldZ = bounds.minZ + ((event.clientY - rect.top) / rect.height) * (bounds.maxZ - bounds.minZ);
          onTeleport(worldX, worldZ);
        }}
      />
    </div>
  );
}

function Joystick({ controls }: { controls: React.RefObject<Controls> }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const center = useRef({ x: 0, y: 0 });
  const RADIUS = 46;
  return (
    <div
      className="pointer-events-auto absolute bottom-6 right-5 h-32 w-32 touch-none rounded-full bg-white/25 ring-2 ring-white/60 backdrop-blur"
      aria-label="ג'ויסטיק תנועה"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        let x = event.clientX - center.current.x;
        let y = event.clientY - center.current.y;
        const length = Math.hypot(x, y);
        if (length > RADIUS) {
          x = (x / length) * RADIUS;
          y = (y / length) * RADIUS;
        }
        setKnob({ x, y });
        controls.current.moveX = x / RADIUS;
        controls.current.moveZ = -y / RADIUS;
      }}
      onPointerUp={() => {
        setKnob({ x: 0, y: 0 });
        controls.current.moveX = 0;
        controls.current.moveZ = 0;
      }}
    >
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white shadow-lg" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}

export function VirtualStore() {
  const { branchParam, openProduct, openProductId, addToCart, cartCount } = useApp();
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Pick>(null);
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<Controls["mode"]>("walk");
  const [fps, setFps] = useState(0);
  const [touch, setTouch] = useState(false);
  const [help, setHelp] = useState(true);
  const [webgl, setWebgl] = useState(true);
  const [added, setAdded] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: number; pointerId: number } | null>(null);
  const keys = useRef(new Set<string>());
  const tweens = useRef({ fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion(), toQuat: new THREE.Quaternion() });
  const cameraRef = useRef<THREE.Camera | null>(null);

  const controls = useRef<Controls>({
    moveX: 0,
    moveZ: 0,
    run: false,
    yaw: 0,
    pitch: 0,
    fov: 68,
    aimX: 0,
    aimY: 0,
    x: 0,
    z: 0,
    mode: "walk",
    tween: null,
    walkPose: null,
    current: null,
  });

  useEffect(() => {
    // The store fills the window, and the wheel zooms instead of scrolling the page away.
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setWebgl(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch {
      setWebgl(false);
    }
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    fetch(`/api/products?limit=400&sort=name&branches=${branchParam}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setProducts(d.items))
      .catch(() => setError("לא הצלחנו לטעון את המוצרים. נסו לרענן את הדף."));
  }, [branchParam]);

  const layout = useMemo(() => (products ? buildLayout(products) : null), [products]);
  // Stable objects: react-three-fiber replaces the camera whenever these props change identity,
  // and these would otherwise change on every state update.
  const cameraOptions = useMemo(
    () => ({ fov: 68, near: 0.08, far: 90, position: [layout?.spawn.x ?? 0, EYE_HEIGHT, layout?.spawn.z ?? 0] as [number, number, number] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Boolean(layout)],
  );
  const glOptions = useMemo(() => ({ antialias: !touch, powerPreference: "high-performance" as const }), [touch]);
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  useEffect(() => {
    if (!layout) return;
    const c = controls.current;
    if (c.x === 0 && c.z === 0) {
      c.x = layout.spawn.x;
      c.z = layout.spawn.z;
      c.yaw = layout.spawn.yaw;
    }
  }, [layout]);

  const startTween = useCallback((toPos: THREE.Vector3, toQuat: THREE.Quaternion) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const t = tweens.current;
    t.fromPos.copy(camera.position);
    t.fromQuat.copy(camera.quaternion);
    t.toPos.copy(toPos);
    t.toQuat.copy(toQuat);
    controls.current.tween = { ...t, t: 0 };
  }, []);

  const returnToWalk = useCallback(() => {
    const c = controls.current;
    if (c.mode === "walk" || !c.walkPose) return;
    const pose = c.walkPose;
    c.x = pose.x;
    c.z = pose.z;
    c.yaw = pose.yaw;
    c.pitch = pose.pitch;
    c.fov = 68;
    c.aimX = 0;
    c.aimY = 0;
    c.mode = "walk";
    setMode("walk");
    startTween(new THREE.Vector3(pose.x, EYE_HEIGHT, pose.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch, pose.yaw, 0, "YXZ")));
  }, [startTween]);

  const focusShelf = useCallback(
    (x: number, y: number, z: number, normalX: number, normalZ: number) => {
      const c = controls.current;
      if (!c.walkPose || c.mode === "walk") c.walkPose = { x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch };
      const distance = 1.15;
      const position = new THREE.Vector3(x + normalX * distance, Math.min(Math.max(y, 0.7), 1.7), z + normalZ * distance);
      const look = new THREE.Vector3(x, Math.min(Math.max(y, 0.5), 1.7), z);
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, look, new THREE.Vector3(0, 1, 0)));
      const euler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");
      c.yaw = euler.y;
      c.pitch = euler.x;
      c.mode = "focus";
      setMode("focus");
      if (document.pointerLockElement) document.exitPointerLock();
      startTween(position, quaternion);
    },
    [startTween],
  );

  const showOverview = useCallback(() => {
    if (!layout) return;
    const c = controls.current;
    if (c.mode === "overview") {
      returnToWalk();
      return;
    }
    if (c.mode === "walk") c.walkPose = { x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch };
    c.mode = "overview";
    setMode("overview");
    if (document.pointerLockElement) document.exitPointerLock();
    const { bounds } = layout;
    const position = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 24, (bounds.minZ + bounds.maxZ) / 2 + 13);
    const look = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    startTween(position, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, look, new THREE.Vector3(0, 1, 0))));
  }, [layout, returnToWalk, startTween]);

  const activate = useCallback(() => {
    const c = controls.current;
    const current = c.current;
    if (current?.kind === "product") {
      if (document.pointerLockElement) document.exitPointerLock();
      openProduct(current.productId);
    } else if (current?.kind === "shelf" && c.mode !== "overview") {
      focusShelf(current.x, current.y, current.z, current.face.normalX, current.face.normalZ);
    }
  }, [openProduct, focusShelf]);

  const teleport = useCallback(
    (x: number, z: number) => {
      if (!layout) return;
      const c = controls.current;
      const inside = (px: number, pz: number) =>
        !layout.colliders.some((b) => px > b.minX - 0.4 && px < b.maxX + 0.4 && pz > b.minZ - 0.4 && pz < b.maxZ + 0.4);
      let point = { x, z };
      if (!inside(x, z)) {
        // The clicked spot is inside a shelf, so walk out in growing circles to the nearest aisle.
        search: for (let r = 0.5; r < 8; r += 0.5) {
          for (let a = 0; a < 16; a++) {
            const px = x + Math.cos((a / 16) * Math.PI * 2) * r;
            const pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
            if (inside(px, pz)) {
              point = { x: px, z: pz };
              break search;
            }
          }
        }
      }
      c.x = point.x;
      c.z = point.z;
      c.mode = "walk";
      c.walkPose = null;
      c.tween = null;
      c.aimX = 0;
      c.aimY = 0;
      setMode("walk");
    },
    [layout],
  );

  const updateMoveFromKeys = useCallback(() => {
    let x = 0;
    let z = 0;
    for (const code of keys.current) {
      const key = KEYS[code];
      if (key) {
        x += key[0];
        z += key[1];
      }
    }
    const length = Math.hypot(x, z) || 1;
    controls.current.moveX = x / length;
    controls.current.moveZ = z / length;
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (openProductId) return;
      if (KEYS[event.code]) {
        event.preventDefault();
        keys.current.add(event.code);
        updateMoveFromKeys();
        setHelp(false);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") controls.current.run = true;
      if (event.code === "KeyE" || event.code === "Enter") activate();
      if (event.code === "KeyF") {
        const current = controls.current.current;
        if (current?.kind === "product") {
          addToCart(current.productId);
          setAdded(current.productId);
          setTimeout(() => setAdded(null), 1400);
        }
      }
      if (event.code === "KeyQ") returnToWalk();
      if (event.code === "KeyM") showOverview();
    };
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
      updateMoveFromKeys();
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") controls.current.run = false;
    };
    const lockChange = () => {
      const isLocked = Boolean(document.pointerLockElement);
      setLocked(isLocked);
      if (isLocked) {
        controls.current.aimX = 0;
        controls.current.aimY = 0;
      }
    };
    const clearKeys = () => {
      keys.current.clear();
      updateMoveFromKeys();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("pointerlockchange", lockChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("pointerlockchange", lockChange);
    };
  }, [activate, addToCart, openProductId, returnToWalk, showOverview, updateMoveFromKeys]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const c = controls.current;
      if (c.mode !== "walk") return;
      c.yaw -= event.movementX * 0.0022;
      c.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, c.pitch - event.movementY * 0.0022));
    };
    document.addEventListener("mousemove", move);
    return () => document.removeEventListener("mousemove", move);
  }, []);

  const requestLock = () => {
    const element = container.current?.querySelector("canvas");
    try {
      const result = element?.requestPointerLock?.() as unknown as Promise<void> | undefined;
      result?.catch?.(() => undefined);
    } catch {
      // Without pointer lock, dragging still turns the camera.
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName !== "CANVAS") return;
    drag.current = { x: event.clientX, y: event.clientY, moved: 0, pointerId: event.pointerId };
    setHelp(false);
  };

  const setAimFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    controls.current.aimX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    controls.current.aimY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.pointerLockElement) return;
    const c = controls.current;
    const state = drag.current;
    if (state && state.pointerId === event.pointerId) {
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      state.x = event.clientX;
      state.y = event.clientY;
      state.moved += Math.abs(dx) + Math.abs(dy);
      if (c.mode === "walk") {
        c.yaw += dx * 0.0035;
        c.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, c.pitch + dy * 0.0035));
      }
    } else if (event.pointerType === "mouse" && (c.mode !== "walk" || !locked)) {
      setAimFromEvent(event);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (document.pointerLockElement) {
      if (event.button === 0) activate();
      return;
    }
    if (!state || state.moved > 8) return;
    const c = controls.current;
    if (event.pointerType === "mouse" && c.mode === "walk" && !c.current) {
      requestLock();
      return;
    }
    // A tap picks what is under the finger.
    if (event.pointerType !== "mouse") setAimFromEvent(event);
    setTimeout(activate, event.pointerType === "mouse" ? 0 : 130);
  };

  const onWheel = (event: React.WheelEvent) => {
    const c = controls.current;
    c.fov = Math.max(28, Math.min(80, c.fov + Math.sign(event.deltaY) * 5));
  };

  if (!webgl) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold">הדפדפן הזה לא מציג תלת-ממד</h1>
        <p className="mt-2 text-mist-700">אפשר לקנות באותה קלות במדפים הדו-ממדיים.</p>
        <Link href="/shelves" className="btn btn-primary mt-4">
          למדפים הדו-ממדיים
        </Link>
      </div>
    );
  }

  const product = target?.kind === "product" ? byId.get(target.productId) : null;

  return (
    <div
      ref={container}
      className="fixed inset-x-0 bottom-0 top-14 z-30 select-none overflow-hidden bg-mist-100"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      {layout && products && (
        <Canvas
          dpr={CANVAS_DPR}
          gl={glOptions}
          camera={cameraOptions}
          onCreated={({ camera }) => {
            cameraRef.current = camera;
          }}
        >
          <StoreScene layout={layout} products={products} controls={controls} onPick={setTarget} onFps={setFps} atlasSize={touch ? 2048 : 4096} />
        </Canvas>
      )}

      {!layout && !error && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <p className="rounded-xl bg-white px-6 py-4 font-semibold shadow">פותחים את הסופר…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded-xl bg-white px-6 py-4 font-semibold text-bad-700 shadow">{error}</p>
        </div>
      )}

      {layout && (
        <div className="pointer-events-none absolute inset-0">
          {mode === "walk" && (locked || touch) && (
            <div aria-hidden className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-forest-800/70" />
          )}

          <MiniMap layout={layout} controls={controls} onTeleport={teleport} />

          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={showOverview} aria-pressed={mode === "overview"}>
                {mode === "overview" ? "חזרה להליכה" : "מבט על"} {!touch && <kbd className="text-xs text-mist-500">M</kbd>}
              </button>
              <Link href="/shelves" className="btn btn-ghost px-3 py-1.5 text-sm">
                מדפים דו-ממדיים
              </Link>
            </div>
            {mode === "focus" && (
              <button className="btn btn-primary px-3 py-1.5 text-sm" onClick={returnToWalk}>
                חזרה לתצוגת הסופר {!touch && <kbd className="text-xs opacity-80">Q</kbd>}
              </button>
            )}
            <div className="flex items-center gap-2">
              {fps > 0 && (
                <span className="rounded bg-black/50 px-2 py-0.5 text-xs text-white" title="תמונות בשנייה">
                  <span dir="ltr">{fps} FPS</span>
                </span>
              )}
              <Link href="/cart" className="btn btn-primary px-3 py-1.5 text-sm">
                🛒 {cartCount}
              </Link>
            </div>
          </div>

          {product && (
            <div className="absolute bottom-28 left-1/2 w-[min(92vw,430px)] -translate-x-1/2 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur sm:bottom-8">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-bold leading-snug">{product.nameHe}</p>
                {product.cheapest ? (
                  <span className={`tabular shrink-0 text-xl font-extrabold ${product.cheapest.viaPromo ? "text-deal-600" : "text-forest-800"}`}>
                    {formatPrice(product.cheapest.price)}
                  </span>
                ) : null}
              </div>
              {product.cheapest ? (
                <p className="mt-0.5 text-sm text-mist-700">
                  הזול ביותר: {product.cheapest.chainName}
                  {product.cheapest.minQty > 1 ? ` · בקניית ${product.cheapest.minQty}` : ""}
                  {product.soldByWeight ? ' · לק"ג' : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-mist-500">לא נמצא מחיר זמין</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-mist-500">
                <TrustBadge state={product.cheapest ? product.cheapest.status : "NONE"} compact />
                {added === product.id ? (
                  <span className="font-bold text-forest-700">נוסף לעגלה ✓</span>
                ) : touch ? (
                  <button className="pointer-events-auto btn btn-primary px-3 py-1.5 text-sm" onClick={() => openProduct(product.id)}>
                    פרטים והשוואה
                  </button>
                ) : (
                  <span>
                    <kbd className="font-semibold">קליק</kbd> או <kbd className="font-semibold">E</kbd> להשוואה · <kbd className="font-semibold">F</kbd> לעגלה
                  </span>
                )}
              </div>
            </div>
          )}
          {!product && target?.kind === "shelf" && mode === "walk" && (
            <p className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">קליק כדי להתקרב למדף</p>
          )}

          {help && (
            <div className="absolute left-1/2 top-1/2 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-5 text-center shadow-2xl">
              <h1 className="text-xl font-extrabold">ברוכים הבאים לסופר</h1>
              {touch ? (
                <p className="mt-2 text-sm text-mist-700">הג&apos;ויסטיק מזיז אתכם, גרירה על המסך מסובבת את המבט, ונגיעה במוצר פותחת אותו.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-mist-700">
                  <li>
                    <b dir="ltr">W A S D</b> או החצים: הליכה · <b>Shift</b>: ריצה
                  </li>
                  <li>קליק על הסצנה: נעילת העכבר להסתכלות · <b>Esc</b>: שחרור</li>
                  <li>קליק על מוצר: השוואת מחירים · קליק על מדף: התקרבות</li>
                  <li>
                    גלגלת: זום · <b>M</b>: מבט על · <b>Q</b>: חזרה
                  </li>
                </ul>
              )}
              <button className="pointer-events-auto btn btn-primary mt-4" onClick={() => setHelp(false)}>
                מתחילים
              </button>
            </div>
          )}

          {touch && mode === "walk" && !openProductId && <Joystick controls={controls} />}
        </div>
      )}
    </div>
  );
}
