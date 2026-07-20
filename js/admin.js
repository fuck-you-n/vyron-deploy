let currentSession = null;
let allKeys = [];
let currentFilter = 'all';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await _supabase.auth.getSession();
    if (data.session) {
        const userMeta = data.session.user?.app_metadata || {};
        if (userMeta.role === 'admin') {
            currentSession = data.session;
            showDashboard();
            return;
        }
    }
});

function showDashboard() {
    document.getElementById('adminLogin').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    document.getElementById('adminEmailDisplay').textContent = currentSession.user.email;
    document.getElementById('settingSupabaseUrl').textContent = SUPABASE_URL;
    loadAllData();
}

// ===== NAVIGATION =====
function showSection(name) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const section = document.getElementById('section-' + name);
    if (section) section.classList.add('active');

    const titles = { overview: 'Overview', keys: 'License Keys', users: 'Users', subscriptions: 'Subscriptions', downloads: 'Downloads & Versions', settings: 'Settings' };
    document.getElementById('pageTitle').textContent = titles[name] || name;

    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.querySelector('span') && n.querySelector('span').textContent.toLowerCase() === name) n.classList.add('active');
    });

    if (name === 'users') loadUsers();
    if (name === 'keys') renderKeys();
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
}

// ===== ADMIN LOGIN =====
async function handleAdminLogin() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const btn = document.getElementById('btnAdminLogin');
    const btnText = document.getElementById('adminLoginText');
    const spinner = document.getElementById('adminLoginSpinner');
    const status = document.getElementById('adminLoginStatus');

    if (!email || !password) { showStatus(status, 'Enter email and password.', 'error'); return; }

    btn.disabled = true; btnText.textContent = 'Signing in...'; spinner.classList.remove('hidden'); status.classList.add('hidden');

    try {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) { showStatus(status, error.message, 'error'); return; }

        const userMeta = data.user?.app_metadata || {};
        if (userMeta.role !== 'admin') {
            showStatus(status, 'Access denied — admin role required.', 'error');
            await _supabase.auth.signOut();
            return;
        }

        currentSession = data.session;
        showDashboard();
    } catch (e) {
        showStatus(status, 'Login failed.', 'error');
    } finally {
        btn.disabled = false; btnText.textContent = 'Sign In'; spinner.classList.add('hidden');
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    currentSession = null;
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('adminLogin').classList.remove('hidden');
}

function togglePassword() {
    const input = document.getElementById('adminPassword');
    const icon = document.querySelector('.toggle-pw i');
    if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
    else { input.type = 'password'; icon.className = 'fas fa-eye'; }
}

// ===== DATA LOADING =====
async function loadAllData() { await loadKeys(); }

async function loadKeys() {
    const { data, error } = await _supabase
        .from('license_keys').select('*').order('created_at', { ascending: false });

    if (error) { console.error(error); return; }
    allKeys = data || [];
    updateStats();
    renderKeys();
    renderRecentKeys();
}

function updateStats() {
    const now = new Date();
    const active = allKeys.filter(k => k.is_active && (!k.expires_at || new Date(k.expires_at) > now)).length;
    const expired = allKeys.filter(k => k.is_active && k.expires_at && new Date(k.expires_at) <= now).length;
    const revoked = allKeys.filter(k => !k.is_active).length;

    document.getElementById('statTotal').textContent = allKeys.length;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statExpired').textContent = expired;
    document.getElementById('statRevoked').textContent = revoked;
    document.getElementById('subFreeCount').textContent = allKeys.filter(k => k.tier === 'free').length;
    document.getElementById('subPremiumCount').textContent = allKeys.filter(k => k.tier === 'premium').length;
}

function renderRecentKeys() {
    const container = document.getElementById('recentKeysList');
    const recent = allKeys.slice(0, 5);
    if (recent.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No keys yet</p></div>';
        return;
    }
    container.innerHTML = recent.map(k => {
        const s = getKeyStatus(k);
        return `<div class="recent-key-item">
            <div><div class="key-val">${k.key_value}</div><div class="key-meta">${k.tier} · ${s.label}</div></div>
            <span class="badge badge-${s.color}">${s.label}</span>
        </div>`;
    }).join('');
}

