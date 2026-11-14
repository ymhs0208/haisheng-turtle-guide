import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TurtleAnim, TurtleExpression, TurtleQuality } from "./TurtleStage";

type PartProps = {
  position?: [number, number, number];
  scale: [number, number, number];
  color: string;
  low: boolean;
};

function RoundedPart({ position, scale, color, low }: PartProps) {
  return <mesh position={position} scale={scale}>
    <sphereGeometry args={[1, low ? 16 : 32, low ? 12 : 24]} />
    <meshStandardMaterial color={color} roughness={0.72} />
  </mesh>;
}

/** Stylized guide avatar. The biological model remains available for calibrated size displays. */
export function GuideCharacter({ anim, expression, quality, motion, tempo, glow }: {
  anim: TurtleAnim;
  expression: TurtleExpression;
  quality: TurtleQuality;
  motion: number;
  tempo: number;
  glow: boolean;
}) {
  const low = quality === "low";
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const scarf = useRef<THREE.Group>(null);
  const happy = expression === "happy" || anim === "wave";
  const talking = expression === "talk" || anim === "talk";
  const skin = glow ? "#83e8b8" : "#63b99b";
  const pale = "#f4e7bb";
  const dark = "#173f3b";
  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime() * tempo;
    const blend = 1 - Math.exp(-8 * delta);
    if (root.current) {
      root.current.position.y = -0.1 + Math.sin(t * 1.8) * 0.045 * motion;
      root.current.rotation.z = Math.sin(t * 0.8) * 0.025 * motion;
    }
    if (head.current) {
      head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, anim === "think" ? 0.16 : Math.sin(t * 0.9) * 0.035 * motion, blend);
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, anim === "point" ? -0.2 : Math.sin(t * 0.6) * 0.04 * motion, blend);
      head.current.rotation.x = talking ? Math.sin(t * 3.2) * 0.035 * motion : 0;
    }
    if (leftArm.current) leftArm.current.rotation.z = -0.2 + Math.sin(t * 1.7) * 0.06 * motion;
    if (rightArm.current) {
      let angle = 0.2 + Math.sin(t * 1.7 + 1) * 0.06 * motion;
      if (anim === "wave") angle = 2.3 + Math.sin(t * 6) * 0.25 * motion;
      if (anim === "point") angle = 1.35;
      if (anim === "think") angle = 2.65;
      if (talking) angle = 0.65 + Math.sin(t * 2.7) * 0.15 * motion;
      rightArm.current.rotation.z = THREE.MathUtils.lerp(rightArm.current.rotation.z, angle, blend);
      rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, anim === "think" ? -0.7 : 0, blend);
    }
    if (eyes.current) {
      const cycle = t % 4.8;
      const blink = motion > 0.3 && cycle > 4.55 ? Math.sin((cycle - 4.55) / 0.25 * Math.PI) : 0;
      eyes.current.scale.y = Math.max(0.08, 1 - blink * 0.92 - (happy ? 0.12 : 0));
    }
    if (mouth.current) mouth.current.scale.y = talking ? 0.45 + Math.abs(Math.sin(t * 8)) * 0.8 : 0.28;
    if (scarf.current) scarf.current.rotation.z = Math.sin(t * 2) * 0.05 * motion;
  });

  return <group ref={root}>
    {/* A flattened shell keeps the silhouette readable from the front and side. */}
    <RoundedPart position={[0, -0.28, -0.3]} scale={[0.79, 0.98, 0.38]} color="#235f54" low={low} />
    <RoundedPart position={[0, -0.28, -0.36]} scale={[0.7, 0.88, 0.36]} color="#398574" low={low} />
    <RoundedPart position={[0, -0.28, 0]} scale={[0.65, 0.84, 0.43]} color={skin} low={low} />
    <RoundedPart position={[0, -0.26, 0.34]} scale={[0.51, 0.65, 0.15]} color={pale} low={low} />
    {[-0.55, -0.25, 0.05].map(y => <mesh key={y} position={[0, y, 0.49]}><boxGeometry args={[0.68, 0.018, 0.012]} /><meshStandardMaterial color="#d6c596" /></mesh>)}
    <mesh position={[0, -0.28, 0.497]}><boxGeometry args={[0.017, 1.08, 0.012]} /><meshStandardMaterial color="#d6c596" /></mesh>

    <group ref={leftArm} position={[-0.57, 0.12, 0]}>
      <RoundedPart position={[-0.1, -0.36, 0.06]} scale={[0.19, 0.5, 0.15]} color={skin} low={low} />
      <RoundedPart position={[-0.13, -0.66, 0.08]} scale={[0.2, 0.22, 0.16]} color={skin} low={low} />
    </group>
    <group ref={rightArm} position={[0.57, 0.12, 0]}>
      <RoundedPart position={[0.1, -0.36, 0.06]} scale={[0.19, 0.5, 0.15]} color={skin} low={low} />
      <RoundedPart position={[0.13, -0.66, 0.08]} scale={[0.2, 0.22, 0.16]} color={skin} low={low} />
    </group>
    <RoundedPart position={[-0.33, -1.08, 0.06]} scale={[0.23, 0.34, 0.25]} color={skin} low={low} />
    <RoundedPart position={[0.33, -1.08, 0.06]} scale={[0.23, 0.34, 0.25]} color={skin} low={low} />
    <RoundedPart position={[-0.34, -1.31, 0.18]} scale={[0.29, 0.14, 0.34]} color="#438f79" low={low} />
    <RoundedPart position={[0.34, -1.31, 0.18]} scale={[0.29, 0.14, 0.34]} color="#438f79" low={low} />

    <group ref={head} position={[0, 0.96, 0.12]}>
      <RoundedPart scale={[0.75, 0.65, 0.56]} color={skin} low={low} />
      <RoundedPart position={[0, -0.22, 0.36]} scale={[0.58, 0.3, 0.26]} color="#c8deb2" low={low} />
      <group ref={eyes} position={[0, 0.08, 0.48]}>
        {[-1, 1].map(side => <group key={side} position={[side * 0.29, 0, 0]}>
          <RoundedPart scale={[0.2, 0.24, 0.11]} color="#fff9e9" low={low} />
          <RoundedPart position={[0.015, 0, 0.088]} scale={[0.113, 0.155, 0.045]} color={dark} low={low} />
          <RoundedPart position={[0.045, 0.06, 0.127]} scale={[0.036, 0.04, 0.016]} color="#ffffff" low={low} />
          <RoundedPart position={[-0.025, -0.05, 0.13]} scale={[0.016, 0.019, 0.008]} color="#a7e3cf" low={low} />
        </group>)}
      </group>
      {[-1, 1].map(side => <group key={side}>
        <RoundedPart position={[side * 0.45, -0.18, 0.48]} scale={[0.1, 0.048, 0.025]} color="#dc9c83" low={low} />
        <RoundedPart position={[side * 0.09, -0.08, 0.604]} scale={[0.017, 0.012, 0.008]} color="#518873" low={low} />
        <mesh position={[side * 0.29, 0.365, 0.44]} rotation={[0, 0, Math.PI / 2 + side * (anim === "think" ? 0.22 : -0.08)]}>
          <capsuleGeometry args={[0.025, 0.16, 4, 8]} /><meshStandardMaterial color="#397a64" />
        </mesh>
      </group>)}
      <mesh ref={mouth} position={[0, -0.3, 0.61]}>
        <sphereGeometry args={[0.105, 20, 12]} /><meshBasicMaterial color="#713e39" />
      </mesh>
      <RoundedPart position={[0, -0.326, 0.637]} scale={[0.047, 0.018, 0.012]} color="#eaa18a" low={low} />
      {/* Three forehead markings give the character a recognizable sea-turtle motif. */}
      {[-1, 0, 1].map(side => <RoundedPart key={side} position={[side * 0.16, 0.48 - Math.abs(side) * 0.035, 0.33]} scale={[0.055, 0.075, 0.018]} color="#3e937b" low={low} />)}
    </group>

    <mesh position={[0, 0.39, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.36, 0.09, 8, 32]} /><meshStandardMaterial color="#df8b62" roughness={0.9} />
    </mesh>
    <group ref={scarf} position={[0.16, 0.36, 0.45]}>
      <RoundedPart scale={[0.115, 0.11, 0.07]} color="#e6a16f" low={low} />
      <mesh position={[0.09, -0.2, 0]} rotation={[0, 0, 0.3]}><coneGeometry args={[0.14, 0.4, 3]} /><meshStandardMaterial color="#d97c54" side={THREE.DoubleSide} /></mesh>
    </group>
    <mesh position={[-0.46, -0.35, 0.39]} rotation={[0, 0, -0.17]}>
      <boxGeometry args={[0.28, 0.4, 0.13]} /><meshStandardMaterial color="#406c65" roughness={0.95} />
    </mesh>
    <mesh position={[-0.46, -0.24, 0.47]}><boxGeometry args={[0.3, 0.13, 0.04]} /><meshStandardMaterial color="#55877b" /></mesh>
    <mesh position={[-0.46, -0.33, 0.5]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#e4bc73" /></mesh>
    <mesh position={[-0.28, 0.13, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.12, 0.12, 0.025, 24]} />
      <meshStandardMaterial color="#dfb96e" metalness={0.35} roughness={0.45} />
    </mesh>
    <mesh position={[-0.28, 0.13, 0.51]} rotation={[0, 0, -0.3]}>
      <coneGeometry args={[0.052, 0.13, 3]} /><meshStandardMaterial color="#fff4d1" />
    </mesh>
  </group>;
}

