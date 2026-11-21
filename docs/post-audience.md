# Wall post audience

When creating a post, the author can narrow who sees it. The default is Everyone on Alma Mater.

## Choices

- **Institute**: a selector. "All institutes" is the default, and any allowed institute can be picked, not only the author's own. An institute covers every allowed email domain listed for it in `DOMAIN_DIRECTORY` (for example, IIT Bombay is `iitb.ac.in` + `iitbombay.org`).
- **Batch, Department, City**: checkboxes that copy the author's own values.
  - Batch is the batch year.
  - Department is the approved department code. "Other" can't be picked.
  - City is the linked, approved city, resolved through city merges.
- Choices combine with AND. Batch, department and city match across all institutes unless an institute is also picked.
- Every composer has the picker: the Wall dialog (`PostBulletinFlow`), Hiring (`PostRoleHiringFlow`) and the inline composer in `BulletinPanel`.

## Rules

- The audience is stored on the post at posting time (migration `067_post_audience.sql`) and can't be changed afterwards.
- Viewers are matched on their **current** profile. A member with no value for a picked part (for example, no linked city) doesn't match.
- The author always sees their own post.
- **Admins see every post.** "Admin" means the signed-in actor's role is `admin` or `super_admin`; it never comes from the request. Admins see restricted posts in the feed, on the Home Wall, via a shared link and on the city page, each with its "Visible to: …" label.
- **Replying stays audience-bound, even for admins.** An admin outside the audience gets the same 404 on `/respond` as anyone else.
- Members outside the audience never see the post anywhere:
  - not in the feed;
  - not via a shared link (404);
  - not on the city page;
  - and they can't reply (the same 404 as for a missing post).
- A post that would reach no one else is refused:
  - the composer blocks Preview and Publish;
  - the server returns 422 `AUDIENCE_EMPTY`.
- The size shown while composing is rounded:
  - none;
  - fewer than 10;
  - nearest 10 below 100;
  - nearest 50 below 1000;
  - nearest 100 above that.
- A narrowed post shows "Visible to: …" on its card, in the preview and on the city page. Everyone posts show no label.
- **Home Wall pins:** an admin can pin a restricted post. Pinning never widens the audience: members outside it still don't see the post, pinned or not. The pinned card shows "Visible to: …" next to "Pinned", so the admin can see the slot is narrowed.
- **Automatic expiry stays paused (#244).** None of the audience reads filter on `expires_at`.
- Analytics record only which parts were picked (`audience: ["batch", "city"]` or `["everyone"]`), never the values.

## Where the rule lives

- `apps/api/src/lib/postAudience.ts`: `audienceVisibleSql(i, vp, { viewerIsAdmin })` and `isAdminRole`.
  - With the admin flag: the feed including the Home Wall (`listFeed`), the shared link (`findFeedItemVisibleToViewer`), the pin check (`setWallPin`, admins only) and city page posts (`citiesRepo.cityPosts`).
  - Without the admin flag: the reply check (`isInAudience`).
- `apps/api/tests/postAudienceUnit.test.ts` has a guard. It fails if a new file starts reading `intentcasts` without being reviewed. It also fails if a reviewed reader stops using the rule, if a post-serving reader drops the admin flag, or if the reply check gains it. The reviewed readers are `analyticsRepo` (admin aggregates), `citiesRepo`, `intentcastRepo` and `intentcastService` (pin locking only).
- `apps/api/tests/postAudience.e2e.test.ts` checks each read path against a database. It needs a disposable test database.

## Rollback

- **Web only:** safe. The API keeps enforcing the audience and the posts keep their labels in the data.
- **API rolled back:** the old API ignores the columns, so narrowed posts would show to everyone. Before rolling back the API, close narrowed posts with `docs/ops/post-audience-close-narrowed.sql`. That needs separate approval. Closing a post also clears its Home Wall pin, through the pinning trigger.
- Don't drop the columns: they are the record of who each post was meant for.
