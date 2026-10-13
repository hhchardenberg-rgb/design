"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { ShieldCheck, ShieldAlert, Copy, Download, KeyRound, Trash2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";

interface MfaStatus {
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
}

interface Passkey {
  id: string;
  name: string;
  deviceType: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type EnrollStep = "idle" | "scanning" | "recovery-codes";

async function parseJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Er is iets misgegaan.");
  return body;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

export default function AccountSecurityPage() {
  const toast = useToast();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [step, setStep] = useState<EnrollStep>("idle");

  // TOTP-setup-state
  const [secret, setSecret] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Her-authenticatie (TOTP uitschakelen / nieuwe herstelcodes)
  const [confirmAction, setConfirmAction] = useState<"disable" | "regenerate" | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");

  // Passkeys
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Passkey | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/account/mfa/status");
    if (res.ok) setStatus(await res.json());
  }

  async function loadPasskeys() {
    const res = await fetch("/api/account/passkeys");
    if (res.ok) setPasskeys((await res.json()).passkeys);
  }

  useEffect(() => {
    loadStatus();
    loadPasskeys();
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const data = await parseJsonOrThrow(await fetch("/api/account/mfa/totp/enroll", { method: "POST" }));
      setSecret(data.secret);
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setStep("scanning");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Instellen is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await parseJsonOrThrow(
        await fetch("/api/account/mfa/totp/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })
      );
      setRecoveryCodes(data.recoveryCodes);
      setStep("recovery-codes");
      setCode("");
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bevestigen is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  function finishSetup() {
    setStep("idle");
    setRecoveryCodes([]);
    setSecret("");
    setQrCodeDataUrl("");
  }

  async function submitConfirmAction(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmAction) return;
    setBusy(true);
    setError(null);
    try {
      if (confirmAction === "disable") {
        await parseJsonOrThrow(
          await fetch("/api/account/mfa/totp/disable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: confirmPassword }),
          })
        );
        toast.success("Tweestapsverificatie is uitgeschakeld.");
        await loadStatus();
        setConfirmAction(null);
      } else {
        const data = await parseJsonOrThrow(
          await fetch("/api/account/mfa/recovery-codes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: confirmPassword }),
          })
        );
        setRecoveryCodes(data.recoveryCodes);
        setStep("recovery-codes");
        setConfirmAction(null);
        await loadStatus();
      }
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Actie is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Herstelcodes gekopieerd.");
    } catch {
      toast.error("Kopiëren is niet gelukt.");
    }
  }

