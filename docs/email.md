# IUST Orbit account emails: Resend and Gmail

IUST Orbit uses **Supabase Auth** to send signup confirmations, confirmation resends and password-reset emails. Users sign in with their email and password. The existing administrator dashboard is at `/admin`.

## Connect Resend

Resend integrates directly through Supabase's **Custom SMTP** settings. The existing confirmation/recovery templates and account flows work with it. The setup command uses the already installed Nodemailer dependency; Supabase Auth sends the application's emails.

1. Add a domain you control in [Resend Domains](https://resend.com/domains), publish the DNS records Resend provides, and wait for verification. Choose a sender on that verified domain, such as `no-reply@your-domain.com`.
2. Create a [Resend API key](https://resend.com/api-keys) with **Sending access** to that domain. Keep an inbox address ready to receive the setup test; the sender itself can be a no-reply address.
3. In your own terminal at the project root, run:

   ```sh
   npm run email:setup:resend
   ```

   Equivalent: `npm run email:setup -- --provider resend`.

   Enter the verified-domain sender, the test recipient, and the API key in the **hidden-input** prompt. The command connects securely to `smtp.resend.com:465`, authenticates as `resend`, and sends one **IUST Orbit email delivery test** to the recipient. Settings are saved only after Resend accepts that message. Check the inbox/spam folder and [Resend email logs](https://resend.com/emails) for delivery.

4. Follow **[Apply the local settings](#apply-the-local-settings)** below, then check the complete signup/recovery flow.

The API key is saved as `SUPABASE_AUTH_EMAIL_SMTP_PASS` in Git-ignored **`supabase/.env.local`**. It must never go in a `VITE_` variable, frontend code or chat. Provider changes replace the managed SMTP block, including blocks from the original Gmail setup, and preserve other operator settings. A rejected setup test preserves the previous sender.

**Status (9 November 2026):** Resend setup support is implemented and tested with SMTP doubles. This checkout has no configured Resend sender/API key, so actual external delivery awaits setup; account mail currently goes to the local mailbox.

Official references: [Resend with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [Resend SMTP settings](https://resend.com/docs/send-with-smtp), and [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Connect Gmail

1. Enable **2-Step Verification** on the Google account that will send the emails.
2. Open [Google App passwords](https://myaccount.google.com/apppasswords), create one named **IUST Orbit**, and keep the generated 16-character password ready.
3. In a terminal at the project root, run:

   ```sh
   npm run email:setup
   ```

   Enter your Gmail address and the **app password** when prompted. Password input is hidden. The command checks Gmail over STARTTLS on port **587**, sends one test email to the sending address, and saves the settings only after Gmail accepts it. Check your inbox and spam folder for **IUST Orbit email delivery test**.

   Settings go into the Git-ignored **`supabase/.env.local`**. The Gmail address is both the SMTP username and the From address; the display name is **IUST Orbit**. `npm run email:setup -- --provider gmail` explicitly selects Gmail.

4. Apply the settings below and check the complete account flow.

## Apply the local settings

Supabase CLI **3** automatically reads the `SUPABASE_AUTH_EMAIL_SMTP_*` overrides from `supabase/.env.local`. Restart the local stack after setup:

```sh
npx supabase stop
npx supabase start
```

The normal stop/start keeps your local database. Restart the image-function terminal after the stack restarts:

```sh
npx supabase functions serve --env-file .env.functions.local
```

Start the app if needed:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

SMTP credentials belong in `supabase/.env.local`. The root `.env.local` contains browser configuration, and every `VITE_` value is public. Vite blocks requests for both environment files. Nodemailer is a development dependency used by the setup command; Supabase Auth sends the application emails.

## Check the complete account flow

1. Open **http://localhost:5173/sign-up**, register with an email address you can receive mail at, and use an application password of at least 12 characters.
2. Find **Confirm your IUST Orbit account** in that inbox and open its link in the **same browser** and application origin that requested it. The browser SDK uses PKCE.
3. Sign out, then sign in with the application password.
4. Open **Forgot password**, request a reset for that account, and find **Reset your IUST Orbit password**. Open it in the same browser, choose a new password, then verify sign-in with the new password.

Supabase generates and verifies the one-use links. A link expires after **one hour** in this local configuration. Confirmation resend is available after signup and when sign-in reports an unconfirmed account. Email buttons have a **60-second** retry cooldown; Supabase independently enforces a one-minute send interval and, with custom SMTP enabled, an initial **20 emails per hour** limit. The CLI uses a higher hourly limit for its local test mailbox. Adjust `[auth.rate_limit].email_sent` in `supabase/config.toml` to suit your sender's capacity, then restart the stack.

Before SMTP setup, mail is captured at **http://127.0.0.1:54324**. After enabling Resend or Gmail, look in the recipient's real inbox. To return to the local mailbox, set `SUPABASE_AUTH_EMAIL_SMTP_ENABLED="false"` in the managed block and restart Supabase.

## Troubleshooting

- **Resend rejects authentication:** use an active API key with sending access to your verified domain, then rerun setup to rotate the saved key.
- **Resend rejects the message:** check domain verification, the sender address, recipient restrictions and sending limits in the Resend dashboard. Test-domain senders such as `onboarding@resend.dev` are restricted; use your verified domain for application users.
- **Cannot reach Resend:** allow outbound `smtp.resend.com:465` from this machine and Docker Desktop. Resend also supports STARTTLS on port 587 for manually configured SMTP clients; the setup command uses implicit TLS on 465.
- **Google rejects authentication:** use the app password from the sender's Google account. Google revokes app passwords when the account password changes; run setup again with a new one. See [Google's app-password help](https://support.google.com/accounts/answer/185833).
- **App passwords are unavailable:** check 2-Step Verification and the account's organization/Advanced Protection settings.
- **Cannot reach Gmail:** allow outbound `smtp.gmail.com:587` from this machine and Docker Desktop.
- **Test email succeeds but signup email fails:** restart Supabase so Auth loads the saved settings. Check Auth container logs locally for the failed request; the setup command runs on the host, while application emails originate in the Auth container.
- **Email is missing:** check the address, spam folder and provider sending limits. Password recovery deliberately gives the same response for unknown addresses.
- **Email requests are limited:** wait for the configured cooldown or hourly limit, then retry. A failed request displays an error rather than a success notice.
- **A link has expired or opens in another browser:** request a fresh confirmation/reset link and open it in the requesting browser. Use `http://localhost:5173` consistently for this checkout.

## Hosted Supabase

The setup command configures this **local** stack. For a hosted Supabase project, open **Authentication → Email → SMTP Settings**, enable **Custom SMTP**, and enter the selected provider's settings:

| Setting | Resend | Gmail |
| --- | --- | --- |
| Host | `smtp.resend.com` | `smtp.gmail.com` |
| Port | `465` | `587` |
| Username | `resend` | Your full Gmail address |
| Password | Your Resend API key | The Google app password |
| Sender email | An address on your verified domain | The same Gmail address |
| Sender name | `IUST Orbit` | `IUST Orbit` |

Set the project's Auth email rate limit to the intended capacity. Copy the subjects and HTML from `supabase/config.toml` and `supabase/templates/{confirmation,recovery}.html` into the corresponding hosted email templates. Set the Auth site URL and exact `/auth/callback` and `/recover-account` redirect URLs to the HTTPS application domain, and build with the matching public `VITE_APP_URL`. The generated local SMTP file does not deploy these settings to a hosted project.
