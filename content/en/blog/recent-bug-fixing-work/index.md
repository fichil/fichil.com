---
title: "Why Logistics Bugs Return: Put Business Rules at the Real Execution Boundary"
date: 2026-05-08
lastmod: 2026-07-21
draft: false
tags: ["java", "bug-fixing", "logistics", "integration", "validation"]
categories: ["Backend Engineering"]
description: "Four apparently unrelated logistics defects shared one cause: business rules protected a visible entry point instead of the boundary where state, data, or integration behavior actually changed."
---

Small logistics-system bugs often return even when the rule appears to exist. The rule may protect one button, page, or exception branch without covering every path that can change business state or data.

The four examples below come from different features, but they support one conclusion: **business constraints belong at the real execution boundary, and every entry point must share the same result semantics.**

## Editing rules must protect the action, not the button

Fee details were editable only in `NEW` or `REJECTED`. Some buttons were hidden correctly, but a grid event could still open the editor, leaving finance-stage data exposed to change.

The safe fix was not another visibility condition. The common edit action had to validate state before opening, and the backend had to reject an invalid update as well. Verification covered row events, shortcuts, and direct requests in addition to the visible button.

The boundary was “perform an edit,” not “render an edit button.”

## Partial-success APIs need a record-level boundary

A vehicle batch interface originally stopped the entire request when one item failed. The caller received a failed batch without a usable account of which records were valid and which required correction.

When the business contract allows partial success, processing needs a record-level boundary:

- validate and process each item independently;
- keep one item failure from cancelling later items;
- return per-item success, failure, and an actionable reason;
- retry failed items without repeating records that already succeeded.

HTTP 200 can describe completion of the batch request. It cannot replace the business result for every item.

## Calculation rules must cover every data entry path

Orders could arrive through an integration or be created manually. Net weight and volume had to prefer package-unit configuration and fall back to SKU base values only when package data was absent.

Fixing only the page or only the import path would let identical orders produce different values. The calculation therefore belonged in shared domain logic and required four checks: integration input, manual input, package configuration present, and package configuration absent.

The boundary was “calculate order weight and volume,” not a particular screen or endpoint.

## External errors must remain useful without leaking internals

When SAP or an OpenAPI dependency returned a precise failure reason, replacing it with “call failed” removed the evidence needed for recovery. The user could not tell whether the fault involved networking, data relationships, field mapping, or external state.

Passing through an unfiltered stack trace would be unsafe as well. The response should preserve a reviewed business message, correlation identifier, and failure category while removing credentials, internal paths, and sensitive values.

The error boundary is whether the next operator can take action, not whether an exception was caught.

## A repeatable execution-boundary review

These defects can be anticipated with the same questions:

1. Which action actually changes state or data?
2. Do the page, batch API, import, and retry paths use the same rule?
3. Is the failure boundary the full batch, one record, or one external call?
4. Can the response distinguish business, transport, and unknown failures?
5. Does verification cover bypassed buttons, repeated requests, and alternate entry points?

Many recurring bugs do not require a clever algorithm. They require one rule to stop being scattered across several entry points. Put the rule at the real execution boundary, then verify the user action and resulting data rather than one convenient code branch.
