let currentSession = null;
let currentProfile = null;
let allKeys = [];
let allProfiles = [];
let currentFilter = 'all';
let editingKeyId = null;

const ROLE_HIERARCHY = { founder: 4, admin: 3, premium: 2, free: 1 };
const ROLE_COLORS = { founder: 'gold', admin: 'purple', premium: 'blue', free: 'yellow' };
const ROLE_ICONS = { founder: 'fa-star', admin: 'fa-shield', premium: 'fa-crown', free: 'fa-user' };

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Supabase to load
    for (let i = 0; i < 50; i++) {
        if (window._supabase) break;
        await new Promise(r => setTimeout(r, 200));
    }
    if (!window._supabase) { alert('Failed to load Supabase. Refresh the page.'); return; }
    window._supabase = window._supabase; // ensure window._supabase alias works
    console.log('[VYRON ADMIN] Supabase loaded, checking session...');
    const { data, error: sessErr } = await window._supabase.auth.getSession();
    console.log('[VYRON ADMIN] Session:', data.session ? 'exists' : 'none', sessErr || '');
    if (data.session) {
        console.log('[VYRON ADMIN] User ID:', data.session.user.id, 'Email:', data.session.user.email);
        const { data: profile, error: profileErr } = await window._supabase.from('user_profiles').select('*').eq('user_id', data.session.user.id).single();
        console.log('[VYRON ADMIN] Profile query result:', JSON.stringify(profile), 'Error:', profileErr || 'none');
        if (profile && ROLE_HIERARCHY[profile.role] >= ROLE_HIERARCHY['admin']) {
            console.log('[VYRON ADMIN] Access granted, role:', profile.role);
            currentSession = data.session;
            currentProfile = profile;
            showDashboard();
        } else {
            console.log('[VYRON ADMIN] Access denied. Profile:', profile ? profile.role : 'null');
        }
    }
});

function showDashboard() {
    document.getElementById('adminLogin').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    document.getElementById('adminEmailDisplay').textContent = currentSession.user.email;

    const role = currentProfile?.role || 'admin';
    const roleBadge = document.getElementById('adminRoleDisplay');
    roleBadge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    roleBadge.className = 'admin-role role-' + role;

    const avatar = document.getElementById('adminAvatar');
    avatar.innerHTML = `<i class="fas ${ROLE_ICONS[role] || 'fa-user-shield'}"></i>`;
    if (role === 'founder') avatar.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
    else avatar.style.background = 'linear-gradient(135deg, #6c3fea, #3b82f6)';

    loadAllData();
}

// ===== NAVIGATION =====
function showSection(name) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const section = document.getElementById('section-' + name);
    if (section) section.classList.add('active');
    const titles = { overview: 'Overview', keys: 'License Keys', plans: 'Plans & Downloads', users: 'Users', settings: 'Settings' };
    document.getElementById('pageTitle').textContent = titles[name] || name;
    document.querySelectorAll('.nav-item').forEach(n => { if (n.querySelector('span')?.textContent.toLowerCase() === name) n.classList.add('active'); });
    if (name === 'plans') loadPlanConfig();
    if (name === 'users') loadUsers();
}
function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('open'); }

