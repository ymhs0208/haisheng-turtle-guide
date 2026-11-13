import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Porthole } from "@/components/Porthole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api";
import { useGuide } from "@/state";
import type { AgeGroup, ExperimentGroup, Session } from "@/types";

export function StartPage() {
  const { ready, error, session, meta, disclaimer, adopt, logout } = useGuide();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState<AgeGroup | "">("");
  const [minutes, setMinutes] = useState(40);
  const [group, setGroup] = useState<ExperimentGroup | "">("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");

  async function start() {
    if (!age) {
      setFormError("請先選年齡層");
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const data = await api<{ session: Session }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          nickname,
          ageGroup: age,
          visitMinutes: minutes,
          ...(group ? { experimentGroup: group } : {}),
        }),
      });
      adopt(data.session);
      navigate("/app");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "沒有建成行程");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center text-muted">小綠游過來…</main>;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-6 px-5 py-8">
      <header>
        <p className="text-sm tracking-widest text-sand">國立海洋生物博物館</p>
        <h1 className="mt-2 font-serif text-4xl">小綠導覽</h1>
        <p className="mt-2 text-muted">一隻綠蠵龜，帶你看懂眼前的海。</p>
      </header>
      <Porthole large />
      <p className="text-center font-serif text-xl">我是小綠，今天換我帶路。</p>
      {error && <p className="rounded-2xl bg-coral/15 px-4 py-3 text-sm leading-6">{error}。請先在專案資料夾執行 npm run dev。</p>}
      {session ? (
        <div className="grid gap-3">
          <Button onClick={() => navigate("/app")}>繼續以{session.nickname || "訪客"}的身份導覽</Button>
          <Button
            variant="ghost"
            onClick={() => {
              logout();
            }}
          >
            重新開始
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-4 rounded-3xl bg-lagoon/80 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="nick">暱稱，可不填</Label>
            <Input id="nick" maxLength={12} placeholder="例如：海浪" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>年齡層</Label>
            <div className="grid grid-cols-3 gap-2">
              {(meta?.ageGroups ?? [
                { id: "child" as const, label: "兒童", blurb: "用比較短的句子" },
                { id: "teen" as const, label: "青少年", blurb: "一般導覽用詞" },
                { id: "adult" as const, label: "成人", blurb: "一般導覽用詞" },
              ]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAge(item.id)}
                  className={`rounded-2xl border px-2 py-3 text-sm ${age === item.id ? "border-teal bg-teal/15" : "border-white/10"}`}
                >
                  <span className="block font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs text-muted">{item.blurb}</span>
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
                  className={`min-h-12 rounded-2xl border ${minutes === value ? "border-teal bg-teal/15" : "border-white/10"}`}
                >
                  {value} 分鐘
                </button>
              ))}
            </div>
          </div>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-sand">評審示範：指定分組</summary>
            <p className="mt-2 leading-6">訪客平常會被隨機分到一組。這裡可以指定，方便對照三種補救方式。</p>
            <div className="mt-2 grid gap-2">
              {(meta?.policies ?? []).map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => setGroup(policy.id)}
                  className={`rounded-2xl border px-3 py-2 text-left ${group === policy.id ? "border-teal" : "border-white/10"}`}
                >
                  <span className="text-foam">{policy.label}</span>
                  <span className="mt-1 block">{policy.blurb}</span>
                </button>
              ))}
            </div>
          </details>
          {formError && <p className="text-sm text-coral">{formError}</p>}
          <Button type="submit" disabled={pending || Boolean(error)}>
            {pending ? "建立行程中…" : "開始導覽"}
          </Button>
        </form>
      )}
      {disclaimer && <p className="text-xs leading-6 text-muted">{disclaimer}</p>}
    </main>
  );
}
