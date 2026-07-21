const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    try {
        const url = process.env.SUPABASE_URL || 'MISSING';
        const key = process.env.SUPABASE_SERVICE_KEY ? 'SET (len:' + process.env.SUPABASE_SERVICE_KEY.length + ')' : 'MISSING';
        
        const supabase = createClient(
            process.env.SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_KEY || ''
        );

        const { data, error } = await supabase.from('user_profiles').select('user_id').limit(1);

        return res.json({ url, key, data, error: error ? error.message : null });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
