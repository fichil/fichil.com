import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFullAudit,
  validateProductionAudit,
} from "../scripts/audit-dependencies.mjs";

const allowedAdvisory = {
  source: 1124334,
  name: "brace-expansion",
  dependency: "brace-expansion",
  title: "brace-expansion denial of service",
  url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
  severity: "high",
  range: "<=5.0.7",
};

function auditWith(vulnerabilities, counts = {}) {
  const names = Object.keys(vulnerabilities);
  return {
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: names.length,
        critical: 0,
        total: names.length,
        ...counts,
      },
    },
  };
}

function knownDevelopmentAudit() {
  return auditWith({
    "@eslint/config-array": { severity: "high", via: ["minimatch"] },
    "@eslint/eslintrc": { severity: "high", via: ["minimatch"] },
    "brace-expansion": { severity: "high", via: [allowedAdvisory] },
    eslint: {
      severity: "high",
      via: ["@eslint/config-array", "@eslint/eslintrc", "minimatch"],
    },
    "eslint-config-next": {
      severity: "high",
      via: ["eslint-plugin-import", "eslint-plugin-jsx-a11y", "eslint-plugin-react"],
    },
    "eslint-plugin-import": { severity: "high", via: ["minimatch"] },
    "eslint-plugin-jsx-a11y": { severity: "high", via: ["minimatch"] },
    "eslint-plugin-react": { severity: "high", via: ["minimatch"] },
    minimatch: { severity: "high", via: ["brace-expansion"] },
  });
}

test("accepts only the known development advisory closure", () => {
  const result = validateFullAudit(knownDevelopmentAudit());
  assert.equal(result.allowedExceptionCount, 9);
});

test("accepts a clean full audit after upstream remediation", () => {
  const result = validateFullAudit(auditWith({}));
  assert.equal(result.allowedExceptionCount, 0);
});

test("rejects a different advisory", () => {
  const audit = knownDevelopmentAudit();
  audit.vulnerabilities["brace-expansion"].via[0] = {
    ...allowedAdvisory,
    url: "https://github.com/advisories/GHSA-unexpected",
  };

  assert.throws(() => validateFullAudit(audit), /unexpected advisory/);
});

test("rejects an unexpected dependency in the allowed path", () => {
  const audit = knownDevelopmentAudit();
  audit.vulnerabilities.eslint.via.push("unexpected-package");

  assert.throws(() => validateFullAudit(audit), /unexpected vulnerability path/);
});

test("rejects moderate-or-higher production vulnerabilities", () => {
  const audit = auditWith(
    {
      "production-package": { severity: "moderate", via: ["another-package"] },
    },
    { high: 0, moderate: 1 },
  );

  assert.throws(
    () => validateProductionAudit(audit),
    /production dependencies contain moderate-or-higher vulnerabilities/,
  );
});
