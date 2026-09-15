"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function TemplateRowActions({ templateId, archived }: { templateId: string; archived: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/duplicate`, { method: "POST" });
      if (res.ok) startTransition(() => router.refresh());
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
        body: JSON.stringify({ id: templateId, status: archived ? "DRAFT" : "ARCHIVED" }),
      });
      if (res.ok) startTransition(() => router.refresh());
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        startTransition(() => router.refresh());
      } else {
        alert(data.error ?? "Verwijderen mislukt.");
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
