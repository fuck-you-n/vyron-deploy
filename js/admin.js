// Admin panel — CRUD operations for license keys
let currentSession = null;

// ===== ADMIN LOGIN =====

async function handleAdminLogin() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const btn = document.getElementById('btnAdminLogin');
    const btnText = document.getElementById('adminLoginText');
    const spinner = document.getElementById('adminLoginSpinner');
    const status = document.getElementById('adminLoginStatus');

    if (!email || !password) {
        showStatus(status, 'Enter email and password.', 'error');
        return;
    }

    btn.disabled = true;
    btnText.textContent = 'LOGGING IN...';
    spinner.classList.remove('hidden');
    status.classList.add('hidden');

    try {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) {
            showStatus(status, error.message, 'error');
            return;
        }

        currentSession = data.session;

        // Check admin role
        const userMeta = data.user?.app_metadata || {};
        if (userMeta.role !== 'admin') {
            showStatus(status, 'Access denied. Admin role required.', 'error');
            await _supabase.auth.signOut();
            return;
        }

        document.getElementById('adminLogin').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        document.getElementById('adminEmailDisplay').textContent = email;

        await loadKeys();
    } catch (e) {
        showStatus(status, 'Login failed. Try again.', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'LOGIN';
        spinner.classList.add('hidden');
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    currentSession = null;
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('adminLogin').classList.remove('hidden');
}

// ===== KEY GENERATION =====

function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let s = 0; s < 4; s++) {
        let seg = '';
        for (let i = 0; i < 4; i++) {
            seg += chars[Math.floor(Math.random() * chars.length)];
        }
        segments.push(seg);
    }
    document.getElementById('newKey').value = segments.join('-');
}

// ===== CREATE KEY =====

async function createKey() {
    const keyInput = document.getElementById('newKey');
    const tierSelect = document.getElementById('newTier');
    const expiryInput = document.getElementById('newExpiry');
    const status = document.getElementById('createStatus');

    const key = keyInput.value.trim().toUpperCase();
    if (!key) {
        showStatus(status, 'Enter or generate a key.', 'error');
        return;
    }

    const payload = {
        key_value: key,
        tier: tierSelect.value,
        is_active: true
    };

    if (expiryInput.value) {
        payload.expires_at = new Date(expiryInput.value).toISOString();
    }

    try {
        const { error } = await _supabase.from('license_keys').insert(payload);
        if (error) {
            showStatus(status, error.message, 'error');
            return;
        }

        showStatus(status, `Key created: ${key}`, 'success');
        keyInput.value = '';
        expiryInput.value = '';
        await loadKeys();
    } catch (e) {
        showStatus(status, 'Failed to create key.', 'error');
    }
}

// ===== LOAD KEYS =====

async function loadKeys() {
    const tbody = document.getElementById('keysTableBody');

    try {
        const { data, error } = await _supabase
            .from('license_keys')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No keys found</td></tr>`;
            updateStats([]);
            return;
        }

        updateStats(data);

        tbody.innerHTML = data.map(key => {
            const status = getKeyStatus(key);
            const created = new Date(key.created_at).toLocaleDateString();
            const expires = key.expires_at
                ? new Date(key.expires_at).toLocaleDateString()
                : 'Never';
            const hwid = key.hwid
                ? key.hwid.substring(0, 12) + '...'
                : '—';

            return `
                <tr>
                    <td class="key-cell">${key.key_value}</td>
                    <td>${key.tier}</td>
                    <td>${hwid}</td>
                    <td>${created}</td>
                    <td>${expires}</td>
                    <td><span class="status-badge ${status.class}">${status.label}</span></td>
                    <td>
                        <div class="action-btns">
                            ${key.is_active
                                ? `<button class="btn btn-sm btn-danger" onclick="revokeKey('${key.id}')">Revoke</button>`
                                : `<button class="btn btn-sm btn-success" onclick="activateKey('${key.id}')">Activate</button>`
                            }
                            <button class="btn btn-sm btn-danger" onclick="deleteKey('${key.id}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Connection error</td></tr>`;
    }
}

function getKeyStatus(key) {
    if (!key.is_active) return { class: 'revoked', label: 'Revoked' };
    if (key.expires_at && new Date(key.expires_at) < new Date()) return { class: 'expired', label: 'Expired' };
    return { class: 'active', label: 'Active' };
}

function updateStats(keys) {
    document.getElementById('statTotal').textContent = keys.length;
    document.getElementById('statActive').textContent = keys.filter(k => getKeyStatus(k).class === 'active').length;
    document.getElementById('statExpired').textContent = keys.filter(k => getKeyStatus(k).class === 'expired').length;
    document.getElementById('statRevoked').textContent = keys.filter(k => getKeyStatus(k).class === 'revoked').length;
}

// ===== REVOKE / ACTIVATE / DELETE =====

async function revokeKey(id) {
    const { error } = await _supabase.from('license_keys').update({ is_active: false }).eq('id', id);
    if (!error) await loadKeys();
}

async function activateKey(id) {
    const { error } = await _supabase.from('license_keys').update({ is_active: true }).eq('id', id);
    if (!error) await loadKeys();
}

async function deleteKey(id) {
    if (!confirm('Permanently delete this key?')) return;
    const { error } = await _supabase.from('license_keys').delete().eq('id', id);
    if (!error) await loadKeys();
}

// ===== HELPERS =====

function showStatus(el, message, type) {
    el.textContent = message;
    el.className = `status-msg ${type}`;
}

// Auto-load if already authenticated
document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await _supabase.auth.getSession();
    if (data.session) {
        const userMeta = data.session.user?.app_metadata || {};
        if (userMeta.role === 'admin') {
            currentSession = data.session;
            document.getElementById('adminLogin').classList.add('hidden');
            document.getElementById('adminDashboard').classList.remove('hidden');
            document.getElementById('adminEmailDisplay').textContent = data.session.user.email;
            await loadKeys();
        }
    }
});
