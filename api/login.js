const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ valid: false, reason: 'Method not allowed.' });
    }

    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            console.error('Missing env vars:', { url: !!process.env.SUPABASE_URL, key: !!process.env.SUPABASE_SERVICE_KEY });
            return res.status(500).json({ valid: false, reason: 'Server configuration error.' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const { email, password, hwid } = req.body;

        if (!email || !password) {
            return res.status(400).json({ valid: false, reason: 'Missing email or password.' });
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
                return res.json({ valid: false, reason: 'User not found.' });
            }

            const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(profile.user_id);
            if (authErr || !authUser?.user?.email) {
                return res.json({ valid: false, reason: 'User not found.' });
            }
            loginEmail = authUser.user.email;
        }

        const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: password
        });

        if (signInErr || !authData?.user) {
            return res.json({ valid: false, reason: 'Invalid email or password.' });
        }

        const userId = authData.user.id;

        const { data: profile, error: profileErr } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (profileErr || !profile) {
            const { error: insertErr } = await supabase
                .from('user_profiles')
                .insert({
                    user_id: userId,
                    username: authData.user.user_metadata?.username || loginEmail.split('@')[0],
                    role: 'free',
                    tier: 'free'
                });

            if (insertErr) {
                console.error('Failed to create profile:', insertErr);
            }

            return res.json({
                valid: true,
                username: authData.user.user_metadata?.username || loginEmail.split('@')[0],
                tier: 'free',
                role: 'free',
                expires: null
            });
        }

        if (hwid) {
            await supabase
                .from('user_profiles')
                .update({ hwid, last_online: new Date().toISOString() })
                .eq('user_id', userId);
        }

        return res.json({
            valid: true,
            username: profile.username || loginEmail.split('@')[0],
            tier: profile.tier || profile.role || 'free',
            role: profile.role || 'free',
            expires: profile.expire_date || null
        });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ valid: false, reason: 'Server error: ' + err.message });
    }
};
