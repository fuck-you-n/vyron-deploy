const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, recordAttempt, getClientIp } = require('./rate-limit');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ valid: false, reason: 'Method not allowed.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ valid: false, reason: 'No env vars.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const ip = getClientIp(req);

    const rl = await checkRateLimit(supabase, ip, 'login', 5, 15);
    if (rl.blocked) {
        return res.status(429).json({ valid: false, reason: 'Too many login attempts. Try again in ' + rl.retryAfter + ' seconds.', retryAfter: rl.retryAfter });
    }

    try {
        let body = req.body;
        if (!body) {
            body = {};
        } else if (typeof body === 'string') {
            body = JSON.parse(body);
        }

        const email = body.email;
        const password = body.password;
        const hwid = body.hwid;

        if (!email || !password) {
            await recordAttempt(supabase, ip, 'login', false);
            return res.json({ valid: false, reason: 'Missing email or password.' });
        }

        const input = email.trim().toLowerCase();
        let loginEmail = input;

        if (!input.includes('@')) {
            const { data: profile, error: lookupErr } = await supabase
                .from('user_profiles')
                .select('user_id')
                .eq('username', input)
                .single();

            if (lookupErr || !profile) {
                await recordAttempt(supabase, ip, 'login', false);
                return res.json({ valid: false, reason: 'User not found.' });
            }

            const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(profile.user_id);
            if (authErr || !authUser?.user?.email) {
                await recordAttempt(supabase, ip, 'login', false);
                return res.json({ valid: false, reason: 'User not found.' });
            }
            loginEmail = authUser.user.email;
        }

        const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: password
        });

        if (signInErr || !authData?.user) {
            await recordAttempt(supabase, ip, 'login', false);
            return res.json({ valid: false, reason: 'Invalid email or password.' });
        }

        const userId = authData.user.id;

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!profile) {
            await supabase.from('user_profiles').insert({
                user_id: userId,
                username: authData.user.user_metadata?.username || loginEmail.split('@')[0],
                role: 'free',
                tier: 'free',
                hwid: hwid || null
            });
            await recordAttempt(supabase, ip, 'login', true);
            return res.json({
                valid: true,
                username: authData.user.user_metadata?.username || loginEmail.split('@')[0],
                tier: 'free',
                role: 'free',
                key_role: 'free',
                expires: null
            });
        }

        if (hwid) {
            if (profile.hwid && profile.hwid !== hwid) {
                await recordAttempt(supabase, ip, 'login', false);
                return res.json({ valid: false, reason: 'Account bound to another device. Contact support to reset.' });
            }

            if (!profile.hwid) {
                await supabase
                    .from('user_profiles')
                    .update({ hwid, last_online: new Date().toISOString() })
                    .eq('user_id', userId);
            } else {
                await supabase
                    .from('user_profiles')
                    .update({ last_online: new Date().toISOString() })
                    .eq('user_id', userId);
            }
        }

        let expires = null;
        let keyRole = null;
        const { data: linkedKey } = await supabase
            .from('license_keys')
            .select('expires_at, role')
            .eq('user_id', userId)
            .maybeSingle();
        if (linkedKey) {
            if (linkedKey.expires_at) expires = linkedKey.expires_at;
            if (linkedKey.role) keyRole = linkedKey.role;
        }

        await recordAttempt(supabase, ip, 'login', true);

        return res.json({
            valid: true,
            username: profile.username || loginEmail.split('@')[0],
            tier: profile.tier || profile.role || 'free',
            role: profile.role || 'free',
            key_role: keyRole || 'free',
            expires: expires
        });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ valid: false, reason: err.message });
    }
};
