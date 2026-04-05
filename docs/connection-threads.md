# Connection threads (soft conversations)

Alumni reach-outs create a **connection thread**: a short on-platform exchange before any contact is shared. Legacy **contact requests** (single note, accept/decline, one shared email) remain in the inbox for older rows.

## Behavior

- **Messages**: Participants send text messages in the thread. There is **no hard message cap** in v1; abuse can be addressed later with caps or moderation.
- **Nudge**: After **four or more messages** in the thread (total, both sides), each participant may see a dismissible prompt to share contact. Dismissing records the count; **new messages** can surface the nudge again until they share something or the thread closes.
- **Selective disclosure**: Sharing is optional and **per channel** (institutional email, personal email if on profile, profile links whose platform name includes “LinkedIn”). Only chosen fields are visible to the other party.
- **End states**: A thread can be **closed** or **declined** without sharing contact.

## Trust and safety

- Prefer **report/block** flows aligned with your broader product policy (same as directory and bulletin).
- **Retention**: Define message and thread retention with your privacy policy and ops practice; this doc does not set a fixed window.

## Routes and API

- **Web**: `/connections/:threadId` for the thread UI; Home sidebar lists open threads; Notifications deep-link for new replies.
- **API**: `/v1/connection-threads` (create/list/detail), `.../messages`, `.../disclose`, `.../nudge/dismiss`, `.../close`.
