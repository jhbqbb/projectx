import { Database, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NoDataState({
  title = "No data available yet",
  reason = "Ingest Alpha Vantage historical data or upload OHLCV data to begin.",
  showAction = true
}: {
  title?: string;
  reason?: string;
  showAction?: boolean;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.035]">
      <CardContent className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
          <Database className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-normal">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{reason}</p>
        {showAction ? (
          <Button asChild variant="premium" className="mt-5">
            <a href="/settings">
              <UploadCloud className="size-4" />
              Ingest data
            </a>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
