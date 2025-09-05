// Branch Staff Directory JavaScript (refactored for safety, usability, and maintainability)

// === CONSTANTS & UTILITIES ===
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpC3yx4TNwq-vEJiO2HeJ54X0TPWiKLZW_yypByCkbz2Cgc5_ABafmrWoZUBZJo2Kp/exec';
const FALLBACK_THUMBNAIL = "https://drive.google.com/thumbnail?id=1iUQhelba6oMDa5Lb3EuZL_B4_MS4plzC";
const FALLBACK_PHOTO = "https://drive.google.com/uc?export=download&id=1iUQhelba6oMDa5Lb3EuZL_B4_MS4plzC";

let allData = [];
let isAdmin = false;
let tempPhotoData = null;
let currentBranch = '';
let staffOriginal = null;
const GLOBAL_STATE = { // encapsulated state for fixes
  tempPhotoData: null,
  currentBranch: '',
  staffOriginal: null
};

// Utility: String Escaping
function escapeHtml(unsafe) {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// Utility: Format mobile to always start with 0
function formatMobile(mobile) {
  if (!mobile || String(mobile).trim() === '') return '';
  mobile = String(mobile);
  return mobile.startsWith('0') ? mobile : '0' + mobile;
}
// Utility: Normalize mobile for searches
function normalizeMobile(mobile) {
  if (!mobile || String(mobile).trim() === '') return '';
  mobile = String(mobile);
  return mobile.startsWith('0') ? mobile : '0' + mobile;
}
// Utility: Consistent notification feedback
function showNotification(message, type = 'info', duration = 3000) {
  let notif = document.getElementById('app-notification');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'app-notification';
    notif.style.position = 'fixed';
    notif.style.bottom = '20px';
    notif.style.right = '20px';
    notif.style.zIndex = '5000';
    notif.style.padding = '15px 20px';
    notif.style.borderRadius = '4px';
    notif.style.fontSize = '1rem';
    notif.style.background = '#2d3748';
    notif.style.color = '#fff';
    notif.style.display = 'none';
    document.body.appendChild(notif);
  }
  notif.textContent = message;
  notif.style.background = type === 'success' ? '#22c55e' : type === 'error' ? '#dc2626' : '#2d3748';
  notif.style.display = 'block';
  setTimeout(() => { notif.style.display = 'none'; }, duration);
}
// Helper to log errors
function handleError(err, userMessage) {
  console.error(userMessage || 'Error:', err);
  showNotification(userMessage + (err && err.message ? `: ${err.message}` : ''), 'error', 5000);
}
// Field Helper
function getField(obj, keys) {
  for (let k of keys) {
    if (obj[k] && String(obj[k]).trim() !== "") return obj[k];
  }
  return '';
}
// Consistent query/caching
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

// === API LAYER (fetch wrappers) ===
function fetchData(funcName, params = {}) {
  const url = new URL(SCRIPT_URL);
  url.searchParams.append('function', funcName);
  const token = localStorage.getItem('adminSessionToken');
  const merged = Object.assign({}, params || {}, token ? { sessionToken: token } : {});
  for (const key in merged) url.searchParams.append(key, merged[key]);
  return fetch(url).then(r => r.json());
}
function postData(funcName, payload) {
  const url = new URL(SCRIPT_URL);
  // Auto-attach session token unless explicitly overridden
  const token = localStorage.getItem('adminSessionToken');
  const merged = Object.assign(
    { function: funcName },
    token ? { sessionToken: token } : {},
    payload || {}
  );
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(merged),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  }).then(r => r.json());
}

// === LOADER UI ===
function showLoader() {
  const loader = $('#loader');
  if (loader) loader.classList.remove('hidden');
}
function hideLoader() {
  const loader = $('#loader');
  if (loader) loader.classList.add('hidden');
}

// Small helper: toggle loading state on buttons (adds spinner via CSS)
function setButtonLoading(btn, isLoading, loadingText) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
    if (loadingText) btn.innerHTML = loadingText;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
  } else {
    if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

// === MODAL MANAGEMENT ===
function openModal(modalId) {
  if (!modalId) return;
  const modalBackdrop = $('#modal-backdrop');
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (modalBackdrop) modalBackdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
}
function closeModal(modalElement) {
  if (!modalElement) return;
  modalElement.classList.add('hidden');
  // Check if any other modal is still open
  const anyOpen = $$('.modal-container').some(m => !m.classList.contains('hidden'));
  if (!anyOpen && $('#modal-backdrop')) $('#modal-backdrop').classList.add('hidden');
}

// === ADMIN HANDLING ===
let currentAdmin = null;
// Enhanced: Accepts an optional permsContext ({ branches, rights, isMain })
let CURRENT_ADMIN_PERMS = null;
function setAdminMode(isAdminActive, permsContext) {
  isAdmin = !!isAdminActive;
  if (isAdminActive && permsContext) {
    CURRENT_ADMIN_PERMS = permsContext;
  } else if (!isAdminActive) {
    CURRENT_ADMIN_PERMS = null;
  }
  updateAdminUI();
}
// Checks if the current admin has a given right/perm
function adminHasRight(right) {
  if (!isAdmin || !CURRENT_ADMIN_PERMS) return false;
  if (CURRENT_ADMIN_PERMS.isMain) return true;
  return !!(CURRENT_ADMIN_PERMS.rights && CURRENT_ADMIN_PERMS.rights[right]);
}
// Checks if current admin has branch access
function adminHasBranch(branchName) {
  if (!isAdmin || !CURRENT_ADMIN_PERMS) return false;
  if (CURRENT_ADMIN_PERMS.isMain) return true;
  return (CURRENT_ADMIN_PERMS.branches||[]).indexOf(branchName) !== -1;
}
// Frontend rights catalog to render checkboxes in modal
const RIGHTS_CATALOG = [
  { key: 'canAddBranch', label: 'Can Add Branch' },
  { key: 'canDeleteBranch', label: 'Can Delete Branch' },
  { key: 'canRenameBranch', label: 'Can Rename Branch' },
  { key: 'canEditStaff', label: 'Can Edit Staff' },
  { key: 'canDeleteStaff', label: 'Can Delete Staff' },
  { key: 'canMoveStaff', label: 'Can Move Staff' },
  { key: 'canUpdatePhotos', label: 'Can Update Photos' },
  { key: 'canManagePermissions', label: 'Can Manage Permissions' },
  { key: 'canManageAdmins', label: 'Can Manage Admins' }
];

// Utility: get branch names from loaded data
function getAllBranchNames() {
  return (allData || []).map(b => b.branchName);
}

// Populate a <select> element with branch options
function populateBranchSelect(selectEl) {
  if (!selectEl) return;
  const branches = getAllBranchNames();
  selectEl.innerHTML = '';
  branches.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    selectEl.appendChild(opt);
  });
}

// Populate Assign tab permissions section (branches only)
function populatePermissionsSection() {
  const container = $('#branch-permissions-list');
  if (!container) return;
  const branches = getAllBranchNames();
  container.innerHTML = '';
  branches.forEach(name => {
    const id = `assign-branch-${name.replace(/[^a-z0-9]/gi,'_')}`;
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 text-sm';
    row.innerHTML = `<input type="checkbox" id="${id}" value="${escapeHtml(name)}"> <span>${escapeHtml(name)}</span>`;
    container.appendChild(row);
  });
}

// Admin settings tab switching
function activateAdminSettingsTab(tabId) {
  ['admin-tab-credentials','admin-tab-assign','admin-tab-users'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === tabId);
  });
  const panels = {
    'admin-tab-credentials': 'admin-panel-credentials',
    'admin-tab-assign': 'admin-panel-assign',
    'admin-tab-users': 'admin-panel-users'
  };
  Object.keys(panels).forEach(tab => {
    const panelEl = document.getElementById(panels[tab]);
    if (panelEl) panelEl.classList.toggle('hidden', tab !== tabId);
  });
}

