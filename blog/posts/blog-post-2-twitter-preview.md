# Why Your Link Preview Looks Ugly on Twitter (And How to Fix It)

You just published a blog post you're proud of. You share it on Twitter. And then you see it — a tiny logo, no description, or worse, a completely blank card with just the URL. Meanwhile, every other link in your feed has a clean, full-width preview image with a title and description.

What went wrong?

The answer is almost always one of five things. Let's go through each one and fix it.

## How Twitter link previews actually work

When you paste a URL into a tweet, Twitter sends a bot (called "Twitterbot") to crawl your page. This bot reads your HTML and looks for specific meta tags called Open Graph tags and Twitter Card tags. These tags tell Twitter: "Here's the title to display, here's the description, and here's the image."

If the bot can't find these tags, or finds them but something is wrong, your link preview either looks broken or doesn't show up at all.

Here's what a properly configured set of tags looks like:

```html
<head>
  <!-- Open Graph tags (used by LinkedIn, Facebook, Slack, Discord) -->
  <meta property="og:title" content="Your Page Title" />
  <meta property="og:description" content="A short description of what this page is about." />
  <meta property="og:image" content="https://yoursite.com/images/og-card.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="https://yoursite.com/your-page" />

  <!-- Twitter-specific tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Your Page Title" />
  <meta name="twitter:description" content="A short description of what this page is about." />
  <meta name="twitter:image" content="https://yoursite.com/images/og-card.png" />
</head>
```

If any of these are missing or misconfigured, things break. Here are the five most common reasons.

## Problem 1: You have no og:image tag at all

This is the most common issue. You wrote a blog post, hit publish, and never added an OG image meta tag. Twitter has nothing to show, so you get either a blank card or a tiny link with just text.

**The fix:**

Add an og:image meta tag pointing to an image URL. At minimum:

```html
<meta property="og:image" content="https://yoursite.com/images/my-image.png" />
<meta name="twitter:image" content="https://yoursite.com/images/my-image.png" />
```

If you're using WordPress, install the Yoast SEO plugin or RankMath — both let you set OG images through the editor without touching code.

If you're using a static site generator like Next.js, Astro, or Hugo, you'll need to add these tags to your page template or layout file.

## Problem 2: Your image is too small

Twitter has minimum size requirements for the large card preview. If your image is smaller than 300x157 pixels, Twitter may not show it at all. If it's between 300px and 600px wide, Twitter will show a small thumbnail instead of the full-width card.

**The fix:**

Use an image that is exactly **1200 x 630 pixels**. This is the standard OG image size that works across all platforms — Twitter, LinkedIn, Facebook, Discord, Slack, and WhatsApp.

Also include the width and height meta tags — some platforms use these to pre-allocate space for the image before it loads:

```html
<meta property="og:image" content="https://yoursite.com/images/og-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

## Problem 3: You're missing the twitter:card tag

This is the sneaky one. You might have og:image set up perfectly, but your Twitter preview still shows a tiny square thumbnail instead of a big full-width card.

The reason: Twitter defaults to `summary` card type, which shows a small square image on the left with text on the right. To get the big, beautiful full-width preview, you need to explicitly set the card type to `summary_large_image`.

**The fix:**

```html
<meta name="twitter:card" content="summary_large_image" />
```

That single line is the difference between this:

```
[tiny square] Title
              Description
              yoursite.com
```

And this:

```
┌─────────────────────────────────┐
│      [BIG FULL-WIDTH IMAGE]     │
├─────────────────────────────────┤
│ Title                           │
│ Description                     │
│ yoursite.com                    │
└─────────────────────────────────┘
```

Always use `summary_large_image`. There's virtually no reason to use the small card format.

## Problem 4: You're using a relative URL instead of an absolute URL

This one trips up a lot of developers. Your OG image tag looks fine in your code:

```html
<!-- This DOES NOT work -->
<meta property="og:image" content="/images/og-card.png" />
```

But Twitter's bot sees `/images/og-card.png` and has no idea what domain that belongs to. It can't resolve it, so no image shows up.

**The fix:**

Always use the full, absolute URL starting with `https://`:

```html
<!-- This works -->
<meta property="og:image" content="https://yoursite.com/images/og-card.png" />
```

If you're building the URL dynamically in JavaScript or a framework, make sure you're prepending your domain:

```javascript
// Wrong
const ogImage = `/images/og/${post.slug}.png`;

// Right
const ogImage = `https://yoursite.com/images/og/${post.slug}.png`;
```

This is especially common in Next.js and Astro projects where developers forget to add the `NEXT_PUBLIC_SITE_URL` or equivalent base URL to their image paths.

## Problem 5: Twitter is showing a cached old version

You fixed all the tags, tested locally, everything looks perfect. But when you share the link on Twitter, it still shows the old broken preview.

This happens because Twitter aggressively caches link previews. Once it crawls your page and stores the preview, it doesn't re-crawl for a while — sometimes hours, sometimes days.

**The fix:**

Force Twitter to re-crawl your page using the Twitter Card Validator:

1. Go to **cards-dev.twitter.com/validator** (or search "Twitter Card Validator")
2. Paste your URL
3. Click "Preview card"

This forces Twitter to fetch the page fresh and update its cache. You should see your new preview image appear immediately. If it still shows the old version, wait 5 minutes and try again.

For Facebook and LinkedIn, they have their own cache-clearing tools:

- **Facebook**: developers.facebook.com/tools/debug — paste your URL, click "Scrape Again"
- **LinkedIn**: linkedin.com/post-inspector — paste your URL

Pro tip: if you're actively developing and testing OG images, add a cache-busting query parameter to your image URL:

```html
<meta property="og:image" content="https://yoursite.com/images/og-card.png?v=2" />
```

Change `v=2` to `v=3` each time you update the image. This forces every platform to treat it as a new URL and fetch the fresh version.

## Quick debugging checklist

Before you share any important link, run through this:

1. Open your page in a browser and view the page source (Ctrl+U or Cmd+U). Search for `og:image`. Is it there? Is it an absolute URL?

2. Open the og:image URL directly in your browser. Does the image load? Is it the right image?

3. Is the image at least 1200x630? Check the dimensions.

4. Do you have `twitter:card` set to `summary_large_image`?

5. Run the URL through a debugger tool. Try opengraph.xyz — it shows all your OG tags in one place and flags issues.

You can also check from the command line:

```bash
curl -s https://yoursite.com/your-page | grep -i "og:image\|twitter:image\|twitter:card"
```

This shows you exactly what the crawlers will see.

## The lazy way to fix all of this

If you have a site with dozens or hundreds of pages and you don't want to manually create and maintain OG images for each one, tools like [Pikzor](https://pikzor.com) generate dynamic OG images automatically — you pick a template, drop one URL into your meta tag, and every page gets a unique preview card.

Whatever you do, don't leave your links looking broken. Every time someone shares your content with a missing or ugly preview, you're losing clicks. It takes 5 minutes to fix, and once it's set up, you never have to think about it again.
