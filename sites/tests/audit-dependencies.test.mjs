import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFullAudit,
  validateProductionAudit,
} from "../scripts/audit-dependencies.mjs";

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

test("accepts a clean full audit", () => {
  const result = validateFullAudit(auditWith({}));
  assert.equal(result.vulnerabilityCount, 0);
});

test("rejects any development dependency advisory", () => {
  const audit = auditWith({
    "development-package": { severity: "high", via: ["transitive-package"] },
  });

  assert.throws(() => validateFullAudit(audit), /full dependency audit contains vulnerabilities/);
});

test("rejects lower-severity findings in the full audit", () => {
  const audit = auditWith(
    { "development-package": { severity: "moderate", via: ["transitive-package"] } },
    { high: 0, moderate: 1 },
  );

  assert.throws(() => validateFullAudit(audit), /full dependency audit contains vulnerabilities/);
});

test("rejects inconsistent audit metadata", () => {
  const audit = auditWith({}, { high: 1, total: 0 });

  assert.throws(() => validateFullAudit(audit), /metadata severity counts/);
});

test("rejects missing audit data", () => {
  assert.throws(() => validateFullAudit({}), /missing vulnerabilities/);
});

test("accepts low-severity production findings", () => {
  const audit = auditWith(
    { "production-package": { severity: "low", via: ["another-package"] } },
    { high: 0, low: 1 },
  );

  const result = validateProductionAudit(audit);
  assert.equal(result.blockingCount, 0);
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
