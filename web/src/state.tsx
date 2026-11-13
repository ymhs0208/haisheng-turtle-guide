import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Meta, Remediation, Session, ShowView, Summary, TurtleAnim, Zone } from "./types";

const KEY = "xiaolu-session-id";

interface GuideState {
  ready: boolean;
  error: string;
  session: Session | null;
  meta: Meta | null;
  zones: Zone[];
  disclaimer: string;
  summary: Summary | null;
  connected: boolean;
  turtlePhase: "idle" | "exit" | "enter" | "off";
  anim: TurtleAnim;
  emphasis: "replay" | "none";
  quality: "low" | "high";
  show: ShowView | null;
  clockOffset: number;
  myCorrect: boolean | null;
  remediation: Remediation | null;
  presence: { phones: number; displays: number };
  queue: { id: string; text: string; votes: number; zoneId: string }[];
  toast: string;
  refresh: () => Promise<void>;
  adopt: (session: Session) => void;
  logout: () => void;
  selectZone: (zoneId: string) => Promise<void>;
  setAnim: (anim: TurtleAnim, emphasis?: "replay" | "none") => void;
  setQuality: (quality: "low" | "high") => void;
  send: (message: object) => boolean;
  dismissRemediation: () => void;
  clearToast: () => void;
}

const Ctx = createContext<GuideState | null>(null);

function detectQuality(): "low" | "high" {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const saved = localStorage.getItem("xiaolu-quality");
  if (saved === "low" || saved === "high") return saved;
  if (nav.connection?.saveData) return "low";
  if ((nav.deviceMemory && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) {
    return "low";
  }
  return "high";
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [connected, setConnected] = useState(false);
  const [turtlePhase, setTurtlePhase] = useState<GuideState["turtlePhase"]>("idle");
  const [anim, setAnimState] = useState<TurtleAnim>("idle");
  const [emphasis, setEmphasis] = useState<"replay" | "none">("none");
  const [quality, setQualityState] = useState<"low" | "high">("high");
  const [show, setShow] = useState<ShowView | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [myCorrect, setMyCorrect] = useState<boolean | null>(null);
  const [remediation, setRemediation] = useState<Remediation | null>(null);
  const [presence, setPresence] = useState({ phones: 0, displays: 0 });
  const [queue, setQueue] = useState<GuideState["queue"]>([]);
  const [toast, setToast] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const awayTimer = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    const id = sessionRef.current?.id ?? localStorage.getItem(KEY);
    if (!id) return;
    const data = await api<{ session: Session }>(`/api/sessions/${id}`);
    setSession(data.session);
    setSummary(await api<Summary>(`/api/sessions/${id}/summary`));
  }, []);

  useEffect(() => {
    setQualityState(detectQuality());
    let cancel = false;
    Promise.all([api<Meta>("/api/meta"), api<{ zones: Zone[]; disclaimer: string }>("/api/zones")])
      .then(([metaData, zoneData]) => {
        if (cancel) return;
        setMeta(metaData);
        setZones(zoneData.zones);
        setDisclaimer(zoneData.disclaimer);
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message || "連不到導覽伺服器");
      });
    const id = localStorage.getItem(KEY);
    if (!id) {
      setReady(true);
      return;
    }
    api<{ session: Session }>(`/api/sessions/${id}`)
      .then(async (data) => {
        if (cancel) return;
        setSession(data.session);
        setSummary(await api<Summary>(`/api/sessions/${id}/summary`));
      })
      .catch(() => localStorage.removeItem(KEY))
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    let delay = 500;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (stop) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = socket;
      socket.onopen = () => {
        delay = 500;
        setConnected(true);
        socket?.send(
          JSON.stringify({
            v: 1,
            type: "hello",
            role: "phone",
            sessionId: session.id,
            zoneId: sessionRef.current?.currentZoneId ?? undefined,
          }),
        );
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as Record<string, any>;
        if (msg.type === "ping") {
          socket?.send(JSON.stringify({ v: 1, type: "pong" }));
          return;
        }
        if (msg.type === "hello_ok") void refresh();
        if (msg.type === "error") setToast(String(msg.message ?? "發生問題"));
        if (msg.type === "presence") setPresence({ phones: msg.phones ?? 0, displays: msg.displays ?? 0 });
        if (msg.type === "queue") setQueue(msg.items ?? []);
        if (msg.type === "turtle_snapshot") {
          setTurtlePhase(msg.sessionId === session.id ? "off" : "idle");
        }
        if (msg.type === "turtle" && msg.who === "phone" && msg.sessionId === session.id) {
          window.clearTimeout(awayTimer.current);
          if (msg.action === "exit") {
            setTurtlePhase("exit");
            awayTimer.current = window.setTimeout(() => setTurtlePhase("off"), 1200);
          }
          if (msg.action === "enter") {
            setTurtlePhase("enter");
            awayTimer.current = window.setTimeout(() => setTurtlePhase("idle"), 1200);
          }
        }
        if (msg.type === "show_state") {
          if (!msg.show) {
            setShow(null);
            setMyCorrect(null);
            return;
          }
          if (msg.show.id !== showId.current) {
            setMyCorrect(null);
            setRemediation(null);
          }
          showId.current = msg.show.id;
          setClockOffset(msg.show.serverNow - Date.now());
          setShow(msg.show);
        }
        if (msg.type === "show_personal") setMyCorrect(Boolean(msg.correct));
        if (msg.type === "personal_remediation") {
          setRemediation(msg as Remediation);
          setAnimState(msg.anim ?? "talk");
          setEmphasis(msg.emphasis ?? "none");
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (stop) return;
        window.setTimeout(connect, delay);
        delay = Math.min(5000, delay * 2);
      };
    };
    const showId = { current: "" };
    connect();
    return () => {
      stop = true;
      socket?.close();
      wsRef.current = null;
    };
  }, [session?.id, refresh]);

  const adopt = useCallback((next: Session) => {
    localStorage.setItem(KEY, next.id);
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setSession(null);
    setSummary(null);
    setShow(null);
  }, []);

  const selectZone = useCallback(
    async (zoneId: string) => {
      if (!sessionRef.current) return;
      const data = await api<{ session: Session }>(`/api/sessions/${sessionRef.current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ currentZoneId: zoneId }),
      });
      setSession(data.session);
      setSummary(await api<Summary>(`/api/sessions/${data.session.id}/summary`));
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ v: 1, type: "set_zone", zoneId }));
      }
    },
    [],
  );

  const send = useCallback((message: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setToast("跟展示箱的連線中斷了，請稍後再試");
      return false;
    }
    ws.send(JSON.stringify({ v: 1, ...message }));
    return true;
  }, []);

  const setAnim = useCallback((next: TurtleAnim, nextEmphasis: "replay" | "none" = "none") => {
    setAnimState(next);
    setEmphasis(nextEmphasis);
  }, []);

  const setQuality = useCallback((next: "low" | "high") => {
    localStorage.setItem("xiaolu-quality", next);
    setQualityState(next);
  }, []);

  const value: GuideState = {
    ready,
    error,
    session,
    meta,
    zones,
    disclaimer,
    summary,
    connected,
    turtlePhase,
    anim,
    emphasis,
    quality,
    show,
    clockOffset,
    myCorrect,
    remediation,
    presence,
    queue,
    toast,
    refresh,
    adopt,
    logout,
    selectZone,
    setAnim,
    setQuality,
    send,
    dismissRemediation: () => setRemediation(null),
    clearToast: () => setToast(""),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuide(): GuideState {
  const value = useContext(Ctx);
  if (!value) throw new Error("導覽狀態尚未就緒");
  return value;
}
