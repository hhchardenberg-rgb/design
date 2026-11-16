#!/usr/bin/env node
/**
 * Ruimt oude Neon-databasekopieën van previews op.
 *
 * Elke Vercel-preview krijgt een eigen Neon-branch "preview/<git-branch>" (een kopie van de
 * productiedatabase). Het gratis Neon-plan staat er maar ongeveer 10 tegelijk toe; zit dat vol, dan
 * faalt elke nieuwe preview met "Resource provisioning failed". Dit script verwijdert de kopieën
 * die niet meer nodig zijn.
 *
 * Wordt NOOIT verwijderd:
 *  - de hoofdbranch (main / default / primary) en beschermde branches;
 *  - branches die niet met "preview/" beginnen (bv. een proefherstel of een handmatige kopie);
 *  - de preview van een pull request dat nog open staat;
 *  - een preview jonger dan 24 uur zonder open pull request (net gepusht, PR volgt misschien nog),
 *    behalve als het de branch is van het pull request dat zojuist gesloten is.
 *
 * Omgeving:
 *  NEON_API_KEY        (verplicht) Neon API-sleutel
 *  NEON_PROJECT_ID     Neon-project, standaard fancy-frog-00433813 (neon-cerise-jacket)
 *  GITHUB_TOKEN        om open pull requests op te vragen
 *  GITHUB_REPOSITORY   eigenaar/repo, standaard hhchardenberg-rgb/design
 *  CLOSED_BRANCH       git-branch van het zojuist gesloten pull request (optioneel)
 *  DRY_RUN=1           alleen tonen wat er zou gebeuren
 *  GITHUB_STEP_SUMMARY (door GitHub Actions gezet) samenvatting van de run
 */
import { appendFileSync } from "node:fs";

const NEON = "https://console.neon.tech/api/v2";
const PROJECT = process.env.NEON_PROJECT_ID || "fancy-frog-00433813";
const REPO = process.env.GITHUB_REPOSITORY || "hhchardenberg-rgb/design";
const DRY_RUN = ["1", "true", "ja"].includes(String(process.env.DRY_RUN ?? "").toLowerCase());
const CLOSED_BRANCH = process.env.CLOSED_BRANCH || "";
const GRACE_MS = 24 * 3600 * 1000;
const PREFIX = "preview/";

function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
}

function dayTime(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

async function neon(path, init = {}) {
  const res = await fetch(NEON + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}`, Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Neon ${init.method ?? "GET"} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function openPrBranches() {
  const branches = new Set();
  for (let page = 1; page < 20; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "hhc-hub-neon-opruiming",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub pull requests: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const pulls = await res.json();
    for (const p of pulls) branches.add(p.head.ref);
    if (pulls.length < 100) break;
  }
  return branches;
}

/** Bepaalt per Neon-branch of hij weg mag. Los van de API, zodat het te testen is. */
export function plan(branches, openBranches, { now = Date.now(), closedBranch = "" } = {}) {
  const parents = new Set(branches.map((b) => b.parent_id).filter(Boolean));
  return branches.map((b) => {
    const keep = (reason) => ({ branch: b, remove: false, reason });
    if (b.default || b.primary || b.protected || b.name === "main") return keep("hoofdbranch");
    if (!b.name.startsWith(PREFIX)) return keep("geen preview, blijft altijd staan");
    const git = b.name.slice(PREFIX.length);
    if (openBranches.has(git)) return keep("pull request staat nog open");
    if (parents.has(b.id)) return keep("er hangt een andere kopie aan deze branch");
    const age = now - new Date(b.created_at).getTime();
    if (git !== closedBranch && age < GRACE_MS) return keep("jonger dan 24 uur, nog geen pull request");
    return { branch: b, remove: true, reason: git === closedBranch ? "pull request zojuist gesloten" : "geen open pull request" };
  });
}

async function main() {
  if (!process.env.NEON_API_KEY) {
    summary("⚠️ NEON_API_KEY ontbreekt: opruimen overgeslagen. Zet het geheim in GitHub (Settings > Secrets and variables > Actions).");
    // Bij een pull request van Dependabot of een fork geeft GitHub geen geheimen mee; de dagelijkse run pakt het dan op.
    return;
  }
  const [{ branches }, open] = await Promise.all([neon(`/projects/${PROJECT}/branches`), openPrBranches()]);
  const decisions = plan(branches, open, { closedBranch: CLOSED_BRANCH });
  const remove = decisions.filter((d) => d.remove);

  summary(`### Neon-opruiming${DRY_RUN ? " (proefrun, er wordt niets verwijderd)" : ""}`);
  summary(`${branches.length} databasekopieën gevonden, ${remove.length} ${remove.length === 1 ? "kan" : "kunnen"} weg.`);
  summary("");
  summary("| Branch | Gemaakt | Besluit |");
  summary("|---|---|---|");
  for (const d of decisions) summary(`| \`${d.branch.name}\` | ${dayTime(d.branch.created_at)} | ${d.remove ? "verwijderen" : "blijft"}: ${d.reason} |`);
  summary("");

  let failed = 0;
  for (const d of remove) {
    if (DRY_RUN) continue;
    try {
      await neon(`/projects/${PROJECT}/branches/${d.branch.id}`, { method: "DELETE" });
      summary(`✅ Verwijderd: \`${d.branch.name}\``);
    } catch (error) {
      failed++;
      summary(`❌ Niet verwijderd: \`${d.branch.name}\` (${error.message})`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    summary(`❌ Opruimen mislukt: ${error.message}`);
    process.exitCode = 1;
  });
}
