import { useEffect, useRef, useState } from "react";
import { TurtleStage, type TurtleAnim, type TurtlePhase } from "@scene/TurtleStage";
import rawSlides from "../../content/public-slides.json";

interface ShowView {
  id: string;
  zoneId: string;
  mode: "solo" | "group";
  phase: "announce" | "answer" | "results" | "explain";
  endsAt: number;
  serverNow: number;
  question: { prompt: string; choices: string[]; conceptTitle: string };
  results?: { counts: number[]; submitted: number; correct: number };
  explain?: { headline: string; text: string; correctIndex: number; allCorrect: boolean };
}

interface BoxAnswer {
  question: string;
  reply: string;
  votes: number;
  sources: { title: string }[];
}

interface Slide {
  zoneId: string;
  zoneName: string;
  title: string;
  text: string;
}

const FALLBACK_SLIDE: Slide = {
  zoneId: "coral",
  zoneName: "珊瑚礁",
  title: "離線導覽",
  text: "目前讀不到預錄稿。請確認 content/public-slides.json 有跟著這個頁面載入。",
};

function loadSlides(raw: unknown): Slide[] {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw) && "default" in raw
      ? (raw as { default: unknown }).default
      : raw;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Slide =>
      !!item &&
      typeof item === "object" &&
      typeof (item as Slide).zoneId === "string" &&
      typeof (item as Slide).zoneName === "string" &&
      typeof (item as Slide).title === "string" &&
      typeof (item as Slide).text === "string",
  );
}

const slides = loadSlides(rawSlides);

function socketUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function closeSocket(socket: WebSocket | null) {
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) return;
  if (socket.readyState === WebSocket.OPEN) {
    socket.close();
    return;
  }
  socket.addEventListener("open", () => socket.close(), { once: true });
}

const params = new URLSearchParams(location.search);

