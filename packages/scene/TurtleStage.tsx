import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CARAPACE_CM, SHELL_LENGTH, SWIM_MS } from "./timing";
import "./turtle.css";

const SWIM_SEC = SWIM_MS / 1000;
const SHELL_Z = SHELL_LENGTH / 2;

export type TurtleAnim = "idle" | "wave" | "talk" | "point" | "think";
export type TurtlePhase = "idle" | "exit" | "enter" | "off";
export type TurtleQuality = "low" | "high";
export type TurtleExpression = "auto" | "happy" | "sad" | "talk";

type Face = "idle" | "happy" | "sad" | "talk" | "think";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function resolveFace(anim: TurtleAnim, expression: TurtleExpression): Face {
  if (expression === "happy") return "happy";
  if (expression === "sad") return "sad";
  if (expression === "talk") return "talk";
  if (anim === "wave") return "happy";
  if (anim === "talk") return "talk";
  if (anim === "think") return "think";
  return "idle";
}

function makeToonRamp(): THREE.DataTexture {
  const values = [188, 220, 242, 255];
  const data = new Uint8Array(values.length * 4);
  values.forEach((value, index) => {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, values.length, 1);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeShellTexture(low: boolean, glow: boolean): THREE.CanvasTexture {
  const size = low ? 128 : 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = low ? 1 : 4;
  if (!ctx) return texture;
  ctx.fillStyle = glow ? "#5dffb0" : "#8fd9bc";
  ctx.fillRect(0, 0, size, size);
  const spots: { x: number; y: number; rx: number; ry: number; color: string }[] = [
    { x: 0.5, y: 0.36, rx: 0.22, ry: 0.16, color: glow ? "#fff3a4" : "#fff6d4" },
    { x: 0.28, y: 0.58, rx: 0.18, ry: 0.15, color: glow ? "#ffc4e0" : "#ffd4e6" },
    { x: 0.73, y: 0.56, rx: 0.16, ry: 0.14, color: glow ? "#ffe08a" : "#ffe7b8" },
    { x: 0.5, y: 0.74, rx: 0.2, ry: 0.13, color: glow ? "#e9fff8" : "#e5f8ff" },
  ];
  for (const spot of spots) {
    ctx.fillStyle = spot.color;
    ctx.beginPath();
    ctx.ellipse(spot.x * size, spot.y * size, spot.rx * size, spot.ry * size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture;
}

function makeMouthGeometry(): { smile: THREE.TubeGeometry; frown: THREE.TubeGeometry } {
  const smile = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.16, 0.05, 0),
    new THREE.Vector3(0, -0.11, 0),
    new THREE.Vector3(0.16, 0.05, 0),
  );
  const frown = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.13, -0.03, 0),
    new THREE.Vector3(0, 0.09, 0),
    new THREE.Vector3(0.13, -0.03, 0),
  );
  return {
    smile: new THREE.TubeGeometry(smile, 20, 0.03, 6, false),
    frown: new THREE.TubeGeometry(frown, 16, 0.026, 5, false),
  };
}

function blinkAmount(t: number, motion: number): number {
  if (motion < 0.35) return 0;
  const cycle = t % 5.8;
  if (cycle < 5.48 || cycle > 5.7) return 0;
  return Math.sin(((cycle - 5.48) / 0.22) * Math.PI);
}

function Bubble({ index, tempo }: { index: number; tempo: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const seed = index * 1.7;
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.getElapsedTime() * 0.18 * tempo + seed;
    mesh.position.y = -1.3 + (t % 2.7);
    mesh.position.x = Math.sin(seed) * 1.7 + Math.sin(t * 1.2) * 0.22;
    mesh.position.z = -0.15 - (index % 4) * 0.18;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.028 + (index % 5) * 0.012, 8, 8]} />
      <meshBasicMaterial color="#f4fff8" transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

