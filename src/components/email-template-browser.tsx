"use client";

import { Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export interface EmailTemplateData {
  id: string;
  title: string;
  subject: string | null;
  body: string;
  category: string | null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EmailTemplateBrowser({ templates }: { templates: EmailTemplateData[] }) {
  const toast = useToast();

  async function handleCopySubject(subject: string) {
    if (await copyText(subject)) {
      toast.success("Onderwerp gekopieerd.");
    } else {
      toast.error("Kopiëren is niet gelukt.");
    }
  }

  async function handleCopyBody(body: string) {
    if (await copyText(body)) {
      toast.success("E-mailtekst gekopieerd.");
    } else {
      toast.error("Kopiëren is niet gelukt.");
    }
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen standaard e-mails toegevoegd.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {templates.map((t) => (
        <Card key={t.id}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {t.category && <Badge variant="outline">{t.category}</Badge>}
                <p className="font-medium">{t.title}</p>
              </div>
            </div>

            {t.subject && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm">
                <p className="min-w-0 truncate">
                  <span className="text-muted-foreground">Onderwerp: </span>
                  {t.subject}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => handleCopySubject(t.subject!)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <p className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm text-muted-foreground">{t.body}</p>

            <Button type="button" size="sm" className="w-fit" onClick={() => handleCopyBody(t.body)}>
              <Copy className="h-4 w-4" />
              E-mail kopiëren
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
