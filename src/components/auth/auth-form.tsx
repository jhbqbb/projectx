"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const body = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? "") || undefined
    };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Authentication failed.");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md items-center">
      <Card className="w-full border-white/10 bg-white/[0.04] shadow-terminal">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LockKeyhole className="size-5 text-cyan-300" />
            {mode === "login" ? "Sign In" : "Create Workspace"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3">
                  <User className="size-4 text-muted-foreground" />
                  <Input id="name" name="name" className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3">
                <Mail className="size-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3">
                <LockKeyhole className="size-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 10 : 1}
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            {error ? <div className="rounded-md border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}

            <Button className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
