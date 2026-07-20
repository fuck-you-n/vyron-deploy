const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    try {
        const { key, hwid } = req.body;

        if (!key || typeof key !== 'string') {
            return res.status(400).json({ valid: false, reason: 'Missing key.' });
        }

        const cleanKey = key.trim().toUpperCase();

        const { data, error } = await supabase
            .from('license_keys')
            .select('*')
            .eq('key_value', cleanKey)
            .single();

        if (error || !data) {
            return res.json({ valid: false, reason: 'Key not found.' });
        }

        if (!data.is_active) {
            return res.json({ valid: false, reason: 'Key has been revoked.' });
        }

        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            return res.json({ valid: false, reason: 'Key has expired.' });
        }

        if (hwid && !data.hwid) {
            await supabase
                .from('license_keys')
                .update({ hwid })
                .eq('id', data.id);
        } else if (hwid && data.hwid && data.hwid !== hwid) {
            return res.json({ valid: false, reason: 'Key bound to another machine.' });
        }

        return res.json({
            valid: true,
            tier: data.tier || 'free',
            expires: data.expires_at || null
        });

    } catch (err) {
        console.error('Validate error:', err);
        return res.status(500).json({ valid: false, reason: 'Server error.' });
    }
};
