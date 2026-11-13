import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGuide } from "@/state";

export function ShowOverlay() {
  const { show, clockOffset, myCorrect, remediation, dismissRemediation, send, zones } = useGuide();
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const answerStart = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setPicked(null);
    setSent(false);
    answerStart.current = 0;
  }, [show?.id]);

  useEffect(() => {
    if (show?.phase === "answer" && answerStart.current === 0) answerStart.current = Date.now();
  }, [show?.id, show?.phase]);

  useEffect(() => {
    if (show?.phase === "announce") navigator.vibrate?.(160);
  }, [show?.id, show?.phase]);

  if (!show && remediation) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 p-4">
        <article className="mx-auto w-full max-w-[480px] rounded-3xl bg-lagoon p-5">
          <p className="text-sm text-sand">{remediation.strategyLabel}</p>
          <h2 className="mt-1 font-serif text-2xl">{remediation.conceptTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{remediation.reason}</p>
          <p className="mt-4 leading-8">{remediation.text}</p>
          <Button className="mt-5 w-full" onClick={dismissRemediation}>
            我看完了
          </Button>
        </article>
      </div>
    );
  }
  if (!show) return null;

  const remain = Math.max(0, Math.ceil((show.endsAt - now - clockOffset) / 1000));
  const zoneName = zones.find((zone) => zone.id === show.zoneId)?.name ?? "展區";

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-abyss/95 px-4 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col">
        <p className="text-sm text-sand">
          {show.mode === "solo" ? "一對一" : "團體挑戰"} · {zoneName}
        </p>
        <p className="mt-2 font-serif text-5xl tabular-nums" aria-live="polite">
          {remain}
        </p>
        <h2 className="mt-4 font-serif text-2xl leading-snug">{show.question.prompt}</h2>
        <div className="mt-4 grid gap-2">
          {show.question.choices.map((choice, index) => {
            const revealed = show.phase === "explain";
            const correct = revealed && show.explain?.correctIndex === index;
            return (
              <Button
                key={choice}
                variant={correct ? "default" : "ghost"}
                className="h-auto justify-start whitespace-normal rounded-2xl py-3 text-left"
                disabled={show.phase !== "answer" || sent}
                onClick={() => {
                  const latency = Math.max(0, Date.now() - (answerStart.current || Date.now()));
                  const ok = send({ type: "show_answer", showId: show.id, choiceIndex: index, latencyMs: latency });
                  if (ok) {
                    setPicked(index);
                    setSent(true);
                  }
                }}
              >
                {index + 1}. {choice}
                {picked === index ? " · 已選" : ""}
              </Button>
            );
          })}
        </div>
        <div className="mt-4 text-sm leading-7 text-muted">
          {show.phase === "announce" && "題目先看，倒數結束就能作答。"}
          {show.phase === "answer" && !sent && "在手機上作答，結果會出現在展示箱。"}
          {show.phase === "answer" && sent && "已送出，看看展示箱的統計。"}
          {show.phase === "results" && (myCorrect == null ? "統計中。" : myCorrect ? "你答對了。" : "這題先記下來，等一下有你的補充。")}
          {show.phase === "explain" && show.explain && (
            <p>
              <span className="text-foam">{show.explain.headline}。</span>
              {show.explain.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
