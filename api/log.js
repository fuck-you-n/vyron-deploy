const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            return res.status(500).json({ error: 'No env vars.' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        let body = req.body;
        if (!body) body = {};
        else if (typeof body === 'string') body = JSON.parse(body);

        const { event, detail, user_email, tier, hwid } = body;

        if (!event || typeof event !== 'string') {
            return res.status(400).json({ error: 'Missing event.' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

        const { error } = await supabase.from('logs').insert({
            event: event.substring(0, 100),
            detail: (detail || '').substring(0, 500),
            user_email: (user_email || '').substring(0, 200),
            tier: (tier || '').substring(0, 20),
            hwid: (hwid || '').substring(0, 100),
            ip: String(ip).substring(0, 100)
        });

        if (error) {
            console.error('Log insert error:', error.message);
            return res.status(500).json({ error: error.message });
        }

        return res.json({ ok: true });

    } catch (err) {
        console.error('Log error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
