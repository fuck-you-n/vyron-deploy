const crypto = require('crypto');

function sha256(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

async function checkRateLimit(supabase, ip, endpoint, maxAttempts, windowMinutes) {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const { count, error } = await supabase
        .from('login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('ip', ip)
        .eq('endpoint', endpoint)
        .eq('success', false)
        .gte('created_at', cutoff);

    if (error) {
        console.error('Rate limit check error:', error);
        return { blocked: false, retryAfter: 0 };
    }

    if ((count || 0) >= maxAttempts) {
        const retryAfter = Math.ceil(windowMinutes * 60 - (Date.now() - new Date(cutoff).getTime()) / 1000);
        return { blocked: true, retryAfter: Math.max(retryAfter, 60) };
    }

    return { blocked: false, retryAfter: 0 };
}

async function recordAttempt(supabase, ip, endpoint, success) {
    await supabase.from('login_attempts').insert({
        ip,
        endpoint,
        success
    });

    if (!success) return;

    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
        .from('login_attempts')
        .delete()
        .eq('ip', ip)
        .eq('endpoint', endpoint)
        .eq('success', true)
        .lt('created_at', cutoff);
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const first = Array.isArray(xff) ? xff[0] : xff.split(',')[0].trim();
        if (first) return first;
    }
    return req.socket?.remoteAddress || 'unknown';
}

module.exports = { sha256, checkRateLimit, recordAttempt, getClientIp };
