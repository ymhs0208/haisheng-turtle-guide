import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Porthole } from "@/components/Porthole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api";
import { useGuide } from "@/state";
import { useDebug } from "@/debug";
import { museumStops } from "@/data/museum";
import type { AgeGroup, ExperimentGroup, Session } from "@/types";

export function StartPage() {
  const { ready, error, session, meta, disclaimer, adopt, logout } = useGuide();
  const navigate = useNavigate();
  const debug = useDebug();
  const { station } = useParams();
  const stop = museumStops.find(item => item.id === station);
  const destination = stop ? `/app?station=${stop.id}` : "/app";
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState<AgeGroup | "">("");
  const [minutes, setMinutes] = useState(40);
  const [group, setGroup] = useState<ExperimentGroup | "">("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");

  async function start(quick = false) {
    if (!quick && !age) {
      setFormError("請先選年齡");
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const data = await api<{ session: Session }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          nickname,
          ageGroup: age || "adult",
          visitMinutes: minutes,
          ...(debug && group ? { experimentGroup: group } : {}),
        }),
      });
      adopt(data.session);
      navigate(destination);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "沒有建成行程");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-base text-muted">小綠游過來…</main>;

  return (
    <main className="soft-in mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-6 px-5 py-8">
      <header>
        <p className="text-base font-semibold text-tide">國立海洋生物博物館</p>
        <h1 className="mt-2 font-serif text-4xl">小綠導覽</h1>
        <p className="mt-2 text-lg leading-8 text-muted">我是小綠。{stop ? `我們從${stop.hall}開始。你想先看什麼？` : "準備好了，我就陪你一起看海。"}</p>
      </header>
      <Porthole size="md" />
      {station && !stop && <p role="status" className="text-muted">找不到這個展區。你可以從導覽首頁選擇展館。</p>}
      {error && <p className="rounded-3xl bg-coral/10 px-4 py-3 text-base leading-7 text-coral">暫時連不上導覽。請重新整理，或請現場工作人員協助。</p>}
      {session ? (
        <div className="grid gap-3">
          <Button size="lg" onClick={() => navigate(destination)}>
            繼續以{session.nickname || "朋友"}的身份看海
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              logout();
            }}
          >
            重新開始
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <Button size="lg" disabled={pending || Boolean(error)} onClick={() => void start(true)}>
            {pending ? "準備中…" : stop ? `開始${stop.hall}導覽` : "直接開始參觀"}
          </Button>
          {formError && <p role="alert" className="text-coral">{formError}</p>}
          <details className="card">
          <summary className="cursor-pointer font-semibold">調整導覽偏好</summary>
          <form
          className="mt-4 grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="nick">怎麼稱呼你？可不填</Label>
            <Input id="nick" maxLength={12} placeholder="例如：海浪" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>年齡</Label>
            <div className="grid grid-cols-3 gap-2">
              {(meta?.ageGroups ?? [
                { id: "child" as const, label: "兒童", blurb: "用比較短的句子" },
                { id: "teen" as const, label: "青少年", blurb: "一般導覽" },
                { id: "adult" as const, label: "成人", blurb: "一般導覽" },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAge(item.id)}
                  className={`soft-press min-h-16 rounded-2xl border px-2 py-2 text-base ${age === item.id ? "border-tide bg-tide text-white" : "border-tide/15 bg-white text-ink"}`}
                >
                  <span className="block font-semibold">{item.label}</span>
                  <span className={`mt-1 block text-sm ${age === item.id ? "text-white/90" : "text-muted"}`}>{item.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>預計停留</Label>
            <div className="grid grid-cols-3 gap-2">
              {[20, 40, 60].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMinutes(value)}
                  className={`soft-press min-h-12 rounded-2xl border text-base font-semibold ${minutes === value ? "border-tide bg-tide text-white" : "border-tide/15 bg-white"}`}
                >
                  {value} 分鐘
                </button>
              ))}
            </div>
          </div>
          {debug && <details className="text-base text-muted">
            <summary className="cursor-pointer text-lg font-semibold text-ink">工作人員：指定分組</summary>
            <p className="mt-2 leading-7">訪客平常會被隨機分到一組。這裡可以指定，方便對照三種補救方式。</p>
            <div className="mt-2 grid gap-2">
              {(meta?.policies ?? []).map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => setGroup(policy.id)}
                  className={`min-h-12 rounded-2xl border px-3 py-2 text-left ${group === policy.id ? "border-tide bg-deep" : "border-tide/15 bg-white"}`}
                >
                  <span className="font-semibold text-ink">{policy.label}</span>
                  <span className="mt-1 block text-muted">{policy.blurb}</span>
                </button>
              ))}
            </div>
          </details>}
          <Button type="submit" size="lg" disabled={pending || Boolean(error)}>
            {pending ? "準備中…" : "開始導覽"}
          </Button>
          </form>
          </details>
        </div>
      )}
      {disclaimer && <p className="text-base leading-7 text-muted">{disclaimer}</p>}
    </main>
  );
}
