# SMTP (cPanel Email) Setup

Bladezux sends password-reset links, invitations, account notices and security alerts through an **existing
cPanel mailbox** using PHPMailer over authenticated SMTP.

> The SMTP mailbox credentials are separate from administrator logins. Admins sign in with their own
> email/password stored (hashed) in the app database; the mailbox password is only used by the server to send mail.

## 1. Create a mailbox

cPanel → **Email Accounts** → *Create* → e.g. `no-reply@yourdomain.com` with a strong password.

## 2. Find the connection details

cPanel → Email Accounts → *Connect Devices* (next to the mailbox) → **Mail Client Manual Settings**:

| Setting | Typical value |
|---|---|
| Outgoing server | `mail.yourdomain.com` (or the server hostname shown, e.g. `server123.hostingprovider.com`) |
| SMTP port (SSL/TLS) | **465** — choose *SSL/TLS* in Bladezux |
| SMTP port (STARTTLS) | **587** — choose *STARTTLS* |
| Username | the full address, `no-reply@yourdomain.com` |
| Password | the mailbox password |

If the SSL certificate on `mail.yourdomain.com` is not valid, use the server hostname from the manual settings page.

## 3. Configure Bladezux

Sign in as the owner → **Settings → Email**:

1. SMTP host, port and encryption (choosing the encryption pre-fills the usual port).
2. Username and password (stored AES-256-GCM encrypted; leave the password blank later to keep it).
3. Sender email — normally the same mailbox — and sender name.
4. **Save**, then **Send test** to your own address.

## 4. Deliverability

- Make sure SPF and DKIM are enabled: cPanel → **Email Deliverability** → *Repair* if needed.
- Add a DMARC record (e.g. `v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com`).
- Use the domain's own mailbox as the sender; do not send as a Gmail address.

## Troubleshooting

| Error shown | Fix |
|---|---|
| SMTP authentication failed | Use the full email address as username; reset the mailbox password in cPanel. |
| Could not connect to the SMTP server | Check host/port/encryption; some hosts block port 465 or 587 from PHP — try the other one, or use `localhost` with port 25 and encryption *None* (local cPanel MTA). |
| Test succeeds but mail lands in spam | Fix SPF/DKIM/DMARC (Email Deliverability). |
| Invitation email failed | The admin is still created; the activation link is shown once on the Administrators page so you can share it securely. |

Detailed SMTP errors are written to the private log folder (`bladezux-private/logs/`), never to the browser.