// Render admins list with edit buttons
function renderAdminsList(admins) {
  const list = $('#all-admins-list');
  if (!list) return;
  list.innerHTML = '';
  if (!admins || !admins.length) {
    list.innerHTML = '<div class="text-gray-500 text-sm">No admins found.</div>';
    return;
  }
  admins.forEach(a => {
    const item = document.createElement('div');
    item.className = 'admin-user-item flex justify-between items-center py-2 border-b';
    const rightsSummary = RIGHTS_CATALOG.filter(r => !!(a.rights && a.rights[r.key])).map(r => r.label).join(', ') || 'No special rights';
    const branchesSummary = (a.branches || []).join(', ') || 'No branches';
    const canDelete = !!(CURRENT_ADMIN_PERMS && CURRENT_ADMIN_PERMS.isMain);
    item.innerHTML = `
      <div>
        <div class="font-semibold">${escapeHtml(a.email || '')}</div>
        <div class="text-xs text-gray-600">Branches: ${escapeHtml(branchesSummary)}</div>
        <div class="text-xs text-gray-600">Rights: ${escapeHtml(rightsSummary)}</div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-secondary" data-action="edit-admin" data-email="${escapeHtml(a.email)}">
          <i class="fas fa-edit mr-1"></i> Edit
        </button>
        ${canDelete ? `<button class="btn-secondary" data-action="delete-admin" data-email="${escapeHtml(a.email)}">
          <i class="fas fa-trash-alt mr-1"></i> Delete
        </button>` : ''}
      </div>`;
    list.appendChild(item);
  });
  // Delegate edit buttons
  // Ensure we don't add multiple listeners if this function re-runs
  if (!list.__adminsListBound) {
    list.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-action="edit-admin"]');
      if (editBtn) {
        const email = editBtn.getAttribute('data-email');
        const admin = admins.find(x => x.email === email);
        openEditAdminModal(admin);
        return;
      }
      const delBtn = e.target.closest('[data-action="delete-admin"]');
      if (delBtn) {
        const email = delBtn.getAttribute('data-email');
        if (!CURRENT_ADMIN_PERMS || !CURRENT_ADMIN_PERMS.isMain) {
          return showNotification('Only the super admin can delete admins.', 'error');
        }
        const ok = await showConfirmModal({ title: 'Delete Admin', message: `Are you sure you want to delete admin ${email}? This action cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' });
        if (!ok) return;
        try {
          showLoader();
          const res = await postData('deleteAdmin', { email });
          if (res.status === 'success') {
            showNotification('Admin deleted successfully.', 'success');
            const out = await fetchData('getAllAdmins');
            if (out.status === 'success') renderAdminsList(out.admins || []);
          } else {
            showNotification(res.message || 'Failed to delete admin.', 'error');
          }
        } catch (err) {
          handleError(err, 'Failed to delete admin');
        } finally {
          hideLoader();
        }
      }
    });
    list.__adminsListBound = true;
  }
}

function openEditAdminModal(admin) {
  if (!admin) return;
  // Use unified permissions modal; backend does not return passwords
  openAdminPermissionsModal({
    mode: 'edit',
    email: admin.email,
    password: '', // do not prefill; allow optional reset in modal
    branches: admin.branches || [],
    rights: admin.rights || {},
  });
}

// Top-level: unified Admin Permissions modal opener (accessible from anywhere)
function openAdminPermissionsModal(opts) {
  const mode = opts.mode;
  const m = $('#admin-permissions-modal');
  $('#admin-permissions-title-text').textContent = mode === 'new' ? 'Assign Admin' : 'Edit Admin';
  const emailField = $('#admin-permissions-email');
  const pwField = $('#admin-permissions-password');
  const pwReset = $('#admin-permissions-password-reset');
  emailField.value = opts.email || '';
  pwField.value = opts.password || '';
  emailField.readOnly = mode !== 'new';
  // Branches
  const branchDiv = $('#admin-perm-branches');
  branchDiv.innerHTML = '';
  (allData||[]).forEach(branch => {
    const id = 'perm-branch-' + branch.branchName.replace(/\s/g,'-');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = branch.branchName;
    cb.id = id;
    if ((opts.branches||[]).includes(branch.branchName)) cb.checked = true;
    const label = document.createElement('label');
    label.className = 'inline-flex items-center gap-2';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + branch.branchName));
    branchDiv.appendChild(label);
  });
  // Rights - full schema mirrored from backend getRightsSchema
  const rightsDiv = $('#admin-perm-rights');
  rightsDiv.innerHTML = '';
  const RIGHTS = [
    { key: 'canAddBranch', label: 'Can add branch' },
    { key: 'canDeleteBranch', label: 'Can delete branch' },
    { key: 'canRenameBranch', label: 'Can rename branch' },
    { key: 'canEditStaff', label: 'Can edit staff' },
    { key: 'canDeleteStaff', label: 'Can delete staff' },
    { key: 'canMoveStaff', label: 'Can move staff' },
    { key: 'canUpdatePhotos', label: 'Can update photos' },
    { key: 'canManagePermissions', label: 'Can manage permissions' },
    { key: 'canManageAdmins', label: 'Can manage admins' },
  ];
  RIGHTS.forEach(r => {
    const id = 'perm-right-' + r.key;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = r.key;
    if (opts.rights && opts.rights[r.key]) cb.checked = true;
    const label = document.createElement('label');
    label.className = 'inline-flex items-center gap-2';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + r.label));
    rightsDiv.appendChild(label);
  });
  // Password reset for edit
  if (pwReset) {
    pwReset.classList.toggle('hidden', mode!=='edit');
    pwReset.onclick = () => {
      pwField.value = '';
      pwField.placeholder = 'Enter new password';
      pwField.focus();
    }
  }
  m.classList.remove('hidden');
  $('#modal-backdrop').classList.remove('hidden');
  // Ensure an inline status area exists for feedback
  let statusArea = m.querySelector('.admin-perm-status');
  if (!statusArea) {
    statusArea = document.createElement('div');
    statusArea.className = 'admin-perm-status text-sm mb-3';
    m.querySelector('form')?.prepend(statusArea);
  }
  statusArea.textContent = '';
  statusArea.style.color = '#4b5563';

  // Save handler (one at a time)
  const form = $('#admin-permissions-form');
  form.onsubmit = ev => {
    ev.preventDefault();
    const email = emailField.value.trim();
    const password = pwField.value.trim();
    const branchList = Array.from(branchDiv.querySelectorAll('input[type=checkbox]')).filter(cb=>cb.checked).map(cb=>cb.value);
    const rightsObj = {};
    rightsDiv.querySelectorAll('input[type=checkbox]').forEach(cb=>{ rightsObj[cb.value]=cb.checked; });
    if (!email || !password || branchList.length===0) {
      statusArea.textContent = 'Email, password and at least one branch are required.';
      statusArea.style.color = '#dc2626';
      showNotification('Email, password and at least one branch required.','error');
      return;
    }
    showLoader();
    const payload = {
      email,
      password,
      allowedBranches: JSON.stringify(branchList),
      rights: rightsObj,
    };
    const api = mode==='edit' ? 'updateAdmin' : 'assignAdmin';
    postData(api, payload)
      .then(resp => {
        showNotification(resp.message, resp.status==='success'?'success':'error');
        if (resp.status==='success') {
          statusArea.textContent = 'Saved successfully';
          statusArea.style.color = '#16a34a';
          closeModal(m);
          // refresh list if open
          if ($('#all-admins-list')) {
            fetchData('getAllAdmins').then(json=>{
              if (json && json.status==='success') renderAdminsList(json.admins||[]);
            }).catch(()=>{});
          }
        }
      })
      .catch(err => {
        statusArea.textContent = 'Save failed';
        statusArea.style.color = '#dc2626';
        handleError(err, 'Failed to save admin');
      })
      .finally(hideLoader);
  };
}

// Reusable confirmation modal; returns a Promise<boolean>
function showConfirmModal({ title = 'Confirm', message = '', confirmText = 'Confirm', cancelText = 'Cancel' } = {}) {
  return new Promise(resolve => {
    let modal = document.getElementById('confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'confirm-modal';
      modal.className = 'modal-container fixed inset-0 z-50 flex items-center justify-center';
      modal.innerHTML = `
        <div class="modal-content bg-white rounded shadow-lg w-full max-w-md p-5">
          <div class="text-lg font-semibold mb-2" id="confirm-title"></div>
          <div class="text-sm text-gray-700 mb-4" id="confirm-message"></div>
          <div class="flex justify-end gap-2">
            <button id="confirm-cancel" class="btn-secondary">${cancelText}</button>
            <button id="confirm-ok" class="btn-primary">${confirmText}</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    modal.querySelector('#confirm-title').textContent = title;
    modal.querySelector('#confirm-message').textContent = message;
    $('#modal-backdrop').classList.remove('hidden');
    modal.classList.remove('hidden');
    const cleanup = (val) => {
      modal.classList.add('hidden');
      $('#modal-backdrop').classList.add('hidden');
      resolve(val);
    };
    const okBtn = modal.querySelector('#confirm-ok');
    const cancelBtn = modal.querySelector('#confirm-cancel');
    const onOk = () => { okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); cleanup(true); };
    const onCancel = () => { okBtn.removeEventListener('click', onOk); cancelBtn.removeEventListener('click', onCancel); cleanup(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function populateModalPermissions(admin) {
  // Branches
  const branchesWrap = $('#admin-perm-branches');
  const rightsWrap = $('#admin-perm-rights');
  if (branchesWrap) {
    branchesWrap.innerHTML = '';
    const branches = getAllBranchNames();
    branches.forEach(name => {
      const id = `modal-branch-${name.replace(/[^a-z0-9]/gi,'_')}`;
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm';
      const checked = Array.isArray(admin.branches) && admin.branches.includes(name) ? 'checked' : '';
      row.innerHTML = `<input type="checkbox" id="${id}" value="${escapeHtml(name)}" ${checked}> <span>${escapeHtml(name)}</span>`;
      branchesWrap.appendChild(row);
    });
  }
  // Rights
  if (rightsWrap) {
    rightsWrap.innerHTML = '';
    RIGHTS_CATALOG.forEach(r => {
      const id = `modal-right-${r.key}`;
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm';
      const checked = admin.rights && admin.rights[r.key] ? 'checked' : '';
      row.innerHTML = `<input type="checkbox" id="${id}" value="${r.key}" ${checked}> <span>${escapeHtml(r.label)}</span>`;
      rightsWrap.appendChild(row);
    });
  }
}
async function checkAdminSession() {
  const token = localStorage.getItem('adminSessionToken');
  if (!token) {
    setAdminMode(false);
    return;
  }
  try {
    const response = await fetchData('checkSession', { sessionToken: token });
    if (response.valid) {
      // Enrich admin mode with returned rights/branches/isMain
      const isMain = !!response.isMain;
      const rights = response.rights || {};
      const branches = response.branches || [];
      setAdminMode(true, { isMain, rights, branches });
      currentAdmin = { email: response.email };
    } else {
      localStorage.removeItem('adminSessionToken');
      setAdminMode(false);
    }
  } catch (e) {
    setAdminMode(false);
    // Log error details
    handleError(e, 'Admin session check failed');
  }
}

// === MAIN DOMContentLoaded ===
document.addEventListener("DOMContentLoaded", () => {
  // Loader/modal UI boot
  showLoader();
  checkAdminSession();

  // Attach (delegated) event handling for modals and global UI
  document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-close')) {
      const modal = e.target.closest('.modal-container');
      if (modal) closeModal(modal);
      return;
    }
    if (e.target === $('#modal-backdrop')) {
      $$('.modal-container').forEach(m => m.classList.add('hidden'));
      $('#modal-backdrop').classList.add('hidden');
      return;
    }
    if (e.target.closest('.modal-content')) return;
    // Inline: hide search suggestions box
    if ($('#search-suggestions')) $('#search-suggestions').classList.add('hidden');
  });
  $$('.modal-container').forEach(modal => modal.classList.add('hidden'));
  if ($('#modal-backdrop')) $('#modal-backdrop').classList.add('hidden');

  // Attach loader UI
  hideLoader();
  // Initialize AOS if available (added in index.html)
  try {
    if (window.AOS) {
      AOS.init({
        duration: 500,
        easing: 'ease-out-cubic',
        once: true,
        offset: 40,
        // Respect reduced motion
        disable: function() {
          return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }
      });
    }
  } catch (e) { /* no-op */ }
  loadInitialData();
  setupAllEventListeners();
});

function setupAllEventListeners() {
  // Admin login
  const adminLoginBtn = $('#admin-login-button');
  if (adminLoginBtn) {
    adminLoginBtn.onclick = () => openModal('login-modal');
  }
  // Logout
  const logoutBtn = $('#logout-button');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem('adminSessionToken');
      setAdminMode(false);
      showNotification('Logged out successfully', 'info');
      loadInitialData();
    };
  }

  // Admin settings entry
  const adminSettingsBtn = $('#admin-settings-btn');
  if (adminSettingsBtn) {
    adminSettingsBtn.onclick = () => {
      if (!adminHasRight('canManageAdmins') && !adminHasRight('canManagePermissions')) {
        showNotification('You do not have permission to open Admin Settings.', 'error');
        return;
      }
      if (!isAdmin) return;
      $('#admin-edit-email').value = currentAdmin ? currentAdmin.email : '';
      $('#admin-edit-password').value = '';
      $('#new-admin-email').value = '';
      $('#new-admin-password').value = '';
      $('#assign-permissions-section').classList.add('hidden');
      activateAdminSettingsTab('admin-tab-credentials');
      openModal('admin-settings-modal');
    };
  }
  // Password/modal save handlers
  const savePermsBtn = $('#save-admin-credentials');
  if (savePermsBtn) {
    savePermsBtn.onclick = async () => {
      if (!adminHasRight('canManagePermissions')) return showNotification('Permission denied: Manage Permissions', 'error');
      const email = $('#new-admin-email') && $('#new-admin-email').value.trim();
      const password = $('#new-admin-password') && $('#new-admin-password').value.trim();
      if (!email || !password) return showNotification('Provide the admin email and password first.', 'error');
      const branches = Array.from(document.querySelectorAll('#branch-permissions-list input[type="checkbox"]:checked')).map(c => c.value);
      setButtonLoading(savePermsBtn, true, 'Saving...');
      try {
        const res = await postData('updateAdmin', { email, password, allowedBranches: branches, rights: {} });
        showNotification(res.message || 'Permissions saved.', res.status === 'success' ? 'success' : 'error');
      } catch (e) { handleError(e, 'Failed to save permissions'); }
      finally { setButtonLoading(savePermsBtn, false); }
    };
  }

  // Save from Admin Permissions modal
  const modalSaveBtn = $('#admin-permissions-save-btn');
  if (modalSaveBtn) {
    modalSaveBtn.onclick = async (e) => {
      e.preventDefault();
      if (!adminHasRight('canManagePermissions') && !adminHasRight('canManageAdmins')) return showNotification('Permission denied.', 'error');
      const email = $('#admin-permissions-email') && $('#admin-permissions-email').value.trim();
      const password = $('#admin-permissions-password') && $('#admin-permissions-password').value.trim();
      if (!email || !password) return showNotification('Email and password required.', 'error');
      const branches = Array.from(document.querySelectorAll('#admin-perm-branches input[type="checkbox"]:checked')).map(c => c.value);
      const rightsInputs = Array.from(document.querySelectorAll('#admin-perm-rights input[type="checkbox"]'));
      const rights = rightsInputs.reduce((acc, el) => { acc[el.value] = el.checked; return acc; }, {});
      setButtonLoading(modalSaveBtn, true, 'Saving...');
      try {
        const res = await postData('updateAdmin', { email, password, allowedBranches: branches, rights });
        showNotification(res.message || 'Admin updated.', res.status === 'success' ? 'success' : 'error');
        if (res.status === 'success') closeModal($('#admin-permissions-modal'));
      } catch (e) { handleError(e, 'Failed to save admin'); }
      finally { setButtonLoading(modalSaveBtn, false); }
    };
  }
  if ($('#admin-logout-btn')) $('#admin-logout-btn').onclick = () => {
    isAdmin = false;
    updateAdminUI();
    closeModal($('#admin-settings-modal'));
    loadInitialData();
    showNotification('Logged out','info');
  };

  // Assign New Admin handlers are defined later to open unified permissions modal
  setupLoginForm();
  setupPasswordForm();
  setupStaffPhotoUpload();
  setupStaffForm();
  setupBranchUIControls();
  setupGlobalSearch();

  // Admin Settings Modal Tab Switching
  if ($('#admin-settings-modal')) {
    const tabIds = [
      {tab:'#admin-tab-credentials', panel:'#admin-panel-credentials'},
      {tab:'#admin-tab-assign', panel:'#admin-panel-assign'},
      {tab:'#admin-tab-users', panel:'#admin-panel-users'}
    ];
    tabIds.forEach(({tab, panel}, idx) => {
      const tabBtn = $(tab);
      if (tabBtn) {
        tabBtn.onclick = function() {
          tabIds.forEach(({tab, panel}) => $(tab).classList.remove('active'));
          tabIds.forEach(({tab, panel}) => $(panel).classList.add('hidden'));
          tabBtn.classList.add('active');
          $(panel).classList.remove('hidden');
        }
      }
    });
    // default to first tab
    $(tabIds[0].tab)?.classList.add('active');
    $(tabIds[0].panel)?.classList.remove('hidden');
    $(tabIds[1].panel)?.classList.add('hidden');
    $(tabIds[2].panel)?.classList.add('hidden');
  }

  // All Assigned Users - secured fetch and render
  if ($('#show-all-admins-btn')) {
    $('#show-all-admins-btn').onclick = async function () {
      const out = document.getElementById('all-admins-list');
      out.innerHTML = '<span class="text-gray-400">Loading...</span>';
      try {
        const json = await fetchData('getAllAdmins');
        if (!json || !json.admins || json.admins.length === 0) {
          out.innerHTML = '<span class="text-red-500">No assigned admin users found.</span>';
          return;
        }
        renderAdminsList(json.admins);
      } catch (e) {
        out.innerHTML = '<span class="text-red-500">Error loading admin users.</span>';
      }
    };
  }

  // Assign New Admin → opens unified permissions modal
  if ($('#assign-admin-btn')) {
    $('#assign-admin-btn').onclick = () => {
      const email = $('#new-admin-email').value.trim();
      const password = $('#new-admin-password').value.trim();
      if (!email || !password) {
        showNotification('Email and password required.', 'error');
        return;
      }
      openAdminPermissionsModal({ mode: 'new', email, password, branches: [], rights: {} });
    };
  }

  function openAdminPermissionsModal(opts) {
    const mode = opts.mode;
    const m = $('#admin-permissions-modal');
    $('#admin-permissions-title-text').textContent = mode === 'new' ? 'Assign Admin' : 'Edit Admin';
    const emailField = $('#admin-permissions-email');
    const pwField = $('#admin-permissions-password');
    const pwReset = $('#admin-permissions-password-reset');
    emailField.value = opts.email || '';
    pwField.value = opts.password || '';
    emailField.readOnly = mode !== 'new';
    // Branches
    const branchDiv = $('#admin-perm-branches');
    branchDiv.innerHTML = '';
    (allData||[]).forEach(branch => {
      const id = 'perm-branch-' + branch.branchName.replace(/\s/g,'-');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = branch.branchName;
      cb.id = id;
      if ((opts.branches||[]).includes(branch.branchName)) cb.checked = true;
      const label = document.createElement('label');
      label.className = 'inline-flex items-center gap-2';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + branch.branchName));
      branchDiv.appendChild(label);
    });
    // Rights - full schema mirrored from backend getRightsSchema
    const rightsDiv = $('#admin-perm-rights');
    rightsDiv.innerHTML = '';
    const RIGHTS = [
      { key: 'canAddBranch', label: 'Can add branch' },
      { key: 'canDeleteBranch', label: 'Can delete branch' },
      { key: 'canRenameBranch', label: 'Can rename branch' },
      { key: 'canEditStaff', label: 'Can edit staff' },
      { key: 'canDeleteStaff', label: 'Can delete staff' },
      { key: 'canMoveStaff', label: 'Can move staff' },
      { key: 'canUpdatePhotos', label: 'Can update photos' },
      { key: 'canManagePermissions', label: 'Can manage permissions' },
      { key: 'canManageAdmins', label: 'Can manage admins' },
    ];
    RIGHTS.forEach(r => {
      const id = 'perm-right-' + r.key;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = r.key;
      if (opts.rights && opts.rights[r.key]) cb.checked = true;
      const label = document.createElement('label');
      label.className = 'inline-flex items-center gap-2';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + r.label));
      rightsDiv.appendChild(label);
    });
    // Password reset for edit
    pwReset.classList.toggle('hidden', mode!=='edit');
    pwReset.onclick = () => {
      pwField.value = '';
      pwField.placeholder = 'Enter new password';
      pwField.focus();
    }
    m.classList.remove('hidden');
    $('#modal-backdrop').classList.remove('hidden');
    // Ensure an inline status area exists for feedback
    let statusArea = m.querySelector('.admin-perm-status');
    if (!statusArea) {
      statusArea = document.createElement('div');
      statusArea.className = 'admin-perm-status text-sm mb-3';
      m.querySelector('form')?.prepend(statusArea);
    }
    statusArea.textContent = '';
    statusArea.style.color = '#4b5563';

    // Save handler (one at a time)
    const form = $('#admin-permissions-form');
    form.onsubmit = ev => {
      ev.preventDefault();
      const email = emailField.value.trim();
      const password = pwField.value.trim();
      const branchList = Array.from(branchDiv.querySelectorAll('input[type=checkbox]')).filter(cb=>cb.checked).map(cb=>cb.value);
      const rightsObj = {};
      rightsDiv.querySelectorAll('input[type=checkbox]').forEach(cb=>{ rightsObj[cb.value]=cb.checked; });
      if (!email || !password || branchList.length===0) {
        statusArea.textContent = 'Email, password and at least one branch are required.';
        statusArea.style.color = '#dc2626';
        showNotification('Email, password and at least one branch required.','error');
        return;
      }
      showLoader();
      const payload = {
        email,
        password,
        allowedBranches: JSON.stringify(branchList),
        rights: rightsObj,
      };
      const api = mode==='edit' ? 'updateAdmin' : 'assignAdmin';
      postData(api, payload)
        .then(resp => {
          showNotification(resp.message, resp.status==='success'?'success':'error');
          if (resp.status==='success') {
            statusArea.textContent = 'Saved successfully';
            statusArea.style.color = '#16a34a';
            closeModal(m);
            $('#modal-backdrop').classList.add('hidden');
            // Optionally reload admin user list
            if ($('#show-all-admins-btn')) $('#show-all-admins-btn').click();
          } else {
            statusArea.textContent = resp.message || 'Failed to save admin';
            statusArea.style.color = '#dc2626';
          }
        })
        .catch(e=>handleError(e, 'Failed to save admin'))
        .finally(hideLoader);
    }
    // Cancel always closes
    m.querySelector('.modal-close').onclick = () => {
      closeModal(m);
      $('#modal-backdrop').classList.add('hidden');
    };
  }
}
function setupLoginForm() {
  const loginForm = $('#login-form');
  if (!loginForm) return;
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#email').value;
    const password = $('#password').value;
    const loginModal = $('#login-modal');
    let statusMsg = loginModal.querySelector('.login-status-msg');
    if (!statusMsg) {
      statusMsg = document.createElement('div');
      statusMsg.className = 'login-status-msg text-center text-base py-2';
      loginModal.querySelector('form').prepend(statusMsg);
    }
    statusMsg.textContent = '';
    statusMsg.style.color = '#6366f1';
    showLoader();
    fetchData('verifyAdmin', { email, password })
      .then(response => {
        if (response.status === 'success' && response.verified) {
          let isMain = !!response.isMain;
          let rights = (response.admin && response.admin.rights) || (isMain ? {canAddBranch:true,canSeeAllAdmins:true,canAssignAdmin:true,canChangeCredentials:true} : {});
          let branches = (response.admin && response.admin.branches) || (isMain ? (allData||[]).map(b=>b.branchName) : []);
          setAdminMode(true, {isMain: isMain, rights, branches});
          currentAdmin = { email };
          if (response.sessionToken) {
            localStorage.setItem('adminSessionToken', response.sessionToken);
          }
          statusMsg.textContent = 'Logged in successfully!';
          statusMsg.style.color = '#16a34a';
          setTimeout(() => {
            closeModal(loginModal);
            loadInitialData();
          }, 900);
          showNotification('Admin login successful', 'success');
        } else {
          setAdminMode(false);
          statusMsg.textContent = 'Invalid credentials. Please try again.';
          statusMsg.style.color = '#dc2626';
          showNotification('Login failed: Invalid credentials', 'error');
        }
      })
      .catch((e) => {
        setAdminMode(false);
        statusMsg.textContent = 'Login failed. Please try again.';
        statusMsg.style.color = '#dc2626';
        handleError(e, 'Login failed');
      })
      .finally(hideLoader);
  });
}
function setupPasswordForm() {
  if ($('#change-password-button')) $('#change-password-button').onclick = () => openModal('password-modal');
  if ($('#password-form')) {
    $('#password-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const currentPassword = $('#current-password').value;
      const newPassword = $('#new-password').value;
      showLoader();
      postData('changePassword', { currentPassword, newPassword })
        .then(response => {
          showNotification(response.message, response.message === 'Success' ? 'success' : 'info');
          if (response.message === 'Success') closeModal($('#password-modal'));
        })
        .catch((e) => handleError(e, 'Error changing password'))
        .finally(hideLoader);
    });
  }
}
function setupStaffPhotoUpload() {
  // Helper for resizing image on client to max 400x400
  function resizeImageFile(file, maxDimension = 400) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = e => {
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDimension) {
              height *= maxDimension / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width *= maxDimension / height;
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            const reader2 = new FileReader();
            reader2.onload = evt => resolve(evt.target.result); // base64
            reader2.onerror = reject;
            reader2.readAsDataURL(blob);
          }, 'image/jpeg', 0.9); // jpeg, reasonable compression
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  if ($('#photo-upload')) {
    const saveBtn = document.querySelector('#staff-form button[type="submit"]');
    const photoUpload = $('#photo-upload');
    photoUpload.onchange = (event) => {
      const file = event.target.files[0];
      if (!file) {
        GLOBAL_STATE.tempPhotoData = null;
        if(saveBtn) saveBtn.disabled = false;
        const uploadStatus = document.getElementById('photo-upload-status');
        if(uploadStatus) uploadStatus.remove();
        return;
      }
      if(saveBtn) saveBtn.disabled = true;
      let uploadStatus = document.getElementById('photo-upload-status');
      if(!uploadStatus) {
        uploadStatus = document.createElement('span');
        uploadStatus.id = 'photo-upload-status';
        uploadStatus.style.marginLeft = '10px';
        uploadStatus.style.color = '#6366f1';
        photoUpload.parentNode.appendChild(uploadStatus);
      }
      uploadStatus.innerText = 'Processing photo...';
      resizeImageFile(file, 400).then(base64 => {
        $('#photo-preview').src = base64;
        GLOBAL_STATE.tempPhotoData = { base64, name: file.name };
        if(saveBtn) saveBtn.disabled = false;
        uploadStatus.innerText = '';
      }).catch(() => {
        showNotification('Failed to process photo. Please try again.','error');
        GLOBAL_STATE.tempPhotoData = null;
        if(saveBtn) saveBtn.disabled = false;
        uploadStatus.innerText = '';
      });
    };
  }
}
function setupStaffForm() {
  if ($('#staff-form')) {
    $('#staff-form').addEventListener('submit', e => {
      e.preventDefault();
      const staffData = { branchName: GLOBAL_STATE.currentBranch };
      let originalStaff = GLOBAL_STATE.staffOriginal;
      function extractDriveFileId(photoUrl) {
        if (!photoUrl) return '';
        // ?id=FILEID
        let match = photoUrl.match(/[?&]id=([\w-]+)/);
        if (match) return match[1];
        // /file/d/FILEID
        match = photoUrl.match(/\/file\/d\/([\w-]+)/);
        if (match) return match[1];
        // /uc?...id=FILEID
        match = photoUrl.match(/\/uc\?.*id=([\w-]+)/);
        if (match) return match[1];
        // lh3.googleusercontent.com/d/FILEID
        match = photoUrl.match(/googleusercontent\.com\/d\/([\w-]+)/);
        if (match) return match[1];
        // Plain file id
        if (/^[\w-]{20,}$/.test(photoUrl)) return photoUrl;
        return '';
      }

      // Guarantee no stale Photo URL is saved:
      // If the photo URL input is empty, we'll submit an empty value for Photo URL.
      // No need to touch any undeclared staff object here.

      document.querySelectorAll('#staff-form [data-header]').forEach(input => {
        const header = input.dataset.header;
        let value = input.value;
        if (header === 'Photo URL') {
          value = extractDriveFileId(value);
          // Never fallback for Photo URL
          staffData[header] = value;
          return;
        }
        // Better merge logic: if unchanged/blank, fallback to original value (incl. header variants)
        if (!value && originalStaff) {
          // Always try the exact spreadsheet header name first for fallback
          if (header === 'Serial No') {
            value = originalStaff['Serial No'] || '';
          } else if (header === "Father's Name" || header === 'Father’s Name') {
            value = originalStaff["Father's Name"] || originalStaff["Father’s Name"] || originalStaff["Father ‘s Name"] || originalStaff["Father ′s Name"] || '';
          } else if (header === "Mother's Name" || header === 'Mother’s Name') {
            value = originalStaff["Mother's Name"] || originalStaff["Mother’s Name"] || originalStaff["Mother ‘s Name"] || originalStaff["Mother ′s Name"] || '';
          } else if (header === "NID / Birth Certificate" || header === 'NID/Birth Certificate') {
            value = originalStaff["NID / Birth Certificate"] || originalStaff["NID/Birth Certificate"] || '';
          } else {
            value = originalStaff[header] || '';
          }
        }
        staffData[header] = value;
      });
      staffData.rowIndex = $('#rowIndex').value;
      staffData.isFormer = $('#isFormer').checked;
      if (GLOBAL_STATE.tempPhotoData) staffData.photo = GLOBAL_STATE.tempPhotoData;
      showLoader();
      closeModal($('#staff-modal'));
      postData('saveStaff', staffData)
        .then(response => {
          if (response.status === 'success') {
            showNotification(response.message, 'success');
            loadInitialData();
          } else {
            showNotification('Error: ' + response.message, 'error');
          }
        })
        .catch((e) => handleError(e, 'An error occurred while saving staff data.'))
        .finally(hideLoader);
    });
  }
}
function setupBranchUIControls() {
  // Handlers for branch option buttons
  // All open/close logic, select population etc., is grouped here for DRYness
  const branchOptionsBtn = $('#branch-options-button');
  if (branchOptionsBtn) branchOptionsBtn.onclick = () => openModal('branch-options-modal');
  // Add
  const openAddBranchBtn = $('#open-add-branch-modal');
  if (openAddBranchBtn) openAddBranchBtn.onclick = () => {
    closeModal($('#branch-options-modal'));
    $('#new-branch-name').value = '';
    openModal('add-branch-modal');
  };
  const submitAddBranchBtn = $('#submit-add-branch');
  if (submitAddBranchBtn) submitAddBranchBtn.onclick = () => {
    const input = $('#new-branch-name');
    let name = input.value.trim();
    if (!name) { input.classList.add('border-red-500'); showNotification('Branch name required','error'); return; }
    input.classList.remove('border-red-500');
    if (!/ branch$/i.test(name)) name = name + ' Branch';
    showLoader();
    postData('addBranch', { branchName: name })
      .then(response => {
        showNotification(response.message, 'success');
        closeModal($('#add-branch-modal'));
        loadInitialData();
      })
      .catch(e => handleError(e, 'Error adding branch'))
      .finally(hideLoader);
  };
  // Remove
  const openRemoveBranchBtn = $('#open-remove-branch-modal');
  if (openRemoveBranchBtn) openRemoveBranchBtn.onclick = () => {
    closeModal($('#branch-options-modal'));
    populateBranchSelect('remove-branch-select');
    openModal('remove-branch-modal');
  };
  $('#remove-branch-select').onchange = function () { GLOBAL_STATE.branchToRemove = this.value; };
  $('#confirm-remove-branch').onclick = () => {
    GLOBAL_STATE.branchToRemove = $('#remove-branch-select').value;
    if (!GLOBAL_STATE.branchToRemove) return;
    closeModal($('#remove-branch-modal'));
    openModal('confirm-remove-modal');
  };
  $('#yes-remove-branch').onclick = () => {
    if (!GLOBAL_STATE.branchToRemove) return;
    showLoader();
    postData('deleteBranch', { branchName: GLOBAL_STATE.branchToRemove })
      .then(response => {
        showNotification(response.message, 'success');
        closeModal($('#confirm-remove-modal'));
        loadInitialData();
      })
      .catch(e => handleError(e, 'Error deleting branch'))
      .finally(hideLoader);
  };
  // Rename
  const openRenameBranchBtn = $('#open-rename-branch-modal');
  if (openRenameBranchBtn) openRenameBranchBtn.onclick = () => {
    closeModal($('#branch-options-modal'));
    populateBranchSelect('rename-branch-select');
    $('#rename-branch-name').value = '';
    openModal('rename-branch-modal');
  };
  $('#submit-rename-branch').onclick = () => {
    const select = $('#rename-branch-select');
    const oldName = select.value;
    let newName = $('#rename-branch-name').value.trim();
    if (!oldName || !newName) return;
    if (!/ branch$/i.test(newName)) newName = newName + ' Branch';
    showLoader();
    postData('renameBranch', { oldName, newName })
      .then(response => {
        showNotification(response.message, 'success');
        closeModal($('#rename-branch-modal'));
        loadInitialData();
      })
      .catch(e => handleError(e, 'Error renaming branch'))
      .finally(hideLoader);
  };
}
function populateBranchSelect(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '';
  if (!allData || allData.length === 0) return;
  allData.forEach(branch => {
    const opt = document.createElement('option');
    opt.value = branch.branchName;
    opt.textContent = branch.branchName;
    select.appendChild(opt);
  });
}