function Caustics({ low, still }: { low: boolean; still: boolean }) {
  const map = useMemo(() => {
    const size = low ? 128 : 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    if (!ctx) return texture;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < (low ? 8 : 16); i += 1) {
      const x = (i * 47) % size;
      const y = (i * 73) % size;
      const gradient = ctx.createRadialGradient(x, y, 2, x, y, size * 0.16);
      gradient.addColorStop(0, "rgba(230,255,245,0.9)");
      gradient.addColorStop(1, "rgba(230,255,245,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.16, size * 0.07, i, 0, Math.PI * 2);
      ctx.fill();
    }
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.center.set(0.5, 0.5);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [low]);
  useEffect(() => () => map.dispose(), [map]);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.getElapsedTime();
    map.offset.set((t * 0.03) % 1, (t * 0.018) % 1);
    map.rotation = t * 0.07;
  });
  return (
    <mesh position={[0, -1.2, -0.5]} rotation={[-Math.PI / 2.35, 0, 0]}>
      <planeGeometry args={[low ? 6 : 9, low ? 6 : 9]} />
      <meshBasicMaterial map={map} transparent opacity={low ? 0.28 : 0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function FpsCap({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

function TrueSize({
  enabled,
  screenWidthCm,
  children,
}: {
  enabled: boolean;
  screenWidthCm: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    if (!enabled || !(camera instanceof THREE.PerspectiveCamera) || size.height < 1) {
      group.scale.setScalar(1);
      return;
    }
    const distance = camera.position.length();
    const visibleH = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
    const shellPx = CARAPACE_CM * (size.width / Math.max(10, screenWidthCm));
    const shellWorld = visibleH * (shellPx / size.height);
    group.scale.setScalar(shellWorld / SHELL_LENGTH);
  });
  return <group ref={ref}>{children}</group>;
}

function Ball({
  scale,
  segments,
  material,
  outline,
  outlineMaterial,
}: {
  scale: number | [number, number, number];
  segments: number;
  material: THREE.Material;
  outline?: boolean;
  outlineMaterial?: THREE.Material;
}) {
  const seg = Math.max(7, segments);
  return (
    <group scale={scale}>
      {outline && outlineMaterial && (
        <mesh scale={1.03} material={outlineMaterial}>
          <sphereGeometry args={[1, seg, seg]} />
        </mesh>
      )}
      <mesh material={material}>
        <sphereGeometry args={[1, seg, seg]} />
      </mesh>
    </group>
  );
}

function Eye({
  position,
  ballRef,
  lookRef,
  sparkRef,
  low,
  mats,
}: {
  position: [number, number, number];
  ballRef: RefObject<THREE.Group | null>;
  lookRef: RefObject<THREE.Group | null>;
  sparkRef: RefObject<THREE.Mesh | null>;
  low: boolean;
  mats: {
    sclera: THREE.Material;
    iris: THREE.Material;
    pupil: THREE.Material;
    sparkle: THREE.Material;
    skin: THREE.Material;
  };
}) {
  const seg = low ? 14 : 18;
  return (
    <group position={position}>
      <group ref={ballRef}>
        <mesh material={mats.sclera} scale={[0.2, 0.23, 0.16]}>
          <sphereGeometry args={[1, seg, seg]} />
        </mesh>
        <group ref={lookRef} position={[0, -0.01, 0.08]}>
          <mesh material={mats.iris} scale={[0.155, 0.17, 0.09]}>
            <sphereGeometry args={[1, seg, seg]} />
          </mesh>
          <mesh material={mats.pupil} position={[0, 0, 0.04]} scale={[0.105, 0.115, 0.05]}>
            <sphereGeometry args={[1, 10, 10]} />
          </mesh>
        </group>
        <mesh ref={sparkRef} material={mats.sparkle} position={[0.055, 0.07, 0.14]} scale={0.045}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
        {!low && (
          <mesh material={mats.sparkle} position={[-0.03, 0.02, 0.13]} scale={0.022}>
            <sphereGeometry args={[1, 8, 8]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function TurtleModel({
  anim,
  face,
  quality,
  emphasis,
  motion,
  tempo,
  glow,
}: {
  anim: TurtleAnim;
  face: Face;
  quality: TurtleQuality;
  emphasis: "replay" | "none";
  motion: number;
  tempo: number;
  glow: boolean;
}) {
  const low = quality === "low";
  const seg = low ? 18 : 28;
  const limbSeg = low ? 10 : 14;
  const mats = useMemo(() => {
    const ramp = makeToonRamp();
    const shellMap = makeShellTexture(low, glow);
    const mouths = makeMouthGeometry();
    const outline = new THREE.MeshBasicMaterial({
      color: glow ? "#f6ffc8" : "#e9fff2",
      side: THREE.BackSide,
      toneMapped: false,
    });
    const skin = new THREE.MeshToonMaterial({
      color: glow ? "#f4ff86" : "#e7f7bf",
      gradientMap: ramp,
      emissive: glow ? "#d6ee62" : "#d7eeae",
      emissiveIntensity: glow ? 0.42 : 0.06,
    });
    const shell = new THREE.MeshToonMaterial({
      map: shellMap,
      gradientMap: ramp,
      emissive: glow ? "#3dcc78" : "#7ec9a4",
      emissiveIntensity: glow ? 0.42 : 0.04,
    });
    const flipper = new THREE.MeshToonMaterial({
      color: glow ? "#dcff6e" : "#c6ee90",
      gradientMap: ramp,
      emissive: glow ? "#c6ee58" : "#b4dc84",
      emissiveIntensity: glow ? 0.36 : 0.1,
    });
    const belly = new THREE.MeshToonMaterial({
      color: glow ? "#ffe7a6" : "#ffe6c4",
      gradientMap: ramp,
      emissive: glow ? "#e6c878" : "#f0d7b0",
      emissiveIntensity: glow ? 0.3 : 0.08,
    });
    const sclera = new THREE.MeshBasicMaterial({ color: "#fffdf8", toneMapped: false });
    const iris = new THREE.MeshStandardMaterial({
      color: glow ? "#16362e" : "#1b3330",
      roughness: 0.16,
      metalness: 0.28,
      emissive: glow ? "#1e4a40" : "#102420",
      emissiveIntensity: glow ? 0.45 : 0.15,
    });
    const pupil = new THREE.MeshStandardMaterial({
      color: "#121416",
      roughness: 0.12,
      metalness: 0.4,
      emissive: "#000000",
    });
    const sparkle = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
    const blush = new THREE.MeshBasicMaterial({
      color: "#ff8eae",
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });
    const mouth = new THREE.MeshBasicMaterial({ color: glow ? "#ff7aa2" : "#a14b62", toneMapped: !glow });
    const tongue = new THREE.MeshBasicMaterial({ color: glow ? "#ffd0dc" : "#ffb3c4", toneMapped: false });
    return { ramp, shellMap, mouths, outline, skin, shell, flipper, belly, sclera, iris, pupil, sparkle, blush, mouth, tongue };
  }, [glow, low]);
  useEffect(
    () => () => {
      mats.ramp.dispose();
      mats.shellMap.dispose();
      mats.mouths.smile.dispose();
      mats.mouths.frown.dispose();
      mats.outline.dispose();
      mats.skin.dispose();
      mats.shell.dispose();
      mats.flipper.dispose();
      mats.belly.dispose();
      mats.sclera.dispose();
      mats.iris.dispose();
      mats.pupil.dispose();
      mats.sparkle.dispose();
      mats.blush.dispose();
      mats.mouth.dispose();
      mats.tongue.dispose();
    },
    [mats],
  );

  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const frontLeft = useRef<THREE.Group>(null);
  const frontRight = useRef<THREE.Group>(null);
  const backLeft = useRef<THREE.Group>(null);
  const backRight = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const lookL = useRef<THREE.Group>(null);
  const lookR = useRef<THREE.Group>(null);
  const sparkL = useRef<THREE.Mesh>(null);
  const sparkR = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Mesh>(null);
  const frown = useRef<THREE.Mesh>(null);
  const open = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * tempo;
    const m = motion;
    if (body.current) {
      const bob = face === "happy" ? 0.09 : 0.055;
      body.current.position.y = Math.sin(t * 1.45) * bob * m;
      body.current.rotation.z = Math.sin(t * 0.7) * 0.04 * m;
      body.current.rotation.x = Math.sin(t * 0.85) * 0.03 * m;
      body.current.rotation.y = emphasis === "replay" ? Math.sin(t * 0.7) * 0.75 * Math.min(m, 1.35) : Math.sin(t * 0.32) * 0.1 * m;
    }
    const amp = (face === "happy" ? 0.34 : 0.2) * m;
    const wiggleL = Math.sin(t * 3.3) * amp;
    const wiggleR = Math.sin(t * 3.3 + 0.75) * amp;
    if (frontLeft.current) frontLeft.current.rotation.set(0.15, 0.2, 0.72 + wiggleL);
    if (frontRight.current) frontRight.current.rotation.set(0.15, -0.2, -0.72 - wiggleR);
    if (backLeft.current) backLeft.current.rotation.set(0.1, 0.1, 0.5 + Math.sin(t * 3.3 + 1.1) * 0.12 * m);
    if (backRight.current) backRight.current.rotation.set(0.1, -0.1, -0.5 - Math.sin(t * 3.3 + 1.1) * 0.12 * m);
    if (head.current) {
      head.current.rotation.set(Math.sin(t * 0.55) * 0.04 * m, Math.sin(t * 0.42) * 0.08 * m, Math.sin(t * 0.8) * 0.12 * m);
    }
    if (anim === "wave" && frontRight.current && head.current) {
      frontRight.current.rotation.set(-0.2, 0.25, -1.35 + Math.sin(t * 7) * 0.46 * m);
      head.current.rotation.z = 0.2 + Math.sin(t * 2.1) * 0.05 * m;
    }
    if (anim === "talk" && head.current) {
      head.current.rotation.x = Math.sin(t * 3.1) * 0.1 * m;
      head.current.rotation.z *= 0.35;
    }
    if (anim === "point" && frontRight.current && head.current) {
      frontRight.current.rotation.set(0.05, 0.5, -1.65);
      head.current.rotation.y = -0.36;
      head.current.rotation.z = 0.06;
    }
    if (anim === "think" && frontRight.current && head.current) {
      head.current.rotation.set(0.18, 0.08, 0.34);
      frontRight.current.rotation.set(-0.95, 0.25, -1.2);
    }
    if (face === "sad" && head.current && anim !== "think" && anim !== "point") {
      head.current.rotation.x += 0.18;
    }

    const blink = blinkAmount(t, m);
    const squint = face === "happy" ? 0.42 : face === "sad" ? 0.16 : 0;
    const close = Math.min(1, Math.max(blink, squint));
    for (const ball of [eyeL.current, eyeR.current]) {
      if (ball) ball.scale.y = 1 - close * 0.72;
    }
    const lookX = face === "think" ? Math.sin(t * 0.8) * 0.035 : 0;
    const lookY = face === "think" ? 0.04 : face === "sad" ? -0.03 : 0;
    if (lookL.current) lookL.current.position.set(lookX, -0.01 + lookY, 0.07);
    if (lookR.current) lookR.current.position.set(lookX, -0.01 + lookY, 0.07);
    const twinkle = 0.85 + Math.sin(t * 5.2) * 0.15;
    if (sparkL.current) sparkL.current.scale.setScalar(0.038 * twinkle);
    if (sparkR.current) sparkR.current.scale.setScalar(0.038 * (0.85 + Math.sin(t * 5.2 + 0.8) * 0.15));
    mats.blush.opacity = face === "happy" ? 0.95 : face === "sad" ? 0.5 : 0.8;

    const chat = face === "talk";
    const sadTalk = face === "sad" && anim === "talk";
    if (smile.current) {
      smile.current.visible = face !== "sad" && face !== "think" && !chat;
      smile.current.scale.setScalar(face === "happy" ? 1.18 : 1);
    }
    if (frown.current) {
      frown.current.visible = face === "sad";
      const pulse = sadTalk ? 0.88 + (Math.sin(t * 8) * 0.5 + 0.5) * 0.28 : 0.96;
      frown.current.scale.setScalar(pulse);
    }
    if (open.current) {
      open.current.visible = chat || face === "think";
      if (chat) {
        const amount = 0.45 + (Math.sin(t * 9) * 0.5 + 0.5) * 1.05;
        open.current.scale.set(1, amount, 1);
      } else {
        open.current.scale.set(0.62, 0.62, 0.8);
      }
    }
  });

  const eyeMats = {
    sclera: mats.sclera,
    iris: mats.iris,
    pupil: mats.pupil,
    sparkle: mats.sparkle,
    skin: mats.skin,
  };

  return (
    <group ref={body}>
      {glow && (
        <mesh position={[0, 0.2, 0.25]} scale={[1.45, 1.2, 1.65]}>
          <sphereGeometry args={[1, low ? 8 : 12, low ? 8 : 12]} />
          <meshBasicMaterial color="#eaffb8" side={THREE.BackSide} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <group position={[0, 0.08, -0.05]}>
        <Ball scale={[1.08, 0.8, SHELL_Z]} segments={seg} material={mats.shell} outline outlineMaterial={mats.outline} />
        <mesh position={[0.1, 0.62, 0.85]} scale={[0.32, 0.1, 0.26]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color={glow ? "#fff4a0" : "#fff3c4"} toneMapped={false} />
        </mesh>
        <mesh position={[-0.48, 0.42, 0.72]} scale={[0.26, 0.09, 0.22]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color={glow ? "#ffc2e2" : "#ffd0e6"} toneMapped={false} />
        </mesh>
        <mesh position={[0.5, 0.32, 0.95]} scale={[0.22, 0.08, 0.18]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color={glow ? "#d9fff4" : "#e7f8ff"} toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, -0.48, -0.08]}>
        <Ball scale={[0.78, 0.28, 0.82]} segments={limbSeg} material={mats.belly} />
      </group>
      <group ref={head} position={[0, 0.42, 1.02]}>
        <Ball scale={0.62} segments={seg} material={mats.skin} outline outlineMaterial={mats.outline} />
        <Eye position={[-0.22, 0.1, 0.5]} ballRef={eyeL} lookRef={lookL} sparkRef={sparkL} low={low} mats={eyeMats} />
        <Eye position={[0.22, 0.1, 0.5]} ballRef={eyeR} lookRef={lookR} sparkRef={sparkR} low={low} mats={eyeMats} />
        <mesh material={mats.blush} position={[-0.34, -0.08, 0.52]} rotation={[0, 0.35, 0]} scale={[0.14, 0.09, 0.05]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <mesh material={mats.blush} position={[0.34, -0.08, 0.52]} rotation={[0, -0.35, 0]} scale={[0.14, 0.09, 0.05]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <mesh position={[-0.045, -0.02, 0.66]} scale={0.028}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={glow ? "#6d8a48" : "#5e7348"} />
        </mesh>
        <mesh position={[0.045, -0.02, 0.66]} scale={0.028}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={glow ? "#6d8a48" : "#5e7348"} />
        </mesh>
        <group position={[0, -0.2, 0.64]}>
          <mesh ref={smile} geometry={mats.mouths.smile} material={mats.mouth} />
          <mesh ref={frown} geometry={mats.mouths.frown} material={mats.mouth} visible={false} />
          <group ref={open} visible={false} position={[0, -0.02, 0.02]}>
            <mesh scale={[0.11, 0.08, 0.05]}>
              <sphereGeometry args={[1, low ? 8 : 10, 8]} />
              <meshBasicMaterial color={glow ? "#ff8aab" : "#c45b78"} toneMapped={false} />
              <mesh position={[0, -0.2, 0.35]} scale={[0.55, 0.4, 0.45]} material={mats.tongue}>
                <sphereGeometry args={[1, 6, 6]} />
              </mesh>
            </mesh>
          </group>
        </group>
      </group>
      <group ref={frontLeft} position={[-0.88, -0.05, 0.42]}>
        <group position={[-0.22, 0, 0.04]} rotation={[0.2, 0.5, 0.2]}>
          <Ball scale={[0.36, 0.18, 0.32]} segments={limbSeg} material={mats.flipper} outline={!low} outlineMaterial={mats.outline} />
        </group>
      </group>
      <group ref={frontRight} position={[0.88, -0.05, 0.42]}>
        <group position={[0.22, 0, 0.04]} rotation={[0.2, -0.5, -0.2]}>
          <Ball scale={[0.36, 0.18, 0.32]} segments={limbSeg} material={mats.flipper} outline={!low} outlineMaterial={mats.outline} />
        </group>
      </group>
      <group ref={backLeft} position={[-0.72, -0.08, -0.95]}>
        <group position={[-0.14, 0, -0.04]} rotation={[0.2, 0.3, 0.2]}>
          <Ball scale={[0.24, 0.13, 0.22]} segments={8} material={mats.flipper} outline={!low} outlineMaterial={mats.outline} />
        </group>
      </group>
      <group ref={backRight} position={[0.72, -0.08, -0.95]}>
        <group position={[0.14, 0, -0.04]} rotation={[0.2, -0.3, -0.2]}>
          <Ball scale={[0.24, 0.13, 0.22]} segments={8} material={mats.flipper} outline={!low} outlineMaterial={mats.outline} />
        </group>
      </group>
      <group position={[0, 0.02, -1.35]}>
        <Ball scale={[0.16, 0.12, 0.16]} segments={8} material={mats.skin} outline={!low} outlineMaterial={mats.outline} />
      </group>
    </group>
  );
}

function Swim({ phase, children }: { phase: TurtlePhase; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const prev = useRef(phase);
  const started = useRef(0);
  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const now = clock.getElapsedTime();
    if (prev.current !== phase) {
      prev.current = phase;
      started.current = now;
    }
    const k = Math.min(1, (now - started.current) / SWIM_SEC);
    const ease = k * k * (3 - 2 * k);
    let x = 0;
    let visible = true;
    if (phase === "exit") {
      x = ease * 6.8;
      visible = k < 0.98;
    } else if (phase === "enter") {
      x = (1 - ease) * -6.8;
    } else if (phase === "off") {
      visible = false;
    }
    group.visible = visible;
    group.position.x = x;
  });
  return <group ref={ref}>{children}</group>;
}

export function TurtleSvg({ anim, glow = false, expression = "auto" }: { anim: TurtleAnim; glow?: boolean; expression?: TurtleExpression }) {
  const shell = glow ? "#5dffb0" : "#8fd9bc";
  const spot = glow ? "#fff3a4" : "#fff6d4";
  const skin = glow ? "#f4ff86" : "#e7f7bf";
  const flip = glow ? "#dcff6e" : "#c6ee90";
  return (
    <svg className={`turtle-svg anim-${anim} face-${expression}${glow ? " glow" : ""}`} viewBox="0 0 240 170" role="img" aria-label="綠蠵龜小綠">
      <g className="body">
        <ellipse className="flip-r" cx="196" cy="96" rx="26" ry="16" fill={flip} />
        <ellipse cx="48" cy="96" rx="26" ry="16" fill={flip} />
        <ellipse cx="156" cy="132" rx="16" ry="11" fill={flip} />
        <ellipse cx="84" cy="132" rx="16" ry="11" fill={flip} />
        <ellipse cx="118" cy="96" rx="70" ry="52" fill={glow ? "#f6ffc8" : "#e9fff2"} />
        <ellipse cx="118" cy="94" rx="64" ry="46" fill={shell} />
        <ellipse cx="104" cy="78" rx="16" ry="12" fill={spot} />
        <ellipse cx="140" cy="86" rx="14" ry="11" fill={glow ? "#ffc4e0" : "#ffd4e6"} />
        <ellipse cx="118" cy="108" rx="18" ry="10" fill={glow ? "#e9fff8" : "#e5f8ff"} />
        <g className="head">
          <circle cx="176" cy="78" r="30" fill={glow ? "#f6ffc8" : "#e9fff2"} />
          <circle cx="176" cy="78" r="28" fill={skin} />
          <ellipse className="blush" cx="158" cy="88" rx="7" ry="4" fill="#ff8eae" opacity="0.85" />
          <ellipse className="blush" cx="198" cy="86" rx="6" ry="3.5" fill="#ff8eae" opacity="0.8" />
          <g className="eyes">
            <ellipse cx="166" cy="72" rx="7" ry="8" fill="#fffdf8" />
            <ellipse cx="190" cy="70" rx="7" ry="8" fill="#fffdf8" />
            <circle cx="168" cy="74" r="3.4" fill="#1b3330" />
            <circle cx="192" cy="72" r="3.4" fill="#1b3330" />
            <circle cx="170" cy="71" r="1.5" fill="#fff" />
            <circle cx="194" cy="69" r="1.5" fill="#fff" />
          </g>
          <path className="mouth smile" d="M166 90 Q178 100 190 88" fill="none" stroke={glow ? "#ff7aa2" : "#a14b62"} strokeWidth="3" strokeLinecap="round" />
          <path className="mouth frown" d="M168 96 Q178 88 188 96" fill="none" stroke={glow ? "#ff7aa2" : "#a14b62"} strokeWidth="3" strokeLinecap="round" />
          <ellipse className="mouth open" cx="178" cy="94" rx="6" ry="5" fill={glow ? "#ff8aab" : "#c45b78"} />
        </g>
      </g>
    </svg>
  );
}

export function TurtleStage({
  anim = "idle",
  phase = "idle",
  quality = "high",
  emphasis = "none",
  expression = "auto",
  transparent = true,
  className,
  tempo = 1,
  exaggerate = 1,
  fps = 0,
  glow = false,
  caustics = false,
  bubbles,
  trueSize = false,
  screenWidthCm = 80,
}: {
  anim?: TurtleAnim;
  phase?: TurtlePhase;
  quality?: TurtleQuality;
  emphasis?: "replay" | "none";
  expression?: TurtleExpression;
  transparent?: boolean;
  className?: string;
  tempo?: number;
  exaggerate?: number;
  fps?: number;
  glow?: boolean;
  caustics?: boolean;
  bubbles?: number;
  trueSize?: boolean;
  screenWidthCm?: number;
}) {
  const [webgl] = useState(hasWebGL);
  const reduced = useReducedMotion();
  const bubbleCount = bubbles ?? (quality === "high" ? 3 : 0);
  const capped = fps > 0 && phase !== "off";
  const shownAnim = reduced ? "idle" : anim;
  const face = reduced ? "idle" : resolveFace(anim, expression);
  if (!webgl) {
    return (
      <div className={className} style={{ display: "grid", placeItems: "center", background: transparent ? "transparent" : "#000" }}>
        <TurtleSvg anim={shownAnim} glow={glow} expression={reduced ? "auto" : expression} />
      </div>
    );
  }
  return (
    <div className={className} style={{ width: "100%", height: "100%", background: transparent ? "transparent" : "#000" }}>
      <Canvas
        frameloop={phase === "off" || capped ? "demand" : "always"}
        dpr={quality === "low" ? 1 : capped ? [1, 1.25] : [1, 1.6]}
        camera={{ position: glow ? [1.55, 0.95, 5.05] : [0, 0.55, 5.25], fov: glow ? 28 : 30 }}
        gl={{
          alpha: transparent,
          antialias: quality !== "low",
          powerPreference: quality === "low" ? "low-power" : "default",
        }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor("#000000", transparent ? 0 : 1);
          camera.lookAt(0, 0.32, glow ? 0.35 : 0.7);
          if (glow) gl.toneMappingExposure = 1.15;
        }}
      >
        {capped && <FpsCap fps={fps} />}
        {glow ? (
          <>
            <ambientLight intensity={0.55} />
            <directionalLight position={[2.4, 3.2, 4.2]} intensity={2.2} color="#ffffff" />
            <directionalLight position={[-3.1, 1.1, -2.6]} intensity={1.35} color="#e7ffc4" />
            <pointLight position={[0, 0.4, 2.2]} intensity={1.35} color="#fff6d0" distance={10} />
          </>
        ) : (
          <>
            <ambientLight intensity={0.62} />
            <directionalLight position={[2.2, 3.4, 4.4]} intensity={1.7} color="#fffaf0" />
            <directionalLight position={[-2.8, 1.2, -1.4]} intensity={0.42} color="#c8f6ea" />
          </>
        )}
        {caustics && <Caustics low={quality === "low"} still={reduced} />}
        {Array.from({ length: bubbleCount }, (_, index) => (
          <Bubble key={index} index={index} tempo={reduced ? 0.35 : tempo} />
        ))}
        <Swim phase={phase}>
          <TrueSize enabled={trueSize} screenWidthCm={screenWidthCm}>
            <group rotation={glow ? [0.05, -0.35, 0] : [0, 0.08, 0]}>
              <TurtleModel
                anim={shownAnim}
                face={face}
                quality={quality}
                emphasis={emphasis}
                motion={(reduced ? 0.2 : 1) * exaggerate}
                tempo={reduced ? 0.45 : tempo}
                glow={glow}
              />
            </group>
          </TrueSize>
        </Swim>
      </Canvas>
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduced;
}
