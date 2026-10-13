"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UnsubscribeForm({ e, t, email }: { e: string; t: string; email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function submit() {
    setState("busy");
    const res = await fetch(`/api/mail/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`, { method: "POST" }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }
  if (state === "done") return <p className="mt-3 text-sm">Je bent afgemeld. Je ontvangt geen mailings meer op {email}.</p>;
  return (
    <div className="mt-3 space-y-3 text-sm">
      <p>Wil je geen mailings meer ontvangen op <strong>{email}</strong>?</p>
      <Button onClick={submit} disabled={state === "busy"}>Afmelden</Button>
      {state === "error" && <p className="text-red-600">Afmelden is niet gelukt. Probeer het later opnieuw.</p>}
    </div>
  );
}
