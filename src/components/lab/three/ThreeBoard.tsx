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
  tz: number; // target HEIGHT — 0 is the mat plane; zooming at the monitor or
  // cabinet lifts the orbit pivot up to them, Unity-style
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
  | { kind: "action"; action: "guide" | "undo" | "reset" | "settings" | "load" }
  | { kind: "rotate" }
  | { kind: "bg"; x: number; y: number };

export interface BoardApi {
  pick: (clientX: number, clientY: number) => Pick;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  // the real 3D point under the cursor — the monitor face, a drawer front,
  // a part — or null if the ray only finds empty room
  pointUnder: (clientX: number, clientY: number) => { x: number; y: number; z: number } | null;
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
  showLabels: boolean;
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


    // ——— the build world: one endless blue plane, ruled like graph paper
    // (small squares 250 units, bold lines every 1000). No table, no chair,
    // no walls — just you and the circuit. ———
    const gridTexture = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const g = c.getContext("2d")!;
      g.fillStyle = "#12203a";
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = "rgba(122, 152, 196, 0.10)"; // the small squares
      g.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
        g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
      }
      g.strokeStyle = "rgba(140, 172, 214, 0.17)"; // the bold measuring lines
      g.lineWidth = 2;
      g.strokeRect(0.5, 0.5, 511, 511);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; // keep the blue DARK, not washed out
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(400, 400); // one tile = 1000 world units
      t.anisotropy = 8;
      return t;
    };
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400000, 400000),
      new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95, metalness: 0.04 })
    );
    ground.position.z = -1;
    ground.receiveShadow = true;
    scene.add(ground);


    // dynamic collections
    const handles = new Map<string, PartHandle>();
    const labelSprites = new Map<string, { sprite: THREE.Object3D; text: string; color: string }>();
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
    dots.frustumCulled = false;
    scene.add(dots);

    // explosion shards
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x57534e });
    const shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shardMat, 600);
    shards.count = 0;
    shards.frustumCulled = false;
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


    // (the guide book and magnifier are gone — both live as mat buttons now)

    // (the drawers live in the HTML dock on the right, not in the scene)

    // (the meters live in their own cabinet drawer, like everything else)

    // (the chip dock is gone — click the PC itself to program microchips)

    // (the control buttons live in the HTML dock on the right too)



    // (no PC — program microchips straight from the dock's button)


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
    // light dashed outline around the whole connected machine when a part
    // is selected — it shows exactly what a body-drag would carry
    const dashMat = new THREE.LineDashedMaterial({ color: 0xb9c2cc, dashSize: 42, gapSize: 26, transparent: true, opacity: 0.75 });
    const dashGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ]);
    const dashBox = new THREE.Line(dashGeo, dashMat);
    dashBox.visible = false;
    scene.add(dashBox);
    // the little rotate arrow that rides the selected part's flank
    const rotC = document.createElement("canvas");
    rotC.width = rotC.height = 96;
    {
      const g2 = rotC.getContext("2d")!;
      g2.strokeStyle = "#e6e1d3";
      g2.lineWidth = 9;
      g2.beginPath();
      g2.arc(48, 48, 28, -Math.PI * 0.25, Math.PI, false);
      g2.stroke();
      g2.fillStyle = "#e6e1d3";
      g2.beginPath();
      g2.moveTo(76, 20);
      g2.lineTo(94, 34);
      g2.lineTo(66, 44);
      g2.closePath();
      g2.fill();
    }
    const rotHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rotC), transparent: true, depthTest: false })
    );
    rotHandle.renderOrder = 999;
    rotHandle.userData.rotate = true;
    rotHandle.visible = false;
    scene.add(rotHandle);
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
        // three.js raycasts THROUGH invisible objects — skip anything whose
        // ancestor chain is hidden (closed drawer contents, pooled effects)
        let anc: THREE.Object3D | null = h.object;
        let hidden = false;
        while (anc) {
          if (anc.visible === false) {
            hidden = true;
            break;
          }
          anc = anc.parent;
        }
        if (hidden) continue;
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData.uiAction) return { kind: "action", action: o.userData.uiAction };
          if (o.userData.rotate) return { kind: "rotate" };
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

    // the actual 3D surface point under the cursor (skipping hidden things
    // and the invisible hit zones), so zooming can aim at tall objects
    const pointUnder = (clientX: number, clientY: number) => {
      setNdc(clientX, clientY);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const h of hits) {
        let anc: THREE.Object3D | null = h.object;
        let skip = false;
        while (anc) {
          if (anc.visible === false) {
            skip = true;
            break;
          }
          anc = anc.parent;
        }
        if (skip) continue;
        const raw = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const m0 = Array.isArray(raw) ? raw[0] : raw;
        if (m0 && m0.transparent && m0.opacity === 0) continue;
        return { x: h.point.x, y: -h.point.y, z: h.point.z };
      }
      return null;
    };

    apiRef.current = { pick, toWorld, pointUnder, project, snapshot: () => renderer.domElement.toDataURL("image/jpeg", 0.72) };

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
    const dotScaleVec = new THREE.Vector3(1, 1, 1);

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
      cur.tz += (cam.tz - cur.tz) * ease;
      cur.dist += (cam.dist - cur.dist) * ease;
      cur.azim += (cam.azim - cur.azim) * ease;
      cur.polar += (cam.polar - cur.polar) * ease;

      // camera from orbit state (world y is negated in three space)
      const t3 = new THREE.Vector3(cur.tx, -cur.ty, cur.tz);
      const sp = Math.sin(cur.polar);
      camera.position.set(
        cur.tx + cur.dist * sp * Math.sin(cur.azim),
        -cur.ty - cur.dist * sp * Math.cos(cur.azim),
        cur.tz + cur.dist * Math.cos(cur.polar)
      );
      camera.up.set(0, 0, 1);
      camera.lookAt(t3);
      key.position.set(cur.tx + 1100, -cur.ty - 2400, 1500); // front-right, slanting at the screen
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

        // flow dots along the leads (electron view runs them the real way).
        // They grow with camera distance so the flow reads at EVERY zoom.
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
            mtx.compose(new THREE.Vector3(va.x + ux * x, -(va.y + uy * x), 13.5 + dotScaleVec.x * 2), quat, dotScaleVec);
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
            const img = tex.image as HTMLCanvasElement;
            const hgt = lbl.big ? 16 : 11.5;
            // printed flat on the ground, locked in place — the text stays
            // put while the camera orbits (no billboarding)
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
            const sprite = new THREE.Mesh(new THREE.PlaneGeometry((hgt * img.width) / img.height, hgt), mat);
            sprite.userData.labelText = lbl.text;
            sprite.renderOrder = 4;
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
      // a vertex whose only parts are breadboards gets no ball — the board is
      // a platform, and bare metal dots on its sides looked wrong
      const bbOnly = new Set<string>();
      {
        const nonBB = new Set<string>();
        for (const p of circ.parts) {
          if (p.type === "breadboard") {
            bbOnly.add(p.a);
            bbOnly.add(p.b);
          } else {
            nonBB.add(p.a);
            nonBB.add(p.b);
          }
        }
        for (const id of nonBB) bbOnly.delete(id);
      }
      const seenV = new Set<string>();
      for (const v of circ.vertices) {
        seenV.add(v.id);
        let m = vertexMeshes.get(v.id);
        if (!m) {
          m = new THREE.Mesh(vertGeo, vertMatOpen);
          m.castShadow = true;
          m.userData.vertexId = v.id;
          // a generous invisible grab bubble: clicking anywhere near the ball
          // grabs the BALL, never the part behind it
          const bubble = new THREE.Mesh(
            new THREE.SphereGeometry(4.2, 8, 6),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
          );
          bubble.userData.vertexId = v.id;
          m.add(bubble);
          scene.add(m);
          vertexMeshes.set(v.id, m);
        }
        m.visible = !bbOnly.has(v.id);
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
      dotScaleVec.setScalar(Math.max(1, cur.dist / 1000));



      // the dashed machine outline for the selected part
      dashBox.visible = false;
      rotHandle.visible = false;
      if (ui.selectedId) {
        const sp = circ.parts.find((pp) => pp.id === ui.selectedId);
        const va2 = sp && vmap.get(sp.a);
        const vb2 = sp && vmap.get(sp.b);
        if (sp && va2 && vb2) {
          const L2 = Math.max(1, Math.hypot(vb2.x - va2.x, vb2.y - va2.y));
          const px2 = -(vb2.y - va2.y) / L2;
          const py2 = (vb2.x - va2.x) / L2;
          rotHandle.position.set(
            (va2.x + vb2.x) / 2 + px2 * 90,
            -((va2.y + vb2.y) / 2 + py2 * 90),
            30
          );
          rotHandle.scale.setScalar(Math.min(3, Math.max(0.9, cur.dist / 900)));
          rotHandle.visible = true;
        }
      }
      if (ui.selectedId) {
        const start = circ.parts.find((pp) => pp.id === ui.selectedId);
        if (start && !start.destroyed) {
          // flood out over shared joints to find the whole machine
          const byVert = new Map<string, Part[]>();
          for (const pp of circ.parts) {
            for (const vid of [pp.a, pp.b]) {
              const arr = byVert.get(vid);
              if (arr) arr.push(pp);
              else byVert.set(vid, [pp]);
            }
          }
          const seen = new Set<string>([start.id]);
          const queue = [start];
          let dx0 = Infinity, dy0 = Infinity, dx1 = -Infinity, dy1 = -Infinity;
          while (queue.length) {
            const pp = queue.pop()!;
            for (const vid of [pp.a, pp.b]) {
              const v = vmap.get(vid);
              if (v) {
                dx0 = Math.min(dx0, v.x);
                dy0 = Math.min(dy0, v.y);
                dx1 = Math.max(dx1, v.x);
                dy1 = Math.max(dy1, v.y);
              }
              for (const q of byVert.get(vid) ?? []) {
                if (!seen.has(q.id)) {
                  seen.add(q.id);
                  queue.push(q);
                }
              }
            }
          }
          if (isFinite(dx0)) {
            const pad2 = 60;
            const pts = dashGeo.attributes.position as THREE.BufferAttribute;
            pts.setXYZ(0, dx0 - pad2, -(dy0 - pad2), 5);
            pts.setXYZ(1, dx1 + pad2, -(dy0 - pad2), 5);
            pts.setXYZ(2, dx1 + pad2, -(dy1 + pad2), 5);
            pts.setXYZ(3, dx0 - pad2, -(dy1 + pad2), 5);
            pts.setXYZ(4, dx0 - pad2, -(dy0 - pad2), 5);
            pts.needsUpdate = true;
            dashBox.computeLineDistances();
            dashBox.visible = true;
          }
        }
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
