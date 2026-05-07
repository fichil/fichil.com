# fichil.com

Source code for my personal technical blog: https://fichil.com

This site is built with Hugo and used to publish technical notes, production troubleshooting cases, and open-source project updates.

## Tech Stack

- Hugo
- Markdown
- Nginx
- GitHub

## Local Development

```bash
hugo server
```

Build:

```
hugo --minify
```

## Repository Structure

```
content/      Blog posts and pages
static/       Static assets
assets/       Theme assets
themes/       Hugo themes
hugo.yaml     Hugo configuration
```

## Deployment

The generated `public/` directory should not be committed.
 Deployment is handled separately on the server.

## AI Maintenance

This repository is intended to be maintained with AI-assisted development tools such as ChatGPT Codex.

Before changing this repository:

- Do not commit secrets
- Do not modify generated `public/` files
- Keep commits small
- Run `hugo server` for local preview
- Run `hugo --minify` before deployment
