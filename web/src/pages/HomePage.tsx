import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { MuseumJourney } from "@/components/MuseumJourney";
import { ZoneSelect } from "@/components/ZoneSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { api } from "@/api";
import { useDebug } from "@/debug";
import { useGuide } from "@/state";

export function HomePage() {
  const guide = useGuide();
  const debug = useDebug();
  const { session, meta, zones, summary, presence, connected, quality, setQuality, selectZone, disclaimer, turtlePhase, send, setAnim } = guide;
  const [qr, setQr] = useState("");
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [recognizeText, setRecognizeText] = useState("");
  const [introOn, setIntroOn] = useState(false);
  const [now, setNow] = useState(Date.now());
  const zone = zones.find((item) => item.id === session?.currentZoneId) ?? zones[0];
  const policy = meta?.policies.find((item) => item.id === session?.experimentGroup);

  useEffect(() => {
    if (session && !session.currentZoneId && zones[0]) void selectZone(zones[0].id);
  }, [session, zones, selectZone]);

  useEffect(() => {
    if (!session) return;
    const url = `${location.origin}/j/${session.id}`;
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0c2e32", light: "#f6edd9" } }).then(setQr);
  }, [session]);

  useEffect(() => {
    if (!debug) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [debug]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (!session || !zone) return <p className="text-base text-muted">正在準備展區…</p>;
  const remain = Math.max(0, Math.round((session.visitEndsAt - now) / 1000));
  const mastery = summary?.mastery.filter((item) => item.zoneId === zone.id) ?? [];
  const mine = summary?.byZone.find((item) => item.zoneId === zone.id);
  const away = turtlePhase === "off";

  return (
    <div className="museum-home">
      <MuseumJourney key={session.id} />
      <details className="personal-tools"><summary>更多選項與參觀工具</summary><div className="museum-utilities">
      <details className="card">
      <summary className="cursor-pointer font-semibold">自由探索與展示箱</summary>
      <div className="mt-4 grid gap-4">
      <ZoneSelect />
      <div className="grid gap-3">
        <Button size="lg" onClick={playIntro}>
          {introOn ? "再聽一次" : "聽小綠介紹"}
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link to="/app/chat">問小綠</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link to="/app/quiz">小挑戰</Link>
        </Button>
        <Button size="lg" variant="sand" onClick={moveTurtle}>
          {away ? "請小綠回來" : "送到展示箱"}
        </Button>
      </div>
      {introOn && <p className="card text-lg leading-8">{zone.intro}</p>}
      {away && (
        <p className="text-center text-base text-muted">
          小綠在展示箱裡。{" "}
          <Link className="font-semibold text-tide underline-offset-4 hover:underline" to="/app/show">
            打開展示箱
          </Link>
        </p>
      )}
      </div></details>
      <details className="card text-base leading-7">
        <summary className="cursor-pointer text-lg font-semibold">參觀工具與設定</summary>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" asChild>
              <Link to="/app/quiz?kind=pre">前測</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/app/quiz?kind=post">後測</Link>
            </Button>
          </div>
          <Button variant="ghost" asChild>
            <Link to="/app/show">團體挑戰與展示箱</Link>
          </Button>
          <Button variant="ghost" onClick={() => void openRecognize()}>
            拍照辨識
          </Button>
          <Button variant="ghost" onClick={() => setQuality(quality === "low" ? "high" : "low")}>
            {quality === "low" ? "省電模式開著" : "改成省電模式"}
          </Button>
          <div>
            <p className="font-semibold">換手機繼續</p>
            {qr && <img className="mx-auto mt-3 rounded-2xl" src={qr} alt="行程票券 QR Code" width={220} height={220} />}
            <p className="mt-2 break-all text-muted">
              {location.origin}/j/{session.id}
            </p>
          </div>
          {debug && <Link className="font-semibold text-tide underline-offset-4 hover:underline" to="/app/admin">
            工作人員
          </Link>}
        </div>
      </details>
      {debug && <details className="card text-base leading-7">
        <summary className="cursor-pointer text-lg font-semibold">評審示範</summary>
        <p className="mt-3 text-muted">訪客會被隨機分組。這裡可以改組，或把剩餘時間改短。</p>
        <div className="mt-3 grid gap-2">
          {meta?.policies.map((item) => (
            <Button key={item.id} variant="ghost" onClick={() => void demo({ experimentGroup: item.id })}>
              改成{item.label}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => void demo({ remainingSec: 30 })}>
            把剩餘時間改成 30 秒
          </Button>
        </div>
      </details>}
      {debug && (
        <section className="card grid gap-3 text-base leading-7">
          <h2 className="font-serif text-2xl">教師檢視</h2>
          <p>
            {connected ? "已連上展示箱" : "展示箱連線中"} · {presence.phones} 支手機、{presence.displays} 台展示箱
          </p>
          <p>
            剩餘 {Math.floor(remain / 60)}:{String(remain % 60).padStart(2, "0")} · {policy?.label}
          </p>
          <p className="text-muted">{policy?.blurb}</p>
          {mastery.map((item) => (
            <div key={item.conceptId}>
              <div className="mb-1 flex justify-between">
                <span>{item.title}</span>
                <span className="text-muted">{Math.round(item.pKnow * 100)}%</span>
              </div>
              <Progress value={item.pKnow * 100} />
            </div>
          ))}
          {mine && (
            <p className="text-muted">
              前測 {mine.pre.done ? `${mine.pre.correct}/${mine.pre.total}` : "還沒做"} · 練習 {mine.practice.correct}/{mine.practice.attempts} · 後測{" "}
              {mine.post.done ? `${mine.post.correct}/${mine.post.total}` : "還沒做"}
            </p>
          )}
        </section>
      )}
      <p className="text-base leading-7 text-muted">{disclaimer}</p>
      </div></details>
      <Dialog open={recognizeOpen} onOpenChange={setRecognizeOpen}>
        <DialogContent>
          <DialogTitle>拍照辨識還沒開放</DialogTitle>
          <DialogDescription>{recognizeText}</DialogDescription>
          <Button className="mt-5 w-full" onClick={() => setRecognizeOpen(false)}>
            知道了
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );

  function playIntro() {
    setIntroOn(true);
    setAnim("talk");
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(zone.intro);
      utter.lang = "zh-TW";
      utter.onend = () => setAnim("idle");
      window.speechSynthesis.speak(utter);
    } else {
      window.setTimeout(() => setAnim("idle"), 3200);
    }
  }

  function moveTurtle() {
    const ok = send({ type: away ? "recall_turtle" : "send_turtle" });
    if (ok) setAnim(away ? "wave" : "idle");
  }

  async function openRecognize() {
    try {
      const data = await api<{ message: string }>("/api/recognize", { method: "POST" });
      setRecognizeText(data.message);
    } catch {
      setRecognizeText("拍照辨識還在下一階段，這次先不判斷物種。");
    }
    setRecognizeOpen(true);
  }

  async function demo(body: object) {
    if (!session) return;
    await api(`/api/sessions/${session.id}/demo`, { method: "POST", body: JSON.stringify(body) });
    await guide.refresh();
  }
}
