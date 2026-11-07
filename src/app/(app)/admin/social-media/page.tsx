"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { SocialIcon } from "@/components/social-icons";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORM_PLACEHOLDERS,
  type SocialChannel,
  type SocialPlatform,
} from "@/lib/social-channels";

type Urls = Record<SocialPlatform, string>;

const emptyUrls = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, ""])) as Urls;

function toUrls(channels: SocialChannel[]): Urls {
  const urls = { ...emptyUrls };
  for (const c of channels) urls[c.platform] = c.url;
  return urls;
}

export default function AdminSocialMediaPage() {
  const toast = useToast();
  const [urls, setUrls] = useState<Urls>(emptyUrls);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/social-channels")
      .then((res) => res.json())
      .then((data) => setUrls(toUrls(data.channels ?? [])))
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/social-channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Opslaan is niet gelukt.");
      return;
    }
    setUrls(toUrls(data.channels ?? []));
    toast.success("Social media-links opgeslagen.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Social media</h1>
        <p className="mt-1 text-muted-foreground">
          Links naar de kanalen van HHC Hardenberg. Ze staan als knoppen op de Communicatie-startpagina. Laat een veld
          leeg om dat kanaal niet te tonen.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          {!loaded ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-4">
              {SOCIAL_PLATFORMS.map((platform) => (
                <div key={platform} className="flex flex-col gap-1.5">
                  <Label htmlFor={`social-${platform}`} className="flex items-center gap-2">
                    <SocialIcon platform={platform} className="h-4 w-4" />
                    {SOCIAL_PLATFORM_LABELS[platform]}
                  </Label>
                  <Input
                    id={`social-${platform}`}
                    type="url"
                    inputMode="url"
                    placeholder={SOCIAL_PLATFORM_PLACEHOLDERS[platform]}
                    value={urls[platform]}
                    onChange={(e) => setUrls((u) => ({ ...u, [platform]: e.target.value }))}
                  />
                </div>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Opslaan..." : "Opslaan"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
