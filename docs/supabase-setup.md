# Setting up accounts (Supabase + Google + Resend)

One-time setup for sign-up. Everything here is on free plans. Three accounts: Supabase (the
database and sign-in), Google Cloud (the "Continue with Google" button) and Resend (sends the
sign-in emails from rookahead.com).

## 1. Supabase project

1. Sign up at <https://supabase.com> (Continue with GitHub is quickest).
2. **New project**: name `rookahead`, generate a database password and keep it somewhere safe,
   region **South Asia (Mumbai)**, Free plan. Wait a minute or two while it starts.
3. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
   It should say "Success. No rows returned". It also makes the public `avatars` storage bucket for
   profile photos; run the file again whenever it changes (it's safe to repeat).
4. **Project Settings → API Keys**: copy the **Project URL** (`https://xxxx.supabase.co`) and the
   **publishable key** (`sb_publishable_…`; on older dashboards, the `anon` `public` key). These two
   are public by design: the database rules decide who can read what, and every user can only
   read their own rows.
5. **Authentication → URL Configuration**:
   - Site URL: `https://rookahead.com`
   - Redirect URLs (add each one):
     - `https://rookahead.com/**`
     - `https://*.rookahead.pages.dev/**`
     - `http://localhost:5173/**`

## 2. Google sign-in

1. Go to <https://console.cloud.google.com> → project picker → **New project** → `Rookahead`.
2. **Google Auth Platform** (search for it) → **Get started**:
   - App name `Rookahead`, user support email: yours.
   - Audience: **External**.
   - Contact email: yours. Agree, Create.
3. **Branding**:
   - App home page `https://rookahead.com`, privacy policy `https://rookahead.com/privacy`.
   - Authorized domains: `rookahead.com` and `xxxx.supabase.co` (your project's, from step 1.4).
4. **Clients → Create client** → Web application, name `Rookahead web`:
   - Authorized JavaScript origins: `https://rookahead.com`
   - Authorized redirect URIs: `https://xxxx.supabase.co/auth/v1/callback`
     (Supabase shows this exact URL on its Google provider page, step 6).
   - Create, then copy the **Client ID** and **Client secret**.
5. **Audience → Publish app** (status "In production"), so anyone can sign in, not only test
   users. Only the basic scopes (email, profile) are used, so Google doesn't need to review it.
6. Back in Supabase: **Authentication → Sign In / Providers → Google** → enable, paste the Client ID
   and secret → Save.

## 3. Sign-in emails through Resend

Supabase's built-in sender allows only a few emails an hour, and only to the project's own team,
so emails go through Resend (free: 3,000 a month, 100 a day).

1. Sign up at <https://resend.com>.
2. **Domains → Add domain** → `rookahead.com`. Resend lists a few DNS records; the **Auto
   configure** button adds them in Cloudflare for you (or add them by hand under Cloudflare → DNS).
   Wait until the domain shows **Verified**.
3. **API Keys → Create API key** (Sending access) → copy it.
4. In Supabase: **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email `auth@rookahead.com`, sender name `Rookahead`
   - Host `smtp.resend.com`, port `465`, username `resend`, password: the API key → Save.

## 4. Passwords and the emails

1. **Authentication → Sign In / Providers → Email**: keep **Confirm email** on, set **Minimum
   password length** to `8`, Save.
2. **Authentication → Emails → Templates.** Each email carries a 6-digit code and a link: the link
   only works in the browser where you asked, the code works anywhere.

**Confirm signup**

Subject: `Your Rookahead code: {{ .Token }}`

```html
<div style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #17171a">
  <h2 style="margin: 0 0 12px; font-size: 20px">Confirm your email</h2>
  <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.5">Welcome to Rookahead! Type this code where you signed up, or click the button:</p>
  <p style="margin: 0 0 20px; font-size: 30px; font-weight: 700; letter-spacing: 6px; font-family: Menlo, Consolas, monospace">{{ .Token }}</p>
  <p style="margin: 0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; border-radius: 8px; background: #0284c7; color: #ffffff; font-weight: 600; text-decoration: none">Confirm email</a>
  </p>
  <p style="margin: 0; font-size: 13px; color: #74747d">If you didn't sign up for Rookahead, ignore this email.</p>
</div>
```

**Reset Password**

Subject: `Reset your Rookahead password: {{ .Token }}`

```html
<div style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #17171a">
  <h2 style="margin: 0 0 12px; font-size: 20px">Reset your password</h2>
  <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.5">Type this code with your new password, or click the button:</p>
  <p style="margin: 0 0 20px; font-size: 30px; font-weight: 700; letter-spacing: 6px; font-family: Menlo, Consolas, monospace">{{ .Token }}</p>
  <p style="margin: 0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; border-radius: 8px; background: #0284c7; color: #ffffff; font-weight: 600; text-decoration: none">Choose a new password</a>
  </p>
  <p style="margin: 0; font-size: 13px; color: #74747d">If you didn't ask for this, ignore this email: your password stays the same.</p>
</div>
```

## 5. Hand over

Put the values from steps 1.4 and 2.4 in `.env` (committed; all public):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_KEY=sb_publishable_…
VITE_GOOGLE_CLIENT_ID=….apps.googleusercontent.com
```

Google sign-in goes through rookahead.com itself (so Google's screen names rookahead.com): in the
Google client, add `https://<host>/auth/google` as a redirect URI and `https://<host>` as a
JavaScript origin for each host in `GOOGLE_HOSTS` (src/lib/account.ts).

Without them the app builds and runs as before, with no sign-up anywhere.
