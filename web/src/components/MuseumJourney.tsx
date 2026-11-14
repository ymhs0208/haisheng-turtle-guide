import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, MapPin, Volume2, MessageCircle, Pause, Play, Route, Square, BookOpen } from "lucide-react";
import { Porthole } from "@/components/Porthole";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGuide } from "@/state";
import { guideClues, museumMap, museumSource, museumStops, observationChoices } from "@/data/museum";

type Finding = { stop: number; clue: number; choice: number };
type Journey = { stop: number; phase: "travel" | "observe" | "discover" | "done"; completed: string[]; clue?: number; findings?: Finding[] };
const initial: Journey = { stop: 0, phase: "travel", completed: [] };
function restore(key: string): Journey {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (value && Number.isInteger(value.stop) && value.stop >= 0 && value.stop < museumStops.length && ["travel", "observe", "discover", "done"].includes(value.phase) && Array.isArray(value.completed)) {
      const findings = Array.isArray(value.findings) ? value.findings.filter((item: Finding) =>
        item && Number.isInteger(item.stop) && item.stop >= 0 && item.stop < museumStops.length &&
        (item.clue === 0 || item.clue === 1) && (item.choice === 0 || item.choice === 1)) : [];
      return { findings, stop: value.stop, phase: value.phase, clue: value.clue === 0 || value.clue === 1 ? value.clue : undefined, completed: value.completed.filter((id: unknown) => typeof id === "string" && museumStops.some(stop => stop.id === id)) };
    }
  } catch { /* Start a fresh journey when saved data cannot be read. */ }
  return initial;
}

