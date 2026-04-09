# How to Add Dynamic OG Images to Any Website in 5 Minutes

Ever shared a link on Twitter and watched it show up as a sad little URL with no preview? Or worse — a tiny stretched logo that makes your site look like it was built in 2004?

That preview card you see when someone shares a link — the one with the image, title, and description — is controlled by something called an Open Graph image (or OG image). And if you're not setting it up properly, you're leaving clicks on the table.

Let's fix that in 5 minutes.

## What's an OG image, exactly?

When you paste a URL into Twitter, LinkedIn, Slack, Discord, or pretty much any messaging app, the platform crawls your page and looks for specific HTML meta tags. These tags tell the platform: "Here's the title. Here's the description. And here's the image to show."

That image is your OG image. It's the first thing people see before deciding whether to click your link.

A good OG image can be the difference between someone scrolling past your link and actually clicking it. Think about your own behavior — when you see a link with a clean, branded preview card versus one with a gray box or a pixelated logo, which one are you more likely to click?

## The meta tags you need

Open Graph images work through HTML meta tags in the `<head>` section of your page. Here's the minimum set you need:

```html
<head>
  <meta property="og:title" content="How We Grew to 10K Users in 6 Months" />
  <meta property="og:description" content="The exact playbook we used to go from zero to 10,000 users without spending a dollar on ads." />
  <meta property="og:image" content="https://yoursite.com/images/og-grow-10k.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="https://yoursite.com/blog/grow-to-10k" />
  <meta property="og:type" content="article" />
</head>
```

For Twitter specifically, you also want these:

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="How We Grew to 10K Users in 6 Months" />
<meta name="twitter:description" content="The exact playbook we used..." />
<meta name="twitter:image" content="https://yoursite.com/images/og-grow-10k.png" />
```

The `summary_large_image` card type is what gives you that big, full-width preview image on Twitter instead of a tiny square thumbnail.

## What size should your OG image be?

The recommended size is **1200 x 630 pixels** with a 1.91:1 aspect ratio. This works well across all major platforms: Twitter, LinkedIn, Facebook, Discord, Slack, and WhatsApp.

A few things to keep in mind:

- Use PNG or JPG format. PNG looks sharper, JPG has smaller file sizes.
- Keep important text and visuals away from the edges — some platforms crop slightly.
- Keep the file size under 1MB. Large images load slowly and some platforms will skip them entirely.
- Always use absolute URLs (starting with `https://`) for the image path, not relative ones. Relative URLs are the number one reason OG images don't show up.

## Three ways to add OG images to your site

### Approach 1: One static image for your entire site

This is the simplest approach. You create one OG image — usually your logo on a branded background — and use it everywhere.

```html
<meta property="og:image" content="https://yoursite.com/images/default-og.png" />
```

**Pros:** Takes 2 minutes. Better than having no image at all.

**Cons:** Every page on your site shares the same preview image. When someone shares your blog post about pricing strategies, it looks identical to someone sharing your about page. People can't tell what the link is about from the preview.

This approach works for a personal portfolio or a simple landing page. For anything with multiple pages of content, you want something better.

### Approach 2: Manually design an image for each page

Open Canva or Figma, create a 1200x630 image with the blog post title, your branding, maybe an icon. Save it. Upload it. Reference it in the meta tag.

```html
<!-- blog/grow-to-10k.html -->
<meta property="og:image" content="https://yoursite.com/images/og/grow-to-10k.png" />

<!-- blog/pricing-strategy.html -->
<meta property="og:image" content="https://yoursite.com/images/og/pricing-strategy.png" />
```

**Pros:** Each page gets a unique, polished preview image.

**Cons:** It takes 10-15 minutes per image. If you have 50 blog posts, that's 8+ hours of design work. Nobody maintains this consistently. You'll do it for the first 5 posts and then stop.

### Approach 3: Dynamic OG images via URL (the smart way)

Instead of creating images manually, you use a service that generates them on-the-fly from a URL. You pass your title, author, and brand color as URL parameters, and the service returns a PNG image.

The concept is simple. Instead of pointing your meta tag at a static file:

```html
<meta property="og:image" content="https://yoursite.com/images/og/some-file.png" />
```

You point it at a URL that generates the image dynamically:

```html
<meta property="og:image" content="https://api.example.com/og?title=How+We+Grew+to+10K+Users&author=Sarah+Chen&theme=dark" />
```

When Twitter or LinkedIn hits that URL, the service renders a beautiful card image with your title and branding, and returns the PNG. The image is cached, so subsequent requests are instant.

**Pros:** Zero manual work per page. Every page gets a unique image. Add a new blog post and the OG image exists automatically. Change your branding once and all images update.

**Cons:** You depend on an external service (or need to host your own rendering engine).

## How to implement dynamic OG images

### In plain HTML

If you have a static HTML site, you set the meta tag manually per page — but the image URL is dynamic:

```html
<head>
  <meta property="og:image" 
    content="https://api.example.com/og?title=My+Blog+Post&author=John&color=3B82F6" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" 
    content="https://api.example.com/og?title=My+Blog+Post&author=John&color=3B82F6" />
</head>
```

### In Next.js (App Router)

With Next.js, you can set OG images dynamically using the metadata export in your page or layout files:

```javascript
// app/blog/[slug]/page.js
export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  
  const ogImageUrl = `https://api.example.com/og?${new URLSearchParams({
    title: post.title,
    author: post.author,
    date: post.date,
    color: '3B82F6'
  })}`;

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        }
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [ogImageUrl],
    },
  };
}
```

This generates a unique OG image URL for every blog post automatically. When you publish a new post, the OG image just works — no extra steps.

### In any JavaScript framework

If you're using Astro, Nuxt, SvelteKit, or any other framework, the pattern is the same. Build the URL with your dynamic data and inject it into the head:

```javascript
// Generic approach — works anywhere
function getOGImageUrl(title, author) {
  const params = new URLSearchParams({
    title: title,
    author: author,
    color: '3B82F6',
    theme: 'dark'
  });
  return `https://api.example.com/og?${params.toString()}`;
}

// Use it in your template/layout
const ogImage = getOGImageUrl(post.title, post.author);
// Then inject into <meta property="og:image" content="${ogImage}" />
```

## How to test your OG images

After adding the meta tags, you need to verify they work. Social platforms cache aggressively, so if your old preview was broken, you need to force a refresh.

Use these free debuggers:

- **Twitter Card Validator**: cards-dev.twitter.com/validator — paste your URL, see the preview
- **Facebook Sharing Debugger**: developers.facebook.com/tools/debug — paste your URL, click "Scrape Again" to refresh the cache
- **LinkedIn Post Inspector**: linkedin.com/post-inspector — paste your URL, see the preview
- **opengraph.xyz**: paste any URL and see all OG tags at once

Common issues to check:

- Is the og:image URL an absolute URL (starts with https://)?
- Is the image actually accessible? Try opening the URL directly in your browser.
- Is the image at least 1200x630? Smaller images may show as tiny thumbnails or not at all.
- Did you include `twitter:card` set to `summary_large_image`? Without this, Twitter shows a tiny square instead of a large card.

## Stop wasting time designing OG images

If you don't want to deal with building your own rendering pipeline, tools like [Pikzor](https://pikzor.com) let you generate dynamic OG images by just picking a template and dropping a URL into your meta tags — no design work, no API code, done in 2 minutes.

Whatever approach you pick, just make sure every page on your site has an OG image. Your links will get more clicks, your content will look more professional, and you'll never have to stare at that ugly gray box again.
