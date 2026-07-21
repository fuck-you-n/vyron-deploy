const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    try {
        const tier = req.query.tier || 'free';

        let version = '1.0.0';
        let changelog = '';
        let downloadUrl = '';

        // Try config.json first
        const configPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            version = config.version || version;
            changelog = config.changelog || '';
        }

        // Try app_config from database for tier-specific download URL
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
            try {
                const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
                const { data } = await supabase.from('app_config').select('*');
                if (data) {
                    const cfg = {};
                    data.forEach(r => cfg[r.key] = r.value);
                    if (cfg.version) version = cfg.version;
                    if (cfg.changelog) changelog = cfg.changelog;

                    if (tier === 'premium' || tier === 'admin' || tier === 'founder') {
                        downloadUrl = cfg.download_premium_url || '';
                    } else {
                        downloadUrl = cfg.download_free_url || '';
                    }
                }
            } catch (e) {
                console.error('DB lookup failed, using config.json:', e.message);
            }
        }

        // Fallback to config.json download_url
        if (!downloadUrl) {
            downloadUrl = config.download_url || '';
        }

        if (!downloadUrl) {
            const proto = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            downloadUrl = `${proto}://${host}/api/download`;
        }

        return res.json({ version, changelog, download_url: downloadUrl });

    } catch (err) {
        console.error('Version error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