export function MuseumJourney() {
  const { session, selectZone, setAnim } = useGuide();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const key = `xiaolu-museum-journey:${session!.id}`;
  const [journey, setJourney] = useState<Journey>(() => restore(key));
  const [journalOpen, setJournalOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const stop = museumStops[journey.stop];
  const clues = guideClues[stop.id];
  const clue = journey.clue === undefined ? undefined : clues[journey.clue];
  const findings = journey.findings ?? [];
  const finding = findings.find(item => item.stop === journey.stop && item.clue === journey.clue);
  const observed = finding && observationChoices[stop.id][finding.clue][finding.choice];
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(journey)); }
    catch { setError("目前無法儲存行程，關閉頁面後可能需要重新開始。"); }
  }, [key, journey]);
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  useEffect(() => {
    const station = params.get("station");
    if (!station) return;
    const index = museumStops.findIndex(item => item.id === station);
    if (index >= 0) {
      setJourney(current => current.stop === index && current.phase !== "done"
        ? current
        : { ...current, stop: index, phase: "travel", clue: undefined });
      setPaused(false);
    }
    const next = new URLSearchParams(params);
    next.delete("station");
    setParams(next, { replace: true });
  }, [params, setParams]);

  async function arrive() {
    setPending(true);
    setError("");
    try {
      if (stop.zoneId) await selectZone(stop.zoneId);
      setJourney(current => ({ ...current, phase: "observe" }));
      setAnim("wave");
    } catch { setError("暫時無法切換展區，請重試。"); }
    finally { setPending(false); }
  }
  function finish() {
    window.speechSynthesis?.cancel();
    setAnim("idle");
    setJourney(current => {
      const completed = Array.from(new Set([...current.completed, stop.id]));
      const nextStop = museumStops.findIndex(item => !completed.includes(item.id));
      return nextStop === -1
        ? { ...current, completed, phase: "done" }
        : { ...current, stop: nextStop, completed, phase: "travel", clue: undefined };
    });
  }
  const done = journey.phase === "done";
  const name = session?.nickname || "朋友";
  const message = paused
    ? "好，我在這裡等你。慢慢看，想繼續的時候再叫我。"
    : done ? `${name}，今天我們一起探索了 ${journey.completed.length} 座展館。你最喜歡哪一個發現？我想聽聽。`
    : journey.phase === "travel" ? `${name}，接下來我想帶你去${stop.hall}。跟著現場指標走，到了告訴我，我們再慢慢看。`
    : journey.phase === "observe" ? clue?.look ?? "這一站，你想先看哪一個？選一個線索，我陪你找。"
    : observed ? `你留意到「${observed}」。${clue?.explain ?? stop.story}` : clue?.explain ?? stop.story;
  const actionLabel = journey.phase === "travel" ? "小綠，我到了" : journey.phase === "observe" ? "先聽解說" : "帶我去下一站";
  const guidePose = !paused && journey.phase === "observe" ? (clue ? "point" : "wave") : "idle";
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setAnim(guidePose);
  }, [journey.stop, journey.phase, clue, paused, guidePose, setAnim]);
  function speak() {
    if (!window.speechSynthesis) { setError("這個瀏覽器無法播放語音，可以閱讀小綠的話。"); return; }
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); setAnim(guidePose); return; }
    const speech = new SpeechSynthesisUtterance(message);
    speech.lang = "zh-TW";
    speech.onend = speech.onerror = () => { setSpeaking(false); setAnim(guidePose); };
    setSpeaking(true);
    setAnim("talk");
    window.speechSynthesis.speak(speech);
  }
  function saveFinding(choice: number) {
    if (journey.clue === undefined) return;
    const entry = { stop: journey.stop, clue: journey.clue, choice };
    setJourney(current => ({
      ...current,
      phase: "discover",
      findings: [...(current.findings ?? []).filter(item => item.stop !== entry.stop || item.clue !== entry.clue), entry],
    }));
  }

  function advance() {
    if (journey.phase === "travel") void arrive();
    else if (journey.phase === "observe") setJourney(current => ({ ...current, phase: "discover" }));
    else finish();
  }
  return (
    <section className="personal-guide" aria-label="小綠陪你參觀">
      <header className="guide-location">
        <span><MapPin size={16} />{done ? "今天的回憶" : stop.hall}<small>{done ? "探索完成" : journey.phase === "travel" ? "準備前往" : "你已確認抵達"}</small></span>
        <button type="button" className="route-toggle" onClick={() => setRouteOpen(true)} aria-label="查看我的路線"><Route size={18} />路線</button>
      </header>
      <div className="personal-character"><Porthole size="lg" /><span className="guide-mood">{paused ? "陪你慢慢看" : speaking ? "正在為你介紹" : "今天，由我陪你看海"}</span></div>
      <div className="guide-speech">
        <div className="speech-author"><span>小綠</span><button type="button" onClick={speak} aria-label={speaking ? "停止播放" : "聽小綠說"}>{speaking ? <Square size={16} /> : <Volume2 size={18} />}{speaking ? "停止" : "聽我說"}</button></div>
        <h1>{paused ? "休息一下也很好。" : done ? "謝謝你，陪我看海。" : journey.phase === "travel" ? "走吧，下一個發現在等你。" : journey.phase === "observe" ? "先把目光交給眼前的海洋。" : "你剛剛看到的，其實很有意思。"}</h1>
        <p aria-live="polite">{message}</p>
        {journey.phase === "observe" && !paused && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="選擇觀察線索">
            {clues.map((option, index) => (
              <Button key={option.label} size="sm" variant={journey.clue === index ? "default" : "ghost"}
                aria-pressed={journey.clue === index}
                onClick={() => setJourney(current => ({ ...current, clue: index }))}>
                {option.label}
              </Button>
            ))}
          </div>
        )}
        {journey.phase === "observe" && clue && journey.clue !== undefined && !paused && (
          <fieldset className="mt-4 grid gap-2 border-t border-tide/15 pt-3">
            <legend className="text-sm font-semibold text-tide">你看到了什麼？</legend>
            {observationChoices[stop.id][journey.clue].map((option, index) => (
              <Button key={option} size="sm" variant="ghost" onClick={() => saveFinding(index)}>{option}</Button>
            ))}
          </fieldset>
        )}
        {journey.phase === "discover" && observed && !paused && <p className="mt-3 text-sm font-semibold text-tide" role="status">已收進海洋筆記</p>}
        {journey.phase === "observe" && clue && !paused && <span className="look-up-note">不用急著回答，觀察好了再回來。</span>}
      </div>
      {error && <p role="alert" className="text-coral">{error}</p>}
      <div className="personal-actions">
        {paused ? <Button size="lg" onClick={() => setPaused(false)}><Play size={18} />好了，我們繼續</Button> : done ? <Button size="lg" asChild><Link to="/app/chat">我想跟你分享<MessageCircle size={18} /></Link></Button> : <Button size="lg" disabled={pending || (journey.phase === "observe" && !clue)} onClick={advance}>{pending ? "等我準備一下…" : actionLabel}<ArrowRight size={18} /></Button>}
        <div className="personal-secondary flex-wrap">
          <button type="button" onClick={() => setJournalOpen(true)}><BookOpen size={17} />海洋筆記{findings.length > 0 && ` · ${findings.length}`}</button>
          <Link to="/app/chat"><MessageCircle size={17} />我想問你</Link>
          {!paused && !done && <button type="button" onClick={() => setPaused(true)}><Pause size={17} />等我一下</button>}
          {!paused && journey.phase === "discover" && stop.zoneId && <button type="button" disabled={pending} onClick={() => void arriveForQuiz()}>猜一題</button>}
          {done && <button type="button" onClick={() => setJourney(initial)}>再走一趟</button>}
        </div>
      </div>
      <Dialog open={journalOpen} onOpenChange={setJournalOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle>我的海洋筆記</DialogTitle>
          <DialogDescription>這些是你在展館親眼看到的發現，保存在這台裝置的本次行程。</DialogDescription>
          {findings.length === 0 ? <p className="my-4 text-muted">選一條線索，到展品前找找看。回報看到什麼後，這裡就會出現你的第一筆發現。</p> :
            <ul className="my-4 grid gap-3">
              {findings.map(item => {
                const hall = museumStops[item.stop];
                return <li key={`${item.stop}-${item.clue}`} className="rounded-xl bg-sea p-3">
                  <p className="text-sm text-muted">{hall.hall} · {guideClues[hall.id][item.clue].label}</p>
                  <p className="mt-1 font-semibold">{observationChoices[hall.id][item.clue][item.choice]}</p>
                </li>;
              })}
            </ul>}
          <Button onClick={() => setJournalOpen(false)}>回到導覽</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <div className="flex items-center justify-between gap-3"><DialogTitle>我們今天的路線</DialogTitle><button type="button" className="min-h-11 px-2 text-sm text-tide" onClick={() => setRouteOpen(false)}>關閉</button></div>
          <DialogDescription>已探索 {journey.completed.length} / {museumStops.length} 館。想換個地方看，可以直接選。</DialogDescription>
          <div className="personal-route-list">{museumStops.map((item, index) => <button key={item.id} type="button" disabled={pending} aria-current={journey.stop === index ? "step" : undefined} onClick={() => {
            setJourney(current => ({ ...current, stop: index, phase: "travel", clue: undefined }));
            setPaused(false); setError(""); setRouteOpen(false);
          }}><span>{journey.completed.includes(item.id) ? <Check size={20} /> : <MapPin size={20} />}</span><span><strong>{item.hall}</strong><small>{item.subtitle}</small></span><ArrowRight size={17} /></button>)}</div>
          <a className="personal-map-link" href={museumMap} target="_blank" rel="noreferrer">打開官方館內平面圖 ↗</a>
          <p className="text-sm leading-6 text-muted">目前由你確認抵達，依館內指標移動。進度儲存在這台裝置。</p>
          <a className="text-sm underline text-tide" href={museumSource} target="_blank" rel="noreferrer">展館資料來源</a>
        </DialogContent>
      </Dialog>
    </section>
  );
  async function arriveForQuiz() {
    setPending(true); setError("");
    try {
      if (stop.zoneId) await selectZone(stop.zoneId);
      navigate("/app/quiz");
    } catch { setError("無法準備題目，請重試。"); setPending(false); }
  }
}
