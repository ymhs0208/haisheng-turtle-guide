import { useEffect, useRef, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { Porthole } from "@/components/Porthole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api";
import { useDebug } from "@/debug";
import { useGuide } from "@/state";

interface ChatSource {
  id: string;
  title: string;
  snippet?: string;
  url?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  provider?: string;
}

const CHIPS = ["你好", "珊瑚為什麼會白化？", "海龜吃什麼？"];

export function ChatPage() {
  const debug = useDebug();
  const { session, setAnim } = useGuide();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openSource, setOpenSource] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    recRef.current?.abort();
    setAnim("idle");
  }, [setAnim]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const speechOk = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!session) return;
    api<{ messages: ChatMessage[] }>(`/api/sessions/${session.id}/chat`)
      .then((data) => setMessages(data.messages))
      .catch(() => setMessages([]));
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  async function send(message: string) {
    if (!session || !message.trim() || pending) return;
    setText("");
    setError("");
    setMessages((list) => [...list, { role: "user", content: message.trim() }]);
    setPending(true);
    setAnim("think");
    const placeholder: ChatMessage = { role: "assistant", content: "" };
    setMessages((list) => [...list, placeholder]);
    try {
      const response = await fetch(`/api/sessions/${session.id}/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok || !response.body) {
        const raw = await response.text();
        let reason = "小綠沒有接到";
        try {
          reason = (JSON.parse(raw) as { error?: string }).error || reason;
        } catch {
          reason = raw || reason;
        }
        throw new Error(reason);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      let sources: ChatSource[] = [];
      let provider = "";
      const paint = (next: Partial<ChatMessage>) => {
        setMessages((list) => list.map((item, index) => (index === list.length - 1 && item.role === "assistant" ? { ...item, ...next } : item)));
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim()) as {
            type?: string;
            text?: string;
            reply?: string;
            sources?: ChatSource[];
            provider?: string;
          };
          if (event.type === "delta" && event.text) {
            reply += event.text;
            paint({ content: reply });
          }
          if (event.type === "done") {
            reply = event.reply || reply;
            sources = event.sources ?? [];
            provider = event.provider ?? "";
            paint({ content: reply, sources, provider });
          }
        }
      }
      setAnim("talk");
      window.setTimeout(() => setAnim("idle"), 2600);
    } catch (err) {
      setMessages((list) => list.filter((item) => item.content || item.role === "user"));
      setError(err instanceof Error ? err.message : "小綠沒有接到");
      setAnim("idle");
    } finally {
      setPending(false);
    }
  }

  function toggleMic() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "zh-TW";
    rec.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      if (said) void send(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function speak(content: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(content);
    utter.lang = "zh-TW";
    utter.onstart = () => setAnim("talk");
    utter.onend = utter.onerror = () => setAnim("idle");
    window.speechSynthesis.speak(utter);
  }

  return (
    <div className="soft-in grid gap-4">
      <header>
        <h1 className="font-serif text-3xl">問小綠</h1>
        <p className="mt-1 text-base text-muted">點一個問題，或自己打一句。</p>
      </header>
      <Porthole size="sm" />
      <div className="grid min-h-[28vh] gap-3">
        {messages.length === 0 && <p className="text-lg leading-8 text-muted">可以問珊瑚、海龜，也可以先說聲你好。</p>}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-3xl bg-tide px-4 py-3 text-lg leading-8 text-white" : "mr-6 rounded-3xl bg-white px-4 py-3 text-lg leading-8 shadow-sm"}>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.sources.map((source, sourceIndex) => {
                  const key = `${index}-${source.id}`;
                  const open = openSource === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className="min-h-11 rounded-full bg-deep px-3 text-left text-base font-semibold text-tide"
                      onClick={() => setOpenSource(open ? "" : key)}
                    >
                      [{sourceIndex + 1}] {source.title}
                      {open && source.snippet && <span className="mt-1 block font-normal text-ink">{source.snippet}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {debug && message.provider?.startsWith("mock") && (
              <p className="mt-2 text-base text-muted">示範回答：沒有設定模型金鑰，這段來自館內樣本。</p>
            )}
            {message.role === "assistant" && (
              <button className="mt-2 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-tide" onClick={() => speak(message.content)}>
                <Volume2 className="h-4 w-4" /> 聽一次
              </button>
            )}
          </article>
        ))}
        {pending && <p className="text-base text-muted">小綠在想…</p>}
        <div ref={bottomRef} />
      </div>
      {error && <p className="text-base text-coral">{error}</p>}
      {!speechOk && <p className="text-base text-muted">這個瀏覽器不能用語音，直接打字就好。</p>}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={pending}
            className="soft-press min-h-12 rounded-full bg-white px-4 text-base font-semibold text-ink ring-1 ring-tide/15 disabled:opacity-40"
            onClick={() => void send(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <Input value={text} maxLength={500} placeholder="想問小綠什麼？" onChange={(event) => setText(event.target.value)} />
        {speechOk && (
          <Button type="button" variant={listening ? "danger" : "ghost"} size="icon" aria-label={listening ? "停止說話" : "用語音問"} onClick={toggleMic}>
            <Mic className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          送出
        </Button>
      </form>
    </div>
  );
}
