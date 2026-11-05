// Runtime-drawn textures: the product atlas, price tags, signs, floor tiles.
import * as THREE from "three";
import type { ProductSummary } from "@/lib/types";
import { CATEGORY_STYLE } from "../ui";

export interface Atlas {
  texture: THREE.CanvasTexture;
  /** [u offset, v offset, u scale, v scale] per product id. */
  rect: Map<string, [number, number, number, number]>;
  dispose: () => void;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = trial;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, product: ProductSummary, x: number, y: number, size: number) {
  const style = CATEGORY_STYLE[product.categoryId] ?? { color: "#166534", icon: "🛒" };
  const hue = hash(product.id) % 40;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.fillStyle = style.color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = `hsla(${hue}, 80%, 92%, 0.92)`;
  ctx.fillRect(x + size * 0.06, y + size * 0.22, size * 0.88, size * 0.56);
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${size * 0.11}px Heebo, Arial`;
  ctx.fillText((product.brand ?? "").slice(0, 16), x + size / 2, y + size * 0.15);
  ctx.fillStyle = "#16201a";
  ctx.font = `700 ${size * 0.105}px Heebo, Arial`;
  const lines = wrapText(ctx, product.nameHe, size * 0.82, 4);
  lines.forEach((line, i) => ctx.fillText(line, x + size / 2, y + size * (0.34 + i * 0.125)));
  ctx.font = `${size * 0.14}px serif`;
  ctx.fillText(style.icon, x + size / 2, y + size * 0.93);
  ctx.restore();
}

/**
 * All product fronts share one texture so thousands of packages draw in a handful of calls.
 * Designed fronts appear at once; real photos replace them as they load.
 */
export function buildProductAtlas(products: ProductSummary[], maxSize: number, onProgress?: (loaded: number, total: number) => void): Atlas {
  const atlasSize = Math.min(maxSize, 4096);
  const columns = Math.ceil(Math.sqrt(products.length));
  const cell = Math.floor(atlasSize / columns);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = atlasSize;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, atlasSize, atlasSize);
  const rect: Atlas["rect"] = new Map();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;

  const inset = 2;
  products.forEach((product, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cell;
    const y = row * cell;
    drawPlaceholder(ctx, product, x + inset, y + inset, cell - inset * 2);
    rect.set(product.id, [(x + inset) / atlasSize, 1 - (y + cell - inset) / atlasSize, (cell - inset * 2) / atlasSize, (cell - inset * 2) / atlasSize]);
  });
  texture.needsUpdate = true;

  let disposed = false;
  let dirty = false;
  const flush = setInterval(() => {
    if (dirty && !disposed) {
      texture.needsUpdate = true;
      dirty = false;
    }
  }, 1200);

  const withImages = products.map((p, i) => ({ p, i })).filter(({ p }) => p.image);
  let next = 0;
  let loaded = 0;
  const worker = () => {
    if (disposed || next >= withImages.length) return;
    const { p, i } = withImages[next++];
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = col * cell + inset;
      const y = row * cell + inset;
      const size = cell - inset * 2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, size, size);
      const scale = Math.min(size / image.width, size / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
      dirty = true;
      loaded += 1;
      onProgress?.(loaded, withImages.length);
      worker();
    };
    image.onerror = () => {
      loaded += 1;
      worker();
    };
    image.src = (p.image as { url: string }).url;
  };
  for (let i = 0; i < 6; i++) worker();

  return {
    texture,
    rect,
    dispose: () => {
      disposed = true;
      clearInterval(flush);
      texture.dispose();
    },
  };
}

/** Shelf-edge labels. Only a real price is printed; otherwise the label says there is none. */
export function buildTagAtlas(products: ProductSummary[]): Atlas {
  const columns = Math.ceil(Math.sqrt(products.length * 2));
  const rows = Math.ceil(products.length / columns);
  const width = 2048;
  const cellW = Math.floor(width / columns);
  const cellH = Math.floor(cellW / 2);
  const height = Math.pow(2, Math.ceil(Math.log2(Math.max(rows * cellH, 2))));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const rect: Atlas["rect"] = new Map();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  products.forEach((product, index) => {
    const x = (index % columns) * cellW;
    const y = Math.floor(index / columns) * cellH;
    const cheapest = product.cheapest;
    const promo = Boolean(cheapest?.viaPromo);
    ctx.fillStyle = !cheapest ? "#e1e4e1" : promo ? "#f97316" : "#ffffff";
    ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = !cheapest ? "#c9cec9" : promo ? "#ea580c" : "#14532d";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
    ctx.fillStyle = promo ? "#ffffff" : cheapest ? "#0b3d21" : "#6b736c";
    if (cheapest) {
      ctx.direction = "ltr";
      ctx.font = `800 ${cellH * 0.55}px Heebo, Arial`;
      ctx.fillText(`₪${cheapest.price.toFixed(2)}`, x + cellW / 2, y + cellH * 0.46);
      ctx.direction = "rtl";
      ctx.font = `600 ${cellH * 0.22}px Heebo, Arial`;
      ctx.fillText(cheapest.chainName, x + cellW / 2, y + cellH * 0.82);
    } else {
      ctx.direction = "rtl";
      ctx.font = `700 ${cellH * 0.26}px Heebo, Arial`;
      ctx.fillText("אין מחיר", x + cellW / 2, y + cellH / 2);
    }
    rect.set(product.id, [x / width, 1 - (y + cellH) / height, cellW / width, cellH / height]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, rect, dispose: () => texture.dispose() };
}

export function buildSignTexture(label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 200;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 200);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 0, 1024, 12);
  ctx.fillStyle = "#ffffff";
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 104px Heebo, Arial";
  ctx.fillText(label, 512, 106);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const tiles = 2;
  const size = 512 / tiles;
  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const shade = (row + col) % 2 === 0 ? 236 : 229;
      ctx.fillStyle = `rgb(${shade},${shade},${shade - 3})`;
      ctx.fillRect(col * size, row * size, size, size);
    }
  }
  ctx.strokeStyle = "rgb(198,200,196)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * size, 0);
    ctx.lineTo(i * size, 512);
    ctx.moveTo(0, i * size);
    ctx.lineTo(512, i * size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function buildCeilingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#eceee9";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#c9ccc6";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Mirrors a wrap-around UV so the whole label shows on the side facing the shopper.
export function wrapLabelUV(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    let a = u <= 0.5 ? u : u - 1;
    if (Math.abs(a) > 0.25) a = Math.sign(a) * (0.5 - Math.abs(a));
    uv.setX(i, 0.5 + 2 * a);
  }
  uv.needsUpdate = true;
  return geometry;
}

const PRODUCE_COLORS: [RegExp, string][] = [
  [/tomato|pepper-red|apple-red|pomegranate/, "#c8321f"],
  [/cucumber|zucchini|pepper-green|apple-green|lettuce|celery|cabbage|avocado|kiwi/, "#5d9a32"],
  [/lemon|pepper-yellow|banana|grapefruit/, "#ecc02c"],
  [/carrot|orange|clementine|persimmon|pumpkin|mango|sweet-potato/, "#e8842a"],
  [/potato|onion|garlic|pear|cauliflower/, "#d9c28f"],
  [/eggplant|beet|grapes|red-onion/, "#5b2a56"],
  [/apple-pink/, "#e0627f"],
];

export function produceColor(productId: string): string {
  // More specific ids come first where one name contains another.
  if (productId.includes("red-onion")) return "#7b2d55";
  if (productId.includes("sweet-potato")) return "#b85f2a";
  if (productId.includes("potato-red")) return "#a1533a";
  for (const [pattern, color] of PRODUCE_COLORS) if (pattern.test(productId)) return color;
  return "#8fae3c";
}
