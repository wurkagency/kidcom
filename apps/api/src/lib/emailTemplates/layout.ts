import { SPLITKID_BRAND_MARK_SVG } from "../mailSender";

// Shared MSO-safe email chrome (header brand block + card + footer) for both
// transactional templates in this folder. Built from the table + inlined-
// style structure the transactional_email_login_2fa_verification Stitch
// mockup already used (that one, unlike transactional_email_confirm_email_
// address, was already written as real email-client-safe markup rather than
// a Tailwind-CDN preview page) — reused here so both real emails share one
// visually-consistent, mail-client-safe skeleton instead of each
// reimplementing table resets/MSO conditionals independently.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmailShell(options: {
  title: string;
  preheader: string;
  badgeText: string;
  bodyHtml: string;
  footerLinks?: { label: string; href: string }[];
  footerNote: string;
}): string {
  const footerLinks = options.footerLinks ?? [
    { label: "Privacy Policy", href: "https://splitkid.com/privacy" },
    { label: "Terms of Service", href: "https://splitkid.com/terms" },
    { label: "Help Center", href: "https://splitkid.com/help" },
  ];
  const footerLinksHtml = footerLinks
    .map(
      (link) =>
        `<a href="${link.href}" style="color: #4b6354; text-decoration: underline; text-underline-offset: 2px;">${escapeHtml(link.label)}</a>`
    )
    .join(`&nbsp;&nbsp;•&nbsp;&nbsp;`);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8" />
<meta content="width=device-width, initial-scale=1.0" name="viewport" />
<meta content="IE=edge" http-equiv="X-UA-Compatible" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(options.title)}</title>
<style>
  html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; background-color: #f0f4ee; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  p { margin: 0 0 16px 0; }
  a { text-decoration: none; }
  body, table, td, p, a, li { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .font-mono-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important; }
</style>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f4ee;">
<div style="display:none;font-size:1px;color:#f0f4ee;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(options.preheader)}</div>
<center role="article" aria-roledescription="email" aria-label="${escapeHtml(options.title)}" style="width:100%;background-color:#f0f4ee;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;">
<tbody><tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8faf4;border:1px solid #dce6d5;border-radius:24px;box-shadow:0 4px 20px -2px rgba(45,90,63,0.05);">
<tbody><tr><td style="padding: 40px 32px 36px 32px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody><tr><td align="center">
<div style="display:inline-block;padding:12px 14px;background-color:#eef4ea;border:1px solid #d8e5d3;border-radius:16px;margin-bottom:12px;">
${SPLITKID_BRAND_MARK_SVG}
</div>
<h1 style="margin:0;font-size:26px;font-weight:700;color:#1b3d2b;letter-spacing:-0.02em;">SplitKid</h1>
<p style="margin:4px 0 0 0;font-size:11px;font-weight:700;color:#4e7d61;letter-spacing:0.12em;">CHILD-CENTERED FAMILY WELL-BEING</p>
</td></tr>
</tbody></table>
<div style="height:28px;line-height:28px;font-size:28px;">&nbsp;</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody><tr><td align="center">
<span style="display:inline-block;padding:5px 14px;background-color:#e7efe4;border:1px solid #cfdfc9;border-radius:9999px;font-size:12px;font-weight:600;color:#2d5a3f;letter-spacing:0.02em;">${escapeHtml(options.badgeText)}</span>
</td></tr>
</tbody></table>
${options.bodyHtml}
</td></tr>
</tbody></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;margin-bottom:8px;">
<tbody><tr><td align="center" style="padding:0 16px;">
<p style="margin:0;font-size:12px;color:#64748b;line-height:1.8;">${footerLinksHtml}</p>
<p style="margin:12px 0 4px 0;font-size:11px;color:#788c7f;line-height:1.5;">&copy; ${new Date().getFullYear()} SplitKid ApS. All rights reserved. Copenhagen, Denmark.</p>
<p style="margin:0;font-size:11px;color:#8fa195;line-height:1.5;">${escapeHtml(options.footerNote)}</p>
</td></tr>
</tbody></table>
</td></tr>
</tbody></table>
</center>
</body>
</html>`;
}
