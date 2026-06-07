"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, Send, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PatternMode = "reversal" | "continuation";
type SweepDirection = "BOTH" | "HIGH" | "LOW";

type IctPatternRow = {
  id: string;
  day: string;
  target: string;
  sweep: string;
  direction: "HIGH" | "LOW";
  trade: string;
  n: number;
  opportunities: number;
  frequency: number;
  reversal: number;
  continuation: number;
  edge: number;
  ciLow: number;
  ciHigh: number;
  depth: number;
  rejection: number;
};

type DirectionSummary = {
  direction: "HIGH" | "LOW";
  label: string;
  frequencyText: string;
  reversal: number;
  continuation: number;
  ci: string;
  averageDepth: number;
  averageRejection: number;
  action: string;
  manipulation: string;
};

type IctPatternPayload = {
  meta: {
    title: string;
    subtitle: string;
    timezone: string;
    mode: PatternMode;
    from: string;
    to: string;
    totalCandles: number;
    tradingDays: number;
    sweepEvents: number;
    provider: string;
    symbol: string;
    exchange: string;
    micCode: string;
  };
  filters: {
    mode: PatternMode;
    day: string;
    direction: SweepDirection;
    minN: number;
    minEdge: number;
    minCiLow: number;
    from: string;
    to: string;
  };
  summary: {
    patterns: number;
    sweepEvents: number;
    weightedEdge: number;
    topEdge: IctPatternRow | null;
  };
  directionSummaries: DirectionSummary[];
  watchlist: IctPatternRow[];
  rows: IctPatternRow[];
};

const days = ["ALL", "MON", "TUE", "WED", "THU", "FRI"];
const suggestions = [
  "Strongest low sweep reversals?",
  "Friday outlook?",
  "Reversal vs continuation?",
  "Best hour overall?",
  "Weak samples?"
];

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function scoreTone(value: number) {
  if (value >= 60) return "bg-[#78ad8e] text-[#08140e]";
  if (value >= 55) return "bg-[#9bbf9c] text-[#08140e]";
  if (value >= 50) return "bg-[#d07b86] text-white";
  return "bg-[#c66373] text-white";
}

function TerminalPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border border-[#294957] bg-[#112934]/82 shadow-[inset_0_0_0_1px_rgba(130,207,226,0.04)]", className)}>
      {children}
    </div>
  );
}

function TinyButton({
  active,
  children,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 border border-[#284553] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#9bb4bc] transition-colors",
        active ? "bg-[#9fd4e6] text-[#081923]" : "bg-[#0c2029] hover:bg-[#142f3a] hover:text-[#d7edf2]"
      )}
    >
      {children}
    </button>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#24414d] py-1.5 text-[11px]">
      <span className="font-bold uppercase tracking-[0.14em] text-[#7898a2]">{label}</span>
      <span className="font-bold text-[#d9edf2]">{value}</span>
    </div>
  );
}

