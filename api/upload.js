// Vercel Serverless Function: /api/upload
// Expects JSON POST: { fileName, fileType, dataBase64 }
// Requires environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileName, fileType, dataBase64 } = req.body || {};
    if (!fileName || !dataBase64) return res.status(400).json({ error: 'Missing fileName or dataBase64' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) return res.status(500).json({ error: 'Server not configured with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });

    // Basic validation: only allow common image types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (fileType && !allowedTypes.includes(fileType)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Decode and enforce max size (3 MB)
    const buffer = Buffer.from(dataBase64, 'base64');
    const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: 'File too large. Max 3MB allowed.' });
    }

    const bucket = 'memories';
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storageUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${safeName}`;

    const uploadRes = await fetch(storageUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': fileType || 'application/octet-stream'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return res.status(500).json({ error: text });
    }

    const publicURL = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${safeName}`;
    return res.status(200).json({ publicURL });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
