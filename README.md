- # fichil.com

  Source code for my personal technical blog: https://fichil.com

  This site is built with Hugo and used to publish technical notes, production troubleshooting cases, open-source project updates, and long-term engineering records.

  ## Tech Stack

  - Hugo
  - Markdown
  - Nginx
  - GitHub
  - GitHub Actions

  ## Repository Structure

  ```text
  content/      Blog posts and pages
  static/       Static files such as images and favicon
  assets/       Theme assets and custom frontend assets
  themes/       Hugo themes managed by Git submodules
  hugo.yaml     Hugo site configuration
  AGENTS.md     AI maintenance rules for Codex / ChatGPT
  .github/      GitHub Actions workflows
  ```

  ## Local Development

  Clone this repository with submodules:

  ```
  git clone --recurse-submodules https://github.com/fichil/fichil.com.git
  cd fichil.com
  ```

  If you already cloned without submodules, run:

  ```
  git submodule update --init --recursive
  ```

  Start local development server:

  ```
  hugo server
  ```

  Build production files:

  ```
  hugo --minify
  ```

  The generated output will be placed in:

  ```
  public/
  ```

  Do not commit the `public/` directory.

  ## Theme

  This site currently uses:

  ```
  theme: "hugo-profile"
  ```

  The theme is managed as a Git submodule:

  ```
  themes/hugo-profile
  ```

  When changing the theme, make sure both `hugo.yaml` and `.gitmodules` stay consistent.

  ## Content Guidelines

  English content should usually be placed under:

  ```
  content/
  ```

  Chinese content should usually be placed under:

  ```
  content/zh-cn/
  ```

  Use Markdown for posts and pages.

  Recommended article types:

  - Technical troubleshooting notes
  - Backend development records
  - DevOps and deployment cases
  - Open-source project updates
  - AI-assisted development experiments

  ## Deployment

  The source code is maintained in this repository.

  The generated `public/` directory should be built separately and deployed to the production server.

  Production build command:

  ```
  hugo --minify
  ```

  Deployment target:

  ```
  https://fichil.com
  ```

  Server deployment is handled separately through Nginx.

  ## GitHub Actions

  This repository includes a Hugo build check workflow.

  The workflow runs on:

  - Pushes to `main`
  - Pull requests

  It checks whether the site can be built successfully with:

  ```
  hugo --minify
  ```

  This helps prevent broken configuration, missing themes, or invalid content from being merged.

  ## AI Maintenance

  This repository is intended to be maintained with AI-assisted development tools such as ChatGPT Codex.

  Before changing this repository:

  - Do not commit secrets
  - Do not commit generated `public/` files
  - Do not modify theme submodules unless required
  - Keep commits small and focused
  - Prefer content and configuration changes over deep theme changes
  - Check `hugo.yaml` before changing navigation, multilingual paths, or homepage sections
  - Run `hugo server` for local preview
  - Run `hugo --minify` before deployment

  For detailed AI maintenance rules, see:

  ```
  AGENTS.md
  ```

  ## Basic Git Workflow

  Check current changes:

  ```
  git status
  ```

  Stage files:

  ```
  git add .
  ```

  Commit changes:

  ```
  git commit -m "Update site content"
  ```

  Push to GitHub:

  ```
  git push
  ```

  ## License

  This repository is open source under the MIT License.

  Source code, configuration files, and site structure are licensed under the MIT License.

  The Hugo theme is included as a Git submodule and is licensed by its original author. Please refer to the theme repository for its license.

  Unless otherwise stated, blog posts and original content in this repository are also released under the MIT License.
