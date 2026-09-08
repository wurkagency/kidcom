import { escapeHtml, renderEmailShell } from "./layout";

// Real, mail-client-safe adaptation of
// docs/stitch_splitkid/transactional_email_confirm_email_address/code.html —
// same copy, structure, and brand colors, rebuilt on renderEmailShell's
// table/inline-style skeleton (the mockup's own markup uses a Tailwind CDN
// <script> + Google Fonts <link>, neither of which real mail clients honor).
export function renderConfirmEmailHtml(options: { email: string; confirmUrl: string; ttlHours: number }): string {
  const { email, confirmUrl, ttlHours } = options;

  const valueProps = [
    { icon: "\u{1F4C5}", title: "Custody & Sync", desc: "Shared calendars that stay in sync." },
    { icon: "\u{1F4D6}", title: "Living Journal", desc: "Memories, milestones, and photos." },
    { icon: "\u{1F4CF}", title: "Growth & Sizing", desc: "Sizes and stats everyone can see." },
  ]
    .map(
      (p) => `
      <td width="33%" valign="top" style="padding: 0 6px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9faf6;border:1px solid #e6eae0;border-radius:12px;">
          <tbody><tr><td style="padding:14px 10px;text-align:center;">
            <div style="font-size:20px;margin-bottom:6px;">${p.icon}</div>
            <div style="font-size:12px;font-weight:700;color:#1e2922;margin-bottom:2px;">${p.title}</div>
            <div style="font-size:11px;color:#5e6d62;line-height:1.4;">${p.desc}</div>
          </td></tr></tbody>
        </table>
      </td>`
    )
    .join("");

  const bodyHtml = `
<h2 style="margin:16px 0 8px 0;font-size:26px;line-height:1.25;font-weight:700;color:#1b3d2b;letter-spacing:-0.015em;text-align:center;">Confirm your email address</h2>
<p style="margin:0 auto 24px auto;font-size:14.5px;line-height:1.6;color:#4b5563;max-width:480px;text-align:center;">
  Welcome to SplitKid! We're dedicated to placing your child's happiness, daily rhythms, and growth at the heart of family collaboration.
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9faf6;border:1px solid #e6eae0;border-radius:16px;margin:0 0 24px 0;">
<tbody><tr><td style="padding:20px;">
  <p style="margin:0;font-size:14px;color:#1e2922;line-height:1.6;">
    Please confirm that <strong style="color:#2d5a3f;">${escapeHtml(email)}</strong> belongs to you by clicking the button below. This ensures your child's schedules, photos, and health notes remain secure.
  </p>
</td></tr></tbody>
</table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody><tr><td align="center" style="padding: 8px 0 8px 0;">
  <a href="${confirmUrl}" style="display:inline-block;padding:16px 36px;border-radius:12px;background-color:#2d5a3f;color:#ffffff;font-size:16px;font-weight:700;">Confirm Email Address</a>
  <p style="margin:12px 0 0 0;font-size:12px;color:#5e6d62;">This confirmation link will safely expire in <strong>${ttlHours} hours</strong>.</p>
</td></tr></tbody>
</table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px;padding-top:24px;border-top:1px solid #e6eae0;">
<tbody><tr>
  <td style="padding-bottom:14px;" colspan="3">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5e6d62;text-align:center;">What you unlock once confirmed</p>
  </td>
</tr>
<tr>${valueProps}</tr>
</tbody></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;padding-top:24px;border-top:1px solid #e6eae0;">
<tbody><tr><td>
  <p style="margin:0 0 8px 0;font-size:12px;color:#5e6d62;">If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
  <p style="margin:0;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;color:#2d5a3f;background-color:#f9faf6;padding:10px;border-radius:8px;border:1px solid #e6eae0;">${escapeHtml(confirmUrl)}</p>
</td></tr></tbody></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">
<tbody><tr><td style="padding:14px 16px;background-color:#fff9f2;border:1px solid #f5debe;border-radius:12px;">
  <p style="margin:0;font-size:12.5px;line-height:1.55;color:#824d1a;">
    <strong style="color:#6b3e14;display:block;margin-bottom:2px;">Didn't create an account?</strong>
    If you did not sign up for SplitKid, you can safely ignore this email or reach out to <a href="mailto:support@splitkid.com" style="color:#9a4c00;font-weight:600;text-decoration:underline;">support@splitkid.com</a>. No profile will be activated without verification.
  </p>
</td></tr></tbody></table>`;

  return renderEmailShell({
    title: "Confirm your email address",
    preheader: `Confirm ${email} to finish setting up your SplitKid account.`,
    badgeText: "Step 1: Account Confirmation",
    bodyHtml,
    footerNote: "You are receiving this transactional security email because an account was registered with your address.",
  });
}