// --- GLOBAL SEARCH ---
function setupGlobalSearch() {
  const globalSearch = $('#global-search');
  const suggestionsBox = $('#search-suggestions');
  let lastQuery = '';
  if (!globalSearch || !suggestionsBox) return;

  function doGlobalSearch(query) {
    if (!query) {
      suggestionsBox.classList.remove('active');
      suggestionsBox.classList.add('hidden');
      suggestionsBox.style.display = '';
      suggestionsBox.innerHTML = '';
      return;
    }
    if (!allData || allData.length === 0) {
      setTimeout(() => doGlobalSearch(query), 200);
      return;
    }
    let matches = [];
    const normalizedQuery = query.startsWith('0') ? query : (query.match(/^\d+$/) ? '0' + query : query);
    allData.forEach(branch => {
      branch.currentStaff.concat(branch.formerStaff).forEach(staff => {
        const name = staff['Full Name'] ? String(staff['Full Name']).toLowerCase() : '';
        const mobile = staff['Mobile'] ? String(staff['Mobile']).toLowerCase() : '';
        const normalizedMobile = normalizeMobile(staff['Mobile']);
        if (!name) return;
        if (name.includes(query) || mobile.includes(query) || normalizedMobile.includes(normalizedQuery)) {
          matches.push({ staff, branch: branch.branchName });
        }
      });
    });
    if (matches.length === 0) {
      suggestionsBox.innerHTML = '<div class="px-3 py-2 text-gray-500">No results found</div>';
      suggestionsBox.classList.add('active');
      suggestionsBox.classList.remove('hidden');
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.innerHTML = matches.slice(0, 20).map(({ staff, branch }) => {
        let name = escapeHtml(staff['Full Name'] || '');
        let mobile = escapeHtml(staff['Mobile'] || '');
        return `<div class="px-3 py-2 cursor-pointer hover:bg-indigo-100 hover:text-gray-900 bg-white text-gray-900 border-b border-gray-200" data-branch="${escapeHtml(branch)}" data-name="${name}">
          <span class="block font-mono text-base">${mobile ? mobile : name}</span>
          ${mobile && name ? `<span class='block text-xs text-gray-500'>${name}</span>` : ''}
        </div>`;
      }).join('');
      suggestionsBox.classList.add('active');
      suggestionsBox.classList.remove('hidden');
      suggestionsBox.style.display = 'block';
    }
  }
  globalSearch.addEventListener('input', function () {
    lastQuery = this.value.trim().toLowerCase();
    doGlobalSearch(lastQuery);
  });
  suggestionsBox.addEventListener('mousedown', function (e) {
    const item = e.target.closest('[data-branch][data-name]');
    if (item) {
      const branchName = item.getAttribute('data-branch');
      const name = item.getAttribute('data-name');
      let found = null;
      allData.forEach(branch => {
        if (branch.branchName === branchName) {
          found = branch.currentStaff.concat(branch.formerStaff).find(staff => staff['Full Name'] === name);
        }
      });
      if (found) showStaffDetailsModal(found, branchName);
      suggestionsBox.classList.add('hidden');
      globalSearch.value = '';
    }
  });
}

