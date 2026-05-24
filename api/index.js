// mGuru — /api/index.js
// Health check endpoint

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ status: 'mGuru API running ✓', version: '2.0' });
};
