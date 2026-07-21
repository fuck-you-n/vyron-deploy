const { createClient } = require('@supabase/supabase-js');
const { sha256, getClientIp } = require('./rate-limit');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (!profile || !['founder', 'admin'].includes(profile.role)) {
            return res.status(403).json({ error: 'Admin role required.' });
        }

        let body = req.body;
        if (!body) body = {};
        else if (typeof body === 'string') body = JSON.parse(body);

        const { key_value, role, expires_at } = body;

        if (!key_value || typeof key_value !== 'string') {
            return res.status(400).json({ error: 'Missing key_value.' });
        }

        const cleanKey = key_value.trim().toUpperCase();
        const keyHash = sha256(cleanKey);

        const { data: existing } = await supabase
            .from('license_keys')
            .select('id')
            .eq('key_hash', keyHash)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Key already exists.' });
        }

        const insert = {
            key_value: cleanKey,
            key_hash: keyHash,
            role: role || 'free',
            is_active: true,
            created_by: user.id
        };

        if (expires_at) insert.expires_at = expires_at;

        const { data, error } = await supabase
            .from('license_keys')
            .insert(insert)
            .select('id, key_value, role, expires_at, created_at')
            .single();

        if (error) {
            console.error('Create key error:', error);
            return res.status(500).json({ error: error.message || 'Failed to create key.' });
        }

        return res.json({ success: true, key: data });

    } catch (err) {
        console.error('Create key error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