// --- FETCH INITIAL DATA ---
function loadInitialData() {
  showLoader();
  fetchData('getInitialData')
    .then(response => {
      if (response.status === 'success') {
        allData = response.data;
        renderAllBranches();
        const globalSearch = $('#global-search');
        if (globalSearch && globalSearch.value.trim() !== '') {
          if (typeof doGlobalSearch === 'function') {
            doGlobalSearch(globalSearch.value.trim().toLowerCase());
          }
        }
      } else {
        throw new Error(response.message);
      }
    })
    .catch(err => {
      $('#main-content').innerHTML = `<p class="text-red-500 text-center">Error loading data: ${escapeHtml(err.message || err)}</p>`;
      handleError(err, 'Data load failed');
    })
    .finally(hideLoader);
}

// === MAIN UI RENDER LOGIC ===
function renderAllBranches() {
  const mainContent = $('#main-content');
  mainContent.innerHTML = '';
  if (!allData || allData.length === 0) {
    mainContent.innerHTML = '<p class="text-center text-gray-500">No branches found. Admin can add a new branch.</p>';
    return;
  }
  allData.forEach(branch => {
    mainContent.appendChild(createBranchSection(branch));
  });
  updateAdminUI();
}
function createBranchSection(branch) {
  const section = document.createElement('section');
  section.className = 'mb-12';
  section.dataset.branchName = branch.branchName;
  // Gate admin branch actions by rights + branch access
  let adminButtons = '';
  if (isAdmin) {
    const canAddStaff = adminHasRight('canEditStaff') && adminHasBranch(branch.branchName);
    const canRenameBranch = adminHasRight('canRenameBranch') && adminHasBranch(branch.branchName);
    const canDeleteBranch = adminHasRight('canDeleteBranch') && adminHasBranch(branch.branchName);
    const parts = [];
    if (canAddStaff) parts.push(`<button class="add-staff-btn text-sm py-2 px-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" data-branch="${branch.branchName}"><i class="fas fa-user-plus mr-1"></i> Add Staff</button>`);
    if (canRenameBranch) parts.push(`<button class="rename-branch-btn text-sm py-2 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700" data-branch="${branch.branchName}"><i class="fas fa-edit mr-1"></i> Rename Branch</button>`);
    if (canDeleteBranch) parts.push(`<button class="delete-branch-btn text-sm py-2 px-3 bg-red-600 text-white rounded-md hover:bg-red-700" data-branch="${branch.branchName}"><i class="fas fa-trash-alt"></i> Delete Branch</button>`);
    if (parts.length) {
      adminButtons = `<div class="space-x-2">${parts.join(' ')}</div>`;
    }
  }
  section.innerHTML = `<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 border-indigo-500">
    <div><h2 class="text-2xl font-bold text-gray-800">${escapeHtml(branch.branchName)} Staff</h2></div>
    ${adminButtons}
    </div>
    <div class="mb-4"><input type="text" placeholder="Search staff in ${escapeHtml(branch.branchName)}..." class="search-box w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"></div>`;
  section.appendChild(createStaffGrid('Current Staff', branch.currentStaff, branch.branchName));
  if (branch.formerStaff.length > 0 || isAdmin) {
    section.appendChild(createStaffGrid('Former Staff', branch.formerStaff, branch.branchName));
  }
  section.querySelector('.search-box').addEventListener('keyup', handleSearch);
  // Attach button events (delegated where feasible)
  section.onclick = async function (e) {
    if (e.target.closest('.delete-branch-btn')) {
      const deleteBtn = e.target.closest('.delete-branch-btn');
      const branchName = deleteBtn.dataset.branch;
      if (!adminHasRight('canDeleteBranch') || !adminHasBranch(branchName)) {
        showNotification('Permission denied: Delete Branch', 'error');
        return;
      }
      const ok = await showConfirmModal({ title: 'Delete Branch', message: `Are you sure you want to permanently delete the "${branchName}" branch? This cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' });
      if (!ok) return;
      showLoader();
      setButtonLoading(deleteBtn, true, '<i class="fas fa-trash-alt mr-1"></i> Deleting...');
      postData('deleteBranch', { branchName })
        .then(response => { showNotification(response.message, 'success'); loadInitialData(); })
        .catch(e => handleError(e, 'Error deleting branch'))
        .finally(() => { hideLoader(); setButtonLoading(deleteBtn, false); });
    } else if (e.target.closest('.add-staff-btn')) {
      const branchName = e.target.closest('.add-staff-btn').dataset.branch;
      if (!adminHasRight('canEditStaff') || !adminHasBranch(branchName)) {
        showNotification('Permission denied: Add Staff', 'error');
        return;
      }
      openStaffModal(null, branchName);
    } else if (e.target.closest('.rename-branch-btn')) {
      const renameBtn = e.target.closest('.rename-branch-btn');
      const branchName = renameBtn.dataset.branch;
      if (!adminHasRight('canRenameBranch') || !adminHasBranch(branchName)) {
        showNotification('Permission denied: Rename Branch', 'error');
        return;
      }
      openPromptModal({
        title: "Rename Branch",
        message: `Enter a new name for branch "${branchName}":`,
        confirmText: "Rename",
        callback: (newName) => {
          if (!newName) { showNotification('Branch name cannot be empty.', 'error'); return; }
          showLoader();
          setButtonLoading(renameBtn, true, '<i class="fas fa-edit mr-1"></i> Renaming...');
          postData('renameBranch', { oldName: branchName, newName })
            .then(response => { showNotification(response.message, 'success'); loadInitialData(); })
            .catch(e => handleError(e, 'Error renaming branch'))
            .finally(() => { hideLoader(); setButtonLoading(renameBtn, false); });
        }
      });
    }
  };
  return section;
}
function createStaffGrid(title, staffList, branchName) {
  const container = document.createElement('div');
  if (staffList.length === 0 && title === 'Former Staff' && !isAdmin) return container;
  container.innerHTML = `<h3 class="text-xl font-semibold text-gray-700 mt-6 mb-4">${title}</h3>`;
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
  const filteredList = staffList.filter(staff => staff['Full Name'] && staff['Full Name'].trim() !== '');
  if (filteredList.length > 0) {
    filteredList.forEach(staff => grid.appendChild(createStaffCard(staff, branchName)));
  } else {
    // Enhanced user message for empty staff
    grid.innerHTML = `<p class="text-gray-500 italic col-span-full">No ${title.toLowerCase()} yet for this branch. You can add staff${title==='Current Staff'&&isAdmin?" using the 'Add Staff' button above.":'.'}</p>`;
  }
  container.appendChild(grid);
  return container;
}
function createStaffCard(staff, branchName) {
  const card = document.createElement('div');
  card.className = 'staff-card fade-in cursor-pointer';
  // Add AOS animation hook for scroll-in
  try { card.setAttribute('data-aos', 'fade-up'); card.setAttribute('data-aos-offset', '50'); } catch (e) {}
  card.dataset.name = escapeHtml(staff['Full Name'] || '');
  card.dataset.designation = escapeHtml(staff['Designation'] || '');

  const fullName = escapeHtml(staff['Full Name'] || 'N/A');
  const designation = escapeHtml(staff['Designation'] || 'N/A');
  const mobile = escapeHtml(formatMobile(staff['Mobile']) || 'N/A');
  const currentAddress = escapeHtml(staff['Current Address'] || 'N/A');
  let adminCardButtons = '';
  if (isAdmin) {
    const canEdit = adminHasRight('canEditStaff') && adminHasBranch(branchName);
    const canDelete = adminHasRight('canDeleteStaff') && adminHasBranch(branchName);
    const btns = [];
    if (canEdit) btns.push(`<button class="edit-staff-btn text-blue-500 hover:text-blue-700 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md" title="Edit"><i class="fas fa-pencil-alt"></i></button>`);
    if (canDelete) btns.push(`<button class="delete-staff-btn text-red-500 hover:text-red-700 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md" title="Delete"><i class="fas fa-trash-alt"></i></button>`);
    if (btns.length) adminCardButtons = `<div class="absolute top-2 right-2 flex space-x-2">${btns.join('')}</div>`;
  }
  // Use direct Photo URL as-is if present, else fallback
  let photoUrl = staff['Photo URL'] && staff['Photo URL'].trim() !== "" ? staff['Photo URL'].trim() : FALLBACK_THUMBNAIL;
  card.innerHTML = `
    <div class="skeleton skeleton-avatar" aria-hidden="true">
      <img src="${photoUrl}" alt="Photo of ${fullName}" class="staff-photo" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="opacity:0;" onerror="this.onerror=null;this.src='${FALLBACK_THUMBNAIL}';">
    </div>
    <div class="staff-name">${fullName}</div>
    <div class="staff-designation">${designation}</div>
    <div class="staff-info">
      <p><i class="fas fa-phone-alt"></i> ${mobile}</p>
      <p><i class="fas fa-map-marker-alt"></i> ${currentAddress}</p>
    </div>
    ${adminCardButtons}
  `;
  // Image load -> replace skeleton wrapper to avoid double border/margins and fade in image
  const imgEl = card.querySelector('img.staff-photo');
  const skeletonEl = card.querySelector('.skeleton');
  if (imgEl) {
    const reveal = () => {
      if (skeletonEl && skeletonEl.contains(imgEl)) {
        // Detach image and replace the skeleton wrapper with the image itself
        skeletonEl.replaceWith(imgEl);
      }
      imgEl.style.opacity = '1';
      imgEl.classList.add('fade-in');
    };
    imgEl.addEventListener('load', reveal, { once: true });
    if (imgEl.complete) {
      // For cached images
      requestAnimationFrame(reveal);
    }
  }
  card.onclick = (e) => {
    if (e.target.closest('.edit-staff-btn') || e.target.closest('.delete-staff-btn')) return;
    showStaffDetailsModal(staff, branchName);
  };
  if (isAdmin) {
    const editBtn = card.querySelector('.edit-staff-btn');
    const delBtn = card.querySelector('.delete-staff-btn');
    if (editBtn) {
      editBtn.onclick = (ev) => {
        ev.stopPropagation();
        if (!adminHasRight('canEditStaff') || !adminHasBranch(branchName)) {
          showNotification('Permission denied: Edit Staff', 'error');
          return;
        }
        $$('.modal-container').forEach(m => m.classList.add('hidden'));
        $('#modal-backdrop').classList.remove('hidden');
        setTimeout(() => openStaffModal(staff, branchName), 100);
      };
    }
    if (delBtn) {
      delBtn.onclick = (ev) => {
        ev.stopPropagation();
        if (!adminHasRight('canDeleteStaff') || !adminHasBranch(branchName)) {
          showNotification('Permission denied: Delete Staff', 'error');
          return;
        }
        deleteStaffHandler(staff, branchName);
      };
    }
  }
  return card;
}
function handleSearch(event) {
  const searchTerm = event.target.value.toLowerCase();
  const normalizedSearch = searchTerm.startsWith('0') ? searchTerm : (searchTerm.match(/^\d+$/) ? '0' + searchTerm : searchTerm);
  const branchSection = event.target.closest('section');
  const cards = branchSection.querySelectorAll('.staff-card');
  cards.forEach(card => {
    const name = card.dataset.name.toLowerCase();
    const designation = card.dataset.designation.toLowerCase();
    let staff = null;
    const branchName = branchSection.dataset.branchName;
    allData.forEach(branch => {
      if (branch.branchName === branchName) {
        staff = branch.currentStaff.concat(branch.formerStaff).find(s => (s['Full Name'] || '').toLowerCase() === name);
      }
    });
    let mobile = staff && staff['Mobile'] ? String(staff['Mobile']).toLowerCase() : '';
    let normalizedMobile = staff ? normalizeMobile(staff['Mobile']) : '';
    card.style.display = (name.includes(searchTerm) || designation.includes(searchTerm) || mobile.includes(searchTerm) || normalizedMobile.includes(normalizedSearch)) ? 'block' : 'none';
  });
}
function updateAdminUI() {
  if ($('#admin-login-button')) {
    if (isAdmin) {
      $('#admin-login-button').classList.add('hidden');
    } else {
      $('#admin-login-button').classList.remove('hidden');
    }
  }
  if ($('#admin-controls')) {
    if (isAdmin) {
      $('#admin-controls').classList.remove('hidden');
      $('#admin-controls').classList.add('flex');
    } else {
      $('#admin-controls').classList.add('hidden');
      $('#admin-controls').classList.remove('flex');
    }
  }
  // Fine-grained gating of admin control buttons
  const branchBtn = $('#branch-options-button');
  if (branchBtn) {
    const canBranchOps = adminHasRight('canAddBranch') || adminHasRight('canDeleteBranch') || adminHasRight('canRenameBranch');
    branchBtn.classList.toggle('hidden', !isAdmin || !canBranchOps);
  }
  const changePwdBtn = $('#change-password-button');
  if (changePwdBtn) {
    changePwdBtn.classList.toggle('hidden', !isAdmin || !adminHasRight('canManageAdmins'));
  }
  const settingsBtn = $('#admin-settings-btn');
  if (settingsBtn) {
    const canManage = adminHasRight('canManageAdmins') || adminHasRight('canManagePermissions');
    settingsBtn.classList.toggle('hidden', !isAdmin || !canManage);
  }
}
function showStaffDetailsModal(staff, branchName) {
  const modal = $('#staff-details-modal');
  const body = $('#staff-details-body');
  let photoUrl = staff['Photo URL'] && String(staff['Photo URL']).trim() !== "" ? staff['Photo URL'] : FALLBACK_THUMBNAIL;
  const fields = [
    { label: "Outlet", value: branchName ? branchName : 'null' },
    { label: "Serial No", value: getField(staff, ['Serial No']) },
    { label: "Full Name", value: getField(staff, ['Full Name']) },
    { label: "Father's Name", value: getField(staff, ["Father’s Name", "Father's Name", "Father ‘s Name", "Father ′s Name"]) },
    { label: "Mother's Name", value: getField(staff, ["Mother’s Name", "Mother's Name", "Mother ‘s Name", "Mother ′s Name"]) },
    { label: "Gender", value: getField(staff, ['Gender']) },
    { label: "Date of Birth", value: getField(staff, ['Date of Birth']) },
    { label: "NID / Birth Certificate", value: getField(staff, ["NID/Birth Certificate", "NID / Birth Certificate"]) },
    { label: "Mobile Number", value: formatMobile(getField(staff, ['Mobile', 'Mobile Number'])) },
    { label: "Emergency Mobile Number", value: formatMobile(getField(staff, ['Emergency Mobile', 'Emergency Mobile Number'])) },
    { label: "Permanent Address", value: getField(staff, ['Permanent Address']) },
    { label: "Current Address", value: getField(staff, ['Current Address']) },
    { label: "Designation", value: getField(staff, ['Designation']) },
    { label: "Date of Joining", value: getField(staff, ['Date of Joining']) },
    { label: "Joining Salary", value: getField(staff, ['Join Salary', 'Joining Salary']) },
    { label: "Increment Date", value: getField(staff, ['Increment Date']) },
    { label: "Salary", value: getField(staff, ['Salary']) }
  ];
  let html = `
    <div class="flex flex-col items-center mb-6">
      <img src="${photoUrl}" alt="${escapeHtml(staff['Full Name'] || 'Staff Photo')}" class="w-32 h-32 object-cover rounded-full border-4 border-indigo-200 shadow-md mb-2" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${FALLBACK_THUMBNAIL}';">
      <div class="text-lg font-bold mt-2">${escapeHtml(staff['Full Name'] || '')}</div>
      <div class="text-sm text-gray-500">${escapeHtml(staff['Designation'] || '')}</div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
  `;
  fields.forEach(f => {
    let displayValue = (f.value && String(f.value).trim() !== "") ? f.value : 'null';
    html += `<div class="flex flex-col mb-1">
      <span class="text-xs text-gray-500 font-semibold">${f.label}</span>
      <span class="text-base text-gray-800">${escapeHtml(displayValue)}</span>
    </div>`;
  });
  html += '</div>';
  body.innerHTML = html;
  $('#staff-details-title').textContent = staff['Full Name'] || 'Staff Details';
  const editBtn = $('#edit-staff-btn-modal');
  if (isAdmin) {
    editBtn.classList.remove('hidden');
    editBtn.onclick = () => {
      closeModal(modal);
      setTimeout(() => openStaffModal(staff, branchName), 200);
    };
  } else {
    editBtn.classList.add('hidden');
  }
  openModal('staff-details-modal');
}
function openStaffModal(staff, branchName) {
  // Security: verify rights + branch access before allowing edit/add
  if (!adminHasRight('canEditStaff') || !adminHasBranch(branchName)) {
    showNotification('Permission denied: Edit Staff', 'error');
    return;
  }
  const form = $('#staff-form');
  form.reset();
  GLOBAL_STATE.tempPhotoData = null;
  GLOBAL_STATE.currentBranch = branchName;
  GLOBAL_STATE.staffOriginal = staff ? { ...staff } : null;
  $('#staff-modal-title').textContent = staff ? `Edit Staff: ${escapeHtml(staff['Full Name'])}` : `Add New Staff to ${escapeHtml(branchName)}`;
  const headerMap = {
    "Father’s Name": ["Father’s Name", "Father's Name", "Father ‘s Name", "Father ′s Name"],
    "Mother’s Name": ["Mother’s Name", "Mother's Name", "Mother ‘s Name", "Mother ′s Name"],
    "NID/Birth Certificate": ["NID/Birth Certificate", "NID / Birth Certificate"]
  };
  if (staff) {
    form.querySelectorAll('[data-header]').forEach(input => {
      const header = input.dataset.header;
      let value = '';
      if (headerMap[header]) {
        for (let h of headerMap[header]) {
          if (staff[h] && String(staff[h]).trim() !== '') { value = staff[h]; break; }
        }
      } else {
        value = staff[header] || '';
      }
      input.value = value;
    });
    $('#rowIndex').value = staff.rowIndex || '';
    // Prefill 'Mark as Former Staff' based on branch-specific former section start
    const formerStart = (branchName === 'Head Office') ? 205 : 52;
    $('#isFormer').checked = (Number(staff.rowIndex) >= formerStart);
  } else {
    $('#rowIndex').value = '';
    $('#isFormer').checked = false;
  }
  const photoUrl = (staff && staff['Photo URL']) ? staff['Photo URL'] : FALLBACK_PHOTO;
  $('#photo-preview').src = photoUrl;
  let removeBtn = $('#remove-photo-btn');
  if (!removeBtn) {
    removeBtn = document.createElement('button');
    removeBtn.innerText = 'Remove Photo';
    removeBtn.id = 'remove-photo-btn';
    removeBtn.type = 'button';
    removeBtn.className = 'ml-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-700';
    $('#photo-upload').insertAdjacentElement('afterend', removeBtn);
  }
  removeBtn.onclick = () => {
    openPromptModal({
      title: 'Remove Photo',
      message: 'Are you sure you want to remove this photo?',
      confirmText: 'Remove',
      callback: () => {
        if (staff && staff['Photo URL']) {
          showLoader();
          postData('removePhoto', { photoUrl: staff['Photo URL'], branchName: branchName, rowIndex: staff.rowIndex })
            .then((response) => {
              if (response.status === 'success') {
                $('#photo-preview').src = FALLBACK_PHOTO;
                staff['Photo URL'] = '';
                GLOBAL_STATE.tempPhotoData = null;
                // Clear the Photo URL input in the modal form as well
                const photoUrlInput = document.querySelector('#staff-form [data-header="Photo URL"]');
                if (photoUrlInput) photoUrlInput.value = '';
                showNotification('Photo removed.', 'success');
              } else {
                showNotification(response.message, 'error');
              }
            })
            .catch(e => handleError(e, 'Error removing photo.'))
            .finally(hideLoader);
        } else {
          $('#photo-preview').src = FALLBACK_PHOTO;
        }
      }
    });
  };
  openModal('staff-modal');
}
function openPromptModal({ title, message, confirmText, callback }) {
  $('#prompt-title').textContent = title;
  $('#prompt-message').textContent = message;
  const input = $('#prompt-input');
  input.value = '';
  const confirmBtn = $('#prompt-confirm');
  confirmBtn.textContent = confirmText;
  // Remove previous click listeners by replacing the node
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.onclick = () => {
    callback(input.value);
    closeModal($('#prompt-modal'));
  };
  openModal('prompt-modal');
}
async function deleteStaffHandler(staff, branchName) {
  // Pre-check for better UX; backend will enforce regardless
  if (!adminHasRight('canDeleteStaff') || !adminHasBranch(branchName)) {
    return showNotification('Permission denied: Delete Staff', 'error');
  }
  const ok = await showConfirmModal({ title: 'Delete Staff', message: `Are you sure you want to delete ${escapeHtml(staff['Full Name'])}?`, confirmText: 'Delete', cancelText: 'Cancel' });
  if (!ok) return;
  showLoader();
  postData('deleteStaff', { branchName, rowIndex: staff.rowIndex })
    .then(response => {
      showNotification(response.message, 'success');
      loadInitialData();
    })
    .catch((e) => handleError(e, 'Error deleting staff record'))
    .finally(hideLoader);
}
//
// [TODO: For large-scale or growth, consider rewriting UI with a light JS framework (e.g., lit-html or Alpine.js) for far better rendering efficiency, code maintainability and security.]
// [TODO: For security, consider using cookies with HttpOnly for session tokens, and setup CSP + strict XSS guards.]
