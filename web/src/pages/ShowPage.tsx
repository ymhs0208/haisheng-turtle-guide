import { useState } from "react";
import { Porthole } from "@/components/Porthole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGuide } from "@/state";

export function ShowPage() {
  const { connected, presence, queue, turtlePhase, send, zones, session } = useGuide();
  const [text, setText] = useState("");
  const zone = zones.find((item) => item.id === session?.currentZoneId);

  return (
    <div className="grid gap-4">
      <header>
        <p className="text-sm text-sand">{zone?.name ?? "尚未選展區"}</p>
        <h1 className="font-serif text-3xl">展示箱</h1>
      </header>
      <Porthole />
      <p className="text-sm text-muted">
        {connected ? "連線正常" : "連線中斷，團體題需要連上伺服器"} · {presence.phones} 支手機 · {presence.displays} 台展示箱
        {presence.phones <= 1 ? " · 若只有你，會改成一對一" : ""}
      </p>
      <div className="grid gap-2">
        {turtlePhase === "off" ? (
          <Button onClick={() => send({ type: "recall_turtle" })}>請小綠回來</Button>
        ) : (
          <Button onClick={() => send({ type: "send_turtle" })}>送小綠去展示箱</Button>
        )}
        <Button variant="sand" onClick={() => send({ type: "show_start" })}>
          發起團體挑戰
        </Button>
      </div>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim().length < 2) return;
          const ok = send({ type: "enqueue_question", text: text.trim() });
          if (ok) setText("");
        }}
      >
        <Input value={text} maxLength={80} placeholder="要展示箱回答的問題" onChange={(event) => setText(event.target.value)} />
        <Button type="submit" variant="ghost">
          送到展示箱
        </Button>
      </form>
      <section className="rounded-3xl bg-lagoon/70 p-4">
        <h2 className="text-sm text-sand">等待回答</h2>
        {queue.length === 0 && <p className="mt-2 text-sm text-muted">還沒有問題。相近的問法會被合成一題。</p>}
        <ul className="mt-2 grid gap-2">
          {queue.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 text-sm">
              <span>{item.text}</span>
              <span className="text-muted">{item.votes} 人</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
