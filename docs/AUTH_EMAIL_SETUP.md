# Auth email setup (custom SMTP)

**Why:** Supabase's built-in auth email is rate-limited to a few sends/hour
and, once tripped, silently stops delivering magic links (the UI still
says "Check your email"). This blocks real signups and multi-account
testing. Configure a real SMTP provider before onboarding any users.
See `TESTING-FINDINGS.md` P1.2.

You can do this **via the dashboard** (fastest, no risk to other
settings) or **as code** with `supabase/config.toml`. Pick one.

---

## Option A — Dashboard (recommended)

1. **Create a sending domain + API key** with a provider:
   - **Resend** (recommended): https://resend.com → Domains → add & verify
     your domain (SPF + DKIM DNS records) → API Keys → create one.
   - SendGrid / Postmark / Mailgun work identically; note the SMTP host,
     port, username, and password/API key.
2. In the Supabase dashboard for project **`cqacfzkyxmtmjzpksznj`**:
   **Authentication → Emails → SMTP Settings → Enable Custom SMTP** and fill in:

   | Field | Resend value |
   |-------|--------------|
   | Sender email | `noreply@yourdomain.com` (on the verified domain) |
   | Sender name | `SAFE` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key (`re_…`) |

3. **Authentication → Rate Limits →** raise **"Emails per hour"** (e.g. 100).
4. **Authentication → URL Configuration →** confirm **Site URL** is your
   deployed origin and **Redirect URLs** include it plus
   `http://localhost:5173` for local dev.
5. Send yourself a magic link from the app and confirm it arrives from
   your domain.

---

## Option B — Infrastructure as code (`supabase/config.toml`)

A ready `config.toml` lives in `supabase/`. It reads all secrets from
env vars so nothing sensitive is committed.

```bash
# 1. Export the provider secrets (Resend shown):
export AUTH_SITE_URL="https://your-deployed-app.example"
export SUPABASE_AUTH_SMTP_HOST="smtp.resend.com"
export SUPABASE_AUTH_SMTP_USER="resend"
export SUPABASE_AUTH_SMTP_PASS="re_your_api_key"
export SUPABASE_AUTH_SMTP_SENDER="noreply@yourdomain.com"

# 2. Review the file — `config push` applies the WHOLE file to the
#    linked project, overwriting dashboard values for keys it sets.
supabase config push
```

> ⚠️ Because `config push` is whole-file, if you've customized other auth
> settings in the dashboard, either mirror them into `config.toml` first
> or use **Option A** instead.

---

## Client session refresh (already handled)

The client is configured with `autoRefreshToken: true` and now also
re-arms the refresh loop on tab `visibilitychange`
(`src/services/supabaseClient.ts`), so a token that would otherwise
expire while the tab was backgrounded is refreshed when the user returns.
`config.toml` also raises `jwt_expiry` to 2h with refresh-token rotation.

## After setup — finish the one pending live test

With delivery working, complete the two-account creator-royalty test
noted in `TESTING-FINDINGS.md` ("Pending live verification"): sign in a
second account, attack the first account's safe that has a custom game
equipped, and confirm the creator receives a `creator_royalty` ledger
row.
