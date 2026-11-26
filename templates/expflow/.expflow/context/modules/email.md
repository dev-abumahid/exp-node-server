# Email Module

Status: Implemented
Module: email
Route: internal (no HTTP routes)

## Capabilities

- SMTP delivery through nodemailer
- OTP and password-reset email templates
- Sending is handled by the background queue

## Integration

- Use `enqueueEmail()` for application emails; do not call `sendMail` in controllers.
- To add an email, add a job type and renderer in `queues/email.queue.ts` and a template in `src/app/templates/`.
- Reuse `sendMail` only inside the queue worker.
- Never add a second mail transport or hard-code credentials.

## Entry points

- `src/app/utils/mail_sender.ts`
- `src/app/queues/email.queue.ts`
- `src/app/templates/`

## Restrictions

- Never log OTPs, reset links or credentials.
- Keep SMTP configuration in environment variables.
- Never send email synchronously from a request handler.
