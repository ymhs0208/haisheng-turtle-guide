import { TurtleStage } from "@scene/TurtleStage";
import { useGuide } from "@/state";

const CAPTION: Record<string, string> = {
  idle: "小綠在這裡",
  wave: "小綠好開心",
  talk: "小綠在說話",
  point: "小綠在提示",
  think: "小綠在想",
  off: "小綠去展示箱了",
};

export function Porthole({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { anim, expression, turtlePhase, quality, emphasis } = useGuide();
  const caption =
    turtlePhase === "off" ? CAPTION.off : expression === "sad" ? "小綠有點難過" : anim === "wave" ? "小綠好開心" : CAPTION[anim];
  const width = size === "lg" ? "min(100%, 280px)" : size === "sm" ? "min(100%, 120px)" : "min(100%, 200px)";
  return (
    <div>
      <div className="porthole" style={{ width }}>
        <div className="water" aria-hidden />
        {turtlePhase !== "off" && (
          <TurtleStage
            anim={anim}
            expression={expression}
            phase={turtlePhase === "idle" ? "idle" : turtlePhase}
            quality={quality}
            emphasis={emphasis}
            className="absolute inset-0"
          />
        )}
        {turtlePhase === "off" && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-base text-sand">小綠正在展示箱裡</p>
        )}
      </div>
      <p className="mt-3 text-center text-base text-muted">{caption}</p>
    </div>
  );
}
