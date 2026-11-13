import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { Camera, Gauge } from "lucide-react";
import { Porthole } from "@/components/Porthole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { api } from "@/api";
import { useGuide } from "@/state";

export function HomePage() {
  const guide = useGuide();
  const { session, meta, zones, summary, presence, connected, quality, setQuality, selectZone, disclaimer } = guide;
  const [qr, setQr] = useState("");
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [recognizeText, setRecognizeText] = useState("");
  const [now, setNow] = useState(Date.now());
  const zone = zones.find((item) => item.id === session?.currentZoneId) ?? zones[0];
  const policy = meta?.policies.find((item) => item.id === session?.experimentGroup);

  useEffect(() => {
    if (session && !session.currentZoneId && zones[0]) void selectZone(zones[0].id);
  }, [session, zones, selectZone]);

  useEffect(() => {
    if (!session) return;
    const url = `${location.origin}/j/${session.id}`;
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#07303a", light: "#f3e0b8" } }).then(setQr);
  }, [session]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!session || !zone) return <p className="text-muted">正在準備展區…</p>;
  const remain = Math.max(0, Math.round(((session.visitEndsAt - now) / 1000)));
  const mastery = summary?.mastery.filter((item) => item.zoneId === zone.id) ?? [];
  const mine = summary?.byZone.find((item) => item.zoneId === zone.id);

  return (
    <div className="grid gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-sand">{zone.hall}</p>
          <h1 className="font-serif text-3xl">{session.nickname || "訪客"}，你好</h1>
        </div>
        <Badge>{policy?.label ?? "導覽中"}</Badge>
      </header>
      <Porthole />
      <p className="text-center text-sm text-muted">
        {connected ? "已連上展示箱" : "展示箱連線中"} · 這個展區 {presence.phones} 支手機、{presence.displays} 台展示箱
      </p>
      <div className="rounded-3xl bg-lagoon/80 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-sand">
            <Gauge className="h-4 w-4" /> 剩餘參觀時間
          </span>
          <span className="tabular-nums">{Math.floor(remain / 60)}:{String(remain % 60).padStart(2, "0")}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">{policy?.blurb}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {zones.map((item) => (
          <button
            key={item.id}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${item.id === zone.id ? "bg-teal text-abyss" : "bg-white/5"}`}
            onClick={() => void selectZone(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <p className="leading-7">{zone.intro}</p>
      <section className="grid gap-3">
        {mastery.map((item) => (
          <div key={item.conceptId}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{item.title}</span>
              <span className="text-muted">{Math.round(item.pKnow * 100)}%</span>
            </div>
            <Progress value={item.pKnow * 100} />
          </div>
        ))}
        {mastery.length === 0 && <p className="text-sm text-muted">這區的熟練度會在你作答之後出現。</p>}
      </section>
      {mine && (
        <p className="text-sm text-muted">
          前測 {mine.pre.done ? `${mine.pre.correct}/${mine.pre.total}` : "還沒做"} · 練習 {mine.practice.correct}/{mine.practice.attempts} · 後測{" "}
          {mine.post.done ? `${mine.post.correct}/${mine.post.total}` : "還沒做"}
        </p>
      )}
      <div className="grid gap-2">
        <Button asChild>
          <Link to="/app/quiz">練習這一區</Link>
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" asChild>
            <Link to="/app/quiz?kind=pre">前測</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/app/quiz?kind=post">後測</Link>
          </Button>
        </div>
        <Button variant="sand" asChild>
          <Link to="/app/chat">跟小綠聊這區</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => void openRecognize()}>
          <Camera className="h-4 w-4" /> 拍照辨識
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setQuality(quality === "low" ? "high" : "low")}>
          {quality === "low" ? "省電模式開著" : "改成省電模式"}
        </Button>
      </div>
      <details className="rounded-3xl bg-white/5 p-4 text-sm leading-6 text-muted">
        <summary className="cursor-pointer text-sand">票券，換手機繼續</summary>
        {qr && <img className="mx-auto mt-3 rounded-2xl" src={qr} alt="行程票券 QR Code" width={220} height={220} />}
        <p className="mt-2 break-all">{location.origin}/j/{session.id}</p>
      </details>
      <details className="rounded-3xl bg-white/5 p-4 text-sm leading-6 text-muted">
        <summary className="cursor-pointer text-sand">評審示範工具</summary>
        <div className="mt-3 grid gap-2">
          {meta?.policies.map((item) => (
            <Button key={item.id} variant="ghost" size="sm" onClick={() => void demo({ experimentGroup: item.id })}>
              改成{item.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => void demo({ remainingSec: 30 })}>
            把剩餘時間改成 30 秒
          </Button>
        </div>
      </details>
      <p className="text-xs leading-6 text-muted">{disclaimer}</p>
      <Link className="text-sm text-sand underline-offset-4 hover:underline" to="/app/admin">
        工作人員
      </Link>
      <Dialog open={recognizeOpen} onOpenChange={setRecognizeOpen}>
        <DialogContent>
          <DialogTitle>物種辨識尚未開放</DialogTitle>
          <DialogDescription>{recognizeText}</DialogDescription>
          <Button className="mt-5" onClick={() => setRecognizeOpen(false)}>
            知道了
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function openRecognize() {
    try {
      const data = await api<{ message: string }>("/api/recognize", { method: "POST" });
      setRecognizeText(data.message);
    } catch {
      setRecognizeText("拍照辨識還在下一階段，這次原型先不判斷物種。");
    }
    setRecognizeOpen(true);
  }

  async function demo(body: object) {
    if (!session) return;
    await api(`/api/sessions/${session.id}/demo`, { method: "POST", body: JSON.stringify(body) });
    await guide.refresh();
  }
}