// ===== LOGIN / LOGOUT =====
async function handleAdminLogin() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const status = document.getElementById('adminLoginStatus');
    const btn = document.getElementById('btnAdminLogin');
    const btnText = document.getElementById('adminLoginText');
    const spinner = document.getElementById('adminLoginSpinner');
    if (!email || !password) { showStatus(status, 'Enter credentials.', 'error'); return; }
    btn.disabled = true; btnText.textContent = 'Signing in...'; spinner.classList.remove('hidden'); status.classList.add('hidden');
    try {
        const { data, error } = await window._supabase.auth.signInWithPassword({ email, password });
        if (error) { showStatus(status, error.message, 'error'); return; }

        console.log('[VYRON ADMIN] Login success, user ID:', data.user.id);
        // Check role from user_profiles
        const { data: profile, error: profileErr } = await window._supabase.from('user_profiles').select('*').eq('user_id', data.user.id).single();
        console.log('[VYRON ADMIN] Profile after login:', JSON.stringify(profile), 'Error:', profileErr || 'none');
        if (!profile) {
            console.error('[VYRON ADMIN] No profile row found for user. Creating one...');
            // Auto-create profile if missing
            const username = data.user.user_metadata && data.user.user_metadata.username ? data.user.user_metadata.username : email.split('@')[0];
            const { error: insertErr } = await window._supabase.from('user_profiles').insert({ user_id: data.user.id, username: username, role: 'free' });
            console.log('[VYRON ADMIN] Auto-created profile, error:', insertErr || 'none');
            showStatus(status, 'No profile found. A free profile was auto-created. Set your role via SQL Editor.', 'error');
            await window._supabase.auth.signOut(); return;
        }
        if (ROLE_HIERARCHY[profile.role] < ROLE_HIERARCHY['admin']) {
            console.log('[VYRON ADMIN] Role too low:', profile.role, 'need admin+');
            showStatus(status, 'Access denied — admin role required. Your role: ' + profile.role, 'error');
            await window._supabase.auth.signOut(); return;
        }
        currentSession = data.session; currentProfile = profile;
        showDashboard();
    } catch (e) { console.error('[VYRON ADMIN] Login error:', e); showStatus(status, 'Login failed.', 'error'); }
    finally { btn.disabled = false; btnText.textContent = 'Sign In'; spinner.classList.add('hidden'); }
}
async function handleLogout() {
    await window._supabase.auth.signOut(); currentSession = null; currentProfile = null;
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('adminLogin').classList.remove('hidden');
}
function togglePassword() {
    const input = document.getElementById('adminPassword');
    const icon = document.querySelector('.toggle-pw i');
    input.type = input.type === 'password' ? 'text' : 'password';
    icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// ===== DATA =====
async function loadAllData() {
    await Promise.all([loadKeys(), loadProfiles()]);
}

async function loadKeys() {
    const { data, error } = await window._supabase.from('license_keys').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    allKeys = data || [];
    updateStats(); renderKeys(); renderRoleBreakdown();
}

async function loadProfiles() {
    const { data, error } = await window._supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    allProfiles = data || [];
}

function updateStats() {
    const now = new Date();
    document.getElementById('statTotal').textContent = allKeys.length;
    document.getElementById('statActive').textContent = allKeys.filter(k => k.is_active && (!k.expires_at || new Date(k.expires_at) > now)).length;
    document.getElementById('statExpired').textContent = allKeys.filter(k => k.is_active && k.expires_at && new Date(k.expires_at) <= now).length;
    document.getElementById('statRevoked').textContent = allKeys.filter(k => !k.is_active).length;
}

function renderRoleBreakdown() {
    const container = document.getElementById('roleBreakdown');
    const roles = ['founder', 'admin', 'premium', 'free'];
    container.innerHTML = roles.map(r => {
        const count = allKeys.filter(k => k.role === r).length;
        return `<div class="info-row"><span><i class="fas ${ROLE_ICONS[r]}" style="color:var(--${ROLE_COLORS[r] === 'gold' ? 'yellow' : ROLE_COLORS[r]});margin-right:8px"></i>${r.charAt(0).toUpperCase() + r.slice(1)}</span><span style="font-weight:700">${count}</span></div>`;
    }).join('');
}

function getKeyStatus(k) {
    if (!k.is_active) return { key: 'revoked', label: 'Revoked', color: 'red' };
    if (k.expires_at && new Date(k.expires_at) < new Date()) return { key: 'expired', label: 'Expired', color: 'yellow' };
    return { key: 'active', label: 'Active', color: 'green' };
}

// ===== KEYS TABLE =====
function renderKeys() {
    const tbody = document.getElementById('keysTableBody');
    let filtered = allKeys;
    if (currentFilter === 'active') filtered = allKeys.filter(k => getKeyStatus(k).key === 'active');
    else if (currentFilter === 'expired') filtered = allKeys.filter(k => getKeyStatus(k).key === 'expired');
    else if (currentFilter === 'revoked') filtered = allKeys.filter(k => getKeyStatus(k).key === 'revoked');
    else if (['founder','admin','premium','free'].includes(currentFilter)) filtered = allKeys.filter(k => k.role === currentFilter);

    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="empty-state"><i class="fas fa-inbox"></i><p>No keys</p></div></td></tr>'; return; }

    tbody.innerHTML = filtered.map(k => {
        const s = getKeyStatus(k);
        const role = k.role || 'free';
        const created = new Date(k.created_at).toLocaleDateString();
        const expires = k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never';
        const hwid = k.hwid ? k.hwid.substring(0, 14) + '...' : '—';
        return `<tr>
            <td><input type="checkbox" class="key-check" value="${k.id}" onchange="updateBulkActions()"></td>
            <td class="key-cell">${k.key_value}</td>
            <td><span class="badge badge-${ROLE_COLORS[role]}" onclick="openEditRole('${k.id}','${k.key_value}','${role}')" style="cursor:pointer" title="Click to change role"><i class="fas ${ROLE_ICONS[role]}"></i> ${role}</span></td>
            <td style="font-size:11px;color:var(--text-3)">${hwid}</td>
            <td>${created}</td><td>${expires}</td>
            <td><span class="badge badge-${s.color}">${s.label}</span></td>
            <td><div class="action-btns">
                ${k.is_active ? `<button class="btn btn-sm btn-warning" onclick="revokeKey('${k.id}')" title="Revoke"><i class="fas fa-ban"></i></button>` : `<button class="btn btn-sm btn-success" onclick="activateKey('${k.id}')" title="Activate"><i class="fas fa-check"></i></button>`}
                <button class="btn btn-sm btn-danger" onclick="deleteKey('${k.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

function filterKeys(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderKeys();
}

function handleSearch(q) {
    if (!q) { renderKeys(); return; }
    const lq = q.toLowerCase();
    const temp = allKeys; allKeys = allKeys.filter(k => k.key_value.toLowerCase().includes(lq) || (k.hwid && k.hwid.toLowerCase().includes(lq)));
    renderKeys(); allKeys = temp;
}

// ===== SELECT / BULK =====
function toggleSelectAll(cb) { document.querySelectorAll('.key-check').forEach(c => c.checked = cb.checked); updateBulkActions(); }
function updateBulkActions() {
    const c = document.querySelectorAll('.key-check:checked');
    const bar = document.getElementById('bulkActions');
    bar.classList.toggle('hidden', c.length === 0);
    document.getElementById('selectedCount').textContent = c.length + ' selected';
}
function getSelectedIds() { return Array.from(document.querySelectorAll('.key-check:checked')).map(c => c.value); }
async function bulkRole(role) { for (const id of getSelectedIds()) await window._supabase.from('license_keys').update({ role }).eq('id', id); await loadKeys(); }
async function bulkRevoke() { for (const id of getSelectedIds()) await window._supabase.from('license_keys').update({ is_active: false }).eq('id', id); await loadKeys(); }
async function bulkDelete() { if (!confirm('Delete selected?')) return; for (const id of getSelectedIds()) await window._supabase.from('license_keys').delete().eq('id', id); await loadKeys(); }

// ===== KEY CRUD =====
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segs = []; for (let s = 0; s < 4; s++) { let seg = ''; for (let i = 0; i < 4; i++) seg += chars[Math.floor(Math.random() * chars.length)]; segs.push(seg); }
    document.getElementById('newKey').value = segs.join('-');
}
function showCreateModal() {
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('newKey').value = ''; document.getElementById('newRole').value = 'premium'; document.getElementById('newExpiry').value = '';
    document.getElementById('createStatus').classList.add('hidden');
}
function closeCreateModal() { document.getElementById('createModal').classList.add('hidden'); }

async function createKey() {
    const key = document.getElementById('newKey').value.trim().toUpperCase();
    const role = document.getElementById('newRole').value;
    const expiry = document.getElementById('newExpiry').value;
    const status = document.getElementById('createStatus');
    if (!key) { showStatus(status, 'Enter or generate a key.', 'error'); return; }
    const payload = { key_value: key, role, is_active: true };
    if (expiry) payload.expires_at = new Date(expiry).toISOString();
    const { error } = await window._supabase.from('license_keys').insert(payload);
    if (error) { showStatus(status, error.message, 'error'); return; }
    showStatus(status, 'Created: ' + key, 'success');
    await loadKeys(); setTimeout(closeCreateModal, 1000);
}

async function revokeKey(id) { await window._supabase.from('license_keys').update({ is_active: false }).eq('id', id); await loadKeys(); }
async function activateKey(id) { await window._supabase.from('license_keys').update({ is_active: true }).eq('id', id); await loadKeys(); }
async function deleteKey(id) { if (!confirm('Delete permanently?')) return; await window._supabase.from('license_keys').delete().eq('id', id); await loadKeys(); }

// ===== EDIT ROLE MODAL =====
function openEditRole(id, keyVal, currentRole) {
    editingKeyId = id;
    document.getElementById('editRoleKey').textContent = keyVal;
    document.getElementById('editRoleSelect').value = currentRole;
    document.getElementById('editRoleModal').classList.remove('hidden');
    document.getElementById('editRoleStatus').classList.add('hidden');
}
function closeEditRoleModal() { document.getElementById('editRoleModal').classList.add('hidden'); editingKeyId = null; }
async function saveEditRole() {
    const role = document.getElementById('editRoleSelect').value;
    const status = document.getElementById('editRoleStatus');
    if (!editingKeyId) return;
    const { error } = await window._supabase.from('license_keys').update({ role }).eq('id', editingKeyId);
    if (error) { showStatus(status, error.message, 'error'); return; }
    showStatus(status, 'Role updated to ' + role, 'success');
    await loadKeys(); setTimeout(closeEditRoleModal, 800);
}

// ===== PLANS / CONFIG =====
async function loadPlanConfig() {
    const { data } = await window._supabase.from('app_config').select('*');
    if (!data) return;
    const map = {}; data.forEach(r => map[r.key] = r.value);
    document.getElementById('cfgPremiumUrl').value = map['download_premium_url'] || '';
    document.getElementById('cfgFreeUrl').value = map['download_free_url'] || '';
    document.getElementById('cfgVersion').value = map['version'] || '1.0.0';
    document.getElementById('cfgChangelog').value = map['changelog'] || '';

    const counts = { founder: 0, admin: 0, premium: 0, free: 0 };
    allKeys.forEach(k => { const r = k.role || 'free'; if (counts[r] !== undefined) counts[r]++; });

    document.getElementById('plansGrid').innerHTML = [
        { role: 'founder', icon: 'fa-star', color: '#f59e0b', name: 'Founder', desc: 'Full control — manages admins, all access' },
        { role: 'admin', icon: 'fa-shield', color: '#6c3fea', name: 'Admin', desc: 'Manages keys, plans, and users' },
        { role: 'premium', icon: 'fa-crown', color: '#3b82f6', name: 'Premium', desc: 'Premium cheat loader with all features' },
        { role: 'free', icon: 'fa-user', color: '#606080', name: 'Free', desc: 'Basic free cheat loader' },
    ].map(p => `<div class="plan-card" style="text-align:center;padding:28px 20px">
        <div style="font-size:28px;color:${p.color};margin-bottom:12px"><i class="fas ${p.icon}"></i></div>
        <h4 style="margin-bottom:4px">${p.name}</h4>
        <p style="font-size:12px;color:var(--text-3);margin-bottom:12px">${p.desc}</p>
        <div style="font-size:24px;font-weight:800">${counts[p.role]}</div>
        <div style="font-size:11px;color:var(--text-3)">users</div>
    </div>`).join('');
}

async function savePlanConfig() {
    const status = document.getElementById('planConfigStatus');
    const updates = [
        { key: 'download_premium_url', value: document.getElementById('cfgPremiumUrl').value.trim() },
        { key: 'download_free_url', value: document.getElementById('cfgFreeUrl').value.trim() },
        { key: 'version', value: document.getElementById('cfgVersion').value.trim() },
        { key: 'changelog', value: document.getElementById('cfgChangelog').value.trim() },
    ];
    const { error } = await window._supabase.from('app_config').upsert(updates, { onConflict: 'key' });
    if (error) { showStatus(status, error.message, 'error'); return; }
    showStatus(status, 'Config saved.', 'success');
}

// ===== USERS (from user_profiles + license_keys) =====
async function loadUsers() {
    // Fetch user profiles with their linked keys
    const { data: profiles, error: pErr } = await window._supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    if (pErr) { console.error(pErr); return; }
    allProfiles = profiles || [];

    // Fetch all keys to find linked ones
    const { data: keys } = await window._supabase.from('license_keys').select('*');
    const keyMap = {};
    (keys || []).forEach(k => { if (k.user_id) keyMap[k.user_id] = k; });

    renderUsers(keyMap);
}

function renderUsers(keyMap) {
    const tbody = document.getElementById('usersTableBody');
    keyMap = keyMap || {};

    if (!allProfiles.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row"><div class="empty-state"><p>No registered users</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = allProfiles.map(p => {
        const role = p.role || 'free';
        const linkedKey = keyMap[p.user_id];
        const keyDisplay = linkedKey ? linkedKey.key_value : '—';
        const keyStatus = linkedKey ? (linkedKey.is_active ? 'Active' : 'Revoked') : 'No key';
        const keyColor = linkedKey ? (linkedKey.is_active ? 'green' : 'red') : 'yellow';
        const joined = new Date(p.created_at).toLocaleDateString();

        return `<tr>
            <td style="font-weight:600">@${p.username}</td>
            <td style="font-size:12px;color:var(--text-3)">—</td>
            <td><span class="badge badge-${ROLE_COLORS[role]}" onclick="openEditRole(null,'${p.username}','${role}')" style="cursor:pointer"><i class="fas ${ROLE_ICONS[role]}"></i> ${role}</span></td>
            <td class="key-cell" style="font-size:12px">${keyDisplay}</td>
            <td><span class="badge badge-${keyColor}">${keyStatus}</span></td>
            <td>${joined}</td>
        </tr>`;
    }).join('');
}

// ===== ASSIGN ROLE (Settings) =====
async function assignRole() {
    const email = document.getElementById('newAdminEmail').value.trim();
    const role = document.getElementById('newAdminRole').value;
    const status = document.getElementById('assignRoleStatus');
    if (!email) { showStatus(status, 'Enter an email.', 'error'); return; }

    // Find user by email via auth.users (needs service_role, but we can try user_profiles)
    // Since we can't query auth.users from client, provide SQL
    const sql = `UPDATE user_profiles SET role = '${role}' WHERE user_id = (SELECT id FROM auth.users WHERE email = '${email}');`;
    showStatus(status, `Run in SQL Editor:\n${sql}`, 'success');
    try { await navigator.clipboard.writeText(sql); } catch {}
}

// ===== EXPORT =====
function exportKeys() {
    if (!allKeys.length) { alert('No keys.'); return; }
    const csv = ['Key,Role,HWID,Created,Expires,Status'];
    allKeys.forEach(k => { const s = getKeyStatus(k); csv.push(`${k.key_value},${k.role||'free'},${k.hwid||''},${k.created_at},${k.expires_at||''},${s.label}`); });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vyron-keys.csv'; a.click();
}

function showStatus(el, msg, type) { el.textContent = msg; el.className = 'status-msg ' + type; }
