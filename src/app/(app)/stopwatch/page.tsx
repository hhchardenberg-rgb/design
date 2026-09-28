import type { Metadata } from "next";
import { HhcStopwatchTool } from "@/components/hhc-stopwatch-tool";

export const metadata: Metadata = { title: "Stopwatch" };

export default function StopwatchPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Stopwatch</h1>
      </div>
      <HhcStopwatchTool />
    </div>
  );
}
