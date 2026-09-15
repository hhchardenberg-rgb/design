import { HhcStopwatchTool } from "@/components/hhc-stopwatch-tool";

export default function StopwatchPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Stopwatch</h1>
        <p className="mt-1 text-muted-foreground">
          Wedstrijdklok met helften, verlengingen en automatische blessuretijd — handig tijdens een wedstrijddag of
          livestream.
        </p>
      </div>
      <HhcStopwatchTool />
    </div>
  );
}
