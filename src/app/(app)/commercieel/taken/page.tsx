import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { TaskBoard } from "./task-board";

export const metadata: Metadata = { title: "Taken – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const a = await pageAccess("tasks:read");
  if (!a.allowed) return <NoAccess what="de taken" />;
  return <TaskBoard canCreate={a.permissions.includes("tasks:create")} canUpdate={a.permissions.includes("tasks:update")} />;
}
