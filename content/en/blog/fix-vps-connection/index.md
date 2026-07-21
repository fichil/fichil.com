---
title: "Historical Note: Recovering fichil.com from a VPS Connection Refusal"
date: 2026-05-07
lastmod: 2026-07-21
draft: false
tags: ["nginx", "linux", "hugo", "devops", "historical"]
categories: ["DevOps"]
description: "A retained historical incident note: diagnosing the former fichil.com VPS from DNS and network reachability through listening ports, Nginx, and site files. Production now runs on Sites."
---

> **Historical architecture note:** This article describes an earlier version of fichil.com that ran on a VPS behind Nginx. Production has since moved to ChatGPT Sites and no longer uses the server release or rollback path below. See [Building and Operating fichil.com with AI](/blog/ai-maintained-hugo-site/) for the current architecture.

The original symptom was a browser connection refusal. That failure happened before Hugo content or an HTTP application response, so the investigation had to begin at the network and listening boundary rather than with templates or Markdown.

## What connection refused establishes

A refusal normally means the hostname resolved and the request reached the target host, but no process accepted the connection on that port or a host-side rule rejected it explicitly.

That differs from DNS failure, a timeout, or an Nginx 4xx/5xx response. Classifying the transport symptom first prevents unnecessary work on site content.

## Check the path from outside to inside

The investigation used this order:

1. confirm the domain resolved to the expected VPS;
2. probe ports 80 and 443 from outside the host;
3. inspect listening ports and owning processes on the host;
4. review host firewall and cloud security rules;
5. check Nginx service state and error logs;
6. only then inspect the site configuration, certificate, and Hugo output directory.

Each step answered one question: did the request reach the host, was a service listening, did the proxy load its configuration, and were the static files available?

## Recovery verification must go beyond the home page

After service recovery, external checks covered HTTP and HTTPS, redirects, English and Chinese entry points, static assets, and a concrete article route. A successful local `curl` did not prove that public DNS, the firewall, and the certificate chain were healthy.

The verification also recorded the real listening process, loaded Nginx configuration, and document root. That avoided a common form of drift where an edited file was not the file used by the running service.

## What remains useful from this historical incident

Although fichil.com no longer uses a VPS deployment, the diagnostic order still applies to connection refusals on self-managed servers: establish network and listener state before moving into proxy configuration and application content.

What must not carry forward is the assumption that this is the site's current release path. Production is now verified and recovered through exact commits, Sites versions, and `/version.json`.
