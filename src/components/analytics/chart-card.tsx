"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { cn, formatNumber, formatPct } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartPoint } from "@/types";

const tooltipStyle = {
  background: "rgba(10, 13, 18, 0.96)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "white"
};

export function ChartCard({
  title,
  children,
  className
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden border-white/10 bg-white/[0.035]", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartMount({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-72 w-full rounded-md bg-white/[0.025]" />;
  }

  return children;
}

export function ProbabilityBars({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ChartMount>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={tooltipStyle}
              formatter={(value) => [formatPct(Number(value)), "Probability"]}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((_, index) => (
                <Cell key={index} fill={["#22d3ee", "#34d399", "#f59e0b", "#a78bfa"][index % 4]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}

export function DistributionCurve({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ChartMount>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="distributionFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatNumber(Number(value), 0), "Days"]} />
            <Area type="monotone" dataKey="value" stroke="#22d3ee" fill="url(#distributionFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}

export function EquityCurve({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ChartMount>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatNumber(Number(value), 0), "Balance"]} />
            <Line type="monotone" dataKey="value" dot={false} stroke="#34d399" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}

export function WeekdayComparison({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ChartMount>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatPct(Number(value)), "Rate"]} />
            <Bar dataKey="value" fill="#22d3ee" radius={[5, 5, 0, 0]} />
            <Bar dataKey="secondary" fill="#34d399" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartMount>
    </div>
  );
}
