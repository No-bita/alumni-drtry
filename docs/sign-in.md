# Sign-in: staying signed in, signing out everywhere

## How long people stay signed in

Signing in (email code, email link or Google) creates a session on that device:

| Setting (API) | Default | Meaning |
|---|---|---|
| `SESSION_SLIDING_HOURS` | `168` (7 days) | Signed out after 7 days without using the site. Each visit pushes this out again. |
| `SESSION_HARD_CAP_HOURS` | `720` (30 days) | Every session ends 30 days after sign-in, however often it's used. |

So a regular visitor sees the email code about once a month per device. Existing sessions pick up the new limits the next time they're used. If Render sets either variable, Render's value wins: remove it or set it to the values above.

## Sign out of all devices

On your own profile, under **Sign out**: **Sign out of all devices** asks once, then ends every session for your account (`POST /v1/auth/logout-all`), including the current one. The shared demo account doesn't get this option, since it would sign out everyone using it.
