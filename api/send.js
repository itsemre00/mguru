// mGuru — /api/send.js
// Vercel serverless function — receives campaign data and sends via Brevo

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async (req, res) => {
  // CORS headers — allow requests from any origin (your frontend)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { from_name, from_email, subject, body, contacts, brevo_key } = req.body;
  const apiKey = brevo_key || process.env.BREVO_API_KEY;

  if (!apiKey)       return res.status(400).json({ error: 'No Brevo API key provided' });
  if (!from_email)   return res.status(400).json({ error: 'from_email is required' });
  if (!subject)      return res.status(400).json({ error: 'subject is required' });
  if (!body)         return res.status(400).json({ error: 'body is required' });
  if (!contacts?.length) return res.status(400).json({ error: 'No contacts provided' });
  if (contacts.length > 300) return res.status(400).json({ error: 'Max 300 per send (Brevo free limit)' });

  const results = { sent: 0, failed: 0, details: [] };

  for (const contact of contacts) {
    const personalizedSubject = applyTags(subject, contact);
    const personalizedBody    = applyTags(body,    contact);

    const payload = {
      sender: { name: from_name || 'mGuru', email: from_email },
      to: [{ email: contact.email, name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email }],
      subject: personalizedSubject,
      textContent: personalizedBody,
      htmlContent: `<div style="font-family:sans-serif;font-size:15px;line-height:1.7;max-width:600px;margin:auto;padding:20px">${personalizedBody.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</div>`,
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

    await sleep(150); // small delay to respect rate limits
  }

  res.status(200).json(results);
};
