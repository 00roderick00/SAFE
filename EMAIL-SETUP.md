# Auth email — AgentMail SMTP

Supabase Auth (project `cqacfzkyxmtmjzpksznj`) sends its magic-link / OTP /
confirmation emails through **AgentMail** custom SMTP. This replaces the
built-in Supabase mailer (which was rate-limited to ~2 emails/hour and
sent from a `supabase.io` address).

Verified working: a triggered magic-link is delivered from
`SAFE <safe@agentmail.to>`.

## SMTP settings (non-secret)

| Field | Value |
|-------|-------|
| Host | `smtp.agentmail.to` |
| Port | `465` (implicit TLS/SSL). `587` (STARTTLS) also works if needed. |
| Username | `safe@agentmail.to` (the AgentMail inbox address) |
| Password | AgentMail **API key** — see "The secret" below |
| Sender name | `SAFE` |
| From / admin email | `safe@agentmail.to` (must equal the inbox — AgentMail rejects a mismatched `From`) |
| Auth email rate limit | `30` / hour |

These live in Supabase Auth config (`smtp_host`, `smtp_port`, `smtp_user`,
`smtp_pass`, `smtp_sender_name`, `smtp_admin_email`, `rate_limit_email_sent`).

## The secret (API key)

The AgentMail API key is the SMTP **password**. It lives **only** in the
Supabase Auth config — it is **not** in this repo, not in `.env*`, not in
any code, and must never be committed. It was set via the Supabase
Management API (see below) and is stored server-side by Supabase.

- Get/rotate keys in the AgentMail console: **Dashboard → API Keys**
  (a valid key has an `am_us_…` prefix; an `Am_us_inbox_…` value is an
  *inbox id*, not an API key, and will fail SMTP auth with `535`).
- The inbox address is under **Dashboard → Inboxes**.

## How to change / rotate the key

Two options. **Send all SMTP fields together**, and note `smtp_port` must be
a **string** — the API rejects a numeric port.

### A. Supabase dashboard (simplest)
Authentication → Emails → **SMTP Settings** → update the password (and any
other field) → Save.

### B. Supabase Management API
Requires a Supabase access token (the CLI stores one after `supabase login`;
on macOS it's in the login keychain under service "Supabase CLI"). Then:

```bash
# TOKEN = your Supabase personal access token
# NEWKEY = the new AgentMail API key (never echo/commit it)
curl -s -X PATCH \
  "https://api.supabase.com/v1/projects/cqacfzkyxmtmjzpksznj/config/auth" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{
    "smtp_host": "smtp.agentmail.to",
    "smtp_port": "465",
    "smtp_user": "safe@agentmail.to",
    "smtp_pass": "'"$NEWKEY"'",
    "smtp_sender_name": "SAFE",
    "smtp_admin_email": "safe@agentmail.to",
    "rate_limit_email_sent": 30
  }'
```

After rotating, **revoke the old key** in AgentMail → API Keys.

Tips learned the hard way:
- `smtp_port` must be a JSON **string** (`"465"`), not a number.
- Enabling custom SMTP requires **all** of `smtp_host/port/user/pass/admin_email`
  in the same request; a partial PATCH can clear the SMTP block.

## Verify a send

```bash
# ANON = the project's publishable/anon key
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "https://cqacfzkyxmtmjzpksznj.supabase.co/auth/v1/otp" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  --data '{"email":"you@example.com","create_user":true}'
```

`200` = accepted. A `500 "Error sending confirmation email"` means SMTP
auth/connection failed (usually a bad key). Confirm actual delivery in the
AgentMail console (Sent / the recipient inbox) — the message should come
from `SAFE <safe@agentmail.to>`.

## Deliverability upgrade path

`@agentmail.to` works, but for the best inbox placement (avoiding spam
folders at scale) move to a **verified custom domain**: add your domain in
AgentMail, set up its SPF / DKIM / DMARC DNS records, create an inbox on it
(e.g. `auth@yourdomain.com`), then update `smtp_user` + `smtp_admin_email`
(the `From`) to that inbox. Sender authentication on your own domain is the
real deliverability win over a shared provider domain.
