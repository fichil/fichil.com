---
title: "Recent Bug Fixes from My Daily Work"
date: 2026-05-08
draft: false
tags: ["java", "bug-fixing", "logistics", "sql"]
categories: ["Engineering"]
---

Recently I spent a lot of time fixing small but important bugs in logistics systems. Most of them were not difficult because of one single line of code. They were difficult because the same page, status, interface, and database field were used by several business steps.

This post records several examples from my recent work.

## 1. Fee details should not be editable in every status

One issue was about the fee detail page. The expected rule was simple: fee details should only be editable when the fee status is `NEW` or `REJECTED`.

The actual behavior was different. Records in later statuses, such as `RELEASED_FINANCE`, could still open the edit dialog. That was risky because users could change data after the fee had already moved into the finance process.

The fix was not only to hide a button. I had to check the front-end event path that opened the edit dialog, because some actions were triggered by grid events instead of the visible button state.

The key point was:

- Check the current fee status before opening the edit form.
- Allow editing only for `NEW` and `REJECTED`.
- Block the dialog for finance or confirmed statuses.
- Keep the rule in one place so future button changes do not bypass it.

This type of bug is easy to miss if testing only checks whether the button is hidden. The real test is whether the edit dialog can still be opened from any page action.

## 2. Partial success for an integration interface

Another change was for an interface like `/lrms/vehicle`. The old behavior treated the full request as failed if any item failed validation or processing.

That was not ideal for batch data. If one vehicle record has a problem, the valid records should still be processed, and the response should clearly show which rows succeeded and which rows failed.

The implementation direction was:

- Process records one by one.
- Catch item-level errors without stopping the whole batch.
- Return a result list with success and failure details.
- Keep enough error information for the caller to fix bad rows.

For this kind of API, "success" cannot only mean HTTP 200. The response body must tell the caller the real result of each item.

## 3. Weight and volume should come from package configuration

There was also a weight and volume calculation issue. For inbound interface orders and manually created work orders, unit net weight and unit volume should use the SKU package configuration when the package unit exists.

The previous logic could fall back to SKU base fields too early. That caused wrong totals when the package unit had its own net weight or volume.

The updated rule was:

- Keep gross weight using the original SKU value.
- For net weight and volume, first check the package relation table.
- Use `quantity * package unit net weight` for net weight when available.
- Use `quantity * package unit volume` for volume when available.
- Fall back to SKU base fields only when package data is missing.

This bug needed both front-end and interface scenarios to be checked. A fix that only works for manual creation is not enough if the same order can also enter the system through an API.

## 4. Preserve external error messages

Some bugs were related to external calls, especially SAP or OpenAPI integration. A common problem was that the lower-level system returned a useful error message, but the page only showed a generic failure.

That makes troubleshooting slower. Users and developers need to see the original external error, for example connection problems, invalid relation data, or missing SAP document numbers.

The fix was to pass the external exception message back to the response instead of replacing it with a vague message.

This does not mean exposing sensitive data. It means keeping the useful part of the failure reason so the next person can identify whether the problem is data, network, mapping, or external system state.

## What I learned

These bugs reminded me of a few practical rules:

- Do not trust the button state alone. Check the real event path.
- Batch interfaces should return row-level results when partial success is required.
- Calculation logic must be shared or aligned between manual pages and API imports.
- External integration errors should not be swallowed by generic messages.
- A small status rule can affect finance, dispatch, billing, and integration steps.

Most bug fixing work is not about writing clever code. It is about finding the exact place where the system allows a wrong state, a wrong value, or a missing error message to continue.

That is the part I want to keep improving: read the data, follow the call path, change the smallest safe area, and verify the result from the user action instead of only from the code branch.
