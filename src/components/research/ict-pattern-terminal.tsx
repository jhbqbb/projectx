"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Loader2, Mic, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PatternMode = "reversal" | "continuation";
type SweepDirection = "BOTH" | "HIGH" | "LOW";
type IctInterval = "15min" | "1h" | "4h";
type LookupMode = "exact" | "loose" | "situational" | "custom";

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
    interval: IctInterval;
    intervalLabel: string;
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
    interval: IctInterval;
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
const timeframes: Array<{ value: IctInterval; label: string; description: string }> = [
  { value: "15min", label: "15M", description: "intraday sweep map" },
  { value: "1h", label: "1H", description: "hourly reaction map" },
  { value: "4h", label: "4H", description: "macro reaction map" }
];
const suggestions = [
  "Strongest low sweep reversals?",
  "Friday outlook?",
  "Reversal vs continuation?",
  "Best hour overall?",
  "Weak samples?"
];
const lookupConfigs: Record<Exclude<LookupMode, "custom">, { minN: number; minEdge: number; minCiLow: number }> = {
  exact: { minN: 10, minEdge: 50, minCiLow: 0 },
  loose: { minN: 5, minEdge: 48, minCiLow: 0 },
  situational: { minN: 3, minEdge: 45, minCiLow: 0 }
};

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
  if (value >= 60) return "bg-[#78ad8e] text-[#06130d]";
  if (value >= 55) return "bg-[#9bbf9c] text-[#06130d]";
  if (value >= 50) return "bg-[#d08189] text-white";
  return "bg-[#c66373] text-white";
}

function TerminalPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "relative border border-[#294957] bg-[#071820]/92 shadow-[0_0_32px_rgba(69,159,184,0.08),inset_0_0_0_1px_rgba(130,207,226,0.04)]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

function TinyButton({
  active,
  children,
  className,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 border border-[#284553] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#9bb4bc] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9fd4e6]",
        active ? "bg-[#9fd4e6] text-[#061923]" : "bg-[#0b2029] hover:border-[#6aa6b8] hover:bg-[#142f3a] hover:text-[#d7edf2]",
        className
      )}
    >
      {children}
    </button>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#24414d] py-2 text-[11px]">
      <span className="font-bold uppercase tracking-[0.14em] text-[#8db3bd]">{label}</span>
      <span className="text-right font-bold text-[#e5f7fa]">{value}</span>
    </div>
  );
}

