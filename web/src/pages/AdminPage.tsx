import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Overview {
  store: string;
  vector: string;
  llm: string;
  adminOpen: boolean;
  sessions: number;
  events: number;
  byGroup: { group: string; sessions: number; answers: number; correctRate: number | null; meanMastery: number | null }[];
  strategies: { group: string; strategy: string; count: number }[];
  concepts: { id: string; zoneName: string; title: string; summary: string }[];
  recentEvents: { id: string; type: string; strategyId: string | null; correct: boolean | null }[];
}

const GROUP: Record<string, string> = { fixed: "固定順序", rule: "規則式", adaptive: "適性學習" };
const STRATEGY: Record<string, string> = { animation: "動畫", hint: "提示", analogy: "比喻" };

function headers(): HeadersInit {
  const token = sessionStorage.getItem("xiaolu-admin") ?? "";
  return token ? { "x-admin-token": token } : {};
}

export function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState(sessionStorage.getItem("xiaolu-admin") ?? "");
  const [conceptId, setConceptId] = useState("");
  const [summary, setSummary] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/admin/overview", { headers: headers() });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "讀不到統計");
      setData(null);
      return;
    }
    setData(body);
    if (!conceptId && body.concepts[0]) {
      setConceptId(body.concepts[0].id);
      setSummary(body.concepts[0].summary);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const concept = data?.concepts.find((item) => item.id === conceptId);

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="font-serif text-3xl">工作人員</h1>
        <p className="mt-1 text-base text-muted">示範環境。若設定了管理權杖，這裡才需要輸入。</p>
      </header>
      {data?.adminOpen && <p className="rounded-2xl bg-sand px-4 py-3 text-base text-ink">尚未設定管理權杖，示範時任何人都能打開這頁。</p>}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          sessionStorage.setItem("xiaolu-admin", token.trim());
          void load();
        }}
      >
        <Input value={token} placeholder="管理權杖，沒設可留白" onChange={(event) => setToken(event.target.value)} />
        <Button type="submit" variant="ghost">
          套用
        </Button>
      </form>
      {error && <p className="text-base text-coral">{error}</p>}
      {data && (
        <>
          <p className="text-base text-muted">
            資料 {data.store}／向量 {data.vector}／模型 {data.llm} · {data.sessions} 個行程 · {data.events} 筆事件
          </p>
          <div className="grid gap-2">
            {data.byGroup.map((row) => (
              <article key={row.group} className="rounded-3xl bg-white p-4 text-base shadow-sm">
                <h2 className="font-semibold">{GROUP[row.group] ?? row.group}</h2>
                <p className="mt-1 text-muted">
                  {row.sessions} 人 · {row.answers} 次作答 · 答對率 {row.correctRate == null ? "—" : `${Math.round(row.correctRate * 100)}%`} · 平均熟練度{" "}
                  {row.meanMastery == null ? "—" : `${Math.round(row.meanMastery * 100)}%`}
                </p>
                <p className="mt-1 text-muted">
                  {data.strategies
                    .filter((item) => item.group === row.group)
                    .map((item) => `${STRATEGY[item.strategy] ?? item.strategy} ${item.count}`)
                    .join(" · ")}
                </p>
              </article>
            ))}
          </div>
          {data.byGroup.every((row) => row.answers === 0) && <p className="text-base text-muted">還沒有足夠的作答紀錄。</p>}
          <section className="grid gap-2">
            <h2 className="font-serif text-xl">概念簡介</h2>
            <p className="text-base text-muted">改的是簡介，會進入檢索。補救腳本仍以種子檔為準，避免實驗組內容走樣。</p>
            <select
              className="min-h-12 rounded-2xl border border-tide/20 bg-white px-3 text-base text-ink"
              value={conceptId}
              onChange={(event) => {
                const next = data.concepts.find((item) => item.id === event.target.value);
                setConceptId(event.target.value);
                setSummary(next?.summary ?? "");
                setSaved("");
              }}
            >
              {data.concepts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.zoneName} · {item.title}
                </option>
              ))}
            </select>
            <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
            <Button
              onClick={() => {
                void fetch(`/api/admin/concepts/${conceptId}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json", ...headers() },
                  body: JSON.stringify({ summary, title: concept?.title }),
                }).then(async (response) => {
                  if (!response.ok) {
                    const body = await response.json();
                    setError(body.error || "沒有儲存");
                    return;
                  }
                  setSaved("已儲存，下一則提問就會用到新簡介。");
                  void load();
                });
              }}
            >
              儲存簡介
            </Button>
            {saved && <p className="text-base font-semibold text-tide">{saved}</p>}
          </section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => void download("/api/export/events.csv", "events.csv")}>
              匯出作答
            </Button>
            <Button variant="ghost" onClick={() => void download("/api/export/mastery.csv", "mastery.csv")}>
              匯出熟練度
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

async function download(path: string, filename: string) {
  const response = await fetch(path, { headers: headers() });
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
