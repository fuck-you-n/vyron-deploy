module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const hasUrl = !!process.env.SUPABASE_URL;
    const hasKey = !!process.env.SUPABASE_SERVICE_KEY;
    const urlVal = process.env.SUPABASE_URL || 'NOT SET';
    return res.json({ hasUrl, hasKey, urlVal });
};
