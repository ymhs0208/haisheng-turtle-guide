import { TurtleStage } from "@scene/TurtleStage";
import { useGuide } from "@/state";

const CAPTION: Record<string, string> = {
  idle: "小綠在等你",
  wave: "小綠在揮手",
  talk: "小綠在說明",
  point: "小綠在提示",
  think: "小綠在想",
  off: "小綠在展示箱",
};

export function Porthole({ large = false }: { large?: boolean }) {
  const { anim, turtlePhase, quality, emphasis } = useGuide();
  const caption = turtlePhase === "off" ? CAPTION.off : CAPTION[anim];
  return (
    <div>
      <div className={large ? "porthole" : "porthole"} style={large ? undefined : { width: "min(100%, 220px)" }}>
        <div className="water" aria-hidden />
        {turtlePhase !== "off" && (
          <TurtleStage
            anim={anim}
            phase={turtlePhase === "idle" ? "idle" : turtlePhase}
            quality={quality}
            emphasis={emphasis}
            className="absolute inset-0"
          />
        )}
        {turtlePhase === "off" && (
          <p className="absolute inset-0 grid place-items-center px-8 text-center text-sand">小綠正在展示箱裡</p>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-muted">{caption}</p>
    </div>
  );
}
