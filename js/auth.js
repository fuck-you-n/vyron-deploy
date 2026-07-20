// Auth page — key validation

async function handleValidate() {
    const keyInput = document.getElementById('licenseKey');
    const btn = document.getElementById('btnValidate');
    const btnText = document.getElementById('btnText');
    const spinner = document.getElementById('btnSpinner');
    const status = document.getElementById('statusMessage');

    const keyValue = keyInput.value.trim().toUpperCase();
    if (!keyValue) {
        showStatus(status, 'Please enter a license key.', 'error');
        return;
    }

    btn.disabled = true;
    btnText.textContent = 'VALIDATING...';
    spinner.classList.remove('hidden');
    status.classList.add('hidden');

    try {
        const { data, error } = await _supabase
            .from('license_keys')
            .select('*')
            .eq('key_value', keyValue)
            .single();

        if (error || !data) {
            showStatus(status, 'Key not found. Please check and try again.', 'error');
            return;
        }

        if (!data.is_active) {
            showStatus(status, 'This key has been revoked.', 'error');
            return;
        }

        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            showStatus(status, 'This key has expired.', 'error');
            return;
        }

        const tier = data.tier === 'premium' ? 'Premium' : 'Free';
        const expiry = data.expires_at
            ? `Expires: ${new Date(data.expires_at).toLocaleDateString()}`
            : 'Expires: Never';

        showStatus(status, `Valid — Tier: ${tier} — ${expiry}`, 'success');
    } catch (e) {
        showStatus(status, 'Connection error. Please try again later.', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'VALIDATE';
        spinner.classList.add('hidden');
    }
}

function showStatus(el, message, type) {
    el.textContent = message;
    el.className = `status-msg ${type}`;
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('licenseKey');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleValidate();
        });
    }

    // Background particles
    createParticles();
});

function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 8 + 's';
        p.style.animationDuration = (6 + Math.random() * 6) + 's';
        container.appendChild(p);
    }
}
