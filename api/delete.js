// Vercel Serverless Function: /api/delete
// Expects JSON POST: { id, photoUrl }
// Requires environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id, photoUrl } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) return res.status(500).json({ error: 'Server not configured with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' });

    // If photoUrl is a Supabase public storage URL, attempt to delete the object
    if (photoUrl && photoUrl.indexOf('/storage/v1/object/public/') !== -1) {
      const marker = '/storage/v1/object/public/';
      const idx = photoUrl.indexOf(marker);
      if (idx !== -1) {
        const path = photoUrl.slice(idx + marker.length); // bucket/path...
        const parts = path.split('/');
        const bucket = parts.shift();
        const objectPath = parts.join('/');
        if (bucket && objectPath) {
          const storageUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${objectPath}`;
          // DELETE isn't supported directly for public objects; use the remove RPC via storage API
          const removeUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${objectPath}`;
          // Supabase storage API supports DELETE on the object path
          await fetch(removeUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE}`
            }
          });
        }
      }
    }

    // Delete DB row via Supabase REST API using service role key
    const restUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/memories?id=eq.${encodeURIComponent(id)}`;
    const resp = await fetch(restUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        Prefer: 'return=representation'
      }
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(500).json({ error: txt });
    }

    const out = await resp.json().catch(() => null);
    return res.status(200).json({ deleted: out });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
