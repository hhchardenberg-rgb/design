"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export function TemplateRowActions({ templateId, archived }: { templateId: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/duplicate`, { method: "POST" });
      if (res.ok) {
        toast.success("Template gedupliceerd.");
        startTransition(() => router.refresh());
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Dupliceren mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: templateId,
          status: archived ? "DRAFT" : "ARCHIVED",
          restoreFromArchive: archived,
        }),
      });
      if (res.ok) {
        toast.success(archived ? "Template hersteld." : "Template gearchiveerd.");
        startTransition(() => router.refresh());
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Actie mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        "Deze template en al zijn versies definitief verwijderen? Dit kan niet ongedaan worden gemaakt."
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Template verwijderd.");
        startTransition(() => router.refresh());
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Verwijderen mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={duplicate} disabled={busy || isPending}>
        Dupliceren
      </Button>
      <Button size="sm" variant="ghost" onClick={toggleArchive} disabled={busy || isPending}>
        {archived ? "Herstellen" : "Archiveren"}
      </Button>
      <Button size="sm" variant="ghost" onClick={remove} disabled={busy || isPending} className="text-destructive">
        Verwijderen
      </Button>
    </>
  );
}