export function App() {
  const [online, setOnline] = useState(false);
  const [mirror, setMirror] = useState(params.get("mirror") === "1");
  const [hud, setHud] = useState(params.get("clean") !== "1");
  const [zoneId, setZoneId] = useState("coral");
  const [nickname, setNickname] = useState("小綠");
  const [phase, setPhase] = useState<TurtlePhase>("idle");
  const [show, setShow] = useState<ShowView | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [feature, setFeature] = useState<BoxAnswer | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [slide, setSlide] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const zoneRef = useRef(zoneId);
  zoneRef.current = zoneId;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (online) return;
    const id = window.setInterval(() => setSlide((value) => (value + 1) % Math.max(1, slides.length)), 16000);
    return () => window.clearInterval(id);
  }, [online]);

  useEffect(() => {
    if (!feature) return;
    const id = window.setTimeout(() => setFeature(null), 25000);
    return () => window.clearTimeout(id);
  }, [feature]);

  useEffect(() => {
    let stop = false;
    let delay = 800;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (stop) return;
      socket = new WebSocket(socketUrl());
      wsRef.current = socket;
      socket.onopen = () => {
        delay = 800;
        setOnline(true);
        socket?.send(JSON.stringify({ v: 1, type: "hello", role: "display", zoneId: zoneRef.current }));
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as Record<string, any>;
        if (msg.type === "ping") {
          socket?.send(JSON.stringify({ v: 1, type: "pong" }));
          return;
        }
        if (msg.type === "turtle_snapshot") {
          setNickname(msg.nickname || "小綠");
          if (msg.zoneId) setZoneId(msg.zoneId);
          setPhase("idle");
        }
        if (msg.type === "turtle" && msg.who === "box") {
          if (msg.zoneId) setZoneId(msg.zoneId);
          setNickname(msg.nickname || "小綠");
          if (msg.action === "exit") setPhase("exit");
          if (msg.action === "enter") {
            setPhase("enter");
            window.setTimeout(() => setPhase("idle"), 1200);
          }
        }
        if (msg.type === "show_state") {
          if (!msg.show) setShow(null);
          else {
            setShow(msg.show);
            setZoneId(msg.show.zoneId);
            setClockOffset(msg.show.serverNow - Date.now());
          }
        }
        if (msg.type === "box_answer") {
          setFeature({ question: msg.question, reply: msg.reply, votes: msg.votes, sources: msg.sources ?? [] });
        }
        if (msg.type === "queue") setQueueCount((msg.items ?? []).length);
      };
      socket.onclose = () => {
        setOnline(false);
        if (stop) return;
        window.setTimeout(connect, delay);
        delay = Math.min(5000, delay * 2);
      };
    };
    connect();
    return () => {
      stop = true;
      closeSocket(socket);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "m" || event.key === "M") setMirror((value) => !value);
      if (event.key === "h" || event.key === "H") setHud((value) => !value);
      if (event.key === "f" || event.key === "F") void document.documentElement.requestFullscreen?.();
      if (event.key === "n" || event.key === "N") setSlide((value) => (value + 1) % Math.max(1, slides.length));
      if (event.key === " ") {
        event.preventDefault();
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ v: 1, type: "show_start" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const deck = slides.length > 0 ? slides : [FALLBACK_SLIDE];
  const current = deck.find((item) => item.zoneId === zoneId) ?? deck[slide % deck.length] ?? deck[0];
  const offlineSlide = deck[slide % deck.length] ?? deck[0];
  const remain = show ? Math.max(0, Math.ceil((show.endsAt - now - clockOffset) / 1000)) : 0;
  let anim: TurtleAnim = "idle";
  let emphasis: "replay" | "none" = "none";
  if (!online) anim = "talk";
  else if (show?.phase === "explain") {
    anim = "talk";
    emphasis = "replay";
  } else if (show && (show.phase === "answer" || show.phase === "announce")) anim = "point";
  else if (feature) anim = "talk";
  else if (phase === "enter") anim = "wave";

  const counts = show?.results?.counts ?? [];
  const max = Math.max(1, ...counts);

  return (
    <div className={mirror ? "root mirror" : "root"}>
      <div className="stage">
        <TurtleStage className="stage-fill" anim={anim} phase={phase} quality="high" emphasis={emphasis} transparent={false} />
      </div>
      <section className="copy">
        {!online && offlineSlide && (
          <>
            <p className="kicker offline">離線模式 · 預錄導覽</p>
            <h1>{offlineSlide.title}</h1>
            <p className="prompt">{offlineSlide.text}</p>
          </>
        )}
        {online && show && (
          <>
            <p className="kicker">
              {show.mode === "solo" ? "一對一" : "團體挑戰"} · {zoneName(show.zoneId)} · {remain}
            </p>
            <h1>{show.phase === "explain" ? show.explain?.headline : show.question.conceptTitle}</h1>
            {show.phase !== "explain" && <p className="prompt">{show.question.prompt}</p>}
            <div className="choices">
              {show.question.choices.map((choice, index) => (
                <div key={choice} className={show.phase === "explain" && show.explain?.correctIndex === index ? "choice correct" : "choice"}>
                  <div className="label">
                    <span>
                      {index + 1}. {choice}
                    </span>
                    {show.results && <span>{show.results.counts[index] ?? 0}</span>}
                  </div>
                  {show.results && <div className="bar" style={{ width: `${((show.results.counts[index] ?? 0) / max) * 100}%` }} />}
                </div>
              ))}
            </div>
            {show.phase === "explain" && show.explain && <p className="explain">{show.explain.text}</p>}
          </>
        )}
        {online && !show && feature && (
          <>
            <p className="kicker">大家問得最多 · {feature.votes} 人</p>
            <h1>{feature.question}</h1>
            <p className="prompt">{feature.reply}</p>
          </>
        )}
        {online && !show && !feature && current && (
          <>
            <p className="kicker">{nickname === "小綠" ? "小綠在此" : `來自${nickname}的小綠`}</p>
            <h1>{zoneName(zoneId)}</h1>
            <p className="prompt">{queueCount > 0 ? `還有 ${queueCount} 題在排隊。` : "把手機上的小綠送來，或發起一題團體挑戰。"}</p>
          </>
        )}
        <p className="sample">樣本導覽，不是海生館正式文本。</p>
      </section>
      {hud && (
        <div className="hud">
          <button type="button" onClick={() => setMirror((value) => !value)}>
            {mirror ? "鏡像開" : "鏡像關"}（M）
          </button>
          <button type="button" onClick={() => setHud(false)}>
            乾淨畫面（H）
          </button>
          <button type="button" onClick={() => void document.documentElement.requestFullscreen?.()}>
            全螢幕（F）
          </button>
          <button
            type="button"
            onClick={() => {
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ v: 1, type: "show_start" }));
            }}
          >
            開始團體題（空白鍵）
          </button>
        </div>
      )}
    </div>
  );
}

function zoneName(id: string): string {
  return slides.find((item) => item.zoneId === id)?.zoneName ?? id;
}
