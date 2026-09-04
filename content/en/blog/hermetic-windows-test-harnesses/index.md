---
title: "Making Windows Test Harnesses Independent of Encoding and Git Defaults"
date: 2026-09-04
publication_date: 2026-09-04
slug: "hermetic-windows-test-harnesses"
draft: false
tags: ["windows", "python", "git", "testing", "subprocess", "line-endings", "ci"]
categories: ["DevOps"]
description: "Fix host-dependent Windows test failures by owning subprocess decoding and Git line-ending policy at the boundaries where test evidence and fixture state are created."
ai:
  schema_version: 1
  problem: "A Windows test suite failed before its business assertions because captured subprocess output used a machine-dependent decoder and freshly cloned Git fixtures inherited a global line-ending policy."
  symptoms:
    - "Tests that expected JSON received no usable stdout after a background text-decoding failure."
    - "A newly created shared-clone fixture reported tracked-file changes before the test changed any file."
    - "The same product behavior could pass in CI while failing on one Windows workstation."
  evidence:
    - "Ten subprocess-driven tests passed after their helper selected UTF-8 explicitly and made malformed bytes visible through replacement characters."
    - "Twenty-four Git-fixture errors disappeared after the clone fixed its line-ending policy before the first checkout."
    - "A clean-fixture regression test proved that a fresh clone started with an empty short status."
    - "The complete local gate and all protected pull-request checks passed before the repair was merged."
  root_cause: "The harness allowed two machine-global defaults to become test inputs. Python text mode chose the default TextIOWrapper decoder when no encoding was supplied, while Git checkout behavior depended on core.autocrlf when no stronger path policy applied."
  resolution_steps:
    - "Centralize subprocess execution in one helper and specify the expected output encoding, error policy, capture behavior, and return-code handling there."
    - "Keep decoding failures distinct from product failures; include return code, stdout, and stderr in assertion diagnostics."
    - "Apply the Git line-ending policy in the clone command so it exists before the fixture's first checkout."
    - "Assert that every newly created repository fixture is clean before a test mutates it."
    - "Run focused regressions first, then the full local suite and protected CI on the exact change."
  verification:
    - "The ten previously blocked subprocess tests passed with usable captured output."
    - "The twenty-four fixture failures were removed and the new clean-clone assertion passed."
    - "The full local run completed 131 content checks and 694 repository tests, with 15 intentional skips and no failures."
    - "All five required pull-request checks succeeded before the exact head was merged."
  limitations:
    - "errors=replace favors diagnostic continuity; protocols that require byte-exact output should capture bytes and decode strictly at a separately tested boundary."
    - "Repository-local .gitattributes remains the durable policy for real source trees; command-scoped core.autocrlf is useful for disposable fixtures whose checkout must be controlled by the harness."
    - "A clean status assertion detects checkout drift, but it does not prove that every platform-sensitive behavior is hermetic."
  applies_to:
    - "Python test suites that launch child processes and parse captured text"
    - "Windows integration tests that create temporary Git repositories"
    - "CI systems where local and hosted runners use different locale or Git defaults"
  keywords: ["Windows subprocess encoding", "Python captured stdout None", "Git fixture dirty after clone", "core.autocrlf test fixture", "hermetic Windows tests"]
---

A Windows full test run produced two clusters of errors before the underlying product assertions could execute. One cluster tried to parse JSON from child-process output and received no usable `stdout`. Another created temporary Git repositories that were already dirty immediately after cloning.

The application logic had not regressed. The test harness had allowed workstation defaults to shape both the evidence it read and the fixture state it created. Repairing those boundaries removed 34 setup errors and let the real assertions run.

## Two symptoms pointed outside the product

The first group contained ten subprocess-driven errors. The child command emitted UTF-8 text, including non-ASCII characters. The helper used `text=True` and `capture_output=True` without naming an encoding. On the affected Windows host, decoding failed in the capture path, leaving the caller without the JSON text it expected.

The second group contained 24 Git-fixture errors. Tests created shared clones and expected a clean starting state. A global `core.autocrlf` setting changed line endings during the first checkout, so tracked files differed from the index before the test performed its first action.

Both failures had the same structural cause: the harness consumed machine policy as hidden input.

