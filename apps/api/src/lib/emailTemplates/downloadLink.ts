import { escapeHtml, renderEmailShell } from "./layout";

// The Download screen's "Email" destination: a 7-day link to a zip of the
// chosen photos and videos. Same shell as the other transactional emails.
export function renderDownloadLinkHtml(options: { firstName: string; count: number; link: string; ttlDays: number }): string {
  const { firstName, count, link, ttlDays } = options;
  const bodyHtml = `
<h2 style="margin:16px 0 8px 0;font-size:26px;line-height:1.25;font-weight:700;color:#1b3d2b;letter-spacing:-0.015em;text-align:center;">Your download is ready</h2>
<p style="margin:0 auto 24px auto;font-size:14.5px;line-height:1.6;color:#4b5563;max-width:480px;text-align:center;">
  Hi ${escapeHtml(firstName)} — the ${count} ${count === 1 ? "file" : "files"} you chose are packed and ready. Sign in with this account to download them.
</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
<tbody><tr><td align="center" style="padding: 8px 0 8px 0;">
  <a href="${link}" style="display:inline-block;padding:16px 36px;border-radius:12px;background-color:#2d5a3f;color:#ffffff;font-size:16px;font-weight:700;">Download</a>
  <p style="margin:12px 0 0 0;font-size:12px;color:#5e6d62;">The link works for <strong>${ttlDays} days</strong>.</p>
</td></tr></tbody>
</table>`;
  return renderEmailShell({
    title: "Your download is ready",
    preheader: `${count} files from KidCom are ready to download.`,
    badgeText: "Download",
    bodyHtml,
    footerNote: "You are receiving this email because you asked KidCom to send you a download link.",
  });
}
