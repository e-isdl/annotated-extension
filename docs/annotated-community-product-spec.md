# Annotated Community Product Specification

Status: proposed product direction

## 1. Product thesis

Annotated is a community for discussing things that already exist on the web.
Every post keeps the original source visible, identifies the exact passage or
moment being discussed, and gives the author a place to add a sharp reaction,
explanation, correction, or supporting evidence.

The product should use the complete, familiar shape of a modern Reddit-style
community product—home feeds, communities, profiles, posts, comments, votes,
saves, discovery, and creation—but its native object is an annotation rather
than a generic post:

> Find something worth discussing → preserve the context → add a point of view
> → let the community respond.

The Chrome extension is the capture surface. The web app is the destination,
community, and discovery engine. The web app is the priority for the bounty
demo.

## 2. The community model we are copying

We are copying the full interaction model because users already understand it.
Annotated keeps its own name, visual details, copy, source previews, and code;
the product behavior should remain immediately legible to a Reddit user:

- Communities organize recurring conversations around a topic.
- A home feed is personalized from followed communities and people.
- Popular, latest, and top views give users explicit control over discovery.
- Posts have a compact metadata row, a clear title or commentary, a source
  preview, and a predictable action row.
- Voting and comments are visible in the feed, not hidden behind a detail page.
- The post detail view makes comments easy to enter while retaining a compact
  context bar for the original post.
- Search and community discovery are first-class navigation, not afterthoughts.

Reddit's current help documentation describes five post sorts—Relevance, Hot,
Top, New, and Comment Count—and separate Home, Popular, News, and Latest feed
concepts. Annotated should begin with a smaller, comprehensible set: Home,
Popular, Latest, and Following. This keeps the model familiar without
pretending we already have Reddit-scale personalization.

References:

