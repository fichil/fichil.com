---
title: "Fixing Incorrect Direct Access with a Domain-Specific Proxy Rule"
date: 2026-07-20
lastmod: 2026-07-23
draft: false
tags: ["dns", "proxy", "routing", "windows", "troubleshooting"]
categories: ["DevOps"]
description: "A local connectivity incident resolved by proving the remote service was healthy, isolating incorrect direct routing, and adding one precise proxy rule."
---

A website worked from external networks but consistently timed out on one Windows workstation. Its browser page, command-line requests, and JSON endpoint were all affected, while other proxied services still worked.

That combination can resemble a server outage, a certificate problem, or a broken proxy client. The useful approach was to test the remote service, local name resolution, and routing decision as separate layers.

## Symptom and evidence

Independent requests reached both the homepage and the endpoint successfully, and the certificate chain was valid. The public service and its TLS configuration were therefore healthy.

Direct requests from the affected workstation resolved and connected differently, then timed out. Sending the same request through the existing local proxy succeeded. This comparison moved the investigation away from the application and toward the workstation's resolution and split-routing path.

The active proxy profile confirmed the missing link: the domain was not covered by a proxy rule. Its traffic fell through to the final direct rule, which then used the unusable resolution result.

## Root cause

Two conditions combined to create the failure:

- the workstation received an unusable address for the domain;
- the routing profile allowed that domain to connect directly.

A healthy proxy service was not enough. Unless the rule selected it for this domain, the browser continued to take the incorrect path.

## Minimal treatment

The fix was deliberately narrow. An exact domain condition was added to the first custom proxy rule, ahead of the final direct rule. The configuration was saved through the client's normal settings flow, and the proxy core was reloaded.

There was no switch to global proxy mode and no change to hosts, system DNS, the machine-wide proxy endpoint, or unrelated routing rules. This kept the blast radius small and made rollback a one-line rule removal.

## Verification

The recovered path was checked at several levels:

- the homepage returned a successful status with valid TLS;
- the JSON endpoint returned the expected media type;
- the browser rendered search, pagination, and downloadable resources;
- existing proxied services continued to behave as expected.

Those checks also established that the recovery came from the routing decision rather than an unrelated global configuration change.

## Lessons and limits

A domain-specific route is appropriate when the remote service is healthy, the proxied path works, and only direct access is wrong. It is not a general cure for connectivity failures. If independent networks also fail, the investigation should stay on the server, authoritative DNS, certificates, or the public network edge.

The broader lesson is to create falsifiable comparisons. Testing external access, local direct access, and local proxied access separately reveals much more than repeatedly refreshing a browser or replacing system-wide DNS settings.