The public repair is visible in [the merged pull request](https://github.com/fichil/tech-invest-daily/pull/90). It changed only test helpers and regression coverage; the application workflow remained untouched.

## Own the subprocess text boundary

Python documents that `subprocess.run()` opens captured streams in text mode when `text`, `encoding`, or `errors` is supplied. When only text mode is selected, decoding uses the `io.TextIOWrapper` default. Supplying `encoding` and `errors` makes that conversion explicit ([Python `subprocess`](https://docs.python.org/3/library/subprocess.html)).

The shared helper was changed from an implicit decoder to a declared contract:

```python
def run_python(script, *args):
    command = [
        sys.executable,
        str(script),
        *map(str, args),
    ]
    return subprocess.run(
        command,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
```

Each option has a separate job:

- `sys.executable` launches the same Python interpreter as the test process.
- `encoding="utf-8"` matches the child program's output contract instead of the workstation locale.
- `errors="replace"` keeps diagnostics readable if an unexpected byte appears.
- `capture_output=True` retains both streams for assertions and failure messages.
- `check=False` lets the harness inspect the command's own structured result and return code.

`errors="replace"` is a deliberate tradeoff. It is appropriate when retaining a diagnostic record matters more than byte identity. If stdout is a signed payload, binary artifact, or byte-exact protocol, capture bytes and perform strict decoding in a separately tested parser. Replacement characters should never make corrupted machine output look valid.

The assertion layer should also distinguish transport from product behavior. A parse failure should report the return code and sanitized stream excerpts. Otherwise a decoder failure can be mislabelled as a business-rule failure.

## Apply Git policy before the first checkout

The Git fixture originally configured its repository after cloning. That was one operation too late. `git clone` performs its checkout while the clone is being created, so a global line-ending rule may already have rewritten the working tree.

Git provides a command-scoped configuration option for clone. Its documentation states that values supplied with `-c` are written after repository initialization and before fetching or checking out files ([`git clone`](https://git-scm.com/docs/git-clone)). The fixture therefore moved the policy into the clone command:

```sh
git \
  -c core.autocrlf=false \
  clone \
  --shared \
  <source> \
  <fixture>
git \
  -C <fixture> \
  status \
  --short
```

The second command is part of the contract. A disposable repository fixture must prove that its baseline is clean before a test changes it. Without that assertion, later failures cannot distinguish the test action from checkout-time drift.

Git's attribute documentation explains why the host can matter: when a path has no explicit `eol` rule, working-tree line endings can be determined by `core.autocrlf` or `core.eol` ([Git attributes](https://git-scm.com/docs/gitattributes.html)).

For a real source repository, `.gitattributes` is usually the durable, reviewable place to define line-ending behavior. A command-scoped setting serves a narrower purpose here: the test harness owns a temporary clone and must neutralize the operator's global Git configuration before the first checkout.

## Verify the boundary before the entire suite

The repair used a layered verification sequence:

1. Re-run the ten subprocess tests that previously lost usable output.
2. Re-run the Git-fixture tests and require a fresh clone to return an empty `status --short`.
3. Run the complete local validation entry point.
4. Review the exact diff to confirm that only test helpers and regressions changed.
5. Require every protected pull-request check to pass before merge.
6. Require the merged main commit to pass its checks again.

The focused tests showed whether each boundary repair worked. The full local gate then completed 131 content checks and 694 repository tests, with 15 intentional skips and no failures. The pull request's five required checks also passed on the exact head before the protected merge.

The sequence matters. A small passing test can prove the immediate mechanism, while the full suite detects new assumptions introduced by centralizing the helper or changing fixture creation.

## Keep host defaults out of test evidence

A hermetic test does not need to emulate every platform. It does need to declare every platform-sensitive conversion that affects its inputs, evidence, or initial state.

For child processes, record the executable, argument list, expected encoding, decode policy, environment overrides, return code, and captured streams. For Git fixtures, record checkout-time configuration, attributes, initial status, and the exact mutation the test is meant to perform.

The reusable conclusion is simple: set boundary policy before conversion happens. Decode bytes before assertions with an explicit contract, and configure a repository before its first checkout can inherit host behavior. Then test the baseline itself. That turns workstation-specific setup errors into stable, reviewable test evidence.

## Limits

This approach does not remove every Windows-specific variable. Filesystem case handling, path length, executable lookup, permissions, antivirus hooks, and shell quoting can still affect integration tests. Add one explicit boundary and one regression assertion for each variable the suite actually encounters.

Do not use `errors="replace"` as a general parser policy. When replacement changes the meaning of structured output, fail visibly. Do not use `core.autocrlf=false` to override a real repository's reviewed `.gitattributes`; the fixture-level setting applies to disposable repositories whose starting bytes must be controlled by the test harness.
