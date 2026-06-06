import { Database, KeyRound, LockKeyhole } from "lucide-react";
import { IngestionForm } from "@/components/settings/ingestion-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const env = {
    database: Boolean(process.env.DATABASE_URL),
    alpha: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY)
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.82fr]">
      <section className="space-y-4">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-cyan-300" />
              Data Ingestion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <IngestionForm />
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LockKeyhole className="size-4 text-emerald-300" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Workspace email</Label>
              <Input id="email" placeholder="you@example.com" className="border-white/10 bg-black/20" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Update password" className="border-white/10 bg-black/20" />
            </div>
            <div className="md:col-span-2">
              <Button variant="outline">Update Security</Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-amber-300" />
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["PostgreSQL", env.database],
              ["Alpha Vantage", env.alpha],
              ["OpenAI", env.openai]
            ].map(([label, ready]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-md border border-white/8 bg-black/20 p-3">
                <span className="text-sm">{label}</span>
                <Badge variant={ready ? "success" : "warning"}>{ready ? "Configured" : "Missing"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
