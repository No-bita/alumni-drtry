# WhatsApp pilot: setup guide

The bot is an **entry point**. It sends new people to the website to sign up, and helps returning members ask for a referral. Everything else stays on the website. It is **off by default** (`WHATSAPP_ENABLED=false`).

## What it does

| Who | They text | The bot replies (one message) |
|---|---|---|
| New number | anything | "Join Alma Mater" button → website sign-in, then "Link WhatsApp ending 3210 to your account?", then onboarding |
| Linked, onboarding not finished | anything | "Finish profile" button → website |
| Member | hi | Menu: **Ask for a referral** (+ **Pause/Resume WhatsApp notes** if they get notes here) |
| Member, after "Ask for a referral" | "Razorpay, product manager" | Top 3 matches, each with a short "Send a note" link (`/w/<code>`; the note is written on the website), and a **Back to menu** button |
| Member, still in search | another "company, role" | Searches again (no "hi" needed). Directory and known names are recognised first; otherwise the reply is read as "company, role": everything before the comma ("acme labs, pm" → Acme Labs), or the whole message when it names no role ("meesho"). "hi" or "menu" (or the button) returns to the menu |
| Member | taps "Send a note" | The website opens with the bot's reading (company, referral) and that alum's note box, even if they're no longer in the list |
| Alum who opted in | taps a button on a note | Accept, share WhatsApp · Accept, share email · Decline → short confirmation |
| Number linked to a closed account | anything | A short note that the number can't be used (no link) |
| Anyone | STOP / START | No WhatsApp messages from us / turn them back on |

Links from the bot are short (`https://<web>/w/k3x9Qa7Z`). The code stands for a signed link (which number it was sent to) and where to go next, both kept in the database (`wa_short_links`, migration 052) for 24 hours. The chat never shows the phone number.

## Costs (India, Meta pricing since 1 Oct 2026; check Meta's rate card before budgeting)

| Message | Cost |
|---|---|
| Anything people send us | Free |
| Our replies within 24 hours of their message ("service") | First 1,000 per number per month free, then about ₹0.115 each (+18% GST) |
| The note to an alum (utility template) | About ₹0.115 each (+18% GST) |

The bot only ever replies, and sends one reply per message. The only paid message is the note template, capped at `WA_MONTHLY_TEMPLATE_CAP` a month (default 300, about ₹41). Past the cap, notes go by email. If WhatsApp later reports a note as failed, the alum is emailed instead. If WhatsApp doesn't answer in time, the alum is emailed at once (in rare cases they get both), and the note counts toward the cap. The asker hears "accepted" on WhatsApp only when their 24-hour window is open (free). Otherwise they hear by email, as before. Reminders stay on email.

## 1. Meta accounts (one-time)

1. **Meta Business portfolio:** create one at business.facebook.com, or use an existing one.
2. **Developer app:** at developers.facebook.com → My Apps → Create app → choose *Business* → add the **WhatsApp** product.
3. **Try it first with Meta's test number.** It can message up to 5 numbers you verify, which is enough for a dry run.
4. **Add the real number.** WhatsApp Manager → Phone numbers → Add.
   - Use a number that is **not** registered on the WhatsApp or WhatsApp Business app (a spare SIM works). Verify it by SMS or a call.
   - Set the **display name**, for example "Alma Mater". Meta reviews it.
   - Note the **Phone number ID**: it goes in `WA_PHONE_NUMBER_ID`.
5. **Permanent access token.**
   - In Business settings → Users → **System users**, add a system user.
   - Assign it the app and the WhatsApp account.
   - Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`. It goes in `WA_ACCESS_TOKEN`.
6. **App secret:** App settings → Basic → App secret. It goes in `WA_APP_SECRET`, and verifies every webhook call.
7. **Payment method:** add it to the WhatsApp account, billed in INR, so the note templates can be sent.
8. **Business verification:** not needed for the pilot. A new account can start 250 conversations a day.

## 2. Webhook

- **Callback URL:** `https://<your API host>/v1/whatsapp/webhook`
- **Verify token:** any long random string. Put the same value in `WA_VERIFY_TOKEN`.
- **Subscribe** to the **messages** field. It carries messages and delivery statuses.

