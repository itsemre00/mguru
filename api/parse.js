// mGuru — /api/parse.js
// Parses CSV text sent from the frontend

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'No CSV content provided' });

  try {
    const rows = csv.trim().split('\n');
    const headers = rows[0].split(',').map(h => h.trim().replace(/['"]/g, '').toLowerCase());

    const contacts = rows.slice(1).map((row, i) => {
      // Handle commas inside quoted fields
      const vals = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',');
      const cleaned = vals.map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, j) => obj[h] = (cleaned[j] || '').trim());

      return {
        id: i + 1,
        email:      obj.email || obj['e-mail'] || obj['email address'] || '',
        first_name: obj.first_name || obj.firstname || obj.first || (obj.name || '').split(' ')[0] || '',
        last_name:  obj.last_name  || obj.lastname  || obj.last  || (obj.name || '').split(' ').slice(1).join(' ') || '',
        company:    obj.company    || obj.organization || obj.org || '',
        industry:   obj.industry   || '',
        city:       obj.city       || obj.location || '',
      };
    }).filter(c => c.email && c.email.includes('@'));

    res.status(200).json({ count: contacts.length, contacts });
  } catch (err) {
    res.status(400).json({ error: 'Could not parse CSV: ' + err.message });
  }
};
