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
        const { user_id, new_password, admin_id } = req.body;

        if (!user_id || !new_password) {
            return res.status(400).json({ error: 'Missing user_id or new_password.' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        if (admin_id) {
            const { data: adminProfile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('user_id', admin_id)
                .single();

            if (!adminProfile || !['founder', 'admin'].includes(adminProfile.role)) {
                return res.status(403).json({ error: 'Admin role required.' });
            }
        }

        const { data, error } = await supabase.auth.admin.updateUserById(
            user_id,
            { password: new_password }
        );

        if (error) {
            console.error('Reset password error:', error);
            return res.status(400).json({ error: error.message || 'Failed to reset password.' });
        }

        return res.json({ success: true, message: 'Password updated successfully.' });

    } catch (err) {
        console.error('Admin reset password error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