export function GuideCharacterFallback({ anim, glow = false }: { anim: TurtleAnim; glow?: boolean }) {
  return <svg className={`turtle-svg guide-avatar anim-${anim}${glow ? " glow" : ""}`} viewBox="0 0 240 280" role="img" aria-label="小綠，戴橘色領巾與指南針徽章的海龜導遊">
    <g className="body">
      <ellipse cx="120" cy="169" rx="59" ry="69" fill="#235f54" />
      <ellipse cx="120" cy="170" rx="48" ry="60" fill="#63b99b" />
      <ellipse cx="120" cy="175" rx="35" ry="46" fill="#f4e7bb" />
      <path d="M91 161h58M86 180h68M94 199h52M120 134v79" fill="none" stroke="#d6c596" strokeWidth="2" />
      <ellipse cx="70" cy="167" rx="13" ry="34" fill="#63b99b" transform="rotate(12 70 167)" />
      <g className="flip-r"><ellipse cx="170" cy="167" rx="13" ry="34" fill="#63b99b" transform="rotate(-12 170 167)" /></g>
      <ellipse cx="98" cy="232" rx="18" ry="25" fill="#63b99b" /><ellipse cx="142" cy="232" rx="18" ry="25" fill="#63b99b" />
      <ellipse cx="94" cy="250" rx="22" ry="10" fill="#438f79" /><ellipse cx="146" cy="250" rx="22" ry="10" fill="#438f79" />
      <g className="head">
        <ellipse cx="120" cy="81" rx="54" ry="47" fill="#63b99b" />
        <ellipse cx="120" cy="103" rx="41" ry="22" fill="#c8deb2" />
        <g className="eyes">{[98,142].map(x => <g key={x}><ellipse cx={x} cy="79" rx="14" ry="17" fill="#fff9e9" /><ellipse cx={x+2} cy="80" rx="8" ry="12" fill="#173f3b" /><circle cx={x+5} cy="74" r="3" fill="white" /></g>)}</g>
        <path d="M88 57q10-6 19-1M133 56q10-5 20 1" fill="none" stroke="#397a64" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="85" cy="102" rx="7" ry="3" fill="#dc9c83" /><ellipse cx="155" cy="102" rx="7" ry="3" fill="#dc9c83" />
        <path className="smile" d="M110 111q10 8 20 0" fill="none" stroke="#713e39" strokeWidth="3" strokeLinecap="round" />
        <ellipse className="open" cx="120" cy="114" rx="7" ry="6" fill="#713e39" />
        <path d="M108 44v5M120 41v6M132 44v5" stroke="#3e937b" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path d="M91 126q29 14 58 0" stroke="#df8b62" strokeWidth="10" fill="none" /><path d="m134 128 16 27-21-7z" fill="#d97c54" />
      <rect x="77" y="169" width="22" height="28" rx="4" fill="#406c65" /><rect x="75" y="167" width="26" height="10" rx="3" fill="#55877b" /><circle cx="88" cy="181" r="2" fill="#e4bc73" />
      <circle cx="103" cy="148" r="9" fill="#dfb96e" /><path d="m105 141-6 11 8-3z" fill="#fff4d1" />
    </g>
  </svg>;
}
