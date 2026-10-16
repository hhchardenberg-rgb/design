/**
 * Opslaan van een ontwerp vanuit de editor, op basis van de echte
 * serverstatus. Bewust los van React zodat het gedrag (volgorde, conflicten,
 * herhaalpogingen) in Node getest kan worden.
 *
 *  - Een concept ontstaat pas bij de eerste wijziging (`change`).
 *  - Er loopt hooguit één opslagverzoek tegelijk, met steeds de nieuwste
 *    invoer; antwoorden kunnen dus niet in de verkeerde volgorde oudere
 *    invoer terugzetten.
 *  - Elke opslag noemt de revisie waar hij op voortbouwt. Bij een conflict
 *    (ander tabblad, andere gebruiker) kiest de gebruiker zelf.
 *  - Bij een tijdelijke fout blijft de invoer staan en volgt automatisch
 *    een nieuwe poging; bij ongeldige invoer pas na een nieuwe wijziging.
 */

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "invalid" | "conflict";

export interface SaverSnapshot {
  designId: string | null;
  revision: number;
  state: SaveState;
  error: string | null;
  conflict: { revision: number; formData: Record<string, unknown> } | null;
  /** Telt elke lokale wijziging; gebruikt om exportresultaten aan invoer te koppelen. */
  changeSeq: number;
}

export interface SaverOptions {
  templateVersionId: string;
  matchId: string | null;
  title: string;
  initialDesign: { id: string; revision: number } | null;
  debounceMs?: number;
  retryDelays?: number[];
  fetchFn?: typeof fetch;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
}

export class DesignSaver {
  private snap: SaverSnapshot;
  private listeners = new Set<() => void>();
  private latest: Record<string, unknown> = {};
  private savedSeq = 0;
  private inFlight: Promise<void> | null = null;
  private timer: unknown = null;
  private retryIndex = 0;
  private waiters: ((ok: boolean) => void)[] = [];
  private readonly debounceMs: number;
  private readonly retryDelays: number[];
  private readonly fetchFn: typeof fetch;
  private readonly timers: NonNullable<SaverOptions["timers"]>;

  constructor(private readonly opts: SaverOptions) {
    this.snap = {
      designId: opts.initialDesign?.id ?? null,
      revision: opts.initialDesign?.revision ?? 0,
      state: opts.initialDesign ? "saved" : "idle",
      error: null,
      conflict: null,
      changeSeq: 0,
    };
    this.debounceMs = opts.debounceMs ?? 800;
    this.retryDelays = opts.retryDelays ?? [2000, 5000, 10000, 30000];
    this.fetchFn = opts.fetchFn ?? ((...args) => fetch(...args));
    this.timers = opts.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private update(patch: Partial<SaverSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  get hasUnsaved() {
    return ["pending", "saving", "error", "invalid", "conflict"].includes(this.snap.state);
  }

  /** Na elke echte wijziging aanroepen, met de volledige actuele invoer. */
  change(formData: Record<string, unknown>) {
    this.latest = formData;
    const blockedByConflict = this.snap.state === "conflict";
    this.update({
      changeSeq: this.snap.changeSeq + 1,
      state: blockedByConflict ? "conflict" : this.inFlight ? "saving" : "pending",
      error: blockedByConflict ? this.snap.error : null,
    });
    if (blockedByConflict) return;
    this.schedule(this.debounceMs);
  }

  private schedule(ms: number) {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private settle(ok: boolean) {
    const list = this.waiters;
    this.waiters = [];
    list.forEach((w) => w(ok));
  }

  private async run(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.snap.changeSeq === this.savedSeq) {
      this.settle(true);
      return;
    }
    const seq = this.snap.changeSeq;
    const formData = this.latest;
    this.update({ state: "saving" });
    this.inFlight = this.send(seq, formData).finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
    // Wijzigingen die tijdens het verzoek binnenkwamen meteen nasturen.
    if (this.snap.state === "pending" || (this.snap.state === "saving" && this.snap.changeSeq !== this.savedSeq)) {
      this.schedule(this.waiters.length > 0 ? 0 : this.debounceMs);
    }
  }

  private async send(seq: number, formData: Record<string, unknown>) {
    try {
      const res = this.snap.designId
        ? await this.fetchFn(`/api/designs/${this.snap.designId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseRevision: this.snap.revision, formData }),
          })
        : await this.fetchFn("/api/designs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateVersionId: this.opts.templateVersionId,
              matchId: this.opts.matchId,
              title: this.opts.title,
              formData,
            }),
          });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.conflict) {
        this.update({
          state: "conflict",
          conflict: { revision: data.conflict.revision, formData: data.conflict.formData ?? {} },
          error: data.error ?? null,
        });
        this.settle(false);
        return;
      }
      if (res.status >= 400 && res.status < 500) {
        this.update({ state: "invalid", error: data.error ?? "De invoer kon niet worden opgeslagen." });
        this.settle(false);
        return;
      }
      if (!res.ok || !data.design) throw new Error(data.error ?? `Serverfout ${res.status}`);

      this.savedSeq = seq;
      this.retryIndex = 0;
      const current = this.snap.changeSeq === seq;
      this.update({
        designId: data.design.id,
        revision: data.design.revision,
        state: current ? "saved" : "pending",
        error: null,
      });
      if (current) this.settle(true);
    } catch (error) {
      const delay = this.retryDelays[Math.min(this.retryIndex, this.retryDelays.length - 1)];
      this.retryIndex++;
      this.update({ state: "error", error: error instanceof Error ? error.message : "Opslaan is niet gelukt." });
      this.settle(false);
      this.schedule(delay);
    }
  }

  /** Direct opslaan en wachten tot de actuele invoer bevestigd is. */
  flush(): Promise<boolean> {
    if (this.snap.state === "conflict" || this.snap.state === "invalid") return Promise.resolve(false);
    // De nieuwste wijziging is al bevestigd (een eventueel lopend verzoek kan
    // alleen nog om dezelfde invoer gaan).
    if (this.snap.changeSeq === this.savedSeq) return Promise.resolve(true);
    const done = new Promise<boolean>((resolve) => this.waiters.push(resolve));
    if (!this.inFlight) {
      if (this.timer !== null) this.timers.clear(this.timer);
      this.timer = null;
      void this.run();
    }
    return done;
  }

  retry() {
    this.retryIndex = 0;
    if (this.snap.state === "invalid" || this.snap.state === "error") this.update({ state: "pending" });
    this.schedule(0);
  }

  /** Conflict: eigen invoer bewaren; overschrijft de andere versie bewust. */
  keepMine() {
    const c = this.snap.conflict;
    if (!c) return;
    this.update({ revision: c.revision, conflict: null, state: "pending", error: null });
    this.schedule(0);
  }

  /** Conflict: de serverversie overnemen; geeft die invoer terug. */
  takeTheirs(): Record<string, unknown> | null {
    const c = this.snap.conflict;
    if (!c) return null;
    this.latest = c.formData;
    this.savedSeq = this.snap.changeSeq;
    this.update({ revision: c.revision, conflict: null, state: "saved", error: null });
    return c.formData;
  }

  dispose() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
}
