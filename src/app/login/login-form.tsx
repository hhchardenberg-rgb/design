"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

// Hetzelfde formulier (e-mail + wachtwoord) wordt in stap 2 gewoon opnieuw
// verzonden, nu met de code/passkey erbij — zie auth.ts: er bestaat op geen
// enkel moment een deels-ingelogde sessie, dus de client moet het
// wachtwoord hoe dan ook een tweede keer meesturen (niet opnieuw laten
// intypen: dat zou een onnodige stap voor de gebruiker zijn).
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

  function goToHub() {
    router.push(callbackUrl);
    router.refresh();
  }

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
    goToHub();
  }

  /** Tweede factor: een geregistreerde passkey i.p.v. een TOTP-/herstelcode. */
  async function useMfaPasskey() {
    setLoading(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!optionsRes.ok) {
        setError("Geen passkey beschikbaar voor dit account.");
        return;
      }
      const options = await optionsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });

      const res = await signIn("credentials", {
        email,
        password,
        webauthnAssertion: JSON.stringify(assertion),
        redirect: false,
      });
      if (res?.error) {
        setError("Passkey-verificatie is mislukt.");
        return;
      }
      goToHub();
    } catch {
      setError("Passkey-verificatie is geannuleerd of mislukt.");
    } finally {
      setLoading(false);
    }
  }

  /** Volledig wachtwoordloos: geen e-mail/wachtwoord nodig, de browser laat de gebruiker een passkey kiezen. */
  async function loginWithPasskey() {
    setLoading(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/discoverable-options", { method: "POST" });
      const options = await optionsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });

      const res = await signIn("passkey", {
        webauthnAssertion: JSON.stringify(assertion),
        redirect: false,
      });
      if (res?.error) {
        setError("Inloggen met passkey is mislukt.");
        return;
      }
      goToHub();
    } catch {
      setError("Inloggen met passkey is geannuleerd of mislukt.");
    } finally {
      setLoading(false);
    }
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
        <Button type="button" variant="outline" disabled={loading} onClick={useMfaPasskey}>
          <KeyRound className="h-4 w-4" />
          Gebruik een passkey
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
    <div className="flex flex-col gap-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Wachtwoord</Label>
            <Link href="/wachtwoord-vergeten" className="text-xs text-muted-foreground hover:underline">
              Wachtwoord vergeten?
            </Link>
          </div>
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
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        of
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" size="lg" disabled={loading} onClick={loginWithPasskey}>
        <KeyRound className="h-4 w-4" />
        Inloggen met passkey
      </Button>
    </div>
  );
}
