---
title: "Stabilizing Browser CI by Testing the Vite Production Build"
date: 2026-08-13
draft: false
tags: ["vite", "playwright", "e2e", "ci", "testing"]
categories: ["Frontend Engineering"]
description: "Run Playwright against a fresh Vite production preview so browser CI verifies the built assets intended for release instead of depending on development-time source-module delivery."
---

A browser check failed while loading one route in a single-page application. The production build had completed, the size budget had passed, the unit suite was green, and eight other end-to-end cases succeeded. The failing browser reported that it could not fetch a route source module from the Vite development server.

Rerunning the job might have produced a green result, but it would have preserved the weak boundary. The release artifact was a generated bundle; the browser gate was still exercising development-time source transformation and on-demand source-module delivery.

The durable change was to make Playwright build the application and start a fresh Vite preview server for every run. The same adjustment also moved a deliberate network-failure test from a source-file URL to the hashed JavaScript asset emitted by the build. After the change, all nine browser cases and the wider local and cloud verification paths passed.

## The failure identified the test server, not the shipped bundle

The failed request pointed to a source view module. That detail mattered because a Vite development server transforms and serves source modules as the browser requests them. A route-level dynamic import therefore creates another development-server request during navigation.

The application already had a successful production build. Vite documents that `vite build` produces a bundle suitable for static hosting, and that `vite preview` serves the generated `dist` files for local inspection ([Vite production build](https://vite.dev/guide/build), [Vite static deployment](https://vite.dev/guide/static-deploy.html)). The failing request did not come from that artifact path.

This evidence did not prove whether startup timing, a transient server response, or another development-only condition caused the individual request to fail. It did establish the actionable mismatch: the release gate depended on a server mode that production would not use.

## A retry would keep the wrong verification boundary

Retries are useful when the behavior under test is intentionally asynchronous and the assertion waits for a defined state. They are a poor substitute for choosing the correct artifact.

Adding a retry here would have created three problems:

- a transient development-server recovery could hide the same module-delivery failure;
- a green result would still say nothing about generated filenames, production transforms, or the contents of `dist`;
- the browser suite could pass while the actual production bundle contained a base-path, code-splitting, or asset-reference error.

The test target needed to move first. Retry policy could then be evaluated independently for genuine network or business-flow behavior.

## Start Playwright from a clean production preview

The preview step built the application before starting its server:

```sh
vite build
vite preview
```

The package script joined the two commands with `&&`, so preview could not start after a failed build. Host, endpoint, and strict-port settings remained environment-owned test configuration rather than article constants.

Playwright's `webServer` option can launch a command and wait until its configured URL accepts requests. It also controls whether an already-running process may be reused ([Playwright web server](https://playwright.dev/docs/test-webserver)). The browser configuration used the production-preview script and rejected reuse:

```ts
const testURL = getTestURL()

const webServer = {
  command: 'npm run preview:e2e',
  url: testURL,
  reuseExistingServer: false,
  timeout: 60_000,
}

export default defineConfig({
  webServer,
  use: {
    baseURL: testURL,
  },
})
```

Disabling reuse made the suite fail if another process already owned the configured endpoint. It also ensured that the browser did not silently attach to a stale development server left by a local session or an earlier test.

This pattern deliberately builds twice when a larger `verify` command already ran `vite build` before E2E. The extra build costs time, but it keeps the preview command self-contained and guarantees that the server reads a current artifact. A mature pipeline can build once and pass the exact immutable `dist` directory to a separate server step, provided it binds the build and browser phases to the same artifact identity.

## Failure injection must follow the built asset

One browser case verified that the default language remained usable when an optional locale failed to download. Under the development server, the test intercepted a TypeScript source-module path. That path does not exist in a production build.

Vite rewrites referenced assets during a production build and commonly emits hashed filenames under an assets directory ([Vite static asset handling](https://vite.dev/guide/assets.html)). The route interception therefore changed to match the emitted locale chunk:

```ts
const localeAsset = new RegExp(
  '/assets/en-US-' +
  '[^/?]+[.]js' +
  '(?:[?].*)?$',
)

async function failLocale(route) {
  await route.abort()
}

await page.route(
  localeAsset,
  failLocale,
)
```

The expression accepts a content hash and an optional query string while keeping the semantic target narrow. A broad `**/*.js` interception would also block the application entry or unrelated chunks and would no longer prove the intended fallback.

When the build configuration changes chunk naming, the test should derive or assert the target from the emitted manifest. A filename pattern is acceptable only while it remains an explicit, reviewed contract.

## Verification covered the artifact and the wider delivery path

The completed run checked several boundaries:

- lint and 26 frontend unit tests passed;
- a production build completed and its bundle budget remained within the configured limits;
- all nine Playwright cases passed against a fresh production preview;
- the broader repository test suite and repository-contract checks passed;
- the final cloud check completed on the exact reviewed commit.

The sequence was important. The earlier cloud run had already proved that compilation and most behavior were healthy before the browser failure. The updated run then proved that the same class of user journeys worked against the generated asset graph.

## Limits

Vite explicitly describes preview as a local way to inspect the production build and says it is not a production server. It does not reproduce a CDN, reverse proxy, TLS termination, cache headers, compression policy, service worker, or production backend.

Applications that depend on development-server API proxying need a separate test backend, fixtures, or request mocks when switching to preview. Server-side rendering and runtime asset generation also require a test server that matches their real delivery model; a static preview alone is insufficient.

The reusable rule is to make browser CI exercise the artifact that the release step intends to ship. Build once or bind repeated builds to the same source, start a clean server for that artifact, update fault injection to target emitted resources, and keep deployed smoke tests for the production behaviors that local preview cannot represent.
