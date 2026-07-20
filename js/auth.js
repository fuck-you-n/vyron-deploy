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
            ? new Date(data.expires_at).toLocaleDateString()
            : 'Never';

        // Show success state
        document.querySelector('.login-form').innerHTML = `
            <div class="success-card">
                <div class="success-icon"><i class="fas fa-check-circle"></i></div>
                <h3>Key Verified</h3>
                <div class="key-display">${data.key_value}</div>
                <div class="key-details">
                    <div class="detail"><span>Tier</span><span class="badge badge-${data.tier === 'premium' ? 'purple' : 'yellow'}">${tier}</span></div>
                    <div class="detail"><span>Expires</span><span>${expiry}</span></div>
                    <div class="detail"><span>Status</span><span class="badge badge-green">Active</span></div>
                </div>
                <p class="success-msg">Open the Vyron Loader on your desktop and paste your key to launch.</p>
            </div>
        `;
    } catch (e) {
        showStatus(status, 'Connection error. Please try again later.', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Validate Key';
        spinner.classList.add('hidden');
    }
}

function showStatus(el, message, type) {
    el.textContent = message;
    el.className = 'status-msg ' + type;
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('licenseKey');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleValidate();
        });
    }
});
