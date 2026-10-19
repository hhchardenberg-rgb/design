"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { api } from "@/lib/commercial/client";
import { DIGEST_FREQUENCIES, DIGEST_FREQUENCY_LABELS, type DigestFrequency } from "@/lib/commercial/digest-frequency";
import { formatDay } from "@/lib/date-format";

interface Profile {
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  notifyCommercialDigest: boolean;
  commercialDigestFrequency: DigestFrequency | null;
  commercialDigestDefault: DigestFrequency;
  memberSince: string;
  roles: string[];
  commercial: { member: boolean; roleName: string | null };
  security: { totp: boolean; passkeys: number };
}

export function ProfileForm() {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  // "" = de standaard van Commerciële Zaken volgen.
  const [digest, setDigest] = useState<DigestFrequency | "">("");
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    void api<Profile>("/api/account/profile").then((r) => {
      if (!r.ok) { setError(r.error); return; }
      setProfile(r.data);
      setName(r.data.name);
      setPhone(r.data.phone ?? "");
      setJobTitle(r.data.jobTitle ?? "");
      setDigest(r.data.commercialDigestFrequency ?? "");
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await api("/api/account/profile", "PATCH", { name, phone: phone || null, jobTitle: jobTitle || null, commercialDigestFrequency: digest || null });
    setSaving(false);
    if (r.ok) toast.success("Profiel opgeslagen. Een gewijzigde naam zie je in de balk bovenin na opnieuw inloggen.");
    else toast.error(r.error);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== again) { toast.error("De twee nieuwe wachtwoorden zijn niet gelijk."); return; }
    setPwBusy(true);
    const r = await api("/api/account/password", "POST", { current, next });
    setPwBusy(false);
    if (r.ok) {
      toast.success("Wachtwoord gewijzigd.");
      setCurrent(""); setNext(""); setAgain("");
    } else toast.error(r.error);
  }

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!profile) return <p className="text-sm text-muted-foreground">Laden…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profiel</h1>
        <p className="mt-1 text-muted-foreground">Je gegevens, voorkeuren en wachtwoord.</p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Gegevens</CardTitle>
            <CardDescription>Je naam en functie zijn zichtbaar voor collega&apos;s, bijvoorbeeld bij taken en in het logboek.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label htmlFor="pf-name">Naam</Label><Input id="pf-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label htmlFor="pf-email">E-mailadres</Label>
              <Input id="pf-email" value={profile.email} readOnly disabled />
              <p className="mt-1 text-xs text-muted-foreground">Je e-mailadres is je inlognaam. Vraag een beheerder om het te wijzigen.</p>
            </div>
            <div><Label htmlFor="pf-job">Functie</Label><Input id="pf-job" maxLength={80} placeholder="Bijvoorbeeld: relatiebeheerder" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
            <div><Label htmlFor="pf-phone">Telefoonnummer</Label><Input id="pf-phone" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Voorkeuren</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <Label htmlFor="pf-digest">Herinneringsmail van Commerciële Zaken</Label>
              <select id="pf-digest" className="block h-10 w-full max-w-sm rounded-md border border-border bg-surface px-2 text-sm" value={digest} onChange={(e) => setDigest(e.target.value as DigestFrequency | "")}>
                <option value="">Standaard ({DIGEST_FREQUENCY_LABELS[profile.commercialDigestDefault].label.toLowerCase()})</option>
                {DIGEST_FREQUENCIES.map((f) => <option key={f} value={f}>{DIGEST_FREQUENCY_LABELS[f].label}</option>)}
              </select>
              <p className="text-muted-foreground">
                {DIGEST_FREQUENCY_LABELS[digest || profile.commercialDigestDefault].hint}
                {(digest || profile.commercialDigestDefault) !== "OFF" && " Met taken van jou die verlopen zijn of eraan komen, naderende opzegdata en sponsoren die te lang niet gesproken zijn. Alleen als er iets is, en zonder bedragen."}
              </p>
            </div>
          </CardContent>
        </Card>

        <div><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Opslaan…" : "Opslaan"}</Button></div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Mijn toegang</CardTitle>
          <CardDescription>Waar je bij aangesloten bent. Wijzigen kan alleen een beheerder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {profile.roles.length === 0 ? <span className="text-muted-foreground">Nog geen onderdelen.</span> : profile.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
            {profile.commercial.member && <Badge variant="outline">Commerciële Zaken{profile.commercial.roleName ? `: ${profile.commercial.roleName}` : ""}</Badge>}
          </div>
          <p className="text-muted-foreground">Account sinds {formatDay(profile.memberSince)}.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Beveiliging</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Tweestapsverificatie: <strong>{profile.security.totp ? "aan" : "uit"}</strong> · Passkeys: <strong>{profile.security.passkeys}</strong></p>
          <Link className="text-hhc-orange-dark underline" href="/account/security">Tweestapsverificatie en passkeys beheren</Link>
        </CardContent>
      </Card>

      <form onSubmit={changePassword}>
        <Card>
          <CardHeader>
            <CardTitle>Wachtwoord wijzigen</CardTitle>
            <CardDescription>Minimaal 8 tekens. Je blijft ingelogd.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label htmlFor="pw-cur">Huidig wachtwoord</Label><Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div><Label htmlFor="pw-new">Nieuw wachtwoord</Label><Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></div>
            <div><Label htmlFor="pw-again">Nieuw wachtwoord nogmaals</Label><Input id="pw-again" type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} /></div>
            <Button type="submit" variant="outline" disabled={pwBusy || !current || !next || !again}>{pwBusy ? "Bezig…" : "Wachtwoord wijzigen"}</Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
