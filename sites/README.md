# fichil.com Sites application

This directory contains the production vinext application hosted by ChatGPT
Sites. The root Hugo content and configuration remain canonical; Hugo also
provides local preview and compatibility validation.

## Content source

- English posts: `../content/en/blog/*/index.md`
- Chinese posts: `../content/zh-cn/blog/*/index.md`
- Homepage copy and projects: `../hugo.yaml`

`npm run content:generate` validates translation pairs and produces an ignored
build input under `generated/`. Do not edit that output manually.

## Commands

```text
npm install
npm run dev
npm run security:audit
npm test
npm run lint
```

`npm test` creates the deployment build and checks every canonical article,
tag, category, feed, sitemap, redirect, removed legacy route, and the public
`/version.json` release marker.

## Dependency security

The required `sites` check blocks high or critical findings in the complete npm
dependency tree and moderate-or-higher findings in production dependencies.
Dependabot proposes grouped weekly updates for the Next and Cloudflare/Vite
stacks; these non-blog changes remain subject to owner review.

The root overrides for `postcss` and `sharp` temporarily replace vulnerable
versions pinned by Next and Miniflare. Keep them at exact reviewed versions and
remove them only when the upstream packages resolve to patched versions without
an override, `npm audit` remains clean, and the image-processing smoke test and
complete Sites checks pass. Track removal in
[GitHub Issue #38](https://github.com/fichil/fichil.com/issues/38).

## Publishing policy

GitHub remains the only source-of-truth repository. A production version must
be built from a committed GitHub SHA, pushed unchanged to the Sites source
repository, packaged, saved, and deployed through Sites. Never persist a Sites
write token in a remote URL, Git configuration, file, or log.

GitHub Actions validates pull requests and pushes to `main`, but holds no Sites
credential. A project-scoped Codex task checks `main` every weekday at 10:00
Asia/Shanghai and publishes only a successfully validated new commit. A failed
post-deploy smoke check must restore the previously known-good Sites version.

Production rollback uses a previously known-good Sites version. The repository
contains no VPS deployment workflow; normal releases and rollbacks must not
change custom-domain DNS or Sites access policy.
