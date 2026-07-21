// Auth page — key validation (server-side only)

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
        const resp = await fetch('/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: keyValue })
        });

        if (resp.status === 429) {
            const data = await resp.json();
            showStatus(status, data.reason || 'Too many attempts. Please wait.', 'error');
            return;
        }

        const data = await resp.json();

        if (!data.valid) {
            showStatus(status, data.reason || 'Key not found.', 'error');
            return;
        }

        const tier = data.tier === 'premium' ? 'Premium' : data.role === 'admin' ? 'Admin' : data.role === 'founder' ? 'Founder' : 'Free';
        const expiry = data.expires
            ? new Date(data.expires).toLocaleDateString()
            : 'Never';

        document.querySelector('.login-form').innerHTML = `
            <div class="success-card">
                <div class="success-icon"><i class="fas fa-check-circle"></i></div>
                <h3>Key Verified</h3>
                <div class="key-details">
                    <div class="detail"><span>Tier</span><span class="badge badge-${data.tier === 'premium' || data.role === 'admin' || data.role === 'founder' ? 'purple' : 'yellow'}">${tier}</span></div>
                    <div class="detail"><span>Expires</span><span>${expiry}</span></div>
                    <div class="detail"><span>Status</span><span class="badge badge-green">Active</span></div>
                </div>
                <p class="success-msg">Open the Vyron Loader on your desktop and log in with your account.</p>
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

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('licenseKey');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleValidate();
        });
    }
});
