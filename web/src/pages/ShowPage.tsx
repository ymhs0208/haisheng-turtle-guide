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
      <p className="text-base text-muted" role="status">
        {!connected
          ? "連線中斷，正在重新連線…"
          : presence.displays === 0
            ? "目前展區還沒有展示箱連線，請確認展示箱已開啟並選擇相同展區。"
            : `展示箱已連線 · ${presence.phones} 人參與${presence.phones <= 1 ? " · 單人模式" : " · 團體模式"}`}
      </p>
      {debug && (
        <p className="text-base text-muted">
          {connected ? "連線正常" : "連線中斷"} · {presence.phones} 支手機 · {presence.displays} 台展示箱
          {presence.phones <= 1 ? " · 只有你的話會改成一對一" : ""}
        </p>
      )}
      <Button size="lg" disabled={!connected} onClick={() => send({ type: away ? "recall_turtle" : "send_turtle" })}>
        {away ? "請小綠回來" : "送到展示箱"}
      </Button>
      <Button size="lg" variant="sand" disabled={!connected} onClick={() => send({ type: "show_start" })}>
        {presence.phones <= 1 ? "開始單人挑戰" : "發起團體挑戰"}
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
          <Button type="submit" variant="ghost" disabled={!connected || text.trim().length < 2}>
            送上展示箱
          </Button>
        </form>
        {sent && <p className="mt-3">已送出：{sent}</p>}
        {queue.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {queue.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.text}</span>
                <span className="shrink-0 text-muted">{item.votes} 人想問</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
