const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
    try {
        const configPath = path.join(process.cwd(), 'config.json');
        let downloadUrl = '';

        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            downloadUrl = config.download_url || '';
        }

        if (downloadUrl) {
            return res.redirect(302, downloadUrl);
        }

        const localPath = path.join(process.cwd(), 'downloads', 'vyron.exe');

        if (fs.existsSync(localPath)) {
            const stat = fs.statSync(localPath);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', 'attachment; filename="vyron.exe"');
            fs.createReadStream(localPath).pipe(res);
        } else {
            return res.status(404).json({
                error: 'No download configured. Set download_url in config.json or place vyron.exe in downloads/.'
            });
        }

    } catch (err) {
        console.error('Download error:', err);
        return res.status(500).json({ error: 'Server error.' });
    }
};
