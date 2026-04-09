/**
 * Transactional email via Resend.
 * All functions are no-ops if RESEND_API_KEY is not set.
 */
const config = require('../config');
const logger = require('../utils/logger');

const FROM = 'Pikzor <hello@pikzor.com>';

async function send({ to, subject, html }) {
  if (!config.resend.apiKey) {
    logger.warn('[email] RESEND_API_KEY not set — skipping email', { to, subject });
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

async function sendWelcome(email) {
  await send({
    to: email,
    subject: 'Welcome to Pikzor!',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;color:#1e293b">
        <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">Welcome to Pikzor 🎉</h1>
        <p style="color:#64748b;margin-bottom:24px">You're all set. Here's how to get your first OG image live in 3 minutes:</p>
        <ol style="padding-left:20px;color:#334155;line-height:2">
          <li>Log in at <a href="https://pikzor.com/dashboard" style="color:#6366f1">pikzor.com/dashboard</a></li>
          <li>Pick a template and enter your brand color</li>
          <li>Copy the meta tag snippet and paste it into your site's <code>&lt;head&gt;</code></li>
        </ol>
        <a href="https://pikzor.com/dashboard" style="display:inline-block;margin-top:28px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Go to Dashboard →</a>
        <p style="margin-top:40px;font-size:13px;color:#94a3b8">Questions? Reply to this email anytime.</p>
      </div>
    `,
  });
}

async function sendPasswordReset(email, token) {
  const url = `${config.baseUrl}/dashboard?reset=${token}`;
  await send({
    to: email,
    subject: 'Reset your Pikzor password',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;color:#1e293b">
        <h1 style="font-size:24px;font-weight:800;margin-bottom:8px">Reset your password</h1>
        <p style="color:#64748b;margin-bottom:24px">Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset Password →</a>
        <p style="margin-top:24px;font-size:13px;color:#94a3b8">If you didn't request this, ignore this email — your password won't change.</p>
      </div>
    `,
  });
}

async function sendUpgradeConfirmation(email, plan) {
  const planName = plan === 'pro' ? 'Pro' : 'Starter';
  await send({
    to: email,
    subject: `You're now on the ${planName} plan!`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;color:#1e293b">
        <h1 style="font-size:24px;font-weight:800;margin-bottom:8px">You're on ${planName}! 🚀</h1>
        <p style="color:#64748b;margin-bottom:24px">Your account has been upgraded. You now have access to higher render limits and all ${planName} features.</p>
        <a href="https://pikzor.com/dashboard" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Go to Dashboard →</a>
        <p style="margin-top:40px;font-size:13px;color:#94a3b8">To manage or cancel your subscription, visit your dashboard billing settings.</p>
      </div>
    `,
  });
}

module.exports = { sendWelcome, sendPasswordReset, sendUpgradeConfirmation };
