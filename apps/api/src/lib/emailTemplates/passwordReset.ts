import { escapeHtml, renderEmailShell } from "./layout";

// Post-launch backlog Phase F — same renderEmailShell table/inline-style
// skeleton confirmEmail.ts uses, without that one's value-props section
// (irrelevant here — this is a security email, not an onboarding one).
export function renderPasswordResetHtml(options: { email: string; resetUrl: string; ttlHours: number }): string {
  const { email, resetUrl, ttlHours } = options;

  const bodyHtml = `
<h2 style="margin:16px 0 8px 0;font-size:26px;line-height:1.25;font-weight:700;color:#1b3d2b;letter-spacing:-0.015em;text-align:center;">Reset your password</h2>
<p style="margin:0 auto 24px auto;font-size:14.5px;line-height:1.6;color:#4b5563;max-width:480px;text-align:center;">
  We got a request to reset the password for <strong style="color:#2d5a3f;">${escapeHtml(email)}</strong>. Click below to choose a new one.
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody><tr><td align="center" style="padding: 8px 0 8px 0;">
  <a href="${resetUrl}" style="display:inline-block;padding:16px 36px;border-radius:12px;background-color:#2d5a3f;color:#ffffff;font-size:16px;font-weight:700;">Reset Password</a>
  <p style="margin:12px 0 0 0;font-size:12px;color:#5e6d62;">This link will safely expire in <strong>${ttlHours} hours</strong>.</p>
</td></tr></tbody>
</table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;padding-top:24px;border-top:1px solid #e6eae0;">
<tbody><tr><td>
  <p style="margin:0 0 8px 0;font-size:12px;color:#5e6d62;">If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
  <p style="margin:0;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;color:#2d5a3f;background-color:#f9faf6;padding:10px;border-radius:8px;border:1px solid #e6eae0;">${escapeHtml(resetUrl)}</p>
</td></tr></tbody></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">
<tbody><tr><td style="padding:14px 16px;background-color:#fff9f2;border:1px solid #f5debe;border-radius:12px;">
  <p style="margin:0;font-size:12.5px;line-height:1.55;color:#824d1a;">
    <strong style="color:#6b3e14;display:block;margin-bottom:2px;">Didn't request this?</strong>
    Your password hasn't changed — you can safely ignore this email. Someone may have typed your email address by mistake.
  </p>
</td></tr></tbody></table>`;

  return renderEmailShell({
    title: "Reset your password",
    preheader: `Reset the password for ${email}.`,
    badgeText: "Password Reset",
    bodyHtml,
    footerNote: "You are receiving this transactional security email because a password reset was requested for your account.",
  });
}