  function downloadRecoveryCodes() {
    const blob = new Blob([recoveryCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hhc-hub-herstelcodes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addPasskey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const options = await parseJsonOrThrow(
        await fetch("/api/account/passkeys/register-options", { method: "POST" })
      );
      const response = await startRegistration({ optionsJSON: options });
      await parseJsonOrThrow(
        await fetch("/api/account/passkeys/register-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newPasskeyName, response }),
        })
      );
      toast.success("Passkey toegevoegd.");
      setAddingPasskey(false);
      setNewPasskeyName("");
      await loadPasskeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toevoegen is mislukt of geannuleerd.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRename(id: string) {
    setBusy(true);
    try {
      await parseJsonOrThrow(
        await fetch(`/api/account/passkeys/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: renameValue }),
        })
      );
      setRenamingId(null);
      await loadPasskeys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hernoemen is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDeletePasskey(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteTarget) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await parseJsonOrThrow(
        await fetch(`/api/account/passkeys/${deleteTarget.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: deletePassword }),
        })
      );
      toast.success("Passkey verwijderd.");
      setDeleteTarget(null);
      setDeletePassword("");
      await loadPasskeys();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Verwijderen is mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Beveiliging</h1>
        <p className="mt-1 text-muted-foreground">Beheer tweestapsverificatie en passkeys voor je account.</p>
      </div>

      {step === "recovery-codes" && (
        <Card>
          <CardHeader>
            <CardTitle>Herstelcodes</CardTitle>
            <CardDescription>
              Bewaar deze codes op een veilige plek. Elke code werkt één keer en geeft toegang als je je
              Authenticator-app kwijtraakt. Ze worden maar één keer getoond.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-muted p-4 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={copyRecoveryCodes}>
                <Copy className="h-4 w-4" />
                Kopiëren
              </Button>
              <Button type="button" variant="outline" onClick={downloadRecoveryCodes}>
                <Download className="h-4 w-4" />
                Downloaden
              </Button>
            </div>
            <Button type="button" onClick={finishSetup}>
              Ik heb ze bewaard
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "idle" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {status?.totpEnabled ? (
                <ShieldCheck className="h-5 w-5 text-green-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              )}
              <CardTitle>Tweestapsverificatie (Authenticator-app)</CardTitle>
            </div>
            <CardDescription>
              {status?.totpEnabled
                ? `Actief. Je hebt nog ${status.recoveryCodesRemaining} ongebruikte herstelcode(s).`
                : "Nog niet ingeschakeld. Voeg een extra beveiligingslaag toe met een Authenticator-app zoals Google Authenticator, Microsoft Authenticator of 1Password."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!status?.totpEnabled ? (
              <Button type="button" onClick={startEnrollment} disabled={busy}>
                Authenticator-app toevoegen
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmAction("regenerate");
                    setError(null);
                  }}
                >
                  Nieuwe herstelcodes genereren
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmAction("disable");
                    setError(null);
                  }}
                >
                  Uitschakelen
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === "scanning" && (
        <Card>
          <CardHeader>
            <CardTitle>Authenticator-app instellen</CardTitle>
            <CardDescription>
              Scan de QR-code met je Authenticator-app en vul de zescijferige code in om te bevestigen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {qrCodeDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image ondersteunt dat niet
              <img src={qrCodeDataUrl} alt="QR-code voor tweestapsverificatie" className="mx-auto h-48 w-48" />
            )}
            <p className="text-center text-xs text-muted-foreground">
              Kan je niet scannen? Voer dit handmatig in: <span className="font-mono">{secret}</span>
            </p>
            <form onSubmit={confirmEnrollment} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="setup-code">Verificatiecode</Label>
                <Input
                  id="setup-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Bevestigen
                </Button>
                <Button type="button" variant="outline" onClick={() => setStep("idle")}>
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {confirmAction && (
        <Card>
          <CardHeader>
            <CardTitle>
              {confirmAction === "disable" ? "Tweestapsverificatie uitschakelen" : "Nieuwe herstelcodes genereren"}
            </CardTitle>
            <CardDescription>
              {confirmAction === "disable"
                ? "Dit verwijdert ook je bestaande herstelcodes. Bevestig met je wachtwoord."
                : "Je bestaande herstelcodes worden ongeldig. Bevestig met je wachtwoord."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitConfirmAction} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="confirm-password">Wachtwoord</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="current-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} variant={confirmAction === "disable" ? "destructive" : "primary"}>
                  Bevestigen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmAction(null);
                    setConfirmPassword("");
                    setError(null);
                  }}
                >
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-foreground" />
            <CardTitle>Passkeys</CardTitle>
          </div>
          <CardDescription>
            Log in met Face ID, Touch ID, Windows Hello of een fysieke beveiligingssleutel — als tweede factor
            of, als je dat liever hebt, volledig zonder wachtwoord.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {passkeys.length > 0 && (
            <ul className="flex flex-col gap-2">
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  {renamingId === pk.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="h-8"
                      />
                      <Button type="button" size="sm" disabled={busy} onClick={() => submitRename(pk.id)}>
                        Opslaan
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRenamingId(null)}>
                        Annuleren
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{pk.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Toegevoegd op {formatDate(pk.createdAt)}
                          {pk.lastUsedAt && ` · laatst gebruikt op ${formatDate(pk.lastUsedAt)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Hernoemen"
                          onClick={() => {
                            setRenamingId(pk.id);
                            setRenameValue(pk.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Verwijderen"
                          onClick={() => {
                            setDeleteTarget(pk);
                            setDeletePassword("");
                            setDeleteError(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {addingPasskey ? (
            <form onSubmit={addPasskey} className="flex flex-col gap-3 border-t border-border pt-3">
              <div>
                <Label htmlFor="passkey-name">Naam voor deze passkey</Label>
                <Input
                  id="passkey-name"
                  placeholder="Bijv. iPhone, MacBook, Beveiligingssleutel"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Doorgaan
                </Button>
                <Button type="button" variant="outline" onClick={() => setAddingPasskey(false)}>
                  Annuleren
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" className="self-start" onClick={() => setAddingPasskey(true)}>
              Passkey toevoegen
            </Button>
          )}
        </CardContent>
      </Card>

      {deleteTarget && (
        <Card>
          <CardHeader>
            <CardTitle>Passkey &ldquo;{deleteTarget.name}&rdquo; verwijderen</CardTitle>
            <CardDescription>Bevestig met je wachtwoord.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitDeletePasskey} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="delete-passkey-password">Wachtwoord</Label>
                <Input
                  id="delete-passkey-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </div>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} variant="destructive">
                  Verwijderen
                </Button>
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
                  Annuleren
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
