import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
});

function getVulnerabilities(audit) {
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    throw new Error("npm audit did not return an object");
  }

  if (!audit.vulnerabilities || typeof audit.vulnerabilities !== "object") {
    throw new Error("npm audit output is missing vulnerabilities");
  }

  if (!audit.metadata?.vulnerabilities) {
    throw new Error("npm audit output is missing vulnerability metadata");
  }

  return audit.vulnerabilities;
}

function validateMetadata(audit, expectedCount) {
  const counts = audit.metadata.vulnerabilities;
  const numericKeys = ["info", "low", "moderate", "high", "critical", "total"];

  for (const key of numericKeys) {
    if (!Number.isInteger(counts[key]) || counts[key] < 0) {
      throw new Error(`npm audit metadata has an invalid ${key} count`);
    }
  }

  if (counts.total !== expectedCount) {
    throw new Error(
      `npm audit metadata reports ${counts.total} vulnerabilities, but ${expectedCount} records were returned`,
    );
  }

  const severityTotal = counts.info + counts.low + counts.moderate + counts.high + counts.critical;
  if (severityTotal !== counts.total) {
    throw new Error(
      `npm audit metadata severity counts total ${severityTotal}, but total is ${counts.total}`,
    );
  }
}

export function validateProductionAudit(audit) {
  const vulnerabilities = getVulnerabilities(audit);
  const names = Object.keys(vulnerabilities).sort();
  validateMetadata(audit, names.length);
  const blocking = Object.entries(vulnerabilities)
    .filter(([, vulnerability]) => SEVERITY_RANK[vulnerability.severity] >= SEVERITY_RANK.moderate)
    .map(([name]) => name)
    .sort();

  if (blocking.length > 0) {
    throw new Error(
      `production dependencies contain moderate-or-higher vulnerabilities: ${blocking.join(", ")}`,
    );
  }

  return { blockingCount: 0 };
}

export function validateFullAudit(audit) {
  const vulnerabilities = getVulnerabilities(audit);
  const names = Object.keys(vulnerabilities).sort();
  validateMetadata(audit, names.length);

  if (names.length > 0) {
    const details = names.map((name) => `${name} (${vulnerabilities[name].severity ?? "unknown"})`);
    throw new Error(`full dependency audit contains vulnerabilities: ${details.join(", ")}`);
  }

  return { vulnerabilityCount: 0 };
}

function runNpmAudit(args) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error("npm_execpath is unavailable; run this audit through npm scripts");
  }

  const result = spawnSync(process.execPath, [npmExecPath, "audit", ...args, "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`failed to execute npm audit: ${result.error.message}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`npm audit exited unexpectedly with status ${result.status}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`failed to parse npm audit JSON: ${error.message}`);
  }
}

export function runDependencyAudit() {
  const productionAudit = runNpmAudit(["--omit=dev", "--audit-level=moderate"]);
  validateProductionAudit(productionAudit);

  const fullAudit = runNpmAudit(["--audit-level=high"]);
  validateFullAudit(fullAudit);

  console.log("Production dependency audit passed with no moderate-or-higher findings.");
  console.log("Full dependency audit passed with no findings.");
}

const isEntrypoint =
  process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  try {
    runDependencyAudit();
  } catch (error) {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
