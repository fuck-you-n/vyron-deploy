module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();

    return res.json({
        bodyType: typeof req.body,
        bodyValue: String(req.body).substring(0, 200),
        rawLength: raw.length,
        rawPreview: raw.substring(0, 200)
    });
};
