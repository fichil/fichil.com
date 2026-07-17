# fichil.com Sites application

This directory contains the Sites-hosted vinext application for fichil.com.
The Hugo repository remains the canonical source of content and the rollback
deployment until the custom-domain cutover is accepted.

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
npm test
npm run lint
```

`npm test` creates the deployment build and checks every canonical article,
tag, category, feed, sitemap, redirect, and removed legacy route.

## Publishing policy

GitHub remains the only source-of-truth repository. A production version must
be built from a committed GitHub SHA, pushed unchanged to the Sites source
repository, packaged, saved, and deployed through Sites. Never persist a Sites
write token in a remote URL, Git configuration, file, or log.

The apex and `www` custom domains must not be attached or made public until the
owner accepts the private Sites deployment. Keep the VPS deployment available
for at least seven days after cutover. The verified rollback target at the time
of migration was `104.244.94.201`; re-check DNS before any rollback.
