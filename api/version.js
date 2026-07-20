const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    try {
        const configPath = path.join(process.cwd(), 'config.json');
        let version = '1.0.0';
        let changelog = '';
        let downloadUrl = '';

        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            version = config.version || version;
            changelog = config.changelog || '';
            downloadUrl = config.download_url || '';
        }

        if (!downloadUrl) {
            downloadUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/download`;
        }

        return res.json({ version, changelog, download_url: downloadUrl });

    } catch (err) {
        console.error('Version error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
