# Business page

`/intent/business` (formerly the Build hub; `/intent/build` redirects). The page is available to signed-in members who pass the existing profile gate. It does not require a feature flag. Request resolution requires the API deployment and migration 068 before the web release.

<!-- Former release gate, retained for history: VITE_ENABLE_BUILD_INTENT_PAGE=true. -->

## What's on it

- **Search:** opens Ask (`/match?q=`).
- **Shortcuts:** four buttons that open Ask with a starter sentence typed in and not yet searched (`/match?draft=…`, plus `cat=founder_advice` for talent and advice):
  - Find customers & partners
  - Find talent & co-founders
  - Get expertise & advice
  - Find suppliers & services

  Raise capital is parked until the fundraising journey is designed.
- **Relevant opportunities:** Wall posts in the Startups category, shown with the Wall's own rows. Tabs:
  - All
  - Needs (Ask posts)
  - Offers (Offer posts)

  "Post a request" opens the Wall composer with Startups and Ask chosen, so one post shows on Business and on the Wall.
- **Your business (side column):**
  - **Your requests:** your open Startups posts, each with its step.
  - **Reachouts waiting for you** and **Your reachouts:** the cards shared with Careers and Home.

## Which posts count as Business

A post counts when its author picked Startups. Posts with no picked category fall back to the Wall's sorting, where collaboration posts land in Startups. The Wall itself sorts a post mentioning "moving", "city" or "housing" under Relocation even when Startups was picked; Business doesn't follow that.

## Progress steps (option A2)

Open → Has replies → Resolved or Closed.

- **Has replies:** comes from the existing reply count, so nothing new is stored.
- **Resolved:** only the author resolves, choosing Got help here, Sorted elsewhere or No longer needed. The post closes with `closed_reason = 'resolved'` and `resolved_outcome` (migration `068_intentcast_resolved.sql`), and leaves the feed like any closed post.
- **Not built:** naming who helped, the "Still looking?" prompt, fundraising, relevance badges and mutual connections.