Meta calls the URL once to verify it. The API answers only when `WHATSAPP_ENABLED=true` and the token matches.

## 3. The note template (submit in WhatsApp Manager → Message templates)

- **Name:** `alum_referral_note` (or set `WA_TEMPLATE_NOTE`)
- **Category:** Utility. Meta may re-classify it. If it becomes Marketing, each note costs about 7× more, so check after approval.
- **Language:** English (`en`, or set `WA_TEMPLATE_LANG`)
- **Body:**

  ```
  New note on Alma Mater from {{1}}:

  "{{2}}"

  Would you like to connect? Your contact is shared only if you accept.
  ```

  Sample values: `{{1}}` = `Asha Rao ('22)`, `{{2}}` = `Hi! Could you refer me for the PM role at your company?`
- **Buttons:** three **Quick reply** buttons, in this order:
  1. `Accept, share WhatsApp`
  2. `Accept, share email`
  3. `Decline`

The API fills in the button payloads (`cr:<note id>:accept_wa` / `accept_email` / `decline`). The order must match.

## 4. Environment (API on Railway)

| Variable | Value |
|---|---|
| `WHATSAPP_ENABLED` | `true` (the API refuses to start without the next four) |
| `WA_PHONE_NUMBER_ID` | from step 1.4 |
| `WA_ACCESS_TOKEN` | from step 1.5 |
| `WA_APP_SECRET` | from step 1.6 |
| `WA_VERIFY_TOKEN` | from step 2 |
| `WA_BOT_NUMBER` | the bot's number, digits only, e.g. `919876543210` (used for "Open WhatsApp" links on the website) |
| `WA_TEMPLATE_NOTE` / `WA_TEMPLATE_LANG` | only if you changed them |
| `WA_MONTHLY_TEMPLATE_CAP` | `300` (default) |
| `WA_GRAPH_VERSION` | default `v23.0`. Set it to the current Graph API version shown in Meta's docs |

Migration 051 runs on deploy.

## 5. Pilot checklist

1. Dry run with the test number: text **hi**, join, onboard, text **hi** again, ask for a referral, send a note, and accept it from a second phone.
2. Switch to the real number. Post a link in 2–3 batch groups: `https://wa.me/<WA_BOT_NUMBER>?text=hi`.
3. Ask a few alumni to switch on **"Get referral asks on WhatsApp"**, on their profile or during onboarding.
4. Watch **Analytics → WhatsApp pilot**:
   - Test 1: WhatsApp vs email accept rate and reply time.
   - Test 2: onboarding finish rate, WhatsApp arrivals vs website.
   - Free replies used, paid messages used, and estimated spend.

**Go / no-go:**

- **Alum replies:** after 30+ WhatsApp notes, go if the accept rate beats email by 15+ points, or the median reply time is half of email's or less.
- **Onboarding:** WhatsApp arrivals must finish 20+ points more often than website arrivals.

## Turning it off

Set `WHATSAPP_ENABLED=false`. The webhook stops answering. Notes go back to email for everyone, and nothing else changes.

## Privacy

- **Message text is not stored.** Only the message type, delivery status and cost category are kept.
- **Phone numbers are hidden** from other members, except when an alum chooses "Accept, share WhatsApp" on a note.
- **Numbers never move.** Each website link from the bot works once, and the website asks "Link WhatsApp ending 3210?" first. A linked number stays with its member, and a member keeps their first number.
- **Unlinking by hand (admin).** To free a number, run in the database:

  ```sql
  UPDATE wa_contacts SET person_id = NULL, notes_opted_in_at = NULL, notes_paused_at = NULL, state = '{}'::jsonb
  WHERE wa_id = '<number, digits only>';
  ```

  The member then texts hi from the number they want and links it again.
