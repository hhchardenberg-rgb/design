"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

// Hetzelfde formulier (e-mail + wachtwoord) wordt in stap 2 gewoon opnieuw
// verzonden, nu met de code erbij — zie auth.ts: er bestaat op geen enkel
// moment een deels-ingelogde sessie, dus de client moet het wachtwoord
// hoe dan ook een tweede keer meesturen (niet opnieuw laten intypen: dat
// zou een onnodige stap voor de gebruiker zijn).
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/hub";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      totpCode: needsMfa && !useRecoveryCode ? code : undefined,
      recoveryCode: needsMfa && useRecoveryCode ? code : undefined,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      if (res.code === "mfa-required") {
        setNeedsMfa(true);
        setError(null);
        return;
      }
      if (res.code === "too-many-attempts") {
        setError("Te veel mislukte inlogpogingen. Probeer het over een kwartier opnieuw.");
        return;
      }
      setError(needsMfa ? "Ongeldige code." : "E-mailadres of wachtwoord onjuist.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  function backToPassword() {
    setNeedsMfa(false);
    setUseRecoveryCode(false);
    setCode("");
    setError(null);
  }

  if (needsMfa) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="code">{useRecoveryCode ? "Herstelcode" : "Verificatiecode"}</Label>
          <Input
            id="code"
            type="text"
            inputMode={useRecoveryCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder={useRecoveryCode ? "XXXXX-XXXXX" : "123456"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {useRecoveryCode
              ? "Vul een van je eenmalige herstelcodes in."
              : "Open je Authenticator-app en vul de actuele zescijferige code in."}
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={loading} className="mt-2">
          {loading ? "Bezig met controleren..." : "Bevestigen"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={backToPassword} className="text-muted-foreground hover:underline">
            Terug
          </button>
          <button
            type="button"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setCode("");
              setError(null);
            }}
            className="text-muted-foreground hover:underline"
          >
            {useRecoveryCode ? "Code uit Authenticator-app gebruiken" : "Herstelcode gebruiken"}
          </button>
        </div>
      </form>
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
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="password">Wachtwoord</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={loading} className="mt-2">
        {loading ? "Bezig met inloggen..." : "Inloggen"}
      </Button>
    </form>
  );
}
