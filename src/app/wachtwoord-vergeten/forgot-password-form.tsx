"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      setMessage(
        data?.message ??
          "Als dit e-mailadres bij ons bekend is, is er zojuist een e-mail verstuurd met een link om je wachtwoord te resetten."
      );
    } catch {
      setMessage("Er ging iets mis. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{message}</p>
        <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
          Terug naar inloggen
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="email">E-mailadres</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={loading} className="mt-2">
        {loading ? "Bezig met versturen..." : "Resetlink versturen"}
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
        Terug naar inloggen
      </Link>
    </form>
  );
}
