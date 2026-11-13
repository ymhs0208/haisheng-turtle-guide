import { useState } from "react";
import { Porthole } from "@/components/Porthole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebug } from "@/debug";
import { useGuide } from "@/state";

export function ShowPage() {
  const debug = useDebug();
  const { connected, presence, queue, turtlePhase, send, zones, session } = useGuide();
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const zone = zones.find((item) => item.id === session?.currentZoneId);
  const away = turtlePhase === "off";

  return (
    <div className="soft-in grid gap-4">
      <header>
        <p className="text-base text-tide">{zone?.name ?? "還沒選展區"}</p>
        <h1 className="font-serif text-3xl">展示箱</h1>
      </header>
      <Porthole />
      <p className="text-lg leading-8">{away ? "小綠在展示箱裡，大家看得到。" : "按下面，小綠就游去展示箱。"}</p>
      {!connected && <p className="text-base text-coral">展示箱還沒連上，請稍後再試。</p>}
      {debug && (
        <p className="text-base text-muted">
          {connected ? "連線正常" : "連線中斷"} · {presence.phones} 支手機 · {presence.displays} 台展示箱
          {presence.phones <= 1 ? " · 只有你的話會改成一對一" : ""}
        </p>
      )}
      <Button size="lg" onClick={() => send({ type: away ? "recall_turtle" : "send_turtle" })}>
        {away ? "請小綠回來" : "送到展示箱"}
      </Button>
      <Button size="lg" variant="sand" onClick={() => send({ type: "show_start" })}>
        發起團體挑戰
      </Button>
      <details className="card text-base leading-7">
        <summary className="cursor-pointer text-lg font-semibold">請展示箱回答一個問題</summary>
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim().length < 2) return;
            const ok = send({ type: "enqueue_question", text: text.trim() });
            if (ok) {
              setSent(text.trim());
              setText("");
            }
          }}
        >
          <Input value={text} maxLength={80} placeholder="想讓大家一起聽的問題" onChange={(event) => setText(event.target.value)} />
          <Button type="submit" variant="ghost">
            送上展示箱
          </Button>
        </form>
        {sent && <p className="mt-3">已送出：{sent}</p>}
        {queue.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {queue.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.text}</span>
                {debug && <span className="text-muted">{item.votes} 人</span>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
