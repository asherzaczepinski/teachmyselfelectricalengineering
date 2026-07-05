// The 3D bodies for every part. Local space: the part runs from (0,0,0) to
// (L,0,0) along +x, sitting on the board plane z=0 (z is up).

import * as THREE from "three";
import { CHANNEL_COLORS, LED_COLORS, LETTER_SECONDS, Part } from "../../../lib/sim";
import { BODY_W, CALC_KEYPAD, calcKeyRect, PIXEL_FONT } from "../Glyph";

export const LEAD_Z = 7;

// ——— shared materials (cloned only where a part mutates them) ———
const M = {
  copper: new THREE.MeshStandardMaterial({ color: 0xd98e32, metalness: 0.85, roughness: 0.32 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9c2cf, metalness: 0.9, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x232b3b, roughness: 0.6, metalness: 0.15 }),
  darker: new THREE.MeshStandardMaterial({ color: 0x161c29, roughness: 0.7, metalness: 0.1 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xea8c1e, roughness: 0.45 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xcfe0ee,
    transparent: true,
    opacity: 0.28,
    roughness: 0.15,
    metalness: 0,
  }),
  pink: new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.9, roughness: 0.3 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.45 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x0c4a6e, roughness: 0.4, metalness: 0.3 }),
};

const GEO = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  unitCylX: (() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 20);
    g.rotateZ(Math.PI / 2); // axis along x
    return g;
  })(),
  unitCylZ: new THREE.CylinderGeometry(1, 1, 1, 24).rotateX(Math.PI / 2), // axis along z (up)
  sphere: new THREE.SphereGeometry(1, 18, 14),
  torus: new THREE.TorusGeometry(1, 0.16, 10, 24),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}
function boxAt(w: number, d: number, h: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = mesh(GEO.unitBox, mat);
  m.scale.set(w, d, h);
  m.position.set(x, y, z);
  return m;
}
function cylX(len: number, r: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = mesh(GEO.unitCylX, mat);
  m.scale.set(len, r, r);
  m.position.set(x, y, z);
  return m;
}
function cylZ(r: number, h: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = mesh(GEO.unitCylZ, mat);
  m.scale.set(r, r, h);
  m.position.set(x, y, z);
  return m;
}

function leads(g: THREE.Group, L: number, pad: number) {
  if (pad > 2) {
    g.add(cylX(pad + 2, 2.2, M.copper, pad / 2, 0, LEAD_Z));
    g.add(cylX(pad + 2, 2.2, M.copper, L - pad / 2, 0, LEAD_Z));
  }
  // little feet so parts visibly sit on the board
  g.add(cylZ(2.2, LEAD_Z, M.copper, 0, 0, LEAD_Z / 2));
  g.add(cylZ(2.2, LEAD_Z, M.copper, L, 0, LEAD_Z / 2));
}

// ——— canvas-texture helpers ———

