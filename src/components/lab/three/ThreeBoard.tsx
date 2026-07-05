"use client";

/* The 3D board. World coordinates match the logic layer exactly:
   world (x, y) maps to three.js (x, -y), z is height above the board.
   The camera orbits a target on the board plane; all picking raycasts
   either hit part/vertex/key meshes or fall through to the plane. */

import { MutableRefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CATALOG, Circuit, Part, Vertex } from "../../../lib/sim";
import { shortA, shortV } from "../../../lib/fmt";
import { BODY_W } from "../Glyph";
import { buildPart, glowTexture, PartHandle, textTexture } from "./parts3d";

export interface CamState {
  tx: number; // camera target on the board, world coords
  ty: number;
  dist: number;
  azim: number; // radians around the up axis
  polar: number; // radians down from vertical: 0 = straight down
}

export interface BoardParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  color: string;
  kind: "shard" | "spark" | "smoke";
}

export type Pick =
  | { kind: "part"; partId: string }
  | { kind: "vertex"; vertexId: string }
  | { kind: "handle" }
  | { kind: "calckey"; partId: string; key: string }
  | { kind: "label"; text: string }
  | { kind: "gizmo"; axis: "x" | "z" | "xy" }
  | { kind: "bg"; x: number; y: number };

export interface BoardApi {
  pick: (clientX: number, clientY: number) => Pick;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  project: (x: number, y: number) => { x: number; y: number };
  snapshot: () => string; // the last rendered frame, as a data URL
}

export interface UIState {
  selectedId: string | null;
  selectedIds: string[]; // marquee multi-selection
  snapHintId: string | null;
  handle: { x: number; y: number } | null;
  degrees: Map<string, number>;
  electronView: boolean; // dots show real electron drift instead of + → −
  showAmps: boolean; // show live current readouts on parts
  showLabels: boolean; // show part info labels (Ω, V, names of magnets, …)
}

interface Props {
  circuitRef: MutableRefObject<Circuit>;
  particlesRef: MutableRefObject<BoardParticle[]>;
  camRef: MutableRefObject<CamState>;
  uiRef: MutableRefObject<UIState>;
  apiRef: MutableRefObject<BoardApi | null>;
  sizeRef: MutableRefObject<{ w: number; h: number }>;
}

const FOV = 40;