export function IctPatternTerminal() {
  const [data, setData] = useState<IctPatternPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PatternMode>("reversal");
  const [day, setDay] = useState("ALL");
  const [direction, setDirection] = useState<SweepDirection>("BOTH");
  const [minN, setMinN] = useState(10);
  const [minEdge, setMinEdge] = useState(50);
  const [minCiLow, setMinCiLow] = useState(0);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatAnswer, setChatAnswer] = useState("Ready. Ask about sweeps, reversals, continuations, session timing, or sample quality.");
  const [chatLoading, setChatLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      mode,
      day,
      direction,
      minN: String(minN),
      minEdge: String(minEdge),
      minCiLow: String(minCiLow)
    });

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    return params.toString();
  }, [day, direction, from, minCiLow, minEdge, minN, mode, to]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetch(`/api/ict-patterns?${query}`)
      .then((response) => response.json())
      .then((payload: IctPatternPayload) => {
        if (mounted) setData(payload);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [query]);

  function setRange(months: number | "FULL") {
    if (!data) return;

    if (months === "FULL") {
      setFrom(null);
      setTo(null);
      return;
    }

    const end = new Date(`${data.meta.to}T00:00:00.000Z`);
    setTo(data.meta.to);
    setFrom(toIsoDate(addMonths(end, -months)));
  }

  async function askAi(prompt = chatInput) {
    const question = prompt.trim();
    if (!question || chatLoading) return;

    setChatLoading(true);
    setChatAnswer("");
    setChatInput("");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Use New York local time and ICT sweep terminology. Current terminal filters: mode=${mode}, day=${day}, direction=${direction}, minN=${minN}, minEdge=${minEdge}, minCiLow=${minCiLow}. Question: ${question}`,
          selectedReports: ["ict-pattern-map", "session-reversal", "session-continuation"]
        })
      });

      if (!response.body) throw new Error("No AI stream returned.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.replace("data: ", "")) as { type: string; delta?: string };

          if (payload.type === "delta" && payload.delta) {
            setChatAnswer((current) => `${current}${payload.delta}`);
          }
        }
      }
    } catch (error) {
      setChatAnswer(error instanceof Error ? error.message : "AI stream failed.");
    } finally {
      setChatLoading(false);
    }
  }

  const topEdge = data?.summary.topEdge;
  const highSummary = data?.directionSummaries.find((item) => item.direction === "HIGH");
  const lowSummary = data?.directionSummaries.find((item) => item.direction === "LOW");

  return (
    <div className="min-h-screen bg-black px-3 py-5 text-[#d8edf2] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1680px] gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-2.5rem)] border-r border-[#284553] pr-8 xl:flex xl:flex-col xl:justify-center">
          <div className="text-[54px] font-black uppercase tracking-[0.24em] text-white">PROJECTX</div>
          <div className="mt-4 h-px w-full bg-[#284553]" />
          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[#84a4ad]">
            Nasdaq QQQ sweep research
          </div>
        </aside>

        <main className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-[#9fc7d1]">
                {`// ${data?.meta.title ?? "PROJECTX QQQ 15M ICT Pattern Map"}`}
              </div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6f8f99]">
                {data?.meta.subtitle ?? "Loading Nasdaq statistics"} - Timezone: America/New_York
              </div>
            </div>
            <button type="button" className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8db3bd]">
              [hide]
            </button>
          </div>

          <TerminalPanel className="p-3">
            <div className="border-l-2 border-[#9fd4e6] pl-3">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#9fd4e6]">
                {"// ASK AI - TALK OR TYPE"}
              </div>
              <div className="mt-2 border-l-2 border-[#d06f7a] bg-[#2a2630] px-3 py-2 text-[11px] font-semibold text-[#d8a2aa]">
                {"// AI reads the current real Nasdaq QQQ dataset. All session and sweep times are New York local time."}
              </div>
              <div className="mt-2 text-[11px] leading-5 text-[#9fb9c0]">
                {chatLoading ? "Thinking through deterministic stats..." : chatAnswer}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  aria-label="Voice input"
                  className="flex size-8 items-center justify-center border border-[#284553] bg-[#0b1a21] text-[#8db3bd]"
                >
                  <Mic className="size-4" />
                </button>
                <Input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      askAi();
                    }
                  }}
                  className="h-8 rounded-none border-[#284553] bg-[#07151b] text-[12px] text-[#d8edf2] placeholder:text-[#526f78]"
                  placeholder="Ask anything about the data..."
                />
                <Button
                  type="button"
                  onClick={() => askAi()}
                  disabled={chatLoading || !chatInput.trim()}
                  className="h-8 rounded-none bg-[#9fd4e6] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-[#07151b] hover:bg-[#b6e7f4]"
                >
                  {chatLoading ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  Send
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => askAi(suggestion)}
                    className="border border-[#284553] bg-[#132a34] px-3 py-1 text-[10px] font-bold text-[#8db3bd] hover:border-[#9fd4e6] hover:text-[#d8edf2]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </TerminalPanel>

          <TerminalPanel className="p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// DATE RANGE"}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6f8f99]">From</span>
              <Input
                type="date"
                value={from ?? data?.meta.from ?? ""}
                onChange={(event) => setFrom(event.target.value)}
                className="h-8 w-[150px] rounded-none border-[#284553] bg-[#07151b] text-[11px]"
              />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6f8f99]">To</span>
              <Input
                type="date"
                value={to ?? data?.meta.to ?? ""}
                onChange={(event) => setTo(event.target.value)}
                className="h-8 w-[150px] rounded-none border-[#284553] bg-[#07151b] text-[11px]"
              />
              <TinyButton onClick={() => setRange(6)}>6 mo</TinyButton>
              <TinyButton onClick={() => setRange(12)}>12 mo</TinyButton>
              <TinyButton onClick={() => setRange(24)}>24 mo</TinyButton>
              <TinyButton active={!from && !to} onClick={() => setRange("FULL")}>
                full
              </TinyButton>
              <div className="ml-auto text-[10px] font-bold uppercase tracking-[0.14em] text-[#86a4ac]">
                {data
                  ? `${data.meta.from} -> ${data.meta.to} - ${formatCount(data.meta.tradingDays)} trading days - ${formatCount(data.meta.sweepEvents)} sweep events`
                  : "Loading"}
              </div>
            </div>
          </TerminalPanel>

          <TerminalPanel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// LIVE LOOKUP"}</div>
              <TinyButton active onClick={() => undefined}>Exact</TinyButton>
              <TinyButton onClick={() => undefined}>Loose</TinyButton>
              <TinyButton onClick={() => undefined}>Situational</TinyButton>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {[highSummary, lowSummary].map((summary) =>
                summary ? (
                  <TerminalPanel key={summary.direction} className="p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{`// ${summary.label}`}</div>
                    <div className="mt-3 space-y-1">
                      <StatLine label="Sweep frequency" value={summary.frequencyText} />
                      <StatLine label="Reversal" value={`${summary.reversal}% ${summary.ci}`} />
                      <StatLine label="Continuation" value={`${summary.continuation}%`} />
                      <StatLine label="Avg depth" value={`${summary.averageDepth} pts`} />
                      <StatLine label="Avg rejection" value={`${summary.averageRejection} pts`} />
                    </div>
                    <div
                      className={cn(
                        "mt-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.16em]",
                        summary.direction === "HIGH" ? "bg-[#d17e83] text-white" : "bg-[#78ad8e] text-[#08140e]"
                      )}
                    >
                      {summary.action}
                    </div>
                    <div className="mt-3 border border-[#284553] bg-[#0c2029] p-3 text-[10px] leading-5 text-[#9eb8c0]">
                      {"// ICT manipulation before expansion"}
                      <br />
                      {summary.manipulation}. Depth and rejection are measured from real QQQ 15-minute candles.
                    </div>
                  </TerminalPanel>
                ) : null
              )}
            </div>
          </TerminalPanel>

          <div className="flex gap-1">
            <TinyButton active={mode === "reversal"} onClick={() => setMode("reversal")}>
              Reversal
            </TinyButton>
            <TinyButton active={mode === "continuation"} onClick={() => setMode("continuation")}>
              Continuation
            </TinyButton>
          </div>

          <div className="border-l-2 border-[#d06f7a] bg-[#2a2630] px-3 py-2 text-[11px] font-semibold text-[#d8a2aa]">
            {`// ${mode === "reversal" ? "REVERSAL MODE" : "CONTINUATION MODE"} - Target candle level is swept by a later candle. Edge is calculated from the response into the close.`}
          </div>
          <div className="border-l-2 border-[#9fd4e6] bg-[#10242d] px-3 py-2 text-[10px] font-semibold text-[#9eb8c0]">
            Each row: day, target candle, sweep candle, direction. Edge uses 95% Wilson CI. Date range filters every calculation.
          </div>

          <TerminalPanel className="p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// TODAY'S WATCHLIST"}</div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f8f99]">
              {day === "ALL" ? "All days" : day} - {mode} mode - filtered
            </div>
            <div className="mt-3 space-y-2">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-[#9fd4e6]" />
                  </div>
                ) : data?.watchlist.length ? (
                  data.watchlist.map((row) => (
                    <motion.div
                      key={row.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-[70px_1fr_92px_92px_1fr] items-center gap-3 border-b border-[#24414d] py-1.5 text-[11px]"
                    >
                      <span className="font-black text-[#d8edf2]">{row.target}</span>
                      <span className="text-[#8eaab2]">-&gt; takes {row.sweep}</span>
                      <span className={row.direction === "LOW" ? "font-black text-[#92c9a4]" : "font-black text-[#d98991]"}>
                        {row.direction} SWEEP
                      </span>
                      <span className={cn("px-2 py-1 text-center text-[10px] font-black", scoreTone(row.edge))}>
                        {row.edge}%
                      </span>
                      <span className="truncate text-[#8eaab2]">
                        {row.trade} - n={row.n}/{row.opportunities} - CI {row.ciLow}-{row.ciHigh} - depth {row.depth}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-8 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[#7898a2]">
                    {"// No high-confidence patterns at current thresholds. Adjust filters."}
                  </div>
                )}
              </AnimatePresence>
            </div>
          </TerminalPanel>

          <TerminalPanel className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Day</span>
              {days.map((item) => (
                <TinyButton key={item} active={day === item} onClick={() => setDay(item)}>
                  {item}
                </TinyButton>
              ))}
              <span className="ml-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Direction</span>
              {(["BOTH", "HIGH", "LOW"] as const).map((item) => (
                <TinyButton key={item} active={direction === item} onClick={() => setDirection(item)}>
                  {item}
                </TinyButton>
              ))}
              <span className="ml-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">
                <SlidersHorizontal className="size-3" />
                Min n
              </span>
              <Input
                type="number"
                value={minN}
                onChange={(event) => setMinN(Number(event.target.value))}
                className="h-8 w-20 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
              />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Min edge</span>
              <Input
                type="number"
                value={minEdge}
                onChange={(event) => setMinEdge(Number(event.target.value))}
                className="h-8 w-20 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
              />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Min CI LO</span>
              <Input
                type="number"
                value={minCiLow}
                onChange={(event) => setMinCiLow(Number(event.target.value))}
                className="h-8 w-20 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
              />
            </div>
          </TerminalPanel>

          <div className="grid gap-3 lg:grid-cols-3">
            <TerminalPanel className="p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// Patterns"}</div>
              <div className="mt-2 text-3xl font-black">{data?.summary.patterns ?? 0}</div>
              <div className="mt-1 text-[10px] text-[#7898a2]">{formatCount(data?.summary.sweepEvents ?? 0)} sweep events</div>
            </TerminalPanel>
            <TerminalPanel className="p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">
                {`// Weighted ${mode === "reversal" ? "reversal" : "continuation"}`}
              </div>
              <div className="mt-2 text-3xl font-black">{data?.summary.weightedEdge ?? 0}%</div>
              <div className="mt-1 text-[10px] text-[#7898a2]">Sample-weighted across visible</div>
            </TerminalPanel>
            <TerminalPanel className="p-4 ring-1 ring-[#9fd4e6]/60">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// Top edge"}</div>
              <div className="mt-2 text-xl font-black">
                {topEdge ? `${topEdge.day} ${topEdge.target} -> ${topEdge.sweep}` : "--"}
              </div>
              <div className="mt-2 text-[11px] text-[#9eb8c0]">
                {topEdge ? `${topEdge.direction.toLowerCase()} sweep - ${topEdge.edge}% [CI ${topEdge.ciLow}-${topEdge.ciHigh}] - n=${topEdge.n}` : "No match"}
              </div>
            </TerminalPanel>
          </div>

          <TerminalPanel className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-[11px]">
              <thead className="bg-[#07151b] text-[10px] font-black uppercase tracking-[0.18em] text-[#8db3bd]">
                <tr>
                  {["Day", "Target", "Sweeps", "Dir", "Trade", "N", "Freq", mode, "95% CI", "Depth", "Rejection"].map((header) => (
                    <th key={header} className="border-b border-[#24414d] px-4 py-3">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-14 text-center text-[#8db3bd]">
                      <Loader2 className="mx-auto size-5 animate-spin" />
                    </td>
                  </tr>
                ) : data?.rows.length ? (
                  data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-[#1c3844] bg-[#102631]/70 hover:bg-[#173541]">
                      <td className="px-4 py-3 font-bold text-[#d8edf2]">{row.day}</td>
                      <td className="px-4 py-3">{row.target}</td>
                      <td className="px-4 py-3">{row.sweep}</td>
                      <td className={cn("px-4 py-3 font-black", row.direction === "LOW" ? "text-[#8cc99d]" : "text-[#d98991]")}>
                        {row.direction} SWEEP
                      </td>
                      <td className="px-4 py-3">{row.trade}</td>
                      <td className="px-4 py-3">{row.n}/{row.opportunities}</td>
                      <td className="px-4 py-3">{row.frequency}%</td>
                      <td className="px-4 py-2">
                        <span className={cn("inline-flex min-w-14 justify-center px-3 py-1 font-black", scoreTone(row.edge))}>
                          {row.edge}
                        </span>
                      </td>
                      <td className="px-4 py-3">[{row.ciLow}-{row.ciHigh}]</td>
                      <td className="px-4 py-3">{row.depth}</td>
                      <td className="px-4 py-3">{row.rejection}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[#7898a2]">
                      {"// No patterns match filters. Adjust thresholds or date range."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TerminalPanel>
        </main>
      </div>
    </div>
  );
}