const texCache = new Map<string, THREE.CanvasTexture>();
export function textTexture(text: string, color: string, px = 44, bold = true): THREE.CanvasTexture {
  const key = `${text}|${color}|${px}|${bold}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = `${bold ? 700 : 500} ${px}px Inter, system-ui, sans-serif`;
  const w = Math.max(2, Math.ceil(ctx.measureText(text).width) + 12);
  c.width = w;
  c.height = px + 14;
  const ctx2 = c.getContext("2d")!;
  ctx2.font = `${bold ? 700 : 500} ${px}px Inter, system-ui, sans-serif`;
  ctx2.textBaseline = "middle";
  ctx2.fillStyle = color;
  ctx2.fillText(text, 6, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

export function textSprite(text: string, color: string, worldH: number): THREE.Sprite {
  const tex = textTexture(text, color);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const img = tex.image as HTMLCanvasElement;
  s.scale.set((worldH * img.width) / img.height, worldH, 1);
  return s;
}

let glowTex: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function glowSprite(color: number, size: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

function heatTint(mat: THREE.MeshStandardMaterial, base: number, temp: number) {
  const f = Math.max(0, Math.min(1, (temp - 45) / 350));
  const c = new THREE.Color(base);
  c.lerp(new THREE.Color(0xff3d00), f);
  mat.color.copy(c);
  mat.emissive.setHex(0xff3d00);
  mat.emissiveIntensity = f * 0.8;
}

export interface PartHandle {
  group: THREE.Group;
  builtLen: number;
  builtType: string;
  update: (p: Part, L: number, t: number) => void;
  hit: THREE.Object3D; // the invisible grab body carrying userData.partId
}

// an invisible fat bar along the axis for easy grabbing/raycasting
function hitBar(L: number, partId: string): THREE.Mesh {
  const m = new THREE.Mesh(
    GEO.unitBox,
    new THREE.MeshBasicMaterial({ visible: false })
  );
  m.scale.set(L + 10, 26, 30);
  m.position.set(L / 2, 0, 12);
  m.userData.partId = partId;
  return m;
}

export function buildPart(p: Part, L: number): PartHandle {
  const g = new THREE.Group();
  const bodyW = BODY_W[p.type];
  const pad = Math.max(0, (L - bodyW) / 2);
  const cx = L / 2;
  const hit = hitBar(L, p.id);
  g.add(hit);
  let update: PartHandle["update"] = () => {};

  // a blown-apart part leaves charred remains on the bench
  if (p.destroyed) {
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(30, 24),
      new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 1 })
    );
    scorch.position.set(cx, 0, 0.4);
    g.add(scorch);
    g.add(cylX(Math.min(30, cx - 14), 2, M.darker, (cx - 14) / 2, 0, 3));
    g.add(cylX(Math.min(30, cx - 14), 2, M.darker, L - (cx - 14) / 2, 0, 3));
    let hsh = 0;
    for (let i = 0; i < p.id.length; i++) hsh = (hsh * 31 + p.id.charCodeAt(i)) >>> 0;
    const lumpMat = new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 0.95 });
    for (let k = 0; k < 6; k++) {
      hsh = (hsh * 1103515245 + 12345) >>> 0;
      const ang = ((hsh % 360) * Math.PI) / 180;
      hsh = (hsh * 1103515245 + 12345) >>> 0;
      const d = 8 + (hsh % 20);
      const lump = boxAt(4 + (hsh % 6), 4 + ((hsh >> 3) % 5), 3 + (hsh % 4), lumpMat, cx + Math.cos(ang) * d, Math.sin(ang) * d * 0.7, 2);
      lump.rotation.z = ang;
      g.add(lump);
    }
    return { group: g, builtLen: L, builtType: p.type, update, hit };
  }

  switch (p.type) {
    case "wire": {
      // a real jumper wire: colored plastic insulation, bare metal tips
      const WIRE_COLORS = [0xc62f2f, 0x24262b, 0x2458c6, 0x1f9d4d, 0xd9a02f];
      let hsh = 0;
      for (let i = 0; i < p.id.length; i++) hsh = (hsh * 31 + p.id.charCodeAt(i)) >>> 0;
      const baseColor = WIRE_COLORS[hsh % WIRE_COLORS.length];
      const ins = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.45, metalness: 0.05 });
      const body = cylX(1, 3.6, ins, cx, 0, LEAD_Z);
      const tipA = cylX(16, 2, M.steel, 9, 0, LEAD_Z);
      const tipB = cylX(16, 2, M.steel, L - 9, 0, LEAD_Z);
      g.add(body, tipA, tipB);
      g.add(cylZ(2.4, LEAD_Z, M.steel, 0, 0, LEAD_Z / 2));
      g.add(cylZ(2.4, LEAD_Z, M.steel, L, 0, LEAD_Z / 2));
      update = (p2, L2) => {
        body.scale.x = Math.max(4, L2 - 28);
        body.position.x = L2 / 2;
        tipB.position.x = L2 - 9;
        heatTint(ins, baseColor, p2.temp);
      };
      break;
    }
    case "battery": {
      leads(g, L, pad);
      g.add(boxAt(42, 26, 24, M.orange, cx - 9, 0, LEAD_Z + 6));
      g.add(boxAt(18, 26, 24, M.dark, cx + 21, 0, LEAD_Z + 6));
      g.add(cylX(5, 4.5, M.steel, cx + 32, 0, LEAD_Z + 6));
      g.add(boxAt(3, 12, 2, M.darker, cx - 16, 0, LEAD_Z + 18.2)); // −
      const plus1 = boxAt(12, 3, 2, M.ivory, cx + 21, 0, LEAD_Z + 18.2);
      const plus2 = boxAt(3, 12, 2, M.ivory, cx + 21, 0, LEAD_Z + 18.4);
      g.add(plus1, plus2);
      break;
    }
    case "outlet": {
      leads(g, L, pad);
      g.add(boxAt(44, 34, 14, M.ivory, cx, 0, LEAD_Z + 4));
      g.add(boxAt(4, 10, 2, M.darker, cx - 8, 0, LEAD_Z + 12));
      g.add(boxAt(4, 10, 2, M.darker, cx + 8, 0, LEAD_Z + 12));
      break;
    }
    case "resistor": {
      leads(g, L, pad);
      const body = cylX(bodyW, 9, (M.dark as THREE.MeshStandardMaterial).clone(), cx, 0, LEAD_Z);
      (body.material as THREE.MeshStandardMaterial).color.setHex(0xc9974a);
      g.add(body);
      // the real color code: two digit bands + a multiplier band + gold tolerance
      const CODE = [0x141414, 0x7b4a12, 0xc62f2f, 0xe8720c, 0xe0c020, 0x1f9d4d, 0x2458c6, 0x8a2be2, 0x8e8e8e, 0xf2f2f2];
      const bandMats = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4 }));
      g.add(cylX(3.6, 9.6, bandMats[0], cx - 17, 0, LEAD_Z));
      g.add(cylX(3.6, 9.6, bandMats[1], cx - 9, 0, LEAD_Z));
      g.add(cylX(3.6, 9.6, bandMats[2], cx - 1, 0, LEAD_Z));
      g.add(cylX(3.6, 9.6, M.gold, cx + 14, 0, LEAD_Z));
      let lastR = -1;
      update = (p2) => {
        heatTint(body.material as THREE.MeshStandardMaterial, 0xc9974a, p2.temp);
        if (p2.resistance !== lastR) {
          lastR = p2.resistance;
          const R = Math.max(1, p2.resistance);
          const exp = Math.floor(Math.log10(R));
          const sig = Math.round(R / Math.pow(10, exp - 1));
          bandMats[0].color.setHex(CODE[Math.floor(sig / 10) % 10]);
          bandMats[1].color.setHex(CODE[sig % 10]);
          bandMats[2].color.setHex(CODE[Math.max(0, Math.min(9, exp - 1))]);
        }
      };
      break;
    }
    case "bulb": {
      leads(g, L, pad);
      const glass = mesh(GEO.sphere, M.glass.clone());
      glass.scale.setScalar(16);
      glass.position.set(cx, 0, LEAD_Z + 16);
      // the real innards: two support posts and a coiled tungsten filament
      const filMat = new THREE.MeshStandardMaterial({ color: 0x7a7166, emissive: 0xffc23d, emissiveIntensity: 0 });
      g.add(cylZ(0.7, 9, M.steel, cx - 5, 0, LEAD_Z + 8.5));
      g.add(cylZ(0.7, 9, M.steel, cx + 5, 0, LEAD_Z + 8.5));
      const helixPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const th = t * Math.PI * 2 * 7;
        helixPts.push(
          new THREE.Vector3(cx - 5 + 10 * t, 1.7 * Math.cos(th), LEAD_Z + 13 + 1.7 * Math.sin(th))
        );
      }
      const fil = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 90, 0.5, 6),
        filMat
      );
      g.add(fil);
      const base = cylZ(8, 10, M.steel, cx, 0, LEAD_Z + 2);
      const glow = glowSprite(0xffd83d, 90);
      glow.position.set(cx, 0, LEAD_Z + 18);
      g.add(glass, base, glow);
      update = (p2) => {
        const watts = Math.abs(p2.current * p2.volts);
        const b = Math.min(1, Math.sqrt(watts / 40));
        filMat.emissiveIntensity = b * 3;
        (glow.material as THREE.SpriteMaterial).opacity = b * 0.85;
        (glass.material as THREE.MeshPhysicalMaterial).opacity = 0.28 + b * 0.2;
      };
      break;
    }
    case "led":
    case "diode": {
      leads(g, L, pad);
      const tint = p.type === "led" ? new THREE.Color(LED_COLORS[p.color] ?? "#ff5a49") : new THREE.Color(0x94a3b8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, emissive: tint, emissiveIntensity: 0 });
      const body = cylX(16, 7.5, bodyMat, cx, 0, LEAD_Z);
      const band = cylX(3, 8, M.steel, cx + 10, 0, LEAD_Z);
      const glow = glowSprite(tint.getHex(), 60);
      glow.position.set(cx, 0, LEAD_Z + 4);
      g.add(body, band, glow);
      update = (p2) => {
        const on = p2.ledOn && Math.abs(p2.current) > 0.001;
        const amt = on ? Math.min(1, 0.35 + Math.abs(p2.current) / 0.4) : 0;
        const c = p2.type === "led" ? new THREE.Color(LED_COLORS[p2.color] ?? "#ff5a49") : new THREE.Color(0x94a3b8);
        bodyMat.emissive.copy(c);
        (glow.material as THREE.SpriteMaterial).color.copy(c);
        bodyMat.emissiveIntensity = amt * (p2.type === "led" ? 1.6 : 0.5);
        (glow.material as THREE.SpriteMaterial).opacity = p2.type === "led" ? amt * 0.7 : 0;
      };
      break;
    }
    case "segment": {
      const barMat = new THREE.MeshStandardMaterial({ color: 0x2a1512, emissive: 0xff4b2e, emissiveIntensity: 0 });
      const bar = boxAt(bodyW, 13, 8, barMat, cx, 0, LEAD_Z);
      const glow = glowSprite(0xff5a35, 95);
      glow.position.set(cx, 0, LEAD_Z + 6);
      leads(g, L, pad);
      g.add(bar, glow);
      update = (p2) => {
        const on = Math.abs(p2.current) > 0.003;
        const amt = on ? Math.min(1, Math.abs(p2.current) / 0.06) : 0;
        barMat.emissiveIntensity = amt * 2;
        barMat.color.setHex(on ? 0xff4b2e : 0x2a1512);
        (glow.material as THREE.SpriteMaterial).opacity = amt * 0.6;
      };
      break;
    }
    case "switch":
    case "relay": {
      leads(g, L, pad);
      g.add(cylZ(4, 6, M.steel, cx - 21, 0, LEAD_Z - 2));
      g.add(cylZ(4, 6, M.steel, cx + 21, 0, LEAD_Z - 2));
      const lever = cylX(46, 3, M.steel, 23, 0, 0);
      const pivot = new THREE.Group();
      pivot.position.set(cx - 21, 0, LEAD_Z + 3);
      pivot.add(lever);
      g.add(pivot);
      if (p.type === "relay") {
        const capMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24 });
        g.add(boxAt(16, 10, 6, capMat, cx, 0, 2.5));
        update = (p2) => {
          capMat.color.set(CHANNEL_COLORS[p2.channel] ?? "#fbbf24");
          pivot.rotation.y = p2.engaged ? 0 : -0.5;
        };
      } else {
        update = (p2) => {
          pivot.rotation.y = p2.closed ? 0 : -0.5;
        };
      }
      break;
    }
    case "button": {
      leads(g, L, pad);
      g.add(boxAt(30, 22, 8, M.dark, cx, 0, LEAD_Z));
      const capMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
      const cap = boxAt(24, 18, 10, capMat, cx, 0, LEAD_Z + 12);
      const letter = textSprite((p.key || "?").toUpperCase(), "#e2e8f0", 14);
      letter.position.set(cx, 0, LEAD_Z + 24);
      g.add(cap, letter);
      let lastKey = p.key;
      update = (p2) => {
        cap.position.z = LEAD_Z + (p2.pressed ? 8 : 12);
        capMat.color.setHex(p2.pressed ? 0xf59e0b : 0x334155);
        if (p2.key !== lastKey) {
          lastKey = p2.key;
          const tex = textTexture((p2.key || "?").toUpperCase(), "#e2e8f0");
          (letter.material as THREE.SpriteMaterial).map = tex;
          (letter.material as THREE.SpriteMaterial).needsUpdate = true;
        }
      };
      break;
    }
    case "blinker": {
      leads(g, L, pad);
      g.add(boxAt(bodyW, 24, 14, M.dark, cx, 0, LEAD_Z));
      const dotMat = new THREE.MeshStandardMaterial({ color: 0x475569, emissive: 0xfbbf24, emissiveIntensity: 0 });
      g.add(cylZ(3.5, 3, dotMat, cx + 14, -6, LEAD_Z + 8));
      update = (p2) => {
        const on = (p2.phase * p2.hz) % 1 < 0.5;
        dotMat.emissiveIntensity = on ? 1.6 : 0;
      };
      break;
    }
    case "fuse": {
      leads(g, L, pad);
      const tube = cylX(bodyW, 9, M.glass.clone(), cx, 0, LEAD_Z);
      const wireMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.25 });
      const thin = cylX(bodyW - 8, 1.2, wireMat, cx, 0, LEAD_Z);
      g.add(tube, thin, cylX(5, 9.6, M.steel, pad + 2, 0, LEAD_Z), cylX(5, 9.6, M.steel, L - pad - 2, 0, LEAD_Z));
      update = (p2) => {
        thin.visible = !p2.blown;
        (tube.material as THREE.MeshPhysicalMaterial).color.setHex(p2.blown ? 0x57534e : 0xcfe0ee);
      };
      break;
    }
    case "capacitor": {
      g.add(cylX(cx - 7, 2.2, M.copper, (cx - 7) / 2, 0, LEAD_Z));
      g.add(cylX(cx - 7, 2.2, M.copper, L - (cx - 7) / 2, 0, LEAD_Z));
      g.add(cylZ(2.2, LEAD_Z, M.copper, 0, 0, LEAD_Z / 2));
      g.add(cylZ(2.2, LEAD_Z, M.copper, L, 0, LEAD_Z / 2));
      const pA = boxAt(3.5, 26, 26, M.steel.clone(), cx - 5, 0, LEAD_Z + 8);
      const pB = boxAt(3.5, 26, 26, M.steel.clone(), cx + 5, 0, LEAD_Z + 8);
      g.add(pA, pB);
      update = (p2) => {
        const f = Math.min(1, Math.abs(p2.capV) / 20);
        (pA.material as THREE.MeshStandardMaterial).emissive.setHex(0xfbbf24);
        (pB.material as THREE.MeshStandardMaterial).emissive.setHex(0xfbbf24);
        (pA.material as THREE.MeshStandardMaterial).emissiveIntensity = p2.capV > 0.3 ? f : 0;
        (pB.material as THREE.MeshStandardMaterial).emissiveIntensity = p2.capV < -0.3 ? f : 0;
      };
      break;
    }
    case "inductor":
    case "coil": {
      leads(g, L, pad);
      const mat = (p.type === "coil" ? M.copper : M.steel).clone() as THREE.MeshStandardMaterial;
      for (let k = 0; k < 5; k++) {
        const ring = mesh(GEO.torus, mat);
        ring.scale.setScalar(9);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(pad + (bodyW / 5) * (k + 0.5), 0, LEAD_Z + 4);
        g.add(ring);
      }
      if (p.type === "coil") {
        const badge = textSprite(String(p.channel), CHANNEL_COLORS[p.channel] ?? "#fbbf24", 13);
        badge.position.set(cx, 16, LEAD_Z + 12);
        g.add(badge);
        let lastCh = p.channel;
        update = (p2) => {
          const on = Math.abs(p2.current) > 0.02;
          mat.emissive.set(CHANNEL_COLORS[p2.channel] ?? "#fbbf24");
          mat.emissiveIntensity = on ? 0.9 : 0;
          if (p2.channel !== lastCh) {
            lastCh = p2.channel;
            (badge.material as THREE.SpriteMaterial).map = textTexture(String(p2.channel), CHANNEL_COLORS[p2.channel] ?? "#fbbf24");
            (badge.material as THREE.SpriteMaterial).needsUpdate = true;
          }
        };
      }
      break;
    }
    case "speaker": {
      leads(g, L, pad);
      g.add(boxAt(14, 24, 24, M.dark, cx - 12, 0, LEAD_Z + 6));
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(4, 15, 14, 24).rotateZ(Math.PI / 2), M.darker);
      cone.castShadow = true;
      cone.position.set(cx + 6, 0, LEAD_Z + 6);
      g.add(cone);
      update = () => {};
      break;
    }
    case "buzzer": {
      leads(g, L, pad);
      g.add(cylZ(15, 12, M.darker, cx, 0, 6));
      g.add(cylZ(3, 13, M.dark, cx, 0, 6.6));
      break;
    }
    case "motor": {
      leads(g, L, pad);
      g.add(cylZ(22, 12, M.dark, cx, 0, 6));
      const rotor = new THREE.Group();
      rotor.position.set(cx, 0, 16);
      g.add(rotor);
      const att = new THREE.Group();
      rotor.add(att);
      let builtAtt = "";
      const crate = new THREE.Group();
      const crateBox = boxAt(22, 18, 18, new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 }), 0, 0, 9);
      crate.add(crateBox);
      const ropeMat = new THREE.LineBasicMaterial({ color: 0xa8a29e });
      const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const rope = new THREE.Line(ropeGeo, ropeMat);
      g.add(crate, rope);
      const rebuildAtt = (kind: string) => {
        att.clear();
        builtAtt = kind;
        if (kind === "fan")
          for (const a of [0, 120, 240]) {
            const b = boxAt(18, 6, 1.6, M.blue, 11, 0, 0);
            const holder = new THREE.Group();
            holder.rotation.z = (a * Math.PI) / 180;
            holder.add(b);
            att.add(holder);
          }
        else if (kind === "propeller")
          for (const a of [0, 180]) {
            const b = boxAt(26, 4.5, 1.4, M.steel, 15, 0, 0);
            const holder = new THREE.Group();
            holder.rotation.z = (a * Math.PI) / 180;
            holder.add(b);
            att.add(holder);
          }
        else if (kind === "wheel") {
          const tire = mesh(GEO.torus, M.darker);
          tire.scale.setScalar(19);
          att.add(tire);
          for (const a of [0, 60, 120]) {
            const s = boxAt(34, 2.5, 2.5, M.steel, 0, 0, 0);
            const holder = new THREE.Group();
            holder.rotation.z = (a * Math.PI) / 180;
            holder.add(s);
            att.add(holder);
          }
        } else {
          att.add(cylZ(9, 8, M.steel, 0, 0, 0));
        }
      };
      rebuildAtt(p.attachment);
      update = (p2, L2) => {
        if (p2.attachment !== builtAtt) rebuildAtt(p2.attachment);
        rotor.rotation.z = (-p2.spin * Math.PI) / 180;
        const isWinch = p2.attachment === "winch";
        crate.visible = isWinch;
        rope.visible = isWinch;
        if (isWinch) {
          // the crate hangs in WORLD space below the motor, whatever the part's angle
          const hang = 26 + (1 - p2.lift) * 64;
          const worldDown = new THREE.Vector3(0, -1, 0); // world -y is screen "down"
          const local = g.worldToLocal(g.localToWorld(new THREE.Vector3(L2 / 2, 0, 0)).add(worldDown.multiplyScalar(hang)));
          crate.position.set(local.x, local.y, 0);
          ropeGeo.setFromPoints([new THREE.Vector3(L2 / 2, 0, 14), new THREE.Vector3(local.x, local.y, 10)]);
        }
      };
      break;
    }
    case "lightsensor": {
      leads(g, L, pad);
      const face = new THREE.MeshStandardMaterial({ color: 0x292524, emissive: 0xfde047, emissiveIntensity: 0 });
      g.add(cylZ(13, 8, M.dark, cx, 0, 5));
      g.add(cylZ(10, 2, face, cx, 0, 10));
      update = (p2) => (face.emissiveIntensity = p2.sense * 1.2);
      break;
    }
    case "heatsensor": {
      leads(g, L, pad);
      const tip = new THREE.MeshStandardMaterial({ color: 0x57534e, emissive: 0xf87171, emissiveIntensity: 0 });
      g.add(cylZ(6, 22, M.dark, cx, 0, 11));
      g.add(mesh(GEO.sphere, tip));
      const tipM = g.children[g.children.length - 1] as THREE.Mesh;
      tipM.scale.setScalar(6.5);
      tipM.position.set(cx, 0, 26);
      update = (p2) => (tip.emissiveIntensity = p2.sense * 1.4);
      break;
    }
    case "solar": {
      leads(g, L, pad);
      const face = new THREE.MeshStandardMaterial({ color: 0x0c4a6e, roughness: 0.35, metalness: 0.4, emissive: 0x7dd3fc, emissiveIntensity: 0 });
      g.add(boxAt(60, 34, 4, M.dark, cx, 0, 4));
      g.add(boxAt(56, 30, 2, face, cx, 0, 7));
      update = (p2) => (face.emissiveIntensity = p2.sense * 0.5);
      break;
    }
    case "memory": {
      // a little register box: stores one number, shows it on a lit screen
      leads(g, L, pad);
      const caseMat = new THREE.MeshStandardMaterial({ color: 0x4c3f8f, roughness: 0.5 });
      g.add(boxAt(52, 34, 14, caseMat, cx, 0, LEAD_Z + 2));
      g.add(boxAt(56, 38, 5, new THREE.MeshStandardMaterial({ color: 0x241d47, roughness: 0.7 }), cx, 0, LEAD_Z - 2));
      const lcd = document.createElement("canvas");
      lcd.width = 192;
      lcd.height = 96;
      const lctx = lcd.getContext("2d")!;
      const lcdTex = new THREE.CanvasTexture(lcd);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(38, 19),
        new THREE.MeshStandardMaterial({ map: lcdTex, roughness: 0.3, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 0.7 })
      );
      screen.position.set(cx, 2, LEAD_Z + 9.3);
      g.add(screen);
      // a tiny lamp that lights while it feels current (the moment it counts)
      const pulse = new THREE.MeshStandardMaterial({ color: 0x1d3b2a, emissive: 0x34d399, emissiveIntensity: 0 });
      g.add(boxAt(5, 5, 3, pulse, cx + 20, -12, LEAD_Z + 9.5));
      let lastMem = -1;
      const drawMem = (n: number) => {
        lctx.fillStyle = "#101726";
        lctx.fillRect(0, 0, 192, 96);
        lctx.fillStyle = "#7ce7ff";
        lctx.font = "700 60px 'IBM Plex Mono', ui-monospace, monospace";
        lctx.textAlign = "center";
        lctx.textBaseline = "middle";
        lctx.fillText(String(n), 96, 52);
        lcdTex.needsUpdate = true;
      };
      drawMem(0);
      update = (p2) => {
        const n = Math.round(p2.mem);
        if (n !== lastMem) {
          lastMem = n;
          drawMem(n);
        }
        pulse.emissiveIntensity = p2.memOn ? 1.6 : 0;
      };
      break;
    }
    case "ammeter":
    case "voltmeter": {
      // a real handheld multimeter lying on the bench
      leads(g, L, pad);
      const isAmp = p.type === "ammeter";
      const caseMat = new THREE.MeshStandardMaterial({
        color: isAmp ? 0xd9a019 : 0xb03434, // classic yellow tester / red tester
        roughness: 0.55,
      });
      g.add(boxAt(50, 38, 16, caseMat, cx, 0, LEAD_Z + 3));
      g.add(boxAt(54, 42, 6, new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7 }), cx, 0, LEAD_Z - 2));
      // live LCD
      const lcd = document.createElement("canvas");
      lcd.width = 192;
      lcd.height = 96;
      const lctx = lcd.getContext("2d")!;
      const lcdTex = new THREE.CanvasTexture(lcd);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 18),
        new THREE.MeshStandardMaterial({ map: lcdTex, roughness: 0.3, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 0.55 })
      );
      screen.position.set(cx - 2, 6, LEAD_Z + 11.2);
      g.add(screen);
      // rotary dial + probe posts
      g.add(cylZ(7, 4, M.darker, cx - 2, -11, LEAD_Z + 11));
      g.add(boxAt(2.4, 10, 4.4, M.steel, cx - 2, -11, LEAD_Z + 12));
      g.add(cylZ(2.6, 5, new THREE.MeshStandardMaterial({ color: 0xc03636 }), cx + 18, -12, LEAD_Z + 11));
      g.add(cylZ(2.6, 5, new THREE.MeshStandardMaterial({ color: 0x16181d }), cx + 18, -4, LEAD_Z + 11));
      let lastTxt = "";
      const drawLcd = (txt: string) => {
        lctx.fillStyle = "#b9c9a6"; // classic LCD green-grey
        lctx.fillRect(0, 0, 192, 96);
        lctx.fillStyle = "#20261a";
        lctx.font = "700 52px 'IBM Plex Mono', ui-monospace, monospace";
        lctx.textAlign = "right";
        lctx.textBaseline = "middle";
        lctx.fillText(txt, 182, 52);
        lcdTex.needsUpdate = true;
      };
      drawLcd(isAmp ? "0 A" : "0 V");
      update = (p2) => {
        const txt = isAmp
          ? Math.abs(p2.current) < 0.0005
            ? "0 A"
            : Math.abs(p2.current) < 0.0995
              ? `${(Math.abs(p2.current) * 1000).toFixed(0)}mA`
              : `${Math.abs(p2.current).toFixed(Math.abs(p2.current) >= 10 ? 1 : 2)}A`
          : Math.abs(p2.volts) < 0.0005
            ? "0 V"
            : Math.abs(p2.volts) < 0.0995
              ? `${(Math.abs(p2.volts) * 1000).toFixed(0)}mV`
              : `${Math.abs(p2.volts).toFixed(Math.abs(p2.volts) >= 10 ? 1 : 2)}V`;
        if (txt !== lastTxt) {
          lastTxt = txt;
          drawLcd(txt);
        }
      };
      break;
    }
    case "heater": {
      leads(g, L, pad);
      g.add(boxAt(bodyW, 36, 26, M.darker, cx, 0, LEAD_Z + 5));
      const coilMat = new THREE.MeshStandardMaterial({ color: 0x525252, emissive: 0xff3d00, emissiveIntensity: 0 });
      for (let k = 0; k < 4; k++) {
        const ring = mesh(GEO.torus, coilMat);
        ring.scale.setScalar(8);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(pad + 12 + k * 19, 0, LEAD_Z + 20);
        g.add(ring);
      }
      update = (p2) => {
        const f = Math.max(0, Math.min(1, (p2.temp - 50) / 350));
        coilMat.emissiveIntensity = f * 2.2;
      };
      break;
    }
    case "hairdryer": {
      leads(g, L, pad);
      g.add(cylX(54, 13, M.blue, cx - 5, 0, LEAD_Z + 8));
      g.add(cylX(12, 7, M.panel, cx + 28, 0, LEAD_Z + 8));
      g.add(boxAt(10, 12, 20, M.panel, cx - 12, 0, LEAD_Z - 4));
      break;
    }
    case "coin": {
      g.add(cylX(L, 2.2, M.copper, cx, 0, LEAD_Z));
      g.add(cylZ(15, 3, M.gold, cx, 0, LEAD_Z + 2));
      break;
    }
    case "eraser": {
      leads(g, L, pad);
      g.add(boxAt(bodyW, 22, 14, M.pink, cx, 0, LEAD_Z));
      break;
    }
    case "hand": {
      leads(g, L, pad);
      g.add(boxAt(26, 22, 8, new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }), cx, 0, LEAD_Z));
      for (let f = 0; f < 4; f++) g.add(boxAt(5, 16, 6, new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }), cx - 9 + f * 6, 14, LEAD_Z));
      break;
    }
    case "calculator": {
      leads(g, L, pad);
      const { deviceUpdate } = buildCalculatorFace(g, p, cx);
      update = deviceUpdate;
      break;
    }
    case "voicebox": {
      leads(g, L, pad);
      const { deviceUpdate } = buildVoiceFace(g, p, cx);
      update = deviceUpdate;
      break;
    }
  }

  return { group: g, builtLen: L, builtType: p.type, update, hit };
}

// ——— the calculator as a physical device: canvas-textured face + real keys ———

function drawCalcFace(ctx: CanvasRenderingContext2D, p: Part, powered: boolean) {
  const W = 512;
  const H = 420;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#1c2333";
  ctx.fillRect(0, 0, W, H);
  // screen
  ctx.fillStyle = powered ? "#0a1f10" : "#101418";
  ctx.fillRect(24, 22, W - 48, 84);
  if (powered) {
    const chars = p.display.slice(0, 9).split("");
    const px = 10;
    const cw = 4 * px;
    const x0 = W - 40 - chars.length * cw;
    ctx.fillStyle = "#4ade80";
    chars.forEach((ch, ci) => {
      const rows = PIXEL_FONT[ch];
      if (!rows) return;
      rows.forEach((bits, r) => {
        for (let c = 0; c < 3; c++) {
          if (bits & (1 << (2 - c))) ctx.fillRect(x0 + ci * cw + c * px, 34 + r * px, px - 2, px - 2);
        }
      });
    });
  }
  // keys
  CALC_KEYPAD.forEach((row, r) =>
    row.forEach((k, c) => {
      const isOp = c === 3 || k === "=" || k === "C";
      const x = 24 + c * 118;
      const y = 124 + r * 72;
      ctx.fillStyle = isOp ? "#3b2f14" : "#283348";
      ctx.strokeStyle = isOp ? "#8a6a1e" : "#3e4d69";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, 106, 58, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = powered ? (isOp ? "#fbbf24" : "#cbd5e1") : "#64748b";
      ctx.font = "700 30px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(k, x + 53, y + 30);
    })
  );
}


function buildCalculatorFace(g: THREE.Group, p: Part, cx: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 420;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  // slab: 140 wide × 116 deep, face on top
  g.add(boxAt(146, 122, 16, M.darker, cx, -10, 8));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 116),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })
  );
  face.position.set(cx, -10, 16.2);
  g.add(face);
  // invisible key hit boxes, matching the SVG key layout for pressCalcKey
  CALC_KEYPAD.forEach((row, r) =>
    row.forEach((k, c) => {
      const kr = calcKeyRect(cx, r, c);
      const hb = new THREE.Mesh(GEO.unitBox, new THREE.MeshBasicMaterial({ visible: false }));
      hb.scale.set(29, 13, 22);
      // map SVG local (x right, y down from axis) to 3D local (x right, y = -svgY)
      hb.position.set(kr.x + kr.w / 2, -(kr.y + kr.h / 2), 18);
      hb.userData.calcKey = { key: k };
      g.add(hb);
    })
  );
  // ——— the inside, as ACTUAL 3D switches: 135 pixel switches, 24 register
  // switches, and the 216-switch adding unit — levers physically flip as
  // the numbers change ———
  const slots: { x: number; y: number }[] = [];
  for (let ci = 0; ci < 9; ci++)
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) slots.push({ x: cx - 214 + ci * 48 + c * 14, y: -(96 + r * 14) });
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 12; i++) slots.push({ x: cx - 214 + i * 37, y: -(196 + row * 26) });
  for (let i = 0; i < 12; i++)
    for (let k = 0; k < 18; k++)
      slots.push({ x: cx - 214 + i * 37 + (k % 3) * 11.5, y: -(262 + Math.floor(k / 3) * 14) });

  const contactGeo = new THREE.SphereGeometry(1.3, 8, 6);
  const contacts = new THREE.InstancedMesh(contactGeo, M.steel, slots.length * 2);
  const tmpM = new THREE.Matrix4();
  slots.forEach((sl, i) => {
    tmpM.makeTranslation(sl.x, sl.y, 1.6);
    contacts.setMatrixAt(i * 2, tmpM);
    tmpM.makeTranslation(sl.x + 8, sl.y, 1.6);
    contacts.setMatrixAt(i * 2 + 1, tmpM);
  });
  contacts.instanceMatrix.needsUpdate = true;
  g.add(contacts);

  const leverGeo = new THREE.BoxGeometry(8, 1.4, 1.1);
  leverGeo.translate(4, 0, 0); // pivot at one end
  const levers = new THREE.InstancedMesh(
    leverGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4 }),
    slots.length
  );
  g.add(levers);
  const litCol = new THREE.Color(0xffc23d);
  const offCol = new THREE.Color(0x46536b);
  const eul = new THREE.Euler();
  const quat2 = new THREE.Quaternion();
  const one2 = new THREE.Vector3(1, 1, 1);
  const setLever = (i: number, on: boolean) => {
    eul.set(0, on ? 0 : -0.55, 0);
    quat2.setFromEuler(eul);
    tmpM.compose(new THREE.Vector3(slots[i].x, slots[i].y, 1.6), quat2, one2);
    levers.setMatrixAt(i, tmpM);
    levers.setColorAt(i, on ? litCol : offCol);
  };

  // labels around the switch field
  const title = textSprite("INSIDE — every switch is real. Watch them flip as you type.", "#cbd5e1", 12);
  title.position.set(cx, -76, 6);
  g.add(title);
  const PLACES = [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1];
  PLACES.forEach((pv, i) => {
    const sp = textSprite(String(pv), "#7d8aa3", 7);
    sp.position.set(cx - 214 + i * 37 + 4, -184, 5);
    g.add(sp);
  });
  const regLabel = textSprite("screen (top) and memory (bottom), in binary", "#7d8aa3", 8);
  regLabel.position.set(cx, -238, 5);
  g.add(regLabel);
  const adderLabel = textSprite("the adding unit: one 18-switch adder per place, carry rippling right to left", "#7d8aa3", 8);
  adderLabel.position.set(cx, -352, 5);
  g.add(adderLabel);
  const sumSprite = { current: null as THREE.Sprite | null, text: "" };

  const applyStates = (p2: Part, powered: boolean) => {
    let idx = 0;
    const chars = p2.display.slice(0, 9).split("");
    for (let ci = 0; ci < 9; ci++) {
      const rows = PIXEL_FONT[chars[ci]] ?? [0, 0, 0, 0, 0];
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) setLever(idx++, powered && !!(rows[r] & (1 << (2 - c))));
    }
    const screenN = Math.round(Math.abs(parseFloat(p2.display) || 0)) & 0xfff;
    const accN = Math.round(Math.abs(p2.calcAcc)) & 0xfff;
    const bitsA: boolean[] = [];
    const bitsB: boolean[] = [];
    for (let i = 11; i >= 0; i--) {
      bitsA.push(!!(screenN & (1 << i)));
      bitsB.push(!!(accN & (1 << i)));
    }
    for (let i = 0; i < 12; i++) setLever(idx++, powered && bitsA[i]);
    for (let i = 0; i < 12; i++) setLever(idx++, powered && bitsB[i]);
    let carry = false;
    const cols: boolean[][] = [];
    for (let i = 11; i >= 0; i--) {
      const a = bitsA[i];
      const b = bitsB[i];
      const cIn: boolean = carry;
      cols.unshift([a, !b, !cIn, !a, b, !cIn, !a, !b, cIn, a, b, cIn, a, b, a, cIn, b, cIn]);
      carry = (a && b) || (a && cIn) || (b && cIn);
    }
    for (let i = 0; i < 12; i++) for (let k = 0; k < 18; k++) setLever(idx++, powered && cols[i][k]);
    levers.instanceMatrix.needsUpdate = true;
    if (levers.instanceColor) levers.instanceColor.needsUpdate = true;
    // the live sum line
    const txt = powered ? `screen + memory = ${screenN} + ${accN} = ${(screenN + accN) & 0xfff}` : "no power — every switch open";
    if (txt !== sumSprite.text) {
      sumSprite.text = txt;
      if (sumSprite.current) g.remove(sumSprite.current);
      sumSprite.current = textSprite(txt, powered ? "#ffc23d" : "#5b6476", 9);
      sumSprite.current.position.set(cx, -368, 5);
      g.add(sumSprite.current);
    }
  };
  applyStates(p, false);

  let lastFace = "";
  let lastGuts = "";
  const deviceUpdate = (p2: Part) => {
    const powered = Math.abs(p2.current) > 0.01;
    const sig = `${p2.display}|${powered}`;
    if (sig !== lastFace) {
      lastFace = sig;
      drawCalcFace(ctx, p2, powered);
      tex.needsUpdate = true;
    }
    const gsig = `${p2.display}|${p2.calcAcc}|${p2.calcOp}|${powered}`;
    if (gsig !== lastGuts) {
      lastGuts = gsig;
      applyStates(p2, powered);
    }
  };
  return { deviceUpdate };
}

function buildVoiceFace(g: THREE.Group, p: Part, cx: number) {
  g.add(boxAt(70, 36, 18, M.dark, cx, 0, 9));
  for (const dx of [-22, -14, -6, 2, 10]) g.add(boxAt(3, 22, 1.5, M.darker, cx + dx, 0, 18.2));
  const winMat = new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0xf59e0b, emissiveIntensity: 0 });
  g.add(boxAt(14, 22, 2, winMat, cx + 22, 0, 18.2));
  const letter = textSprite("·", "#1c1400", 15);
  letter.position.set(cx + 22, 0, 24);
  g.add(letter);
  let last = "";
  const deviceUpdate = (p2: Part) => {
    const speaking = p2.playing && Math.abs(p2.current) > 0.02;
    const idx = Math.floor(p2.playPos / LETTER_SECONDS);
    const ch = speaking ? (p2.text[idx] ?? "").toUpperCase() : "";
    winMat.emissiveIntensity = speaking ? 1.2 : 0;
    if (ch !== last) {
      last = ch;
      (letter.material as THREE.SpriteMaterial).map = textTexture(ch || "·", "#1c1400");
      (letter.material as THREE.SpriteMaterial).needsUpdate = true;
      letter.visible = !!ch;
    }
  };
  return { deviceUpdate };
}
