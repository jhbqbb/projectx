"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, Database, FileText, History, Loader2, PanelLeft, Plus, Send, Sparkles, User } from "lucide-react";
import { REPORT_MODULES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type ResearchContextState = {
  calculations: string[];
  sql: string;
  followUps: string[];
  warnings: string[];
  sourceDatasets: string[];
  summary: {
    sampleSize: number;
    confidence: number;
  };
  hasData: boolean;
  noDataReason?: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    content:
      "Select one or more reports, then ask any trading research question. I will show the SQL plan, calculations, sample warnings, and follow-up research paths when historical data exists."
  }
];

const savedSessions: Array<{ title: string; count: number; active: boolean }> = [];

const promptChips = [
  "What patterns have the strongest response-session expectancy?",
  "What happens after an opening gap in the direction of the premarket move?",
  "Show win rate by weekday.",
  "Find common characteristics of reversal days across all reports."
];

export function AIResearchWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [selectedReports, setSelectedReports] = useState<string[]>(["context-vs-regular", "session-reversal"]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [context, setContext] = useState<ResearchContextState | null>(null);
  const activeAssistantId = useRef<string | null>(null);

  const selectedReportTitles = useMemo(
    () => REPORT_MODULES.filter((report) => selectedReports.includes(report.id)).map((report) => report.title),
    [selectedReports]
  );

  function toggleReport(id: string) {
    setSelectedReports((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function sendMessage(content = input) {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed
    };
    const assistantId = crypto.randomUUID();
    activeAssistantId.current = assistantId;
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" }
    ]);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          selectedReports
        })
      });

      if (!response.body) {
        throw new Error("No stream returned.");
      }

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
          const payload = JSON.parse(line.replace("data: ", "")) as {
            type: string;
            delta?: string;
            context?: ResearchContextState;
            error?: string;
          };

          if (payload.type === "context" && payload.context) {
            setContext(payload.context);
          }

          if (payload.type === "delta" && payload.delta) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${payload.delta}` }
                  : message
              )
            );
          }

          if (payload.type === "error") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: payload.error ?? "AI stream failed." }
                  : message
              )
            );
          }
        }
      }
    } finally {
      setIsStreaming(false);
      activeAssistantId.current = null;
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
      <aside className="rounded-lg border border-white/10 bg-white/[0.035]">
        <div className="flex h-14 items-center justify-between border-b border-white/8 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PanelLeft className="size-4 text-cyan-300" />
            Research
          </div>
          <Button variant="ghost" size="icon" aria-label="New research">
            <Plus className="size-4" />
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-10.5rem)]">
          <div className="space-y-5 p-4">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reports</h2>
                <Badge variant="info">{selectedReports.length}</Badge>
              </div>
              <div className="space-y-2">
                {REPORT_MODULES.map((report) => {
                  const Icon = report.icon;
                  const selected = selectedReports.includes(report.id);

                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => toggleReport(report.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                          : "border-white/8 bg-black/15 text-muted-foreground hover:bg-white/[0.055] hover:text-foreground"
                      )}
                    >
                      <Checkbox checked={selected} aria-label={report.title} />
                      <Icon className={cn("size-4", report.accent)} />
                      <span className="min-w-0 flex-1 truncate">{report.title}</span>
                      {selected ? <Check className="size-3.5 text-cyan-200" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <Separator />

            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <History className="size-3.5" />
                Sessions
              </div>
              <div className="space-y-2">
                {savedSessions.length ? (
                  savedSessions.map((session) => (
                    <button
                      key={session.title}
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition-colors",
                        session.active
                          ? "border-emerald-300/25 bg-emerald-300/10"
                          : "border-white/8 bg-black/15 hover:bg-white/[0.055]"
                      )}
                    >
                      <div className="truncate text-sm font-medium">{session.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{session.count} messages</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-md border border-white/8 bg-black/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    No saved sessions yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
      </aside>

      <section className="flex min-h-[680px] flex-col rounded-lg border border-white/10 bg-[#0b0d10]/92 shadow-terminal">
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-white/8 px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-cyan-300" />
              AI Research
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {selectedReportTitles.length ? selectedReportTitles.join(" + ") : "No report selected"}
            </div>
          </div>
          {isStreaming ? (
            <Badge variant="info">
              <Loader2 className="mr-1 size-3 animate-spin" />
              Streaming
            </Badge>
          ) : (
            <Badge variant="success">Ready</Badge>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={cn("flex gap-3", isUser && "justify-end")}
                  >
                    {!isUser ? (
                      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                        <Bot className="size-4" />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[78%] whitespace-pre-wrap rounded-lg border px-4 py-3 text-sm leading-6",
                        isUser
                          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                          : "border-white/10 bg-white/[0.045] text-foreground"
                      )}
                    >
                      {message.content || (message.id === activeAssistantId.current ? "Analyzing..." : "")}
                    </div>
                    {isUser ? (
                      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
                        <User className="size-4" />
                      </div>
                    ) : null}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="border-t border-white/8 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {promptChips.map((chip) => (
              <Button
                key={chip}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto min-h-8 whitespace-normal text-left"
                onClick={() => sendMessage(chip)}
                disabled={isStreaming}
              >
                {chip}
              </Button>
            ))}
          </div>
          <div className="flex gap-3">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask about reversals, continuations, gap behavior, weekdays, expectancy, or hidden patterns"
              className="min-h-12 resize-none border-white/10 bg-black/20"
            />
            <Button className="h-12 px-4" onClick={() => sendMessage()} disabled={isStreaming || !input.trim()}>
              {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-emerald-300" />
              Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(context?.sourceDatasets?.length ? context.sourceDatasets : ["No data available yet"]).map((source) => (
              <div key={source} className="rounded-md border border-white/8 bg-black/20 p-3 text-sm">
                <div className="font-medium">{source}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {context?.hasData ? "Session normalized to America/New_York" : "Ingest Alpha Vantage data in Settings"}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Calculations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(context?.calculations ?? ["Waiting for analysis"]).map((calculation) => (
              <div key={calculation} className="rounded-md bg-black/20 px-3 py-2 text-xs text-muted-foreground">
                {calculation}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-cyan-300" />
              SQL Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-md border border-white/8 bg-black/35 p-3 text-[11px] leading-5 text-cyan-50">
              {context?.sql ?? "No SQL plan yet."}
            </pre>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Follow-Ups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(context?.followUps ?? promptChips).map((followUp) => (
              <Button
                key={followUp}
                variant="outline"
                size="sm"
                className="h-auto w-full justify-start whitespace-normal text-left"
                onClick={() => sendMessage(followUp)}
                disabled={isStreaming}
              >
                {followUp}
              </Button>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
