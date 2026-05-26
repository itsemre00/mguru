// mGuru — /api/send.js
// Vercel serverless function — Brevo ile email gönderir

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

// Temiz, resim içermeyen, metin ağırlıklı HTML şablonu
function buildHtml(text, fromName) {
  // Her paragrafı <p> tag'ine çevir
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 18px 0;line-height:1.7;color:#222222;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  // Tamamen resim içermeyen, saf metin tabanlı HTML
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;font-size:15px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:4px;">

        <!-- BODY -->
        <tr>
          <td style="padding:36px 44px 24px 44px;">
            ${paragraphs}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:16px 44px 28px 44px;border-top:1px solid #eeeeee;">
            <p style="margin:0;font-size:11px;color:#999999;line-height:1.6;">
              Bu emaili aldınız çünkü ${fromName || 'sender'} iletişim listenizde bulunmaktadır.<br>
              Abonelikten çıkmak için "unsubscribe" yazarak yanıtlayın.
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

  if (!apiKey)           return res.status(400).json({ error: 'Brevo API key yok' });
  if (!from_email)       return res.status(400).json({ error: 'from_email gerekli' });
  if (!subject)          return res.status(400).json({ error: 'subject gerekli' });
  if (!body)             return res.status(400).json({ error: 'body gerekli' });
  if (!contacts?.length) return res.status(400).json({ error: 'Contact yok' });
  if (contacts.length > 300) return res.status(400).json({ error: 'Max 300 (Brevo free limit)' });

  const results = { sent: 0, failed: 0, details: [] };

  for (const contact of contacts) {
    const personalizedSubject = applyTags(subject, contact);
    const personalizedBody    = applyTags(body, contact);

    const payload = {
      sender: { name: from_name || 'mGuru', email: from_email },
      to: [{
        email: contact.email,
        name:  `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
      }],
      subject:     personalizedSubject,
      textContent: personalizedBody,                            // plain text — spam filtresi bunu seviyor
      htmlContent: buildHtml(personalizedBody, from_name),      // temiz HTML
    };

    try {
      const result = await brevoRequest(payload, apiKey);
      if (result.status === 201 || result.status === 200) {
        results.sent++;
        results.details.push({ email: contact.email, status: 'sent' });
      } else {
        const errBody = JSON.parse(result.body || '{}');
        results.failed++;
        results.details.push({ email: contact.email, status: 'failed', reason: errBody.message || `HTTP ${result.status}` });
      }
    } catch (err) {
      results.failed++;
      results.details.push({ email: contact.email, status: 'failed', reason: err.message });
    }

    await sleep(150);
  }

  res.status(200).json(results);
};
