import { useEffect, useRef, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api";
import { useGuide } from "@/state";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string }[];
}

export function ChatPage() {
  const { session, setAnim } = useGuide();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
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
    try {
      const data = await api<{ reply: string; sources: { id: string; title: string }[] }>(`/api/sessions/${session.id}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setMessages((list) => [...list, { role: "assistant", content: data.reply, sources: data.sources }]);
      setAnim("talk");
      window.setTimeout(() => setAnim("idle"), 2600);
    } catch (err) {
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
    window.speechSynthesis.speak(utter);
  }

  return (
    <div className="grid gap-3">
      <h1 className="font-serif text-3xl">跟小綠說</h1>
      <div className="grid min-h-[46vh] gap-3">
        {messages.length === 0 && <p className="leading-7 text-muted">可以問我珊瑚為什麼變白，或只是打聲招呼。</p>}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-3xl bg-teal text-abyss px-4 py-3" : "mr-6 rounded-3xl bg-lagoon px-4 py-3"}>
            <p className="whitespace-pre-wrap leading-7">{message.content}</p>
            {message.sources && message.sources.length > 0 && (
              <p className="mt-2 text-xs text-sand">依據：{message.sources.map((item) => item.title).join("、")}</p>
            )}
            {message.role === "assistant" && (
              <button className="mt-2 inline-flex items-center gap-1 text-xs text-sand" onClick={() => speak(message.content)}>
                <Volume2 className="h-3.5 w-3.5" /> 朗讀
              </button>
            )}
          </article>
        ))}
        {pending && <p className="text-sm text-muted">小綠在想…</p>}
        <div ref={bottomRef} />
      </div>
      {error && <p className="text-sm text-coral">{error}</p>}
      {!speechOk && <p className="text-xs text-muted">這個瀏覽器沒有語音辨識，可以直接打字。</p>}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <Input value={text} maxLength={500} placeholder="問海龜、珊瑚或深海" onChange={(event) => setText(event.target.value)} />
        {speechOk && (
          <Button type="button" variant={listening ? "danger" : "ghost"} size="icon" aria-label={listening ? "停止說話" : "按住說話"} onClick={toggleMic}>
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
