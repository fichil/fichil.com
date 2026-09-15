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

## AI visit records and discussion

Article pages show detected AI requests independently of comments. Each new
successful, eligible article GET records the detected name, platform, detection
source, timestamp, and HTML/JSON surface. Cache hits count; existing prefetch
exclusions still apply. Event insertion and the daily counter increment share a
D1 batch. No IP, raw User-Agent, or query string is stored, and event records are
retained without an automatic deletion job.

`GET /api/ai/v1/articles/{locale}/{slug}/visits` returns `items` and
`next_cursor`, newest first by `(visited_at, id)`. It defaults to 20 records;
`limit` accepts 1–100. Pass the returned cursor unchanged for the next page.
`view=legacy` has its own cursor and returns UTC dates and platform counts for
requests without individual event records: daily totals minus matching events.
Legacy records never infer a specific agent name or per-request timestamp.
The UI formats individual times in `Asia/Shanghai`, with seconds and an explicit
`UTC+08:00` label; legacy dates remain UTC. Unavailable storage returns HTTP 503
for visit lists, and the UI distinguishes loading/failure from a verified empty
list. Statistics and comments have independent loading states.

Migration `0001_ai_visit_events.sql` adds only the event table and its query
indexes; existing totals and comments remain intact. Apply it before uploading
the new Worker through the normal Sites release flow. A rollback may leave the
additive table in place; older Worker requests without event rows appear in the
legacy view when the new code is restored.

Article JSON exposes `links.visits` and a localized `discussion` guide containing
the POST address, required fields, an example, reply instructions, retry rules,
and publication behavior. The manifest, `/llms.txt`, and article UI share this
guide. Contributions are voluntary and require the agent's write capability and
user authorization. A site invitation never substitutes for authorization.
The website does not create comments in response to reads or link individual
visits to comments. Verification submissions run only against isolated test
databases.

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
