const { createClient } = require('@supabase/supabase-js');
const { sha256, checkRateLimit, recordAttempt, getClientIp } = require('./rate-limit');

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
    const ip = getClientIp(req);

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

        const rl = await checkRateLimit(supabase, ip, 'link-key', 5, 15);
        if (rl.blocked) {
            return res.status(429).json({ error: 'Too many attempts. Try again in ' + rl.retryAfter + ' seconds.', retryAfter: rl.retryAfter });
        }

        let body = req.body;
        if (!body) body = {};
        else if (typeof body === 'string') body = JSON.parse(body);

        const { key_value } = body;

        if (!key_value || typeof key_value !== 'string') {
            await recordAttempt(supabase, ip, 'link-key', false);
            return res.status(400).json({ error: 'Missing key_value.' });
        }

        const cleanKey = key_value.trim().toUpperCase();
        const keyHash = sha256(cleanKey);

        const { data: keyData, error: lookupErr } = await supabase
            .from('license_keys')
            .select('*')
            .eq('key_hash', keyHash)
            .single();

        if (lookupErr || !keyData) {
            await recordAttempt(supabase, ip, 'link-key', false);
            return res.json({ valid: false, reason: 'Key not found.' });
        }

        if (!keyData.is_active) {
            await recordAttempt(supabase, ip, 'link-key', false);
            return res.json({ valid: false, reason: 'Key has been revoked.' });
        }

        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            await recordAttempt(supabase, ip, 'link-key', false);
            return res.json({ valid: false, reason: 'Key has expired.' });
        }

        if (keyData.user_id && keyData.user_id !== user.id) {
            await recordAttempt(supabase, ip, 'link-key', false);
            return res.json({ valid: false, reason: 'Key is already linked to another account.' });
        }

        const { error: updateErr } = await supabase
            .from('license_keys')
            .update({ user_id: user.id })
            .eq('id', keyData.id);

        if (updateErr) {
            console.error('Link key error:', updateErr);
            await recordAttempt(supabase, ip, 'link-key', false);
            return res.status(500).json({ error: 'Failed to link key.' });
        }

        await recordAttempt(supabase, ip, 'link-key', true);

        if (keyData.role && keyData.role !== 'free') {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();

            if (profile && profile.role === 'free') {
                await supabase
                    .from('user_profiles')
                    .update({ role: keyData.role })
                    .eq('user_id', user.id);
            }
        }

        return res.json({
            success: true,
            key: {
                key_value: keyData.key_value,
                role: keyData.role,
                expires_at: keyData.expires_at,
                is_active: keyData.is_active,
                created_at: keyData.created_at
            }
        });

    } catch (err) {
        console.error('Link key error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