// the workbench is a finite board sitting on a wooden table
export const BENCH = { cx: 600, cy: 300, w: 5200, h: 3600 };

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(0, 0, 512, 512);
  for (let plank = 0; plank < 4; plank++) {
    const y0 = plank * 128;
    ctx.fillStyle = ["#8f653c", "#835c34", "#93683f", "#7d5731"][plank];
    ctx.fillRect(0, y0, 512, 126);
    for (let i = 0; i < 40; i++) {
      const gy = y0 + 4 + ((i * 37 + plank * 13) % 120);
      ctx.strokeStyle = `rgba(52,34,16,${0.06 + ((i * 7) % 10) / 80})`;
      ctx.lineWidth = 1 + ((i * 3) % 3) * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(170, gy + ((i % 5) - 2) * 3, 340, gy - ((i % 3) - 1) * 4, 512, gy + ((i % 7) - 3) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(30,18,8,0.5)";
    ctx.fillRect(0, y0 + 126, 512, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.anisotropy = 8;
  return tex;
}

// what a part's floating label should say (mirrors the old SVG label layer)
function labelFor(p: Part, showAmps: boolean, showLabels: boolean): { text: string; color: string; big?: boolean } | null {
  if (p.destroyed) return { text: "blew up — remove it", color: "#f87171" };
  if (p.type === "ammeter") return { text: shortA(p.current), color: "#7dd3fc", big: true };
  if (p.type === "voltmeter") return { text: shortV(p.volts), color: "#f0abfc", big: true };
  if (!showAmps && !showLabels) return null;
  let base = "";
  if (p.type === "battery") base = `${p.voltage} V`;
  else if (p.type === "capacitor") base = `${p.capacitance} F · ${shortV(p.capV)}`;
  else if (p.type === "fuse") base = p.blown ? "BLOWN — click to fix" : `max ${p.maxAmps} A`;
  else if (p.type === "button") base = `hold ${(p.key || "?").toUpperCase()}`;
  else if (p.type === "blinker") base = `blinks ${p.hz}×/s`;
  else if (p.type === "speaker") base = p.mode === "note" ? "plays a note" : "pitch = volts";
  else if (p.type === "coil") base = Math.abs(p.current) > 0.02 ? `magnet #${p.channel} ON` : `magnet #${p.channel}`;
  else if (p.type === "relay") base = `obeys #${p.channel}${p.normallyClosed ? " (flipped)" : ""}`;
  else if (p.type === "lightsensor") base = `${Math.round(p.sense * 100)}% light`;
  else if (p.type === "heatsensor") base = `${Math.round(p.sense * 100)}% heat`;
  else if (p.type === "solar") base = `making ${shortV(p.voltage)}`;
  else if (p.type === "outlet") base = "120 V";
  else if (p.type === "usbc") base = "5 V";
  else if (p.type === "chip") {
    if (Math.abs(p.current) > 0.01) {
      const driving = [1, 2, 3, 4, 5, 6].filter((ch) => p.chipDrive & (1 << ch));
      base = driving.length ? `running · driving #${driving.join(" #")}` : "running";
    } else base = "no power";
  }
  else if (p.type === "inductor") base = `${p.henries} H`;
  else if (p.type === "voicebox") base = p.playing ? `saying “${p.text}”` : "";
  else if (p.type === "calculator") base = "";
  else if (p.type !== "wire" && p.type !== "switch" && p.type !== "led" && p.type !== "diode")
    base = p.resistance >= 1e6 ? "blocks current" : `${p.resistance} Ω`;
  if (!showLabels) base = "";
  const amps = showAmps && Math.abs(p.current) > 0.0005 && p.type !== "calculator" ? shortA(p.current) : "";
  const text = [base, amps].filter(Boolean).join(" · ");
  if (!text) return null;
  return { text, color: amps && !base ? "#facc15" : "#b7c1d4" };
}

export default function ThreeBoard({ circuitRef, particlesRef, camRef, uiRef, apiRef, sizeRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a101d);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a101d, 8000, 90000);
    // soft studio reflections make every metal surface read as real metal
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 5, 200000);

    // lights — a bright workshop, so nothing hides in shadow
    scene.add(new THREE.AmbientLight(0xd8e2f2, 1.0));
    const key = new THREE.DirectionalLight(0xfff2df, 0.95);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 100;
    key.shadow.camera.far = 3000;
    key.shadow.bias = -0.0005;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x88b7ff, 0.4);
    rim.position.set(-400, 300, 500);
    scene.add(rim);


    // ——— a real workstation: mat on a wooden table, desk lamp, tools ———
    const matSlab = new THREE.Mesh(
      new THREE.BoxGeometry(BENCH.w, BENCH.h, 13),
      new THREE.MeshStandardMaterial({ color: 0x12203a, roughness: 0.95, metalness: 0.04 })
    );
    matSlab.position.set(BENCH.cx, -BENCH.cy, -6.6);
    matSlab.receiveShadow = true;
    scene.add(matSlab);

    const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0x8f7a5e, roughness: 0.78, metalness: 0.02 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(BENCH.w + 1100, BENCH.h + 1000, 70), woodMat);
    tableTop.position.set(BENCH.cx, -BENCH.cy, -13.2 - 35);
    tableTop.receiveShadow = true;
    scene.add(tableTop);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5b3f24, roughness: 0.75 });
    const legX = (BENCH.w + 1100) / 2 - 260;
    const legY = (BENCH.h + 1000) / 2 - 260;
    for (const [sx, sy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(220, 220, 1500), legMat);
      leg.position.set(BENCH.cx + sx * legX, -BENCH.cy + sy * legY, -48.2 - 35 - 750);
      scene.add(leg);
    }
    // ——— the garage: concrete slab, corrugated walls, shop lights, shelving ———
    const FLOOR_Z = -48.2 - 35 - 1500;
    const ROOM = 20000; // half-width of the room — a proper workshop hall
    const WALL_H = 27000000; // functionally infinite — the roof does not exist for you
    const concreteTexture = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const g = c.getContext("2d")!;
      g.fillStyle = "#4a4a4e";
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + Math.random() * 0.05})`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
      g.strokeStyle = "rgba(20,20,22,0.55)"; // expansion joints
      g.lineWidth = 3;
      g.strokeRect(0, 0, 512, 512);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(8, 8);
      t.anisotropy = 8;
      return t;
    };
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
      new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0x9a9aa0, roughness: 0.95 })
    );
    floor.position.z = FLOOR_Z;
    floor.receiveShadow = true;
    scene.add(floor);

    // the roof: you are always inside this building
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
      new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.9, side: THREE.DoubleSide })
    );
    ceiling.position.z = FLOOR_Z + WALL_H;
    scene.add(ceiling);

    const corrugatedTexture = () => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 64;
      const g = c.getContext("2d")!;
      for (let x = 0; x < 256; x++) {
        const v = 0.5 + 0.5 * Math.sin((x / 16) * Math.PI * 2);
        const b = 52 + v * 26;
        g.fillStyle = `rgb(${b},${b + 3},${b + 8})`;
        g.fillRect(x, 0, 1, 64);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(26, 1);
      return t;
    };
    const wallMat = new THREE.MeshStandardMaterial({
      map: corrugatedTexture(),
      color: 0xb9c2cc,
      roughness: 0.7,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    const mkWall = (x: number, y: number, rotZ: number) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, WALL_H), wallMat);
      wall.position.set(x, y, FLOOR_Z + WALL_H / 2);
      wall.rotation.x = Math.PI / 2;
      wall.rotation.y = rotZ;
      scene.add(wall);
    };
    mkWall(0, ROOM, 0); // back wall
    mkWall(0, -ROOM, Math.PI); // front wall
    mkWall(-ROOM, 0, Math.PI / 2); // left
    mkWall(ROOM, 0, -Math.PI / 2); // right

    // steel I-beam columns
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x3c434c, roughness: 0.5, metalness: 0.6 });
    for (const [bx, by] of [
      [-ROOM + 200, ROOM - 200],
      [ROOM - 200, ROOM - 200],
      [-ROOM + 200, -ROOM + 200],
      [ROOM - 200, -ROOM + 200],
      [0, ROOM - 200],
      [-ROOM + 200, 0],
      [ROOM - 200, 0],
    ]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(260, 260, WALL_H), beamMat);
      col.position.set(bx, by, FLOOR_Z + WALL_H / 2);
      scene.add(col);
    }

    // a roll-up garage door on the back wall
    {
      const door = new THREE.Mesh(
        new THREE.PlaneGeometry(5200, 4400),
        new THREE.MeshStandardMaterial({ color: 0x7d8894, roughness: 0.55, metalness: 0.45 })
      );
      door.position.set(3400, ROOM - 30, FLOOR_Z + 2200);
      door.rotation.x = Math.PI / 2;
      door.rotation.y = Math.PI;
      scene.add(door);
      const slatM = new THREE.MeshStandardMaterial({ color: 0x5d6874, roughness: 0.6 });
      for (let i = 1; i < 10; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(5200, 26, 30), slatM);
        slat.position.set(3400, ROOM - 45, FLOOR_Z + i * 440);
        scene.add(slat);
      }
    }

    // metal shelving rack with cardboard boxes along the back wall
    {
      const rackM = new THREE.MeshStandardMaterial({ color: 0x2f6db3, roughness: 0.5, metalness: 0.4 });
      const shelfM = new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.6, metalness: 0.5 });
      const rackX = -4200,
        rackY = ROOM - 700;
      for (const dx of [-2200, 2200]) {
        for (const dy of [-330, 330]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(120, 120, 4600), rackM);
          post.position.set(rackX + dx, rackY + dy, FLOOR_Z + 2300);
          scene.add(post);
        }
      }
      for (let lvl = 0; lvl < 4; lvl++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(4560, 800, 60), shelfM);
        shelf.position.set(rackX, rackY, FLOOR_Z + 300 + lvl * 1350);
        scene.add(shelf);
      }
    }


    // desk chair pulled up to the front of the bench
    {
      const chairX = 600,
        chairY = 3400;
      const cushionM = new THREE.MeshStandardMaterial({ color: 0x27313d, roughness: 0.85 });
      const chromeM = new THREE.MeshStandardMaterial({ color: 0x5a636e, roughness: 0.35, metalness: 0.8 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(950, 950, 110), cushionM);
      seat.position.set(chairX, -chairY, FLOOR_Z + 820);
      seat.castShadow = true;
      scene.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(900, 110, 1050), cushionM);
      back.position.set(chairX, -chairY - 480, FLOOR_Z + 1450);
      back.rotation.x = -0.12;
      back.castShadow = true;
      scene.add(back);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 760, 12).rotateX(Math.PI / 2), chromeM);
      post.position.set(chairX, -chairY, FLOOR_Z + 400);
      scene.add(post);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(620, 90, 60), chromeM);
        leg.position.set(chairX + Math.cos(a) * 310, -chairY + Math.sin(a) * 310, FLOOR_Z + 60);
        leg.rotation.z = a;
        scene.add(leg);
        const caster = new THREE.Mesh(new THREE.SphereGeometry(70, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5 }));
        caster.position.set(chairX + Math.cos(a) * 590, -chairY + Math.sin(a) * 590, FLOOR_Z + 60);
        scene.add(caster);
      }
    }



    // dynamic collections
    const handles = new Map<string, PartHandle>();
    const labelSprites = new Map<string, { sprite: THREE.Sprite; text: string; color: string }>();
    const vertexMeshes = new Map<string, THREE.Mesh>();
    const vertGeo = new THREE.SphereGeometry(1, 14, 10);
    // silver terminal balls: bright chrome when joined, a faint warm hint
    // on ends still waiting for a connection
    const vertMatOpen = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.95, roughness: 0.3, emissive: 0xff8a3d, emissiveIntensity: 0.22 });
    const vertMatJoined = new THREE.MeshStandardMaterial({ color: 0xe8edf4, metalness: 0.98, roughness: 0.18 });

    // flow dots
    const dotGeo = new THREE.SphereGeometry(2.6, 8, 6);
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xffd83d, emissive: 0xffd83d, emissiveIntensity: 1.4 });
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, 3000);
    dots.count = 0;
    scene.add(dots);

    // explosion shards
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x57534e });
    const shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shardMat, 600);
    shards.count = 0;
    scene.add(shards);
    const sparkMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffc23d,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparkPool: THREE.Sprite[] = [];
    const smokeMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x6b6560, transparent: true, depthWrite: false });
    const smokePool: THREE.Sprite[] = [];

    // heat glow + flames for parts running hot
    const heatFx = new Map<string, { glow: THREE.Sprite; flame: THREE.Sprite; core: THREE.Sprite }>();
    const mkHeat = () => {
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a2e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
      );
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a2e, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
      );
      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
      );
      scene.add(glow, flame, core);
      return { glow, flame, core };
    };

    // selection rings (a pool — marquee can select many parts), snap ring
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    // desk dressing on the wood margins: books, a ruler, a pen cup
    {
      // ruler on the front strip
      const ruler = new THREE.Mesh(
        new THREE.BoxGeometry(900, 92, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8c26a, roughness: 0.6 })
      );
      ruler.position.set(500, 1740, -13.2 + 4);
      ruler.rotation.z = -0.06;
      ruler.castShadow = true;
      scene.add(ruler);
      for (let i = 0; i < 9; i++) {
        const tick = new THREE.Mesh(
          new THREE.BoxGeometry(4, i % 2 ? 26 : 40, 1.6),
          new THREE.MeshStandardMaterial({ color: 0x4a3a1c, roughness: 0.8 })
        );
        tick.position.set(500 - 400 + i * 100, 1740 + 24, -13.2 + 8.5);
        tick.rotation.z = -0.06;
        scene.add(tick);
      }
      // pen cup near the lamp, pencils poking out at lazy angles
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(95, 85, 210, 20, 1, true).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x30363f, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
      );
      cup.position.set(2400, 1760, -13.2 + 105);
      cup.castShadow = true;
      scene.add(cup);
      const penCols = [0xf2c230, 0x3f6dd8, 0xd84a3f, 0x3aa065];
      penCols.forEach((c, i) => {
        const pen = new THREE.Mesh(
          new THREE.CylinderGeometry(13, 13, 320, 8).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })
        );
        const a = (i / penCols.length) * Math.PI * 2;
        pen.position.set(2400 + Math.cos(a) * 40, 1760 + Math.sin(a) * 40, -13.2 + 220);
        pen.rotation.x = Math.cos(a) * 0.22;
        pen.rotation.y = Math.sin(a) * 0.22;
        scene.add(pen);
      });
    }

    // Unity-style move gizmo: red arrow = X, blue arrow = the other bench axis,
    // yellow pad = free move. Drawn on top of everything, shown on the selected part.
    const gizmo = new THREE.Group();
    const mkArrow = (color: number, axis: "x" | "z") => {
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
      const grp = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 90, 10), mat);
      shaft.position.y = 68;
      const head = new THREE.Mesh(new THREE.ConeGeometry(17, 42, 14), mat);
      head.position.y = 134;
      shaft.userData.gizmo = axis;
      head.userData.gizmo = axis;
      shaft.renderOrder = 999;
      head.renderOrder = 999;
      grp.add(shaft, head);
      return grp;
    };
    const gizX = mkArrow(0xe4483c, "x");
    gizX.rotation.z = -Math.PI / 2; // +X
    const gizZ = mkArrow(0x3a7bd5, "z");
    gizZ.rotation.z = Math.PI; // world +y (toward the front of the bench)
    const gizPadMat = new THREE.MeshBasicMaterial({ color: 0xf2c230, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const gizPad = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), gizPadMat);
    gizPad.userData.gizmo = "xy";
    gizPad.renderOrder = 999;
    gizmo.add(gizX, gizZ, gizPad);
    gizmo.position.z = 26;
    gizmo.visible = false;
    scene.add(gizmo);

    // one SQUARE frame around a marquee region (no circles — the user hates circles)
    const regionFrame = new THREE.Group();
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
    const frameEdges: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), frameMat);
      frameEdges.push(m);
      regionFrame.add(m);
    }
    regionFrame.visible = false;
    scene.add(regionFrame);
    const selRing = new THREE.Mesh(ringGeo, ringMat);
    selRing.visible = false;
    selRing.position.z = 1.2;
    scene.add(selRing);
    // a burst of real light when something blows
    const flashLight = new THREE.PointLight(0xffc27a, 0, 2600, 1.6);
    flashLight.position.z = 60;
    scene.add(flashLight);
    const snapRing = selRing.clone();
    (snapRing.material as THREE.MeshBasicMaterial) = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    snapRing.material = snapRing.material;
    snapRing.scale.setScalar(14);
    snapRing.visible = false;
    scene.add(snapRing);

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const ndc = new THREE.Vector2();

    const setNdc = (clientX: number, clientY: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    };

    const toWorld = (clientX: number, clientY: number) => {
      setNdc(clientX, clientY);
      raycaster.setFromCamera(ndc, camera);
      const out = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, out);
      return { x: out.x, y: -out.y };
    };

    const pick = (clientX: number, clientY: number): Pick => {
      setNdc(clientX, clientY);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData.gizmo) return { kind: "gizmo", axis: o.userData.gizmo };
          if (o.userData.calcKey && o.userData.partIdKey) {
            return { kind: "calckey", partId: o.userData.partIdKey, key: o.userData.calcKey.key };
          }
          if (o.userData.labelText) return { kind: "label", text: o.userData.labelText };
          if (o.userData.vertexId) return { kind: "vertex", vertexId: o.userData.vertexId };
          if (o.userData.partId) return { kind: "part", partId: o.userData.partId };
          o = o.parent;
        }
      }
      const w = toWorld(clientX, clientY);
      return { kind: "bg", x: w.x, y: w.y };
    };

    const project = (x: number, y: number) => {
      const v = new THREE.Vector3(x, -y, 6).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height };
    };

    apiRef.current = { pick, toWorld, project, snapshot: () => renderer.domElement.toDataURL("image/jpeg", 0.72) };

    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      renderer.setSize(Math.max(50, r.width), Math.max(50, r.height));
      sizeRef.current = { w: Math.max(50, r.width), h: Math.max(50, r.height) };
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    });
    ro.observe(host);

    const mtx = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);

    // the camera glides toward its target state instead of snapping — this
    // is what makes moving around feel right
    const cur = { ...camRef.current };
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const circ = circuitRef.current;
      const cam = camRef.current;
      const ui = uiRef.current;

      const ease = 0.16;
      cur.tx += (cam.tx - cur.tx) * ease;
      cur.ty += (cam.ty - cur.ty) * ease;
      cur.dist += (cam.dist - cur.dist) * ease;
      cur.azim += (cam.azim - cur.azim) * ease;
      cur.polar += (cam.polar - cur.polar) * ease;

      // camera from orbit state (world y is negated in three space)
      const t3 = new THREE.Vector3(cur.tx, -cur.ty, 0);
      const sp = Math.sin(cur.polar);
      camera.position.set(
        cur.tx + cur.dist * sp * Math.sin(cur.azim),
        -cur.ty - cur.dist * sp * Math.cos(cur.azim),
        cur.dist * Math.cos(cur.polar)
      );
      camera.up.set(0, 0, 1);
      camera.lookAt(t3);
      key.position.set(cur.tx + 260, -cur.ty + 200, 640);
      key.target.position.copy(t3);
      const shadowSpan = Math.min(1600, cur.dist * 1.4 + 200);
      const sc = key.shadow.camera as THREE.OrthographicCamera;
      sc.left = -shadowSpan;
      sc.right = shadowSpan;
      sc.top = shadowSpan;
      sc.bottom = -shadowSpan;
      sc.updateProjectionMatrix();

      const vmap = new Map<string, Vertex>();
      for (const v of circ.vertices) vmap.set(v.id, v);

      // ——— parts ———
      const seen = new Set<string>();
      let dotCount = 0;
      for (const p of circ.parts) {
        const va = vmap.get(p.a);
        const vb = vmap.get(p.b);
        if (!va || !vb) continue;
        seen.add(p.id);
        const L = Math.max(4, Math.hypot(vb.x - va.x, vb.y - va.y));
        const buildKey = p.destroyed ? `${p.type}|charred` : p.type;
        let h = handles.get(p.id);
        if (h && (h.builtType !== buildKey || (!p.destroyed && CATALOG[p.type].rigid && Math.abs(h.builtLen - L) > 1))) {
          scene.remove(h.group);
          handles.delete(p.id);
          h = undefined;
        }
        if (!h) {
          h = buildPart(p, L);
          h.builtType = buildKey;
          h.group.traverse((o) => {
            if (!o.userData.partId && !o.userData.calcKey) o.userData.partId = p.id;
            if (o.userData.calcKey) o.userData.partIdKey = p.id;
          });
          scene.add(h.group);
          handles.set(p.id, h);
        }
        if (h) {
          h.group.position.set(va.x, -va.y, 0);
          h.group.rotation.z = -Math.atan2(vb.y - va.y, vb.x - va.x);
          if (!CATALOG[p.type].rigid) {
            h.hit.scale.x = L + 10;
            h.hit.position.x = L / 2;
          }
          h.update(p, L, performance.now() / 1000);
        }

        // flow dots along the leads (electron view runs them the real way)
        if (Math.abs(p.current) >= 0.002 && !p.destroyed) {
          const bodyW = BODY_W[p.type];
          const padD = Math.max(0, (L - bodyW) / 2);
          const SP = 16;
          const flowVal = ui.electronView ? -p.flow : p.flow;
          const offset = ((flowVal % SP) + SP) % SP;
          const ux = (vb.x - va.x) / L;
          const uy = (vb.y - va.y) / L;
          for (let x = offset; x <= L && dotCount < 3000; x += SP) {
            if (bodyW > 0 && x > padD - 3 && x < L - padD + 3) continue;
            mtx.compose(new THREE.Vector3(va.x + ux * x, -(va.y + uy * x), 9), quat, one);
            dots.setMatrixAt(dotCount++, mtx);
          }
        }

        // floating label
        const lbl = labelFor(p, ui.showAmps, ui.showLabels);
        const ls = labelSprites.get(p.id);
        const mx = (va.x + vb.x) / 2;
        const my = (va.y + vb.y) / 2;
        let px = -(vb.y - va.y) / L;
        let py = (vb.x - va.x) / L;
        if (py < 0) {
          px = -px;
          py = -py;
        }
        if (lbl) {
          if (!ls || ls.text !== lbl.text || ls.color !== lbl.color) {
            if (ls) scene.remove(ls.sprite);
            const tex = textTexture(lbl.text, lbl.color, lbl.big ? 56 : 40);
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
            const sprite = new THREE.Sprite(mat);
            sprite.userData.labelText = lbl.text;
            const img = tex.image as HTMLCanvasElement;
            const hgt = lbl.big ? 16 : 11.5;
            sprite.scale.set((hgt * img.width) / img.height, hgt, 1);
            scene.add(sprite);
            labelSprites.set(p.id, { sprite, text: lbl.text, color: lbl.color });
          }
          const cur = labelSprites.get(p.id)!;
          cur.sprite.position.set(mx + px * 34, -(my + py * 34), 10);
        } else if (ls) {
          scene.remove(ls.sprite);
          labelSprites.delete(p.id);
        }
      }
      // hot parts glow; burning parts carry a flickering flame
      const tNow = performance.now() / 1000;
      const seenHeat = new Set<string>();
      for (const p of circ.parts) {
        const va = vmap.get(p.a);
        const vb = vmap.get(p.b);
        if (!va || !vb) continue;
        const hotAmt = p.destroyed ? 0 : Math.max(0, Math.min(1, (p.temp - 70) / 300));
        const burning = !p.destroyed && p.temp > 280;
        if (hotAmt <= 0.02 && !burning) continue;
        seenHeat.add(p.id);
        let fx = heatFx.get(p.id);
        if (!fx) {
          fx = mkHeat();
          heatFx.set(p.id, fx);
        }
        const mx = (va.x + vb.x) / 2;
        const my = -(va.y + vb.y) / 2;
        const L2 = Math.max(30, Math.hypot(vb.x - va.x, vb.y - va.y));
        fx.glow.position.set(mx, my, 10);
        fx.glow.scale.setScalar(L2 * 0.9 + 60);
        (fx.glow.material as THREE.SpriteMaterial).opacity = hotAmt * 0.55;
        const flick = 1 + Math.sin(tNow * 16 + mx) * 0.16 + Math.sin(tNow * 7.3 + my) * 0.1;
        (fx.flame.material as THREE.SpriteMaterial).opacity = burning ? 0.85 : 0;
        (fx.core.material as THREE.SpriteMaterial).opacity = burning ? 0.9 : 0;
        if (burning) {
          fx.flame.position.set(mx, my, 30 + flick * 6);
          fx.flame.scale.set(46 * flick, 66 * flick, 1);
          fx.core.position.set(mx, my, 26 + flick * 5);
          fx.core.scale.set(22 * flick, 34 * flick, 1);
        }
      }
      for (const [id, fx] of heatFx) {
        if (!seenHeat.has(id)) {
          scene.remove(fx.glow, fx.flame, fx.core);
          heatFx.delete(id);
        }
      }

      dots.count = dotCount;
      dots.instanceMatrix.needsUpdate = true;
      const wantDot = ui.electronView ? 0x7cc7ff : 0xffd83d;
      if (dotMat.color.getHex() !== wantDot) {
        dotMat.color.setHex(wantDot);
        dotMat.emissive.setHex(wantDot);
      }
      for (const [id, h] of handles) {
        if (!seen.has(id)) {
          scene.remove(h.group);
          handles.delete(id);
        }
      }
      for (const [id, l] of labelSprites) {
        if (!seen.has(id)) {
          scene.remove(l.sprite);
          labelSprites.delete(id);
        }
      }

      // ——— vertices ———
      const seenV = new Set<string>();
      for (const v of circ.vertices) {
        seenV.add(v.id);
        let m = vertexMeshes.get(v.id);
        if (!m) {
          m = new THREE.Mesh(vertGeo, vertMatOpen);
          m.castShadow = true;
          m.userData.vertexId = v.id;
          scene.add(m);
          vertexMeshes.set(v.id, m);
        }
        const deg = ui.degrees.get(v.id) ?? 0;
        m.material = deg >= 2 ? vertMatJoined : vertMatOpen;
        m.scale.setScalar(deg >= 2 ? 5.5 : 6.2);
        m.position.set(v.x, -v.y, LEADZ_TOP);
      }
      for (const [id, m] of vertexMeshes) {
        if (!seenV.has(id)) {
          scene.remove(m);
          vertexMeshes.delete(id);
        }
      }

      // ——— selection / snap / handle ———
      // the move gizmo rides on the selected part
      const gizPart = ui.selectedId ? circ.parts.find((pp) => pp.id === ui.selectedId) : null;
      if (gizPart && !gizPart.destroyed) {
        const ga = vmap.get(gizPart.a);
        const gb = vmap.get(gizPart.b);
        if (ga && gb) {
          gizmo.visible = true;
          gizmo.position.set((ga.x + gb.x) / 2, -(ga.y + gb.y) / 2, 26);
          gizmo.scale.setScalar(Math.min(4, Math.max(0.7, cur.dist / 950)));
        } else {
          gizmo.visible = false;
        }
      } else {
        gizmo.visible = false;
      }

      // one square frame around the marquee REGION — a plain click draws nothing
      const selIds = ui.selectedIds.length > 1 ? ui.selectedIds : [];
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const sid of selIds) {
        const sel = circ.parts.find((pp) => pp.id === sid);
        if (!sel) continue;
        const va = vmap.get(sel.a);
        const vb = vmap.get(sel.b);
        if (!va || !vb) continue;
        bx0 = Math.min(bx0, va.x, vb.x);
        by0 = Math.min(by0, va.y, vb.y);
        bx1 = Math.max(bx1, va.x, vb.x);
        by1 = Math.max(by1, va.y, vb.y);
      }
      if (isFinite(bx0)) {
        const fpad = 55, ft = 6;
        const fw = bx1 - bx0 + fpad * 2;
        const fh = by1 - by0 + fpad * 2;
        regionFrame.visible = true;
        regionFrame.position.set((bx0 + bx1) / 2, -(by0 + by1) / 2, 1.0);
        frameEdges[0].position.set(0, fh / 2, 0);
        frameEdges[0].scale.set(fw + ft, ft, 3);
        frameEdges[1].position.set(0, -fh / 2, 0);
        frameEdges[1].scale.set(fw + ft, ft, 3);
        frameEdges[2].position.set(-fw / 2, 0, 0);
        frameEdges[2].scale.set(ft, fh + ft, 3);
        frameEdges[3].position.set(fw / 2, 0, 0);
        frameEdges[3].scale.set(ft, fh + ft, 3);
      } else {
        regionFrame.visible = false;
      }
      selRing.visible = false;
      const snapV = ui.snapHintId ? vmap.get(ui.snapHintId) : null;
      snapRing.visible = !!snapV;
      if (snapV) snapRing.position.set(snapV.x, -snapV.y, 1.1);

      // ——— explosion debris ———
      let shardCount = 0;
      let sparkI = 0;
      let smokeI = 0;
      for (const pt of particlesRef.current) {
        const fade = 1 - pt.age / pt.life;
        if (pt.kind === "shard" && shardCount < 600) {
          mtx.compose(
            new THREE.Vector3(pt.x, -pt.y, Math.max(1.5, pt.z)),
            quat.setFromEuler(new THREE.Euler(pt.age * 5, pt.age * 7, 0)),
            new THREE.Vector3(pt.size, pt.size, pt.size * 0.6)
          );
          shards.setMatrixAt(shardCount++, mtx);
        } else if (pt.kind === "spark") {
          if (pt.size > 14) {
            // the explosion flash: real light thrown over everything nearby
            flashLight.position.set(pt.x, -pt.y, 80);
            flashLight.intensity = Math.max(flashLight.intensity, fade * 30000);
          }
          let s = sparkPool[sparkI];
          if (!s) {
            s = new THREE.Sprite(sparkMat.clone());
            sparkPool.push(s);
            scene.add(s);
          }
          s.visible = true;
          s.position.set(pt.x, -pt.y, Math.max(2, pt.z));
          s.scale.setScalar(pt.size * 6);
          (s.material as THREE.SpriteMaterial).opacity = fade;
          sparkI++;
        } else if (pt.kind === "smoke") {
          let s = smokePool[smokeI];
          if (!s) {
            s = new THREE.Sprite(smokeMat.clone());
            smokePool.push(s);
            scene.add(s);
          }
          s.visible = true;
          s.position.set(pt.x, -pt.y, Math.max(6, pt.z));
          s.scale.setScalar(pt.size * (1 + pt.age) * 3);
          (s.material as THREE.SpriteMaterial).opacity = 0.25 * fade;
          smokeI++;
        }
      }
      shards.count = shardCount;
      shards.instanceMatrix.needsUpdate = true;
      for (let i = sparkI; i < sparkPool.length; i++) sparkPool[i].visible = false;
      for (let i = smokeI; i < smokePool.length; i++) smokePool[i].visible = false;

      flashLight.intensity *= 0.86; // the blast light dies down fast
      renderer.render(scene, camera);
    };
    const LEADZ_TOP = 8;
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
