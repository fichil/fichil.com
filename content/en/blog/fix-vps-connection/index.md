---
title: "Fixing VPS Connection Refused on fichil.com"
date: 2026-05-07
draft: false
tags: ["nginx", "linux", "hugo", "devops"]
categories: ["DevOps"]
---

This case records how I restored `fichil.com` from a basic server reachability failure to a working Hugo site served by Nginx.

## Problem

The browser returned `ERR_CONNECTION_REFUSED`. This usually means the domain resolved to the server, but nothing was accepting traffic on the expected port.

For this site, the impact was straightforward: until the access path worked again, new posts and page edits could not be checked properly online.

## Investigation path

The practical checklist was:

1. Confirm the domain resolves to the VPS.
2. Check whether Nginx is installed and running.
3. Verify port 80 and port 443 listeners on the server.
4. Test local access with `curl http://127.0.0.1`.
5. Review the Nginx site configuration.
6. Build the Hugo site and point Nginx to the generated `public/` directory.
7. Add HTTPS after the HTTP path is stable.

## Resolution

The recovery strategy was to keep the stack simple:

- Hugo generates static files.
- Nginx serves the generated site.
- HTTPS is handled at the Nginx layer.
- GitHub stores the source code and configuration.

This setup is easy to operate: write content, build Hugo, deploy static files, and let Nginx serve them.

## What I learned

Deployment problems should be handled from the outside in:

- Network reachability first.
- Process and port status second.
- Web server configuration third.
- Application or site generation last.

This order prevents wasting time debugging Hugo when the actual failure is a closed port or stopped Nginx service.

## Next step

The site will continue to document backend engineering, DevOps troubleshooting, logistics system integration, and AI-assisted development workflows.
