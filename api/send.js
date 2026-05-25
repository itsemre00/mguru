// mGuru — /api/send.js
// Vercel serverless function — sends via Brevo with proper HTML email

const https = require('https');

function brevoRequest(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function applyTags(text, c) {
  return text
    .replace(/\{\{first_name\}\}/gi, c.first_name || '')
    .replace(/\{\{last_name\}\}/gi,  c.last_name  || '')
    .replace(/\{\{company\}\}/gi,    c.company    || '')
    .replace(/\{\{email\}\}/gi,      c.email      || '')
    .replace(/\{\{industry\}\}/gi,   c.industry   || '')
    .replace(/\{\{city\}\}/gi,       c.city       || '');
}

// Proper HTML email template — clean, valid, spam-filter friendly
function buildHtml(text, fromName) {
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px;font-size:15px;color:#222222;line-height:1.6;">
            ${paragraphs}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px 24px;border-top:1px solid #eeeeee;">
            <p style="margin:0;font-size:11px;color:#999999;line-height:1.5;">
              You received this email because you are on ${fromName}'s contact list.<br>
              To unsubscribe, reply with "unsubscribe" in the subject line.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { from_name, from_email, subject, body, contacts, brevo_key } = req.body;
  const apiKey = brevo_key || process.env.BREVO_API_KEY;

  if (!apiKey)            return res.status(400).json({ error: 'No Brevo API key provided' });
  if (!from_email)        return res.status(400).json({ error: 'from_email is required' });
  if (!subject)           return res.status(400).json({ error: 'subject is required' });
  if (!body)              return res.status(400).json({ error: 'body is required' });
  if (!contacts?.length)  return res.status(400).json({ error: 'No contacts provided' });
  if (contacts.length > 300) return res.status(400).json({ error: 'Max 300 per send (Brevo free limit)' });

  const results = { sent: 0, failed: 0, details: [] };

  for (const contact of contacts) {
    const personalizedSubject = applyTags(subject, contact);
    const personalizedBody    = applyTags(body, contact);

    const payload = {
      sender: { name: from_name || 'mGuru', email: from_email },
      to: [{
        email: contact.email,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
      }],
      subject: personalizedSubject,
      textContent: personalizedBody,                        // plain text version
      htmlContent: buildHtml(personalizedBody, from_name || from_email), // proper HTML
    };

    try {
      const result = await brevoRequest(payload, apiKey);
      if (result.status === 201 || result.status === 200) {
        results.sent++;
        results.details.push({ email: contact.email, status: 'sent' });
      } else {
        const errBody = JSON.parse(result.body || '{}');
        results.failed++;
        results.details.push({
          email: contact.email,
          status: 'failed',
          reason: errBody.message || `HTTP ${result.status}`,
        });
      }
    } catch (err) {
      results.failed++;
      results.details.push({ email: contact.email, status: 'failed', reason: err.message });
    }

    await sleep(150);
  }

  res.status(200).json(results);
};
