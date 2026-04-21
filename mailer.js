// mailer.js — Gmail login alert system
'use strict';
const nodemailer = require('nodemailer');
require('dotenv').config();

const GMAIL_USER     = process.env.GMAIL_USER || '';
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASS || '';
const ALERT_TO       = process.env.ALERT_EMAIL || GMAIL_USER;

// Create transporter (lazy — only if credentials exist)
function getTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASS) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS }
  });
}

/**
 * Send a login alert email. Fire-and-forget (non-blocking).
 * @param {object} loginInfo - { employee_id, full_name, role, branch, ip, userAgent }
 */
function sendLoginAlert(loginInfo) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('[Mailer] Gmail not configured — skipping alert email.');
    return;
  }

  const { employee_id, full_name, role, branch, ip, userAgent = '', success = true } = loginInfo;
  const now    = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' });
  const roleColors = { admin: '#CC0000', manager: '#2563eb', agent: '#059669' };
  const color  = roleColors[role] || '#6b7280';
  const status = success ? '✅ Successful Login' : '❌ Failed Login Attempt';
  const bgFlag = success ? '#ecfdf5' : '#fef2f2';
  const bdFlag = success ? '#a7f3d0' : '#fecaca';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0d1117,#1a1d2e);padding:28px 32px;display:flex;align-items:center;gap:16px;">
      <div style="width:48px;height:48px;background:#CC0000;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">🛢️</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:#fff;">IndianOil Portal</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Security Notification</div>
      </div>
    </div>

    <!-- Status Banner -->
    <div style="background:${bgFlag};border:1px solid ${bdFlag};margin:24px 32px 0;border-radius:10px;padding:14px 18px;">
      <div style="font-size:15px;font-weight:700;color:#111;">${status}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">${now} (IST)</div>
    </div>

    <!-- Details -->
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;color:#6b7280;width:40%">Employee ID</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;font-weight:600;color:#111;font-family:monospace">${employee_id}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;color:#6b7280;">Full Name</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;font-weight:600;color:#111;">${full_name}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;color:#6b7280;">Role</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;">
            <span style="background:${color}18;color:${color};border:1px solid ${color}33;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;text-transform:capitalize;">${role}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;color:#6b7280;">Branch</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;color:#111;">${branch}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;color:#6b7280;">IP Address</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f5;font-size:13px;font-weight:600;color:#111;font-family:monospace;">${ip || 'Unknown'}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#6b7280;vertical-align:top;">Device/Browser</td>
          <td style="padding:10px 0;font-size:12px;color:#6b7280;word-break:break-all;">${userAgent.substring(0,120) || 'Unknown'}</td>
        </tr>
      </table>

      ${!success ? `
      <div style="margin-top:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;">
        <div style="font-size:13px;font-weight:700;color:#991b1b;">⚠️ Security Alert</div>
        <div style="font-size:12px;color:#991b1b;margin-top:4px;">A failed login attempt was made with Employee ID: <strong>${employee_id}</strong>. If this wasn't you, consider changing your admin password immediately.</div>
      </div>
      ` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #f0f0f5;padding:18px 32px;text-align:center;">
      <div style="font-size:11px;color:#9ca3af;">This is an automated security alert from the IOC Scrap Management Portal.</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">© 2026 Indian Oil Corporation Limited</div>
    </div>
  </div>
</body>
</html>`;

  const subject = success
    ? `🔐 IOC Portal Login — ${full_name} (${role}) at ${new Date().toLocaleTimeString('en-IN')}`
    : `⚠️ IOC Portal FAILED Login Attempt — ${employee_id}`;

  transporter.sendMail({
    from: `"IOC Security Alert" <${GMAIL_USER}>`,
    to:   ALERT_TO,
    subject,
    html
  }, (err) => {
    if (err) console.error('[Mailer] Failed to send alert:', err.message);
    else      console.log(`[Mailer] Login alert sent → ${ALERT_TO}`);
  });
}

module.exports = { sendLoginAlert };
