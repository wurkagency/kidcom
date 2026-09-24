import { config } from "../../config";
import { escapeHtml, renderEmailShell } from "./layout";

// Real, mail-client-safe adaptation of
// legacy Stitch export transactional_email_login_2fa_verification/code.html.
// That mockup was already written as production-grade table/inline-style
// markup (unlike the confirm-email one) — this keeps its exact box/badge/
// warning-notice design, rebuilt on the shared renderEmailShell skeleton so
// both transactional emails look like siblings from the same system.
export function renderLoginTwoFactorHtml(options: {
  email: string;
  code: string; // 6 raw digits, e.g. "841920"
  ttlMinutes: number;
  device: string;
  location: string;
  time: string;
}): string {
  const { email, code, ttlMinutes, device, location, time } = options;

  const bodyHtml = `
<h2 style="margin:16px 0 8px 0;font-size:26px;line-height:1.25;font-weight:700;color:#1b3d2b;letter-spacing:-0.015em;text-align:center;">Your verification code</h2>
<p style="margin:0 auto 24px auto;font-size:14.5px;line-height:1.6;color:#4b5563;max-width:480px;text-align:center;">
  A login request to your KidCom account was initiated for <span style="color:#1f2937;font-weight:600;">${escapeHtml(email)}</span>. Enter the 6-digit verification code below to complete your sign in.
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;">
<tbody><tr><td align="center">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:2px dashed #b9d3b5;border-radius:18px;max-width:460px;width:100%;">
<tbody><tr><td align="center" style="padding:24px 20px;">
  <span style="display:block;font-size:11px;font-weight:700;color:#5a876a;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:8px;">One-Time Passcode</span>
  <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:34px;font-weight:700;color:#1b3d2b;letter-spacing:0.28em;margin:6px 0;padding:6px 18px;background-color:#f6f9f4;border:1px solid #e4ede1;border-radius:8px;display:inline-block;">${code}</div>
  <p style="margin-top:10px;margin-bottom:0;font-size:12px;color:#527b63;font-weight:500;">&#9201; Valid for <strong style="color:#244f38;">${ttlMinutes} minutes</strong>. Do not share this code with anyone.</p>
</td></tr></tbody>
</table>
</td></tr></tbody></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;">
<tbody><tr><td align="center">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color:#f0f5ed;border:1px solid #d8e5d3;border-radius:14px;max-width:460px;width:100%;text-align:left;">
<tbody><tr><td style="padding:16px 20px;">
  <span style="display:block;font-size:11px;font-weight:700;color:#2d5a3f;letter-spacing:0.08em;text-transform:uppercase;padding-bottom:8px;">Login Attempt Details</span>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
  <tbody>
  <tr><td style="padding:4px 0;font-size:13px;color:#475569;border-bottom:1px solid #e1ebdc;"><span style="color:#1b3d2b;font-weight:600;display:inline-block;min-width:80px;">Device:</span> ${escapeHtml(device)}</td></tr>
  <tr><td style="padding:4px 0;font-size:13px;color:#475569;border-bottom:1px solid #e1ebdc;"><span style="color:#1b3d2b;font-weight:600;display:inline-block;min-width:80px;">Location:</span> ${escapeHtml(location)}</td></tr>
  <tr><td style="padding-top:5px;font-size:13px;color:#475569;"><span style="color:#1b3d2b;font-weight:600;display:inline-block;min-width:80px;">Time:</span> ${escapeHtml(time)}</td></tr>
  </tbody></table>
</td></tr></tbody></table>
</td></tr></tbody></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody><tr><td align="center">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color:#fff9f2;border:1px solid #f5debe;border-radius:12px;max-width:460px;width:100%;">
<tbody><tr><td style="padding:14px 16px;font-size:12.5px;line-height:1.55;color:#824d1a;">
  <strong style="color:#6b3e14;display:block;margin-bottom:2px;">Didn't request this code?</strong>
  If you didn't attempt to log in, someone may be trying to access your account. Please <a href="${escapeHtml(`${config.corsOrigin[0]}/forgot-password`)}" style="color:#9a4c00;font-weight:600;text-decoration:underline;">change your password immediately</a> or contact us at <a href="mailto:support@kidcom.org" style="color:#9a4c00;font-weight:600;text-decoration:underline;">support@kidcom.org</a>.
</td></tr></tbody></table>
</td></tr></tbody></table>`;

  return renderEmailShell({
    title: "Your KidCom verification code",
    preheader: `Your KidCom verification code is ${code}. Valid for ${ttlMinutes} minutes.`,
    badgeText: "\u{1F512} Security: Two-Factor Authentication",
    bodyHtml,
    footerLinks: [
      { label: "Privacy Policy", href: "https://kidcom.org/privacy" },
      { label: "Terms of Service", href: "https://kidcom.org/terms" },
      { label: "Help Center", href: "https://kidcom.org/help" },
      { label: "Security Overview", href: "https://kidcom.org/security" },
    ],
    footerNote: "You received this security email because two-factor authentication is active on your account.",
  });
}
