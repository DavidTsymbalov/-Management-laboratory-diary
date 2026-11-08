# Enrollment form

1. Supabase → SQL Editor → New query: run the entire file
   `supabase/migrations/202611080001_enrollment_form.sql`.
2. Publish the site normally. No Edge Function changes are required.

- Form: `https://davidtsymbalov.github.io/-Management-laboratory-diary/forma/`
- Inbox: `https://davidtsymbalov.github.io/-Management-laboratory-diary/BaseOOO/`

Both routes are omitted from navigation and have `noindex, nofollow` metadata.
The form accepts first name, last name and a Telegram username without login.
Submissions do not create accounts. The inbox requires the existing teacher or
CSA login, including MFA when already enrolled. Other administrators and pupils
cannot read submissions, even through the database API. Revoked sessions are
blocked by the existing session guard.

Telegram usernames are normalized and unique. Duplicate submissions receive the
same confirmation without revealing or overwriting the existing contact. The
public RPC only inserts validated contacts and returns no personal data. Direct
public table writes are disabled. A honeypot reduces basic bot submissions but
does not replace CAPTCHA or an edge rate limiter if the form is widely shared.

The inbox supports search, pagination, refresh and copying/opening Telegram.
Private data is fetched after authentication, never included in exported HTML,
query parameters or local storage. The URL alone is not the access control.
