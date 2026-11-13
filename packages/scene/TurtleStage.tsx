import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CARAPACE_CM, SWIM_MS } from "./timing";
import "./turtle.css";

const SWIM_SEC = SWIM_MS / 1000;
const SHELL_LENGTH = 2.84;

export type TurtleAnim = "idle" | "wave" | "talk" | "point" | "think";
export type TurtlePhase = "idle" | "exit" | "enter" | "off";
export type TurtleQuality = "low" | "high";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function makeShellTexture(low: boolean, glow: boolean): THREE.CanvasTexture {
  const size = low ? 128 : 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  ctx.fillStyle = glow ? "#3dcc68" : "#1c7a46";
  ctx.fillRect(0, 0, size, size);
  const spots: [number, number][] = [
    [0.5, 0.26],
    [0.3, 0.46],
    [0.7, 0.46],
    [0.5, 0.64],
    [0.27, 0.74],
    [0.73, 0.74],
  ];
  spots.forEach(([x, y], index) => {
    ctx.beginPath();
    ctx.fillStyle = glow ? (index % 2 === 0 ? "#147a3c" : "#d6ff4a") : index % 2 === 0 ? "#145c36" : "#249255";
    ctx.ellipse(x * size, y * size, size * 0.15, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.012);
    ctx.strokeStyle = glow ? "#062816" : "#0d3f26";
    ctx.stroke();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function TurtleModel({
  anim,
  quality,
  emphasis,
  motion,
  tempo,
  glow,
}: {
  anim: TurtleAnim;
  quality: TurtleQuality;
  emphasis: "replay" | "none";
  motion: number;
  tempo: number;
  glow: boolean;
}) {
  const shellMap = useMemo(() => makeShellTexture(quality === "low", glow), [quality, glow]);
  useEffect(() => () => shellMap.dispose(), [shellMap]);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const frontLeft = useRef<THREE.Group>(null);
  const frontRight = useRef<THREE.Group>(null);
  const backLeft = useRef<THREE.Group>(null);
  const backRight = useRef<THREE.Group>(null);
  const seg = quality === "low" ? 10 : 18;
  const skin = glow ? "#e8f56b" : "#b7c56b";
  const flipper = glow ? "#c8f04a" : "#8eaf55";
  const plastron = glow ? "#ffe39a" : "#f0d7a4";
  const emissive = glow ? "#1c8a40" : "#000000";
  const emissiveIntensity = glow ? 0.42 : 0;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * tempo;
    const m = motion;
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.5) * 0.055 * m;
      body.current.rotation.z = Math.sin(t * 0.8) * 0.05 * m;
      body.current.rotation.y = emphasis === "replay" ? t * 0.55 * m : Math.sin(t * 0.35) * 0.12 * m;
    }
    const flap = Math.sin(t * 1.8) * 0.34 * m;
    if (frontLeft.current) {
      frontLeft.current.rotation.set(0.15, 0, 0.45 + flap);
    }
    if (frontRight.current) {
      frontRight.current.rotation.set(0.15, 0, -0.45 - flap);
    }
    if (backLeft.current) backLeft.current.rotation.set(0, 0, 0.35 + Math.sin(t * 1.8 + 1) * 0.18 * m);
    if (backRight.current) backRight.current.rotation.set(0, 0, -0.35 - Math.sin(t * 1.8 + 1) * 0.18 * m);
    if (head.current) head.current.rotation.set(0, 0, 0);
    if (mouth.current) mouth.current.scale.y = 0.35;
    if (anim === "wave" && frontRight.current) {
      frontRight.current.rotation.set(-0.35, 0.1, -1.25 + Math.sin(t * 7) * 0.42 * m);
    }
    if (anim === "talk") {
      if (mouth.current) mouth.current.scale.y = 0.3 + (Math.sin(t * 9) * 0.5 + 0.5) * 0.95;
      if (head.current) head.current.rotation.x = Math.sin(t * 3) * 0.08 * m;
    }
    if (anim === "point" && frontRight.current && head.current) {
      frontRight.current.rotation.set(0.1, 0.45, -1.65);
      head.current.rotation.y = -0.32;
    }
    if (anim === "think" && frontRight.current && head.current) {
      head.current.rotation.set(0.2, 0, 0.28);
      frontRight.current.rotation.set(-0.85, 0.2, -1.05);
    }
  });

  return (
    <group ref={body}>
      {glow && (
        <mesh position={[0, 0.12, -0.05]} scale={[1.26, 0.6, 1.5]}>
          <sphereGeometry args={[1, Math.max(8, seg - 4), Math.max(8, seg - 4)]} />
          <meshBasicMaterial color="#d8ffb0" side={THREE.BackSide} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0.12, -0.05]} scale={[1.18, 0.52, 1.42]}>
        <sphereGeometry args={[1, seg, seg]} />
        <meshStandardMaterial map={shellMap} roughness={glow ? 0.38 : 0.62} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      </mesh>
      <mesh position={[0, -0.05, -0.02]} scale={[0.95, 0.22, 1.22]}>
        <sphereGeometry args={[1, seg, Math.max(8, seg - 4)]} />
        <meshStandardMaterial color={plastron} roughness={0.7} emissive={glow ? "#8a6a28" : "#000000"} emissiveIntensity={glow ? 0.2 : 0} />
      </mesh>
      <group ref={head} position={[0, 0.05, 0.98]}>
        <mesh scale={[0.38, 0.3, 0.42]}>
          <sphereGeometry args={[1, seg, seg]} />
          <meshStandardMaterial color={skin} roughness={glow ? 0.4 : 0.55} emissive={glow ? "#6a8a20" : "#000000"} emissiveIntensity={glow ? 0.28 : 0} />
        </mesh>
        <mesh position={[-0.14, 0.08, 0.24]} scale={[0.09, 0.1, 0.06]}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#f7fff8" />
        </mesh>
        <mesh position={[0.14, 0.08, 0.24]} scale={[0.09, 0.1, 0.06]}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#f7fff8" />
        </mesh>
        <mesh position={[-0.14, 0.08, 0.29]} scale={0.045}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#1b1a17" />
        </mesh>
        <mesh position={[0.14, 0.08, 0.29]} scale={0.045}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#1b1a17" />
        </mesh>
        <mesh ref={mouth} position={[0, -0.08, 0.3]} scale={[0.14, 0.35, 0.07]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#2c261c" />
        </mesh>
      </group>
      <group ref={frontLeft} position={[-0.78, 0.02, 0.28]}>
        <mesh position={[-0.32, 0, 0.02]} scale={[0.42, 0.07, 0.78]}>
          <sphereGeometry args={[1, seg, Math.max(8, seg - 6)]} />
          <meshStandardMaterial color={flipper} roughness={0.5} />
        </mesh>
      </group>
      <group ref={frontRight} position={[0.78, 0.02, 0.28]}>
        <mesh position={[0.32, 0, 0.02]} scale={[0.42, 0.07, 0.78]}>
          <sphereGeometry args={[1, seg, Math.max(8, seg - 6)]} />
          <meshStandardMaterial color={flipper} roughness={0.5} />
        </mesh>
      </group>
      <group ref={backLeft} position={[-0.62, -0.02, -0.72]}>
        <mesh position={[-0.18, 0, -0.08]} scale={[0.28, 0.06, 0.42]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={flipper} />
        </mesh>
      </group>
      <group ref={backRight} position={[0.62, -0.02, -0.72]}>
        <mesh position={[0.18, 0, -0.08]} scale={[0.28, 0.06, 0.42]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={flipper} />
        </mesh>
      </group>
      <mesh position={[0, 0.02, -1.35]} rotation={[0.4, 0, 0]} scale={[0.12, 0.08, 0.28]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial color={skin} />
      </mesh>
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

export function TurtleSvg({ anim, glow = false }: { anim: TurtleAnim; glow?: boolean }) {
  return (
    <svg className={`turtle-svg anim-${anim}${glow ? " glow" : ""}`} viewBox="0 0 220 150" role="img" aria-label="綠蠵龜小綠">
      <g className="body">
        <ellipse className="flip-r" cx="168" cy="78" rx="34" ry="12" fill="#8eaf55" transform="rotate(18 168 78)" />
        <ellipse cx="52" cy="78" rx="34" ry="12" fill="#8eaf55" transform="rotate(-18 52 78)" />
        <ellipse cx="150" cy="112" rx="22" ry="9" fill="#7ea24c" />
        <ellipse cx="70" cy="112" rx="22" ry="9" fill="#7ea24c" />
        <ellipse cx="110" cy="78" rx="58" ry="36" fill="#1c7a46" />
        <ellipse cx="110" cy="86" rx="40" ry="22" fill="#16693c" />
        <circle cx="168" cy="62" r="18" fill="#b7c56b" />
        <circle cx="174" cy="58" r="3.2" fill="#1b1a17" />
        <ellipse className="mouth" cx="182" cy="68" rx="5" ry="2.4" fill="#2c261c" />
      </g>
    </svg>
  );
}

export function TurtleStage({
  anim = "idle",
  phase = "idle",
  quality = "high",
  emphasis = "none",
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
  if (!webgl) {
    return (
      <div className={className} style={{ display: "grid", placeItems: "center", background: transparent ? "transparent" : "#000" }}>
        <TurtleSvg anim={reduced ? "idle" : anim} glow={glow} />
      </div>
    );
  }
  return (
    <div className={className} style={{ width: "100%", height: "100%", background: transparent ? "transparent" : "#000" }}>
      <Canvas
        frameloop={phase === "off" || capped ? "demand" : "always"}
        dpr={quality === "low" ? 1 : capped ? [1, 1.25] : [1, 1.6]}
        camera={{ position: glow ? [2.15, 1.45, 3.7] : [0, 0.28, 4.5], fov: glow ? 32 : 35 }}
        gl={{
          alpha: transparent,
          antialias: quality !== "low",
          powerPreference: quality === "low" ? "low-power" : "default",
        }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor("#000000", transparent ? 0 : 1);
          camera.lookAt(0, 0.05, 0.1);
        }}
      >
        {capped && <FpsCap fps={fps} />}
        {glow ? (
          <>
            <ambientLight intensity={0.62} />
            <directionalLight position={[2.4, 3.2, 4.2]} intensity={2.15} color="#ffffff" />
            <directionalLight position={[-3.1, 1.1, -2.6]} intensity={1.45} color="#d8ffc4" />
            <pointLight position={[0, 0.15, -2.6]} intensity={1.5} color="#f6fff4" distance={12} />
          </>
        ) : (
          <>
            <ambientLight intensity={0.78} />
            <directionalLight position={[2.4, 3.1, 4]} intensity={1.4} />
            <directionalLight position={[-3, 1, -2]} intensity={0.45} color="#8ef6e4" />
          </>
        )}
        {caustics && <Caustics low={quality === "low"} still={reduced} />}
        {Array.from({ length: bubbleCount }, (_, index) => (
          <Bubble key={index} index={index} tempo={reduced ? 0.35 : tempo} />
        ))}
        <Swim phase={phase}>
          <TrueSize enabled={trueSize} screenWidthCm={screenWidthCm}>
            <group rotation={glow ? [0.18, -0.65, 0] : [0, 0, 0]}>
            <TurtleModel
              anim={reduced ? "idle" : anim}
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
