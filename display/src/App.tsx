import { useEffect, useRef, useState } from "react";
import { TurtleStage, type TurtleAnim, type TurtlePhase } from "@scene/TurtleStage";
import { CARAPACE_CM, SWIM_MS } from "@scene/timing";
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

function readNumber(query: string, storage: string, fallback: number, min: number, max: number): number {
  const queryValue = params.get(query);
  const fromQuery = Number(queryValue);
  if (queryValue?.trim() && Number.isFinite(fromQuery)) return Math.min(max, Math.max(min, fromQuery));
  const storedValue = localStorage.getItem(storage);
  const stored = Number(storedValue);
  if (storedValue?.trim() && Number.isFinite(stored)) return Math.min(max, Math.max(min, stored));
  return fallback;
}

function readFlag(query: string, storage: string): boolean {
  const value = params.get(query);
  if (value === "1") return true;
  if (value === "0") return false;
  return localStorage.getItem(storage) === "1";
}

function readQuality(): "low" | "high" {
  const query = params.get("quality");
  if (query === "low" || query === "high") return query;
  return localStorage.getItem("display-quality") === "low" ? "low" : "high";
}

export function App() {
  const [online, setOnline] = useState(false);
  const [mirror, setMirror] = useState(readFlag("mirror", "display-mirror"));
  const [flip, setFlip] = useState(readFlag("flip", "display-flip"));
  const [calibrate, setCalibrate] = useState(params.get("cal") === "1");
  const [quality, setQuality] = useState<"low" | "high">(readQuality);
  const [trueSize, setTrueSize] = useState(readFlag("truesize", "display-truesize"));
  const [bandVh, setBandVh] = useState(readNumber("band", "display-band", 48, 24, 68));
  const [widthCm, setWidthCm] = useState(readNumber("widthCm", "display-width-cm", 80, 15, 250));
  const [hud, setHud] = useState(params.get("clean") !== "1");
  const phaseTimer = useRef(0);
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
          if (msg.action === "exit") {
            window.clearTimeout(phaseTimer.current);
            setPhase("exit");
          }
          if (msg.action === "enter") {
            window.clearTimeout(phaseTimer.current);
            setPhase("enter");
            phaseTimer.current = window.setTimeout(() => setPhase("idle"), SWIM_MS);
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
      if (event.key === "m" || event.key === "M") {
        setMirror((value) => {
          localStorage.setItem("display-mirror", value ? "0" : "1");
          return !value;
        });
      }
      if (event.key === "v" || event.key === "V") {
        setFlip((value) => {
          localStorage.setItem("display-flip", value ? "0" : "1");
          return !value;
        });
      }
      if (event.key === "c" || event.key === "C") setCalibrate((value) => !value);
      if (event.key === "q" || event.key === "Q") {
        setQuality((value) => {
          const next = value === "low" ? "high" : "low";
          localStorage.setItem("display-quality", next);
          return next;
        });
      }
      if (event.key === "t" || event.key === "T") {
        setTrueSize((value) => {
          localStorage.setItem("display-truesize", value ? "0" : "1");
          return !value;
        });
      }
      if (event.key === "[") {
        setBandVh((value) => {
          const next = Math.max(24, value - 2);
          localStorage.setItem("display-band", String(next));
          return next;
        });
      }
      if (event.key === "]") {
        setBandVh((value) => {
          const next = Math.min(68, value + 2);
          localStorage.setItem("display-band", String(next));
          return next;
        });
      }
      if (event.key === "-" || event.key === "_") {
        setWidthCm((value) => {
          const next = Math.max(15, value - 5);
          localStorage.setItem("display-width-cm", String(next));
          return next;
        });
      }
      if (event.key === "=" || event.key === "+") {
        setWidthCm((value) => {
          const next = Math.min(250, value + 5);
          localStorage.setItem("display-width-cm", String(next));
          return next;
        });
      }
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

  const low = quality === "low";
  const ghostClass = ["ghost", mirror ? "mirror" : "", flip ? "flip" : ""].filter(Boolean).join(" ");

  return (
    <div className="root">
      <div className={ghostClass} style={{ ["--band" as string]: `${bandVh}vh` }}>
      <div className="stage">
        <TurtleStage
          className="stage-fill"
          anim={anim}
          phase={phase}
          quality={quality}
          emphasis={emphasis}
          transparent={false}
          glow
          caustics={!low}
          bubbles={low ? 5 : 16}
          tempo={0.62}
          exaggerate={1.8}
          fps={30}
          trueSize={trueSize}
          screenWidthCm={widthCm}
        />
      </div>
      <section className={online && show ? "band is-show" : "band"}>
        {calibrate ? (
          <p className="kicker">校正 · 這一段文字和海龜會一起鏡像、一起上下翻轉</p>
        ) : (
        <>
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
            {feature.sources.length > 0 && (
              <p className="sample">資料依據：{feature.sources.map((source) => source.title).join("、")}</p>
            )}
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
        </>
        )}
      </section>
      {calibrate && (
        <div className="cal">
          <div className="cal-grid" />
          <div className="cal-safe" />
          <div className="cal-center" />
          <p className="cal-caption">中心對準膜片 · 安全框留在反射區內</p>
        </div>
      )}
      </div>
      {hud && (
        <div className="hud">
          <button
            type="button"
            onClick={() =>
              setMirror((value) => {
                localStorage.setItem("display-mirror", value ? "0" : "1");
                return !value;
              })
            }
          >
            {mirror ? "鏡像開" : "鏡像關"}（M）
          </button>
          <button
            type="button"
            onClick={() =>
              setFlip((value) => {
                localStorage.setItem("display-flip", value ? "0" : "1");
                return !value;
              })
            }
          >
            {flip ? "上下翻轉開" : "上下翻轉關"}（V）
          </button>
          <button type="button" onClick={() => setCalibrate((value) => !value)}>
            {calibrate ? "校正開" : "校正關"}（C）
          </button>
          <button
            type="button"
            onClick={() =>
              setQuality((value) => {
                const next = value === "low" ? "high" : "low";
                localStorage.setItem("display-quality", next);
                return next;
              })
            }
          >
            {low ? "低畫質" : "高畫質"}（Q）· 30fps
          </button>
          <button
            type="button"
            onClick={() =>
              setTrueSize((value) => {
                localStorage.setItem("display-truesize", value ? "0" : "1");
                return !value;
              })
            }
          >
            {trueSize ? `一比一 ${CARAPACE_CM} 公分` : "一比一關"}（T）· 螢幕寬 {widthCm} 公分
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
