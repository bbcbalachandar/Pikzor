---
title: What Is an OG Image (And Why Every Blog Post Needs One)
date: 2026-04-01
author: Pikzor Team
description: OG images are the preview cards that appear when you share a link on social media. Here's everything you need to know about them.
tag: Guide
---

When you paste a link into Twitter, LinkedIn, or Slack, something magical happens: a preview card appears with a title, description, and an image. That image is an **OG image** — short for Open Graph image.

If you don't have one, the preview looks like this: a gray box, a URL, and maybe a title if you're lucky. Not exactly click-worthy.

## What is the Open Graph protocol?

The Open Graph protocol was created by Facebook in 2010. It defines a set of `<meta>` tags you add to your HTML `<head>` that tell social platforms how to display your content when it's shared.

The most important tags are:

```html
<meta property="og:title" content="My Blog Post Title" />
<meta property="og:description" content="A short description of the post." />
<meta property="og:image" content="https://yourdomain.com/og-image.png" />
<meta property="og:url" content="https://yourdomain.com/posts/my-post" />
```

The `og:image` tag is the one that generates the preview image. If it's missing, most platforms either show a gray box or fall back to a random image from your page.

## Why does it matter?

Research consistently shows that links with preview images get significantly more clicks than links without them. Some studies put the number at 2–3x more engagement.

Think about your own behavior: when you're scrolling through Twitter, do you click more on bare links or on cards with compelling images?

OG images also help establish your brand. If every post from your blog has the same clean, branded card format, readers start recognizing your content at a glance.

## What makes a good OG image?

The recommended size is **1200×630 pixels** (roughly 1.91:1 aspect ratio). This renders well on all platforms.

A good OG image includes:
- **The post title** — large, readable, high contrast
- **Your brand** — logo or domain name so people know who wrote it
- **Author information** — builds trust and recognition
- **Clean design** — simple is better than complex

What to avoid:
- Text that's too small to read in a thumbnail
- Images that are purely decorative with no text
- Relative URLs (use absolute HTTPS URLs)
- Images that are too small (under 600×315)

## How do social platforms handle it?

Each platform reads your `og:image` tag slightly differently:

**Twitter/X** looks for `twitter:card` and `twitter:image` first, then falls back to `og:image`. Set `twitter:card` to `summary_large_image` for the full-width card format.

**LinkedIn** uses `og:image` directly. It caches images aggressively — if you change your image, you may need to use LinkedIn's Post Inspector to flush the cache.

**Slack** and **Discord** both read `og:image` and show it inline when you paste a URL.

**iMessage** and **WhatsApp** also support link previews using OG tags.

## How to check your OG images

Use our free [OG Image Checker](/checker.html) to see exactly how your page looks when shared. Paste in any URL and you'll get a score, a visual preview of the Twitter and LinkedIn card, and a list of issues to fix.

## The manual way vs the Pikzor way

If you want to do this manually, you'd need to:

1. Design an image in Figma or Canva for each blog post
2. Export it, upload it somewhere
3. Update the `og:image` meta tag in each post
4. Repeat for every new post you write

With Pikzor, you set up once:

1. Upload your logo, pick your brand color
2. Get a URL like `/og/t_xK9mP2?title=Your+Post+Title`
3. Add it to your site's template — every post gets a branded card automatically

The title, author, and date are pulled from the URL parameters. Change the title parameter, get a different card. No Figma, no uploads, no manual work.

[Get started free →](/dashboard)
