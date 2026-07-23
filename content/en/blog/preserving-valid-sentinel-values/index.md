---
title: "A Business Sentinel Is Not Empty Data"
date: 2026-07-22
lastmod: 2026-07-23
draft: false
tags: ["android", "data-normalization", "sentinel-values", "validation", "mobile"]
categories: ["Mobile Engineering"]
description: "A valid sentinel was converted to an empty string, breaking display, required-field validation, and request propagation until normalization was narrowed to true empty values."
---

A handheld picking workflow received its target field from the backend, but the page showed no target when that field contained a contract-defined asterisk sentinel. Save and confirmation actions then failed the required-field check.

Ordinary target values worked, so the symptom initially resembled an intermittent API omission. Tracing the value through the response model, view state, and outgoing request instead exposed a client-side normalization branch.

## Evidence

The backend response contained the literal asterisk, and the data model could preserve it as a string. Before the value reached page state, however, the client explicitly converted that sentinel to an empty string.

The normalized result was shared by several behaviors:

- text shown on the item card and confirmation dialog;
- required-target validation;
- the target parameter sent by save and confirm requests.

A condition that looked like display cleanup therefore removed the value from presentation, validation, and transport at the same time.

## Root cause

Within this business contract, the asterisk did not mean unknown or missing. It represented a valid special target. The client applied a generic idea of emptiness to a domain sentinel and destroyed legitimate information before the workflow could use it.

That explains why only the special case failed. Ordinary strings never entered the branch, while null and empty strings were correctly treated as missing.

## Minimal correction

The fix narrowed the normalization boundary:

- null and empty strings remain empty;
- the contract-defined sentinel and ordinary strings are preserved exactly.

No view or request pipeline needed redesign. Once retained, the value appeared in both UI locations, satisfied the existing required check, and traveled through the existing request model unchanged.

Serial-number, packaging-area, and other workflow checks were left intact. The backend contract and request type did not change. An independently maintained copy of the client contained the same condition and received the same minimal correction.

## Verification

The primary project change was committed after its Android Java compilation succeeded. The second copy passed a focused diff check showing only the normalization condition had changed, then compiled successfully with its compatible JDK.

Regression boundaries covered three input classes:

- the asterisk remains visible and reaches the request unchanged;
- ordinary targets behave exactly as before;
- null and empty values still fail the required check.

These checks demonstrate preservation of one defined valid value, not removal of input validation.

## Lessons and limits

Normalization must follow the domain contract. Trimming, case conversion, or replacing special characters can look harmless, but information loss spreads quickly when the same normalized value drives presentation, validation, and transport.

A sentinel should only be preserved when the interface contract defines it. One valid asterisk does not make every special character acceptable. Centralizing allowed domain values and testing ordinary, sentinel, and truly empty inputs separately produces a safer boundary.
