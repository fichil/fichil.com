import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_ADVISORY = Object.freeze({
  source: 1124334,
  name: "brace-expansion",
  dependency: "brace-expansion",
  severity: "high",
  range: "<=5.0.7",
  url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
});

const ALLOWED_VULNERABILITY_NAMES = new Set([
  "@eslint/config-array",
  "@eslint/eslintrc",
  "brace-expansion",
  "eslint",
  "eslint-config-next",
  "eslint-plugin-import",
  "eslint-plugin-jsx-a11y",
  "eslint-plugin-react",
  "minimatch",
]);

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

function isExactAllowedAdvisory(via) {
  return (
    via &&
    typeof via === "object" &&
    via.source === ALLOWED_ADVISORY.source &&
    via.name === ALLOWED_ADVISORY.name &&
    via.dependency === ALLOWED_ADVISORY.dependency &&
    via.severity === ALLOWED_ADVISORY.severity &&
    via.range === ALLOWED_ADVISORY.range &&
    via.url === ALLOWED_ADVISORY.url
  );
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
}

export function validateProductionAudit(audit) {
  const vulnerabilities = getVulnerabilities(audit);
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

  if (names.length === 0) {
    return { allowedExceptionCount: 0 };
  }

  const counts = audit.metadata.vulnerabilities;
  if (
    counts.high !== names.length ||
    counts.info !== 0 ||
    counts.low !== 0 ||
    counts.moderate !== 0 ||
    counts.critical !== 0
  ) {
    throw new Error("the temporary exception only permits high-severity records from one advisory");
  }

  for (const name of names) {
    const vulnerability = vulnerabilities[name];
    if (!ALLOWED_VULNERABILITY_NAMES.has(name)) {
      throw new Error(`unexpected vulnerable dependency: ${name}`);
    }
    if (vulnerability.severity !== "high") {
      throw new Error(`unexpected severity for ${name}: ${vulnerability.severity}`);
    }
    if (!Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
      throw new Error(`npm audit returned no vulnerability path for ${name}`);
    }
  }

  if (!vulnerabilities[ALLOWED_ADVISORY.name]) {
    throw new Error("the allowed advisory root is missing from npm audit output");
  }

  function reachesAllowedAdvisory(name, stack = new Set()) {
    if (stack.has(name)) {
      throw new Error(`cyclic npm audit dependency path at ${name}`);
    }

    const nextStack = new Set(stack).add(name);
    return vulnerabilities[name].via.every((via) => {
      if (typeof via === "string") {
        if (!ALLOWED_VULNERABILITY_NAMES.has(via) || !vulnerabilities[via]) {
          throw new Error(`unexpected vulnerability path from ${name} to ${via}`);
        }
        return reachesAllowedAdvisory(via, nextStack);
      }

      if (name !== ALLOWED_ADVISORY.name || !isExactAllowedAdvisory(via)) {
        throw new Error(`unexpected advisory in vulnerability path for ${name}`);
      }
      return true;
    });
  }

  for (const name of names) {
    if (!reachesAllowedAdvisory(name)) {
      throw new Error(`vulnerability path for ${name} does not reach the allowed advisory`);
    }
  }

  return { allowedExceptionCount: names.length };
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
  const { allowedExceptionCount } = validateFullAudit(fullAudit);

  console.log("Production dependency audit passed with no moderate-or-higher findings.");
  if (allowedExceptionCount > 0) {
    console.warn(
      `Allowed ${allowedExceptionCount} development-only records rooted exclusively in ${ALLOWED_ADVISORY.url}. ` +
        "Tracked for removal in https://github.com/fichil/fichil.com/issues/57 by 2026-08-10.",
    );
  } else {
    console.log("Full dependency audit passed with no high-severity findings.");
  }
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
