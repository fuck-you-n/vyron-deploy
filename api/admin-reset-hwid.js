const { createClient } = require('@supabase/supabase-js');

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

        const { target_user_id } = body;

        if (!target_user_id) {
            return res.status(400).json({ error: 'Missing target_user_id.' });
        }

        const { error } = await supabase
            .from('user_profiles')
            .update({ hwid: null })
            .eq('user_id', target_user_id);

        if (error) {
            console.error('Reset HWID error:', error);
            return res.status(500).json({ error: error.message || 'Failed to reset HWID.' });
        }

        return res.json({ success: true, message: 'HWID reset. User can re-bind on next login.' });

    } catch (err) {
        console.error('Reset HWID error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
