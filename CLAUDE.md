# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI-powered CRM (Customer Relationship Management) app built as a vanilla HTML/JS/CSS frontend with Supabase as the backend. There is no build step — files are served directly in the browser.

## Running the App

Open `index.html` directly in a browser, or serve it with any static file server:

```bash
python -m http.server 8080
# then visit http://localhost:8080
```

## Architecture

- **No build toolchain** — no npm, no bundler, no compilation. All dependencies are loaded via CDN.
- **Tailwind CSS** is loaded via CDN (`cdn.tailwindcss.com`) and used with utility classes directly in HTML.
- **Supabase JS client** is loaded via CDN (`@supabase/supabase-js@2`).
- **Dark theme** using Tailwind's `slate` palette (`bg-slate-900`, `text-slate-100`, etc.).

## Supabase Configuration

`js/supabase-config.js` and `js/supabase-config.local.js` are gitignored (contain real keys). The loading order in `index.html` is:

1. `js/supabase-config.local.js` — loaded first (local override, silently fails if absent)
2. `js/supabase-config.js` — loaded as fallback only if `SUPABASE_URL` is still undefined

To set up locally, copy the example and fill in your credentials from the Supabase dashboard:

```bash
cp js/supabase-config.example.js js/supabase-config.js
# Edit js/supabase-config.js with your SUPABASE_URL and SUPABASE_ANON_KEY
```

The Supabase client is initialized in `js/app.js` and currently expects a `contacts` table to exist in the project.