function PatternCard({ row, mode }: { row: IctPatternRow; mode: PatternMode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-[#24414d] bg-[#102631]/80 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8db3bd]">
            {row.day} {row.target} -&gt; {row.sweep}
          </div>
          <div className={cn("mt-1 text-[11px] font-black uppercase", row.direction === "LOW" ? "text-[#8cc99d]" : "text-[#d98991]")}>
            {row.direction} sweep
          </div>
        </div>
        <span className={cn("min-w-14 px-2 py-1 text-center text-[11px] font-black", scoreTone(row.edge))}>{row.edge}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[#9eb8c0]">
        <div>N {row.n}/{row.opportunities}</div>
        <div>Freq {row.frequency}%</div>
        <div>{mode} CI [{row.ciLow}-{row.ciHigh}]</div>
        <div>Depth {row.depth} pts</div>
      </div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d8edf2]">{row.trade}</div>
    </motion.div>
  );
}

export function IctPatternTerminal() {
  const [data, setData] = useState<IctPatternPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PatternMode>("reversal");
  const [interval, setInterval] = useState<IctInterval>("15min");
  const [lookupMode, setLookupMode] = useState<LookupMode>("exact");
  const [day, setDay] = useState("ALL");
  const [direction, setDirection] = useState<SweepDirection>("BOTH");
  const [minN, setMinN] = useState(10);
  const [minEdge, setMinEdge] = useState(50);
  const [minCiLow, setMinCiLow] = useState(0);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [aiHidden, setAiHidden] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatAnswer, setChatAnswer] = useState("Ready. Ask about sweeps, reversals, continuations, session timing, or sample quality.");
  const [chatLoading, setChatLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      mode,
      interval,
      day,
      direction,
      minN: String(minN),
      minEdge: String(minEdge),
      minCiLow: String(minCiLow)
    });

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    return params.toString();
  }, [day, direction, from, interval, minCiLow, minEdge, minN, mode, to]);

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

  function applyLookup(next: Exclude<LookupMode, "custom">) {
    setLookupMode(next);
    setMinN(lookupConfigs[next].minN);
    setMinEdge(lookupConfigs[next].minEdge);
    setMinCiLow(lookupConfigs[next].minCiLow);
  }

  function setNumberFilter(setter: (value: number) => void, value: string) {
    setLookupMode("custom");
    setter(Math.max(0, Number(value)));
  }

  async function askAi(prompt = chatInput) {
    const question = prompt.trim();
    if (!question || chatLoading) return;

    setChatLoading(true);
    setChatExpanded(true);
    setChatAnswer("");
    setChatInput("");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Use New York local time and ICT sweep terminology. Current terminal filters: interval=${interval}, mode=${mode}, day=${day}, direction=${direction}, minN=${minN}, minEdge=${minEdge}, minCiLow=${minCiLow}. Question: ${question}`,
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
  const activeInterval = timeframes.find((item) => item.value === interval);

  return (
    <div className="min-h-screen overflow-x-hidden bg-black px-2 py-4 font-mono text-[#d8edf2] sm:px-4 lg:px-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(105,170,190,0.18),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(208,111,122,0.12),transparent_24%),linear-gradient(180deg,#020607_0%,#08161b_58%,#020607_100%)]" />
      <main className="relative mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-col gap-3 border-b border-[#284553] pb-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-2xl font-black uppercase tracking-[0.26em] text-white sm:text-4xl">PROJECTX</div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#9fd4e6]">
                <Sparkles className="size-3" />
                real QQQ research terminal
              </div>
            </div>
            <div className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#9fc7d1]">
              {`// ${data?.meta.title ?? "PROJECTX QQQ 15M ICT Pattern Map"}`}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#7fa1aa]">
              {data?.meta.subtitle ?? "Loading Nasdaq statistics"} - Timezone: America/New_York
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {timeframes.map((item) => (
              <TinyButton key={item.value} active={interval === item.value} onClick={() => setInterval(item.value)}>
                {item.label}
              </TinyButton>
            ))}
            <TinyButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
              {filtersOpen ? "hide filters" : "show filters"}
            </TinyButton>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {aiHidden ? (
            <TerminalPanel key="ai-hidden" className="p-3">
              <button
                type="button"
                onClick={() => setAiHidden(false)}
                className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9fd4e6] hover:text-white"
              >
                [show ai]
              </button>
            </TerminalPanel>
          ) : (
            <TerminalPanel key="ai-open" className="p-3 sm:p-4">
              <div className="border-l-2 border-[#9fd4e6] pl-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#9fd4e6]">
                    {"// ASK AI - TALK OR TYPE"}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setChatExpanded((current) => !current)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#8db3bd] hover:text-white"
                    >
                      {chatExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      {chatExpanded ? "short" : "expand"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiHidden(true)}
                      className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8db3bd] hover:text-white"
                    >
                      [hide]
                    </button>
                  </div>
                </div>
                <div className="mt-2 border-l-2 border-[#d06f7a] bg-[#2a2630] px-3 py-2 text-[11px] font-semibold text-[#e0a8b0]">
                  {"// AI reads the current real Nasdaq QQQ dataset. All session and sweep times are New York local time."}
                </div>
                <div
                  className={cn(
                    "mt-2 overflow-y-auto border border-[#1f3f4c] bg-[#06141a] px-3 py-2 text-[11px] leading-5 text-[#b8d3db] shadow-inner",
                    chatExpanded ? "max-h-[44vh]" : "max-h-36 sm:max-h-52"
                  )}
                >
                  <div className="whitespace-pre-wrap">{chatLoading && !chatAnswer ? "Streaming deterministic research context..." : chatAnswer}</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[32px_minmax(0,1fr)_112px]">
                  <button
                    type="button"
                    aria-label="Voice input"
                    className="flex size-8 items-center justify-center border border-[#284553] bg-[#0b1a21] text-[#8db3bd] transition hover:border-[#9fd4e6] hover:text-white"
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
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => askAi(suggestion)}
                      className="shrink-0 border border-[#284553] bg-[#132a34] px-3 py-1.5 text-[10px] font-bold text-[#9fc7d1] transition hover:border-[#9fd4e6] hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </TerminalPanel>
          )}
        </AnimatePresence>

        <TerminalPanel className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// DATE RANGE"}</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f8f99]">
                {activeInterval?.label} - {activeInterval?.description} - source {data?.meta.provider ?? "Twelve Data"}
              </div>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#86a4ac]">
              {data
                ? `${data.meta.from} -> ${data.meta.to} - ${formatCount(data.meta.tradingDays)} trading days - ${formatCount(data.meta.sweepEvents)} sweep events`
                : "Loading"}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,150px)_auto_minmax(0,150px)] lg:flex lg:flex-wrap lg:items-center">
            <span className="self-center text-[10px] font-black uppercase tracking-[0.16em] text-[#6f8f99]">From</span>
            <Input
              type="date"
              value={from ?? data?.meta.from ?? ""}
              onChange={(event) => setFrom(event.target.value)}
              className="h-8 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
            />
            <span className="self-center text-[10px] font-black uppercase tracking-[0.16em] text-[#6f8f99]">To</span>
            <Input
              type="date"
              value={to ?? data?.meta.to ?? ""}
              onChange={(event) => setTo(event.target.value)}
              className="h-8 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
            />
            <div className="col-span-full flex flex-wrap gap-2 lg:col-span-1">
              <TinyButton onClick={() => setRange(6)}>6 mo</TinyButton>
              <TinyButton onClick={() => setRange(12)}>12 mo</TinyButton>
              <TinyButton onClick={() => setRange(24)}>24 mo</TinyButton>
              <TinyButton active={!from && !to} onClick={() => setRange("FULL")}>
                full
              </TinyButton>
            </div>
          </div>
        </TerminalPanel>

        <TerminalPanel className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// LIVE LOOKUP"}</div>
            <TinyButton active={lookupMode === "exact"} onClick={() => applyLookup("exact")}>
              Exact
            </TinyButton>
            <TinyButton active={lookupMode === "loose"} onClick={() => applyLookup("loose")}>
              Loose
            </TinyButton>
            <TinyButton active={lookupMode === "situational"} onClick={() => applyLookup("situational")}>
              Situational
            </TinyButton>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                      "mt-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.14em]",
                      summary.direction === "HIGH" ? "bg-[#d17e83] text-white" : "bg-[#78ad8e] text-[#06130d]"
                    )}
                  >
                    {summary.action}
                  </div>
                  <div className="mt-3 border border-[#284553] bg-[#0c2029] p-3 text-[10px] leading-5 text-[#9eb8c0]">
                    {"// ICT manipulation before expansion"}
                    <br />
                    {summary.manipulation}. Depth and rejection are measured from real QQQ {data?.meta.intervalLabel ?? "15M"} candles.
                  </div>
                </TerminalPanel>
              ) : null
            )}
          </div>
        </TerminalPanel>

        <AnimatePresence>
          {filtersOpen ? (
            <TerminalPanel className="p-3" key="filters">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Mode</span>
                <TinyButton active={mode === "reversal"} onClick={() => setMode("reversal")}>
                  Reversal
                </TinyButton>
                <TinyButton active={mode === "continuation"} onClick={() => setMode("continuation")}>
                  Continuation
                </TinyButton>
                <span className="ml-0 text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2] sm:ml-2">Day</span>
                {days.map((item) => (
                  <TinyButton key={item} active={day === item} onClick={() => setDay(item)}>
                    {item}
                  </TinyButton>
                ))}
                <span className="ml-0 text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2] sm:ml-2">Direction</span>
                {(["BOTH", "HIGH", "LOW"] as const).map((item) => (
                  <TinyButton key={item} active={direction === item} onClick={() => setDirection(item)}>
                    {item}
                  </TinyButton>
                ))}
                <span className="ml-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2] sm:ml-2">
                  <SlidersHorizontal className="size-3" />
                  Min n
                </span>
                <Input
                  type="number"
                  value={minN}
                  onChange={(event) => setNumberFilter(setMinN, event.target.value)}
                  className="h-8 w-20 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
                />
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Min edge</span>
                <Input
                  type="number"
                  value={minEdge}
                  onChange={(event) => setNumberFilter(setMinEdge, event.target.value)}
                  className="h-8 w-20 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
                />
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7898a2]">Min CI LO</span>
                <Input
                  type="number"
                  value={minCiLow}
                  onChange={(event) => setNumberFilter(setMinCiLow, event.target.value)}
                  className="h-8 w-20 rounded-none border-[#284553] bg-[#07151b] text-[11px]"
                />
              </div>
            </TerminalPanel>
          ) : null}
        </AnimatePresence>

        <div className="border-l-2 border-[#d06f7a] bg-[#2a2630] px-3 py-2 text-[11px] font-semibold text-[#e0a8b0]">
          {`// ${mode === "reversal" ? "REVERSAL MODE" : "CONTINUATION MODE"} - Target candle level is swept by a later candle. Edge is calculated from the response path.`}
        </div>
        <div className="border-l-2 border-[#9fd4e6] bg-[#10242d] px-3 py-2 text-[10px] font-semibold text-[#9eb8c0]">
          Each row: day, target candle, sweep candle, direction. Edge uses 95% Wilson CI. Date range above filters every calculation.
        </div>

        <TerminalPanel className="p-3 sm:p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9fc7d1]">{"// TODAY'S WATCHLIST"}</div>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f8f99]">
            {day === "ALL" ? "All days" : day} - {mode} mode - {interval.toUpperCase()} - filtered
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
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid gap-2 border-b border-[#24414d] py-2 text-[11px] md:grid-cols-[70px_minmax(0,1fr)_98px_78px_minmax(0,1fr)] md:items-center md:gap-3"
                  >
                    <span className="font-black text-[#d8edf2]">{row.target}</span>
                    <span className="text-[#8eaab2]">-&gt; takes {row.sweep}</span>
                    <span className={row.direction === "LOW" ? "font-black text-[#92c9a4]" : "font-black text-[#d98991]"}>
                      {row.direction} SWEEP
                    </span>
                    <span className={cn("w-16 px-2 py-1 text-center text-[10px] font-black", scoreTone(row.edge))}>{row.edge}%</span>
                    <span className="min-w-0 text-[#8eaab2] md:truncate">
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
            <div className="mt-2 text-lg font-black sm:text-xl">
              {topEdge ? `${topEdge.day} ${topEdge.target} -> ${topEdge.sweep}` : "--"}
            </div>
            <div className="mt-2 text-[11px] text-[#9eb8c0]">
              {topEdge
                ? `${topEdge.direction.toLowerCase()} sweep - ${topEdge.edge}% [CI ${topEdge.ciLow}-${topEdge.ciHigh}] - n=${topEdge.n}`
                : "No match"}
            </div>
          </TerminalPanel>
        </div>

        <div className="space-y-2 md:hidden">
          {loading ? (
            <TerminalPanel className="p-8 text-center">
              <Loader2 className="mx-auto size-5 animate-spin text-[#9fd4e6]" />
            </TerminalPanel>
          ) : data?.rows.length ? (
            data.rows.map((row) => <PatternCard key={row.id} row={row} mode={mode} />)
          ) : (
            <TerminalPanel className="px-4 py-12 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-[#7898a2]">
              {"// No patterns match filters. Adjust thresholds or date range."}
            </TerminalPanel>
          )}
        </div>

        <TerminalPanel className="hidden overflow-x-auto md:block">
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
                  <tr key={row.id} className="border-b border-[#1c3844] bg-[#102631]/70 transition hover:bg-[#173541]">
                    <td className="px-4 py-3 font-bold text-[#d8edf2]">{row.day}</td>
                    <td className="px-4 py-3">{row.target}</td>
                    <td className="px-4 py-3">{row.sweep}</td>
                    <td className={cn("px-4 py-3 font-black", row.direction === "LOW" ? "text-[#8cc99d]" : "text-[#d98991]")}>
                      {row.direction} SWEEP
                    </td>
                    <td className="px-4 py-3">{row.trade}</td>
                    <td className="px-4 py-3">
                      {row.n}/{row.opportunities}
                    </td>
                    <td className="px-4 py-3">{row.frequency}%</td>
                    <td className="px-4 py-2">
                      <span className={cn("inline-flex min-w-14 justify-center px-3 py-1 font-black", scoreTone(row.edge))}>{row.edge}</span>
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
  );
}
