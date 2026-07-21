const { createClient } = require('@supabase/supabase-js');
const { sha256, checkRateLimit, recordAttempt, getClientIp } = require('./rate-limit');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            return res.status(500).json({ valid: false, reason: 'Server configuration error.' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const ip = getClientIp(req);

        const rl = await checkRateLimit(supabase, ip, 'validate', 10, 15);
        if (rl.blocked) {
            return res.status(429).json({ valid: false, reason: 'Too many attempts. Try again in ' + rl.retryAfter + ' seconds.', retryAfter: rl.retryAfter });
        }

        const { key, hwid } = req.body;

        if (!key || typeof key !== 'string') {
            await recordAttempt(supabase, ip, 'validate', false);
            return res.status(400).json({ valid: false, reason: 'Missing key.' });
        }

        const cleanKey = key.trim().toUpperCase();
        const keyHash = sha256(cleanKey);

        const { data, error } = await supabase
            .from('license_keys')
            .select('*')
            .eq('key_hash', keyHash)
            .single();

        if (error || !data) {
            await recordAttempt(supabase, ip, 'validate', false);
            return res.json({ valid: false, reason: 'Key not found.' });
        }

        if (!data.is_active) {
            await recordAttempt(supabase, ip, 'validate', false);
            return res.json({ valid: false, reason: 'Key has been revoked.' });
        }

        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            await recordAttempt(supabase, ip, 'validate', false);
            return res.json({ valid: false, reason: 'Key has expired.' });
        }

        if (hwid && !data.hwid) {
            await supabase
                .from('license_keys')
                .update({ hwid })
                .eq('id', data.id);
        } else if (hwid && data.hwid && data.hwid !== hwid) {
            await recordAttempt(supabase, ip, 'validate', false);
            return res.json({ valid: false, reason: 'Key bound to another machine.' });
        }

        await recordAttempt(supabase, ip, 'validate', true);

        return res.json({
            valid: true,
            tier: data.tier || 'free',
            role: data.role || 'free',
            expires: data.expires_at || null
        });

    } catch (err) {
        console.error('Validate error:', err);
        return res.status(500).json({ valid: false, reason: 'Server error.' });
    }
};
