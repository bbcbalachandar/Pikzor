---
title: How to Add OG Images to Your Next.js Blog in 5 Minutes
date: 2026-04-05
author: Pikzor Team
description: A step-by-step guide to adding dynamic OG images to every post on your Next.js blog using Pikzor.
tag: Tutorial
---

If you're running a Next.js blog, you're already ahead of most developers. But if you don't have dynamic OG images set up, you're leaving clicks on the table every time someone shares your posts.

This guide walks you through adding automatic, branded OG images to every blog post in about 5 minutes — using Pikzor so you don't have to maintain any image generation code yourself.

## Step 1: Sign up and get your token

Go to [Pikzor](/dashboard), create a free account, and complete the setup:

1. Enter your brand color (hex code from your site)
2. Choose a card template (we recommend **Gradient** or **Minimal** for blogs)
3. Copy your token URL — it looks like `/og/t_xK9mP2?title=...`

## Step 2: Add it to your Next.js layout

In Next.js 13+ with the App Router, open your `app/blog/[slug]/page.tsx`:

```typescript
import type { Metadata } from 'next'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug)

  const ogImageUrl = new URL('https://pikzor.com/og/t_xK9mP2')
  ogImageUrl.searchParams.set('title', post.title)
  ogImageUrl.searchParams.set('author', post.author)

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImageUrl.toString()],
    },
  }
}
```

Replace `t_xK9mP2` with your actual token from the Pikzor dashboard.

## Step 3: Using the Pages Router?

If you're on Next.js Pages Router, use `next/head` in your blog post template:

```jsx
import Head from 'next/head'

export default function BlogPost({ post }) {
  const ogImageUrl = `https://pikzor.com/og/t_xK9mP2?title=${encodeURIComponent(post.title)}&author=${encodeURIComponent(post.author)}`

  return (
    <>
      <Head>
        <title>{post.title}</title>
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      {/* post content */}
    </>
  )
}
```

## Step 4: Test it

Use the [OG Checker](/checker.html) to verify your OG tags are working. Paste in the URL of one of your blog posts and you should see:

- ✅ og:image found
- ✅ og:image is accessible
- ✅ og:image is 1200×630px
- ✅ twitter:card is set

## How the caching works

Pikzor generates the image on first request, then caches it for 30 days. So the first time someone shares your post, there's a ~2 second delay while the image renders. Every subsequent request returns the cached image instantly.

This means your site's performance is never affected — the image URL is just like any other CDN URL after the first hit.

## Adding a date parameter

You can also pass a `date` parameter:

```
https://pikzor.com/og/t_xK9mP2?title=My+Post&author=Jane&date=April+5%2C+2026
```

This shows up in the card footer, which makes it look more like a real article preview.

## Template options

Pikzor has 5 templates. Here's which ones work best for different use cases:

| Template | Best for |
|----------|----------|
| Minimal  | Clean, text-heavy blogs |
| Gradient | Visual, modern tech blogs |
| Split    | Corporate or business blogs |
| Bold     | High-impact announcements |
| Light    | Lightweight, readable design |

You can switch templates at any time from your dashboard — all existing URLs continue to work, but new renders will use the new template.

## What about static sites?

If you're using a static site generator (Astro, Eleventy, Hugo), you can set the `og:image` meta tag in your template the same way. Just construct the URL with the post's frontmatter title and author:

```html
<!-- In your base template -->
<meta property="og:image" 
  content="https://pikzor.com/og/t_xK9mP2?title={{ title | url_encode }}&author={{ author | url_encode }}" />
```

The variable syntax varies by framework, but the concept is the same everywhere.

---

Questions? Use the [OG Checker](/checker.html) to debug your implementation, or check the [docs](/docs) for the full API reference.
