import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import "./turtle.css";

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

function makeShellTexture(low: boolean): THREE.CanvasTexture {
  const size = low ? 128 : 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  ctx.fillStyle = "#1c7a46";
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
    ctx.fillStyle = index % 2 === 0 ? "#145c36" : "#249255";
    ctx.ellipse(x * size, y * size, size * 0.15, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.012);
    ctx.strokeStyle = "#0d3f26";
    ctx.stroke();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Bubble({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.getElapsedTime() * 0.28 + index * 0.55;
    mesh.position.y = -0.7 + (t % 1.8);
    mesh.position.x = Math.sin(t * 2 + index) * 0.9;
    mesh.position.z = -0.4;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.04 + index * 0.012, 8, 8]} />
      <meshStandardMaterial color="#e7fff8" transparent opacity={0.38} />
    </mesh>
  );
}

function TurtleModel({
  anim,
  quality,
  emphasis,
  motion,
}: {
  anim: TurtleAnim;
  quality: TurtleQuality;
  emphasis: "replay" | "none";
  motion: number;
}) {
  const shellMap = useMemo(() => makeShellTexture(quality === "low"), [quality]);
  useEffect(() => () => shellMap.dispose(), [shellMap]);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const frontLeft = useRef<THREE.Group>(null);
  const frontRight = useRef<THREE.Group>(null);
  const backLeft = useRef<THREE.Group>(null);
  const backRight = useRef<THREE.Group>(null);
  const seg = quality === "low" ? 10 : 18;
  const skin = "#b7c56b";
  const flipper = "#8eaf55";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
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
      <mesh position={[0, 0.12, -0.05]} scale={[1.18, 0.52, 1.42]}>
        <sphereGeometry args={[1, seg, seg]} />
        <meshStandardMaterial map={shellMap} roughness={0.62} />
      </mesh>
      <mesh position={[0, -0.05, -0.02]} scale={[0.95, 0.22, 1.22]}>
        <sphereGeometry args={[1, seg, Math.max(8, seg - 4)]} />
        <meshStandardMaterial color="#f0d7a4" roughness={0.7} />
      </mesh>
      <group ref={head} position={[0, 0.05, 0.98]}>
        <mesh scale={[0.38, 0.3, 0.42]}>
          <sphereGeometry args={[1, seg, seg]} />
          <meshStandardMaterial color={skin} roughness={0.55} />
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
      {quality === "high" && (
        <>
          <Bubble index={0} />
          <Bubble index={1} />
          <Bubble index={2} />
        </>
      )}
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
    const k = Math.min(1, (now - started.current) / 1.15);
    const ease = k * k * (3 - 2 * k);
    let x = 0;
    let visible = true;
    if (phase === "exit") {
      x = ease * 5.4;
      visible = k < 0.98;
    } else if (phase === "enter") {
      x = (1 - ease) * -5.4;
    } else if (phase === "off") {
      visible = false;
    }
    group.visible = visible;
    group.position.x = x;
  });
  return <group ref={ref}>{children}</group>;
}

export function TurtleSvg({ anim }: { anim: TurtleAnim }) {
  return (
    <svg className={`turtle-svg anim-${anim}`} viewBox="0 0 220 150" role="img" aria-label="綠蠵龜小綠">
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
}: {
  anim?: TurtleAnim;
  phase?: TurtlePhase;
  quality?: TurtleQuality;
  emphasis?: "replay" | "none";
  transparent?: boolean;
  className?: string;
}) {
  const [webgl] = useState(hasWebGL);
  const reduced = useReducedMotion();
  if (!webgl) {
    return (
      <div className={className} style={{ display: "grid", placeItems: "center" }}>
        <TurtleSvg anim={reduced ? "idle" : anim} />
      </div>
    );
  }
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        frameloop={phase === "off" ? "demand" : "always"}
        dpr={quality === "low" ? 1 : [1, 1.6]}
        camera={{ position: [0, 0.28, 4.5], fov: 35 }}
        gl={{
          alpha: transparent,
          antialias: quality !== "low",
          powerPreference: quality === "low" ? "low-power" : "default",
        }}
        onCreated={({ gl }) => gl.setClearColor("#000000", transparent ? 0 : 1)}
      >
        <ambientLight intensity={0.78} />
        <directionalLight position={[2.4, 3.1, 4]} intensity={1.4} />
        <directionalLight position={[-3, 1, -2]} intensity={0.45} color="#8ef6e4" />
        <Swim phase={phase}>
          <TurtleModel anim={reduced ? "idle" : anim} quality={quality} emphasis={emphasis} motion={reduced ? 0.2 : 1} />
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