function renderKeys() {
    const tbody = document.getElementById('keysTableBody');
    let filtered = allKeys;

    if (currentFilter !== 'all') {
        filtered = allKeys.filter(k => {
            const s = getKeyStatus(k).key;
            return s === currentFilter;
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="empty-state"><i class="fas fa-inbox"></i><p>No keys found</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(k => {
        const s = getKeyStatus(k);
        const created = new Date(k.created_at).toLocaleDateString();
        const expires = k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never';
        const hwid = k.hwid ? k.hwid.substring(0, 16) + '...' : '—';
        return `<tr>
            <td><input type="checkbox" class="key-check" value="${k.id}" onchange="updateBulkActions()"></td>
            <td class="key-cell">${k.key_value}</td>
            <td><span class="badge badge-${k.tier === 'premium' ? 'purple' : 'yellow'}">${k.tier}</span></td>
            <td style="font-size:11px;color:var(--text-3)">${hwid}</td>
            <td>${created}</td>
            <td>${expires}</td>
            <td><span class="badge badge-${s.color}">${s.label}</span></td>
            <td><div class="action-btns">
                ${k.is_active
                    ? `<button class="btn btn-sm btn-warning" onclick="revokeKey('${k.id}')" title="Revoke"><i class="fas fa-ban"></i></button>`
                    : `<button class="btn btn-sm btn-success" onclick="activateKey('${k.id}')" title="Activate"><i class="fas fa-check"></i></button>`}
                <button class="btn btn-sm btn-danger" onclick="deleteKey('${k.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

function getKeyStatus(k) {
    if (!k.is_active) return { key: 'revoked', label: 'Revoked', color: 'red' };
    if (k.expires_at && new Date(k.expires_at) < new Date()) return { key: 'expired', label: 'Expired', color: 'yellow' };
    return { key: 'active', label: 'Active', color: 'green' };
}

function filterKeys(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderKeys();
}

function handleSearch(query) {
    if (!query) { renderKeys(); return; }
    const q = query.toLowerCase();
    const tbody = document.getElementById('keysTableBody');
    const filtered = allKeys.filter(k => k.key_value.toLowerCase().includes(q) || (k.hwid && k.hwid.toLowerCase().includes(q)));
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="empty-state"><p>No matching keys</p></div></td></tr>';
        return;
    }
    // Reuse render logic with filtered set
    const temp = allKeys; allKeys = filtered; renderKeys(); allKeys = temp;
}

// ===== SELECT ALL / BULK =====
function toggleSelectAll(cb) {
    document.querySelectorAll('.key-check').forEach(c => c.checked = cb.checked);
    updateBulkActions();
}
function updateBulkActions() {
    const checked = document.querySelectorAll('.key-check:checked');
    const bar = document.getElementById('bulkActions');
    if (checked.length === 0) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    document.getElementById('selectedCount').textContent = checked.length + ' selected';
}
function getSelectedIds() {
    return Array.from(document.querySelectorAll('.key-check:checked')).map(c => c.value);
}
async function bulkActivate() {
    for (const id of getSelectedIds()) await _supabase.from('license_keys').update({ is_active: true }).eq('id', id);
    await loadKeys();
}
async function bulkRevoke() {
    for (const id of getSelectedIds()) await _supabase.from('license_keys').update({ is_active: false }).eq('id', id);
    await loadKeys();
}
async function bulkDelete() {
    if (!confirm('Delete selected keys permanently?')) return;
    for (const id of getSelectedIds()) await _supabase.from('license_keys').delete().eq('id', id);
    await loadKeys();
}

// ===== KEY ACTIONS =====
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segs = [];
    for (let s = 0; s < 4; s++) {
        let seg = '';
        for (let i = 0; i < 4; i++) seg += chars[Math.floor(Math.random() * chars.length)];
        segs.push(seg);
    }
    document.getElementById('newKey').value = segs.join('-');
}

function showCreateModal() {
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('newKey').value = '';
    document.getElementById('newTier').value = 'premium';
    document.getElementById('newExpiry').value = '';
    document.getElementById('createStatus').classList.add('hidden');
}
function closeCreateModal() { document.getElementById('createModal').classList.add('hidden'); }

async function createKey() {
    const key = document.getElementById('newKey').value.trim().toUpperCase();
    const tier = document.getElementById('newTier').value;
    const expiry = document.getElementById('newExpiry').value;
    const status = document.getElementById('createStatus');

    if (!key) { showStatus(status, 'Enter or generate a key.', 'error'); return; }

    const payload = { key_value: key, tier, is_active: true };
    if (expiry) payload.expires_at = new Date(expiry).toISOString();

    const { error } = await _supabase.from('license_keys').insert(payload);
    if (error) { showStatus(status, error.message, 'error'); return; }

    showStatus(status, 'Key created: ' + key, 'success');
    await loadKeys();
    setTimeout(closeCreateModal, 1200);
}

async function revokeKey(id) {
    await _supabase.from('license_keys').update({ is_active: false }).eq('id', id);
    await loadKeys();
}
async function activateKey(id) {
    await _supabase.from('license_keys').update({ is_active: true }).eq('id', id);
    await loadKeys();
}
async function deleteKey(id) {
    if (!confirm('Delete this key permanently?')) return;
    await _supabase.from('license_keys').delete().eq('id', id);
    await loadKeys();
}

// ===== EXPORT =====
function exportKeys() {
    if (allKeys.length === 0) { alert('No keys to export.'); return; }
    const csv = ['Key,Tier,HWID,Created,Expires,Status'];
    allKeys.forEach(k => {
        const s = getKeyStatus(k);
        csv.push(`${k.key_value},${k.tier},${k.hwid || ''},${k.created_at},${k.expires_at || ''},${s.label}`);
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vyron-keys.csv';
    a.click();
}

// ===== USERS (requires service key on server side) =====
async function loadUsers() {
    document.getElementById('usersTableBody').innerHTML =
        '<tr><td colspan="5" class="empty-row"><div class="empty-state"><i class="fas fa-lock"></i><p>User management requires the API server with service_role key</p></div></td></tr>';
}

// ===== PUSH UPDATE =====
async function pushUpdate() {
    const version = document.getElementById('newVersion').value.trim();
    const downloadUrl = document.getElementById('newDownloadUrl').value.trim();
    const changelog = document.getElementById('newChangelog').value.trim();
    const status = document.getElementById('updateStatus');

    if (!version) { showStatus(status, 'Enter a version number.', 'error'); return; }

    try {
        const { error } = await _supabase.from('app_config').upsert([
            { key: 'version', value: version, updated_at: new Date().toISOString() },
            { key: 'download_url', value: downloadUrl, updated_at: new Date().toISOString() },
            { key: 'changelog', value: changelog, updated_at: new Date().toISOString() }
        ]);
        if (error) { showStatus(status, error.message, 'error'); return; }
        showStatus(status, 'Updated to v' + version, 'success');
    } catch (e) {
        showStatus(status, 'Failed. Make sure app_config table exists.', 'error');
    }
}

// ===== HELPERS =====
function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status-msg ' + type;
}
