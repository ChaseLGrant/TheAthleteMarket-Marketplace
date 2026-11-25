# Send coach emails from your Microsoft 365 mailbox (about 10 minutes)

**Why:** school email (Outlook / Microsoft 365) quietly hides or quarantines mail from bulk sending services.
Mail sent *by Microsoft 365 itself, from your real mailbox* (chase@theathletemarket.com) is trusted far more,
because it's the same as an email you type in Outlook. Once this is set up, **every coach email is sent from
chase@theathletemarket.com through Microsoft**, and shows up in your Outlook **Sent Items**. Parent emails keep
using Resend, since Gmail and other consumer email receive those fine. If Microsoft ever fails, the site
automatically falls back to Resend, so no coach email is lost.

## Steps

1. Go to **https://entra.microsoft.com** and sign in with your **admin** Microsoft 365 account (the one that
   manages theathletemarket.com email).
   *Microsoft 365 bought through GoDaddy:* sign in with the GoDaddy-provided admin account. If it says you don't
   have access, open **admin.microsoft.com** first, then click **Show all → Identity**.
2. **Applications → App registrations → + New registration**
   * Name: `Coach Line mailer`
   * Supported account types: **Accounts in this organizational directory only**
   * Redirect URI: leave blank → **Register**
3. On the page that opens, copy into your notes:
   * **Application (client) ID**
   * **Directory (tenant) ID**
4. Left menu → **API permissions → + Add a permission → Microsoft Graph → Application permissions**
   → search **Mail.Send** → tick it → **Add permissions**.
   Then click **✓ Grant admin consent for …** → **Yes**. The status should turn green.
5. Left menu → **Certificates & secrets → + New client secret** → Description `coach line` → Expires **24 months** → **Add**.
   Copy the **Value** column right away. It's shown only once.
   ⚠️ Copy the **Value**, not the **Secret ID** (same trap as the Stripe and Resend keys).
6. In **Vercel → coach-line → Settings → Environment Variables**, add:

| Key | Value |
|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID |
| `MS_CLIENT_ID` | Application (client) ID |
| `MS_CLIENT_SECRET` | the secret **Value** |
| `MS_SENDER` | `chase@theathletemarket.com` |

7. Redeploy. **Admin → 🚀 Launch** shows "Coach emails from Microsoft 365" ✅, and `/api/health` shows
   `"microsoft365CoachEmail": true`.

**Limits:** Microsoft lets one mailbox send to about 10,000 recipients a day and about 30 messages a minute. The
site retries automatically when Microsoft asks it to slow down. When volume grows past that, add a second mailbox
(for example coaches@theathletemarket.com).

**Optional, more secure:** limit the app so it can only send as chase@theathletemarket.com, using Exchange
"RBAC for Applications" (Exchange admin). Ask Claude to walk you through it.
