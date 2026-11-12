"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, PageTitle } from "@/components/tickets/parts";

interface Settings {
  bulkApprovalThreshold: number;
  retentionPersonalMonths: number;
  retentionScanMonths: number;
  retentionTechnicalDays: number;
}
interface Config {
  signing: boolean;
  fullhouse: { mode: string; apiKey: boolean; accessToken: boolean; webhookSecret: boolean; baseUrl: string };
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </li>
  );
}

const FIELDS: { key: keyof Settings; label: string; hint: string; unit: string }[] = [
  { key: "bulkApprovalThreshold", label: "Drempel voor goedkeuring", hint: "Meer tickets in één keer dan dit aantal: eerst goedkeuring door een tweede persoon.", unit: "tickets" },
  { key: "retentionPersonalMonths", label: "Persoonsgegevens bewaren", hint: "Na de vervaldatum van een ticket; daarna anonimiseren (totalen blijven).", unit: "maanden" },
  { key: "retentionScanMonths", label: "Scanlogs bewaren", hint: "Gebruikt vanaf de scanner (fase 3).", unit: "maanden" },
  { key: "retentionTechnicalDays", label: "Technische logs bewaren", hint: "Synchronisaties en foutmeldingen (fase 4).", unit: "dagen" },
];

export function SettingsForm() {
  const toast = useStableToast();
  const [s, setS] = useState<Settings | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: Settings; config: Config }>("/api/tickets/settings").then(
      (r) => (setS(r.settings), setConfig(r.config)),
      (e) => toast.error(errorText(e)),
    );
  }, [toast]);

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      await api("/api/tickets/settings", { method: "PUT", body: { bulkApprovalThreshold: s.bulkApprovalThreshold, retentionPersonalMonths: s.retentionPersonalMonths, retentionScanMonths: s.retentionScanMonths, retentionTechnicalDays: s.retentionTechnicalDays } });
      toast.success("Instellingen opgeslagen.");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="text-sm text-muted-foreground">Laden…</p>;
  return (
    <div className="space-y-6">
      <PageTitle title="Instellingen" description="Goedkeuring en bewaartermijnen van HHC Tickets." />
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`st-${f.key}`}>
                {f.label} ({f.unit})
              </Label>
              <Input id={`st-${f.key}`} type="number" min={1} value={s[f.key]} onChange={(e) => setS({ ...s, [f.key]: Number(e.target.value) })} />
              <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={busy}>
              Opslaan
            </Button>
          </div>
        </CardContent>
      </Card>

      {config && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Koppelingen en sleutels</CardTitle>
            <CardDescription>Alleen of iets is ingesteld; de waarden zelf staan veilig in Vercel en zijn hier nooit zichtbaar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <Check ok={config.signing} label="Sleutel voor QR-codes en ticketlinks (TICKETS_SIGNING_KEY)" />
              <Check ok={config.fullhouse.mode !== "mock"} label={`Fullhouse-modus: ${config.fullhouse.mode === "mock" ? "testdata (geen echte koppeling)" : config.fullhouse.mode}`} hint={config.fullhouse.baseUrl} />
              <Check ok={config.fullhouse.apiKey} label="Fullhouse API-sleutel (FULLHOUSE_API_KEY)" />
              <Check ok={config.fullhouse.apiKey || config.fullhouse.accessToken} label="Fullhouse API-sleutel (FULLHOUSE_API_KEY) of scanapparaat-token" hint="De API-sleutel (alleen lezen) heeft voorrang; een access-user-token is een alternatief." />
              <Check ok={config.fullhouse.webhookSecret} label="Fullhouse webhooksleutel (FULLHOUSE_WEBHOOK_SECRET)" />
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