- [Reddit feed differences](https://support.reddithelp.com/hc/en-us/articles/360043043552-What-s-the-difference-between-r-all-r-popular-news-and-my-home-feed)
- [Reddit filters and sorts](https://support.reddithelp.com/hc/en-us/articles/19695706914196-What-filters-and-sorts-are-available)
- [Reddit communities](https://support.reddithelp.com/hc/en-us/articles/204533569-What-are-communities-or-subreddits)
- [Reddit posting and commenting](https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit)
- [Reddit community discovery](https://support.reddithelp.com/hc/en-us/articles/17881389378196-How-do-I-browse-and-find-communities-on-the-Reddit-app)

## 3. Target user experience

### First visit

An anonymous visitor should understand the product in five seconds:

1. The headline says what Annotated is: thoughtful reactions to things on the
   web.
2. The feed immediately shows attractive, believable example discussions.
3. Each post visibly connects commentary to a source quote, video moment, or
   preserved preview.
4. The visitor can read a discussion without signing in.
5. The visitor sees one clear action: join the conversation or create an
   annotation.

An empty database must never produce a dead product. Until there is real
community activity, a clearly labeled demo feed provides representative posts
and links to the capture workflow.

### Returning user

The recurring loop is:

1. Open Home and scan a ranked list of conversations.
2. Switch to Latest or Popular when the current feed is not enough.
3. Open a post, read the source context, and jump directly to the comments.
4. Vote, comment, save, follow the author, or follow the community.
5. Create an annotation from a URL or from the extension.

## 4. Information architecture

### Primary navigation

- Home: personalized feed from followed communities and people.
- Popular: highest-signal public discussions.
- Latest: newest public discussions.
- Explore: communities, topics, and trending sources.
- Search: posts, communities, users, and source domains.
- Create: compose a new annotation.
- Profile: posts, comments, saved posts, and followed communities.

### Desktop layout

At widths of 1100px and above:

- Left rail: brand, primary navigation, joined communities, and Explore link.
- Center column: feed or post detail, maximum width approximately 720px.
- Right rail: create prompt, trending communities, trending sources, and a
  short product explanation.

At widths below 1100px, the right rail collapses first. At mobile widths, the
left rail becomes a compact menu and the bottom action/navigation bar provides
Home, Explore, Create, Notifications, and Profile.

### Feed controls

The feed header contains:

- Current feed name and a one-line description.
- Sort tabs: Best, Hot, New, Top.
- Optional content filters: All, Articles, Video, Social, Audio.
- A compact “Create annotation” button.

The MVP ranking can use score, comment count, recency, and source diversity.
Ranking must be deterministic and explainable; personalization can be added
after the interaction loop is proven.

## 5. Post model: an annotation as a community post

Every post has these visible layers, in this order:

1. Metadata: community, author, relative time, source type.
2. Commentary headline or opening sentence: the author's point is the visual
   focus.
3. Context block: selected quote, screenshot/thumbnail, or video/audio preview.
4. Source title and domain, linked to the original.
5. Action row: vote score, comments, share, save, and overflow menu.

The author's commentary must never look like a caption under a generic link.
The source is evidence and context; the annotation is the post.

Supported source presentations:

- Article: selected quote plus source thumbnail and title.
- X/social post: preserved screenshot or safe embed plus source link.
- YouTube: timestamped playable preview plus transcript excerpt where
  available.
- Podcast/audio: playable excerpt plus source title.
- Link-only fallback: attractive domain card when richer capture fails.

The source card should include a visible “Open original” affordance and should
not pretend that an external embed is a permanent archive.

## 6. Post detail and conversation

The post detail page is the product's strongest screen and the primary bounty
demo target.

Order:

1. Back navigation and community breadcrumb.
2. Author, time, source type, and moderation menu.
3. Large annotation/commentary block.
4. Selected quote or media context with a thumbnail/screenshot.
5. Source title, domain, and Open Original action.
6. Vote/share/save controls.
7. Comment composer.
8. Sortable comment thread.

When a user enters from a comment action, the post context remains pinned in a
compact bar above the discussion. This follows Reddit's conversation-first
pattern while keeping the annotation's evidence in view.

Comments should support:

- Nested replies, with clear indentation and collapse affordances.
- Sort by Best, Top, and New.
- Optimistic posting with clear failure recovery.
- Vote state and score.
- Author identity and relative time.
- Shareable comment links later; not required for the first vertical slice.

## 7. Communities

Annotated uses “communities” or “channels,” not “subreddits.” A community is
a focused place for related annotations, such as:

- `c/technology`
- `c/startups`
- `c/ai`
- `c/media-literacy`
- `c/internet-culture`

Community page requirements:

- Name, handle, description, member count, and Join/Joined action.
- Featured or pinned discussion.
- Feed tabs: Best, New, Top.
- About panel with rules and moderators.
- Create action scoped to the community.
- Empty state that suggests a first post.

The first release can derive communities from existing data or a small seeded
catalog, but the data model should allow real community ownership and rules.

## 8. Create flow

The create flow should work without the extension so the public web app is
demonstrable:

1. Choose a community.
2. Paste a source URL or choose “Text discussion.”
3. Fetch lightweight metadata when possible: title, domain, image, and source
   type.
4. Select a post type: Reaction, Fact Check, Explainer, Steelman, or Receipts.
5. Add commentary.
6. Add a quote, screenshot, timestamp, or media context when available.
7. Preview the post exactly as it will appear.
8. Publish and immediately navigate to the permalink.

The extension can later populate steps 3 and 6 automatically. The web create
flow should still be useful when metadata extraction fails.

## 9. Identity, trust, and moderation

MVP:

- Google sign-in through Supabase.
- Public reading without sign-in.
- Sign-in required to post, vote, comment, save, or follow.
- Report content and file a source/copyright claim.
- Owner can delete their post.
- Community moderators and rules are modeled, even if moderation tooling is
  initially minimal.

Trust signals:

- Account age and post/comment history on profile.
- Community membership.
- Source domain and source type.
- Clear distinction between a quote, an embed, and the author's own words.
- Visible edit indicator when post editing is added.

## 10. Visual direction

The target is a modern Reddit-like community experience with Annotated's own
identity. We should keep the density, hierarchy, and posting rhythm familiar
while avoiding Reddit-owned assets, logos, or copied implementation details:

- A near-black neutral surface with one orange action/selection accent.
- A native system sans for the social UI; compact metadata, readable titles,
  and generous line-height for quoted context.
- A consistent source preview that makes the original material inspectable.
- Strong typography hierarchy: title first, annotation second, source third,
  metadata and actions last.
- Dark mode first, with a light theme possible later.
- Rounded surfaces used sparingly; avoid a dashboard full of floating cards.
- Real thumbnails and source domains to make the feed feel alive and credible.

The visual test is whether a screenshot makes someone want to open a post and
read the argument, not merely admire the UI.

## 11. MVP acceptance criteria

The bounty-ready web experience is complete when:

- A visitor can browse a populated feed without signing in.
- Feed tabs switch between Best, Hot, New, and Top with loading and empty
  states.
- The desktop layout has a useful center feed plus navigation/context rails.
- A post makes the commentary, selected context, and source relationship
  obvious in one viewport.
- A visitor can open a post and reach comments immediately.
- A signed-in user can create a post from a URL, choose a type, preview it,
  publish it, and land on its permalink.
- A signed-in user can vote, comment, follow a community, save a post, and
  share a permalink.
- Article, video, and social-source cards have distinct, credible previews.
- The app remains useful when Supabase has no seeded content.
- The app works on a narrow mobile viewport.
- No secret is shipped to the browser beyond the Supabase URL and public anon
  key.
- Production build succeeds and the deployed URL is usable without local setup.

## 12. What is deliberately deferred

- Full Reddit-scale recommendation ML.
- Private communities and moderator dashboards.
- Chat, awards, ads, premium subscriptions, and karma economics.
- Arbitrary scraping of third-party pages.
- Automatic fact-checking claims presented as authoritative truth.
- Extension polish beyond the capture path needed for the demo.

The first win is a believable community with a beautiful, context-rich
conversation loop. Scale features come after that loop feels alive.
