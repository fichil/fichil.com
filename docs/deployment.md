# Deployment Guide

This document describes how to build and deploy fichil.com.

## Overview

fichil.com is a static website built with Hugo and served by Nginx on a VPS.

Repository:

```text
https://github.com/fichil/fichil.com
```

Production domain:

```
https://fichil.com
```

## Stack

- Hugo
- Git
- Nginx
- Certbot
- Ubuntu VPS

## Local Build

Clone the repository with submodules:

```
git clone --recurse-submodules https://github.com/fichil/fichil.com.git
cd fichil.com
```

If the repository was cloned without submodules:

```
git submodule update --init --recursive
```

Start local preview:

```
hugo server
```

Build production files:

```
hugo --minify
```

The generated static files will be placed in:

```
public/
```

Do not commit the `public/` directory.

## Server Directory

Recommended production directory:

```
/var/www/fichil.com
```

Alternative directory if using a custom deployment path:

```
/home/fichil/fichil.com
```

The Nginx root should point to the generated static site directory.

Example:

```
server {
    listen 80;
    server_name fichil.com www.fichil.com;

    root /var/www/fichil.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

## Deploy From Local Machine

Build locally:

```
hugo --minify
```

Upload generated files to the server:

```
scp -r public/* user@server_ip:/var/www/fichil.com/
```

Replace:

```
user
server_ip
/var/www/fichil.com/
```

with the actual server username, server IP, and deployment directory.

## Deploy From Server

SSH into the server:

```
ssh user@server_ip
```

Go to the repository directory:

```
cd /path/to/fichil.com
```

Pull latest source code:

```
git pull
git submodule update --init --recursive
```

Build:

```
hugo --minify
```

Copy generated files to Nginx root:

```
sudo rsync -av --delete public/ /var/www/fichil.com/
```

Reload Nginx:

```
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS

If HTTPS is not configured yet, use Certbot:

```
sudo certbot --nginx -d fichil.com -d www.fichil.com
```

Check certificate renewal:

```
sudo certbot renew --dry-run
```

## Health Check

Check Nginx status:

```
sudo systemctl status nginx
```

Check Nginx config:

```
sudo nginx -t
```

Check local response:

```
curl -I http://127.0.0.1
```

Check production domain:

```
curl -I https://fichil.com
```

## Rollback

If deployment breaks the site, restore the previous version from backup.

Recommended backup before deploy:

```
sudo cp -r /var/www/fichil.com /var/www/fichil.com.backup
```

Rollback:

```
sudo rm -rf /var/www/fichil.com
sudo mv /var/www/fichil.com.backup /var/www/fichil.com
sudo systemctl reload nginx
```

## Deployment Checklist

Before deployment:

- Run `hugo server` locally
- Run `hugo --minify`
- Confirm GitHub Actions passed
- Confirm no secrets are committed
- Confirm `public/` is not committed

After deployment:

- Open https://fichil.com
- Check homepage
- Check blog page
- Check Chinese page if updated
- Run `curl -I https://fichil.com`