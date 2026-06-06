import { cn } from "@/lib/utils";

type HeatmapPoint = {
  day: string;
  condition: string;
  value: number;
  sampleSize: number;
};

export function ProbabilityHeatmap({ data }: { data: HeatmapPoint[] }) {
  const days = [...new Set(data.map((point) => point.day))];
  const conditions = [...new Set(data.map((point) => point.condition))];

  return (
    <div className="w-full overflow-x-auto">
      <div className="grid min-w-[620px] gap-2" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(84px, 1fr))` }}>
        <div />
        {days.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {conditions.map((condition) => (
          <div key={condition} className="contents">
            <div className="flex h-14 items-center text-xs text-muted-foreground">{condition}</div>
            {days.map((day) => {
              const point = data.find((item) => item.day === day && item.condition === condition);
              const value = point?.value ?? 0;
              const intensity = Math.max(0.08, Math.min(0.72, value / 100));

              return (
                <div
                  key={`${condition}-${day}`}
                  className={cn("flex h-14 flex-col items-center justify-center rounded-md border border-white/8")}
                  style={{ backgroundColor: `rgba(34, 211, 238, ${intensity})` }}
                >
                  <div className="text-sm font-semibold text-white">{value}%</div>
                  <div className="text-[10px] text-white/72">n={point?.sampleSize ?? 0}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
