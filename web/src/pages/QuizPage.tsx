import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Porthole } from "@/components/Porthole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/api";
import { useGuide } from "@/state";
import type { Grade, PublicQuestion, Summary } from "@/types";

type Kind = "practice" | "pre" | "post";

export function QuizPage() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") === "pre" || params.get("kind") === "post" ? params.get("kind") : "practice") as Kind;
  const { session, zones, summary, setAnim, refresh } = useGuide();
  const zone = zones.find((item) => item.id === session?.currentZoneId) ?? zones[0];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [practice, setPractice] = useState<{ done: boolean; total: number; answered: number; question: PublicQuestion | null } | null>(null);
  const [bundle, setBundle] = useState<PublicQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Grade | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [started, setStarted] = useState(0);
  const [round, setRound] = useState(0);
  const [doneLine, setDoneLine] = useState("");

  const question = kind === "practice" ? practice?.question ?? null : bundle[index] ?? null;

  useEffect(() => {
    if (!session || !zone) return;
    let cancel = false;
    setLoading(true);
    setError("");
    setResult(null);
    setPicked(null);
    setDoneLine("");
    setPractice(null);
    setBundle([]);
    setAnim("idle");
    const run = async () => {
      const data = await api<{ done?: boolean; total: number; answered?: number; question: PublicQuestion | null; questions?: PublicQuestion[] }>(
        `/api/sessions/${session.id}/quiz?zoneId=${zone.id}&kind=${kind}`,
      );
      if (cancel) return;
      if (kind === "practice") {
        setPractice({ done: Boolean(data.done), total: data.total, answered: data.answered ?? 0, question: data.question });
      } else {
        const questions = data.questions ?? [];
        setBundle(questions);
        setIndex(0);
        if (questions.length === 0) setDoneLine(await compareLine(session.id, zone.id, kind));
      }
      setStarted(performance.now());
    };
    run()
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [kind, zone?.id, session?.id, round, setAnim]);

  async function submit(choice: number) {
    if (!session || !question || result) return;
    setAnim("think");
    setPicked(choice);
    try {
      const grade = await api<Grade>(`/api/sessions/${session.id}/answer`, {
        method: "POST",
        body: JSON.stringify({
          questionId: question.id,
          choiceIndex: choice,
          latencyMs: Math.round(performance.now() - started),
          kind,
        }),
      });
      setResult(grade);
      if (grade.strategy) setAnim(grade.strategy.anim, grade.strategy.emphasis);
      else setAnim("wave");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
      setAnim("idle");
    }
  }

  async function next() {
    if (kind === "practice") {
      setRound((value) => value + 1);
      return;
    }
    if (index + 1 < bundle.length) {
      setIndex((value) => value + 1);
      setResult(null);
      setPicked(null);
      setStarted(performance.now());
      setAnim("idle");
      return;
    }
    if (session && zone) setDoneLine(await compareLine(session.id, zone.id, kind));
    setBundle([]);
  }

  const zoneStat = summary?.byZone.find((item) => item.zoneId === zone?.id);

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {(
          [
            ["practice", "練習"],
            ["pre", "前測"],
            ["post", "後測"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`rounded-full px-4 py-2 text-sm ${kind === id ? "bg-teal text-abyss" : "bg-white/5"}`}
            onClick={() => setParams(id === "practice" ? {} : { kind: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <Porthole />
      {session?.ageGroup === "child" && !result && <p className="text-center text-sm text-sand">慢慢想也沒關係。</p>}
      {loading && <p className="text-muted">題目游過來…</p>}
      {error && <p className="rounded-2xl bg-coral/15 px-4 py-3 text-sm">{error}</p>}
      {!loading && !question && (
        <section className="rounded-3xl bg-lagoon p-5 leading-7">
          <h1 className="font-serif text-2xl">{kind === "practice" ? "這區的練習題都做過了" : kind === "pre" ? "前測完成" : "後測完成"}</h1>
          <p className="mt-2 text-muted">{doneLine || "可以換一區，或把練習再做一次。"}</p>
          {zoneStat && kind !== "practice" && (
            <p className="mt-3">
              前測 {zoneStat.pre.correct}/{zoneStat.pre.total} · 後測 {zoneStat.post.correct}/{zoneStat.post.total}
            </p>
          )}
          {kind === "practice" && (
            <Button className="mt-4" onClick={() => void resetPractice()}>
              再練一次
            </Button>
          )}
        </section>
      )}
      {question && (
        <section className="grid gap-3">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>{question.conceptTitle}</span>
            <span>
              {kind === "practice" && practice ? `第 ${practice.answered + 1} 題，共 ${practice.total} 題` : `第 ${index + 1} 題，共 ${bundle.length} 題`}
            </span>
          </div>
          <h1 className="font-serif text-2xl leading-snug">{question.prompt}</h1>
          {question.choices.map((choice, choiceIndex) => {
            const correct = result && result.correctIndex === choiceIndex;
            const wrongPick = result && picked === choiceIndex && !result.correct;
            return (
              <Button
                key={choice}
                variant={correct ? "default" : "ghost"}
                className={`h-auto justify-start whitespace-normal rounded-2xl py-3 text-left ${wrongPick ? "border-coral" : ""}`}
                disabled={Boolean(result)}
                onClick={() => void submit(choiceIndex)}
              >
                {choice}
              </Button>
            );
          })}
          {result && (
            <article className="rounded-3xl bg-lagoon p-4">
              <Badge>{result.correct ? "答對了" : result.strategy?.strategyLabel}</Badge>
              <p className="mt-3 text-sm leading-6 text-sand">{result.timingNote}</p>
              <p className="mt-2 text-sm text-muted">
                熟練度 {Math.round(result.masteryBefore * 100)}% → {Math.round(result.masteryAfter * 100)}%
              </p>
              {result.strategy && (
                <>
                  <p className="mt-3 text-sm leading-6">{result.strategy.reason}</p>
                  <p className="mt-3 leading-8">{result.strategy.text}</p>
                  <p className="mt-2 text-xs text-muted">預估大約 {result.strategy.timeSec} 秒</p>
                </>
              )}
              <Button className="mt-4 w-full" onClick={() => void next()}>
                {kind === "practice" ? (result.hasNextPractice ? "下一題" : "看這個展區") : index + 1 < bundle.length ? "下一題" : "看結果"}
              </Button>
            </article>
          )}
        </section>
      )}
    </div>
  );

  async function resetPractice() {
    if (!session || !zone) return;
    await api(`/api/sessions/${session.id}/reset-practice`, {
      method: "POST",
      body: JSON.stringify({ zoneId: zone.id }),
    });
    setRound((value) => value + 1);
  }
}

async function compareLine(sessionId: string, zoneId: string, kind: Kind): Promise<string> {
  const summary = await api<Summary>(`/api/sessions/${sessionId}/summary`);
  const row = summary.byZone.find((item) => item.zoneId === zoneId);
  if (!row) return "";
  if (kind === "post") return `前測 ${row.pre.correct}/${row.pre.total}，後測 ${row.post.correct}/${row.post.total}。`;
  return `前測答對 ${row.pre.correct}/${row.pre.total}。等你逛完可以再做後測。`;
}
