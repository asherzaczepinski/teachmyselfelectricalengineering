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
  | { kind: "lamp" }
  | { kind: "bg"; x: number; y: number };

export interface BoardApi {
  pick: (clientX: number, clientY: number) => Pick;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  project: (x: number, y: number) => { x: number; y: number };
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
  lampRef: MutableRefObject<{ x: number; y: number }>;
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

export default function ThreeBoard({ circuitRef, particlesRef, camRef, uiRef, apiRef, sizeRef, lampRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
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
    scene.add(new THREE.AmbientLight(0xd8e2f2, 0.5));
    const key = new THREE.DirectionalLight(0xfff2df, 0.35);
    key.castShadow = false;
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
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60000, 60000),
      new THREE.MeshStandardMaterial({ color: 0x27242c, roughness: 0.95 })
    );
    floor.position.z = -48.2 - 35 - 1500;
    floor.receiveShadow = true;
    scene.add(floor);

    // the desk lamp: THE light source, and you can drag it around the bench
    const lampGroup = new THREE.Group();
    scene.add(lampGroup);
    const lampM = new THREE.MeshStandardMaterial({ color: 0x2c343f, roughness: 0.4, metalness: 0.7 });
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(150, 170, 40, 24).rotateX(Math.PI / 2), lampM);
    lampBase.position.set(0, 0, 20 - 13);
    lampBase.castShadow = true;
    lampBase.userData.lamp = true;
    lampGroup.add(lampBase);
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 900, 12).rotateX(Math.PI / 2), lampM);
    arm1.position.set(120, 100, 440);
    arm1.rotation.y = 0.35;
    arm1.rotation.x = -0.15;
    arm1.userData.lamp = true;
    lampGroup.add(arm1);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(36, 16, 12), lampM);
    joint.position.set(270, 170, 850);
    joint.userData.lamp = true;
    lampGroup.add(joint);
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 820, 12).rotateX(Math.PI / 2), lampM);
    arm2.position.set(620, 330, 960);
    arm2.rotation.y = -1.05;
    arm2.rotation.x = 0.32;
    arm2.userData.lamp = true;
    lampGroup.add(arm2);
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(70, 210, 260, 24, 1, true).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2c343f, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide })
    );
    head.position.set(980, 480, 1020);
    head.rotation.x = 0.4;
    head.rotation.y = -0.35;
    head.userData.lamp = true;
    lampGroup.add(head);
    const bulbBall = new THREE.Mesh(
      new THREE.SphereGeometry(58, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffe9b0, emissiveIntensity: 2.2 })
    );
    bulbBall.position.set(1020, 520, 950);
    bulbBall.userData.lamp = true;
    lampGroup.add(bulbBall);
    const lampGlow2 = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffedbb, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 })
    );
    lampGlow2.scale.setScalar(380);
    lampGlow2.position.copy(bulbBall.position);
    lampGroup.add(lampGlow2);
    const deskSpot = new THREE.SpotLight(0xffe9c0, 6.5, 0, 1.2, 0.5, 0.35);
    deskSpot.position.copy(bulbBall.position);
    deskSpot.castShadow = true;
    deskSpot.shadow.mapSize.set(2048, 2048);
    deskSpot.shadow.bias = -0.0004;
    deskSpot.target.position.set(1020, 520, 0); // straight down from the bulb
    lampGroup.add(deskSpot, deskSpot.target);

    // the maker's mark carved into the table edge
    {
      const decTex = textTexture("engineerwithasher.com", "#4a3520", 64);
      const img = decTex.image as HTMLCanvasElement;
      const dec = new THREE.Mesh(
        new THREE.PlaneGeometry(1400, (1400 * img.height) / img.width),
        new THREE.MeshBasicMaterial({ map: decTex, transparent: true, opacity: 0.85 })
      );
      dec.position.set(BENCH.cx, -(BENCH.cy + BENCH.h / 2 + 240), -12.8);
      scene.add(dec);
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
    const ringPool: THREE.Mesh[] = [];
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
          if (o.userData.calcKey && o.userData.partIdKey) {
            return { kind: "calckey", partId: o.userData.partIdKey, key: o.userData.calcKey.key };
          }
          if (o.userData.lamp) return { kind: "lamp" };
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

    apiRef.current = { pick, toWorld, project };

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
      lampGroup.position.set(lampRef.current.x, -lampRef.current.y, 0);
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
      const selIds = ui.selectedIds.length ? ui.selectedIds : ui.selectedId ? [ui.selectedId] : [];
      let ringI = 0;
      for (const sid of selIds) {
        const sel = circ.parts.find((pp) => pp.id === sid);
        if (!sel) continue;
        const va = vmap.get(sel.a);
        const vb = vmap.get(sel.b);
        if (!va || !vb) continue;
        let ring = ringPool[ringI];
        if (!ring) {
          ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.z = 0.9;
          scene.add(ring);
          ringPool.push(ring);
        }
        const L = Math.max(20, Math.hypot(vb.x - va.x, vb.y - va.y));
        ring.visible = true;
        ring.scale.setScalar(L / 2 + 26);
        ring.position.set((va.x + vb.x) / 2, -(va.y + vb.y) / 2, 0.9);
        ringI++;
      }
      for (let i = ringI; i < ringPool.length; i++) ringPool[i].visible = false;
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
