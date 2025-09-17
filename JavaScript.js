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
  staffOriginal: null,
  staffStatusState: { activeTab: 'approval', search: '', scrollTop: 0 }
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
// Utility: Debounce to throttle high-frequency events (e.g., input)
function debounce(fn, delay = 180) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), delay);
  }
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
  checkAdminSession().finally(loadInitialData);

  // Attach (delegated) event handling for modals and global UI
  document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-close')) {
      // Support standard modals and staff status modal
      const modalContainer = e.target.closest('.modal-container');
      const staffStatusModal = document.getElementById('staff-status-modal');
      const backdrop = document.getElementById('modal-backdrop');
      if (modalContainer) {
        const isStaffStatus = modalContainer.id === 'staff-status-modal';
        closeModal(modalContainer);
        if (isStaffStatus) {
          // Unlock page scroll when closing staff status modal
          document.body.style.overflow = '';
        }
      } else if (staffStatusModal && !staffStatusModal.classList.contains('hidden')) {
        staffStatusModal.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        document.body.style.overflow = '';
      }
      return;
    }
    if (e.target === $('#modal-backdrop')) {
      $('.modal-container').forEach(m => m.classList.add('hidden'));
      $('#modal-backdrop').classList.add('hidden');
      // Ensure page scroll is unlocked when backdrop closes modals
      document.body.style.overflow = '';
      return;
    }
    if (e.target.closest('.modal-content')) return;
    // Inline: hide search suggestions box
    if ($('#search-suggestions')) $('#search-suggestions').classList.add('hidden');
  });
  $$('.modal-container').forEach(modal => modal.classList.add('hidden'));
  if ($('#modal-backdrop')) $('#modal-backdrop').classList.add('hidden');

  // Attach loader UI
  // Loader is managed inside loadInitialData(); removed early hide to prevent flicker.
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
  // loadInitialData is invoked after checkAdminSession completes above
  setupAllEventListeners();
  
  // Initialize enhanced card interactions after data loads
  setTimeout(() => {
    addCardInteractionEffects();
  }, 1000);
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

  // Staff Status quick access
  const staffStatusBtn = $('#staff-status-button');
  if (staffStatusBtn) {
    staffStatusBtn.onclick = () => {
      try {
        renderStaffStatusModal();
        openModal('staff-status-modal');
        // Lock page scroll while status modal is open
        document.body.style.overflow = 'hidden';
      } catch (e) {
        handleError(e, 'Failed to open Staff Status');
      }
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
            // Refresh data and keep Staff Status modal if it is open
            fetchData('getInitialData')
              .then(res => {
                if (res.status === 'success') {
                  allData = res.data;
                  renderAllBranches();
                  const statusModal = document.getElementById('staff-status-modal');
                  if (statusModal && !statusModal.classList.contains('hidden')) {
                    // Re-render the Staff Status modal content and preserve UI state
                    renderStaffStatusModal();
                  }
                }
              })
              .catch(() => { /* ignore */ });
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
  const onGlobalInput = debounce(function (ev) {
    lastQuery = (ev.target.value || '').trim().toLowerCase();
    doGlobalSearch(lastQuery);
  }, 180);
  globalSearch.addEventListener('input', onGlobalInput);
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

// Date helpers for Staff Status calculations
function parseDateSafe(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input) ? null : input;
  const s = String(input).trim();
  if (!s) return null;
  // Try ISO YYYY-MM-DD first
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    return isNaN(dt) ? null : dt;
  }
  // Try DD/MM/YYYY
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    const d = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, y = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    return isNaN(dt) ? null : dt;
  }
  // Fallback to Date.parse
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}
function daysInMonth(year, month) { // month: 0-11
  return new Date(year, month + 1, 0).getDate();
}
function diffYMD(fromDate, toDate = new Date()) {
  if (!fromDate) return { years: 0, months: 0, days: 0, totalMonths: 0, totalDays: 0 };
  // Normalize times to noon to avoid DST issues
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12);
  const to = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 12);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    const pm = (to.getMonth() - 1 + 12) % 12;
    const py = pm === 11 ? to.getFullYear() - 1 : to.getFullYear();
    days += daysInMonth(py, pm);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.floor((to - from) / (1000 * 60 * 60 * 24));
  return { years, months, days, totalMonths: years * 12 + months, totalDays };
}
function formatGapText(diff) {
  if (!diff) return 'N/A';
  const parts = [];
  if (diff.years > 0) parts.push(`${diff.years} ${diff.years === 1 ? 'Year' : 'Years'}`);
  if (diff.months > 0) parts.push(`${diff.months} ${diff.months === 1 ? 'Month' : 'Months'}`);
  if (diff.days > 0) parts.push(`${diff.days} ${diff.days === 1 ? 'Day' : 'Days'}`);
  if (parts.length === 0) return 'Today';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts.slice(-1);
}
function getStaffStatusCategory(staff) {
  const incStr = (staff['Increment Date'] || '').toString().trim();
  const joinStr = (staff['Date of Joining'] || '').toString().trim();
  const incDate = parseDateSafe(incStr);
  const joinDate = parseDateSafe(joinStr);
  if (incDate) {
    const d = diffYMD(incDate);
    const needsApproval = d.years >= 1 || d.totalDays >= 365;
    return { category: needsApproval ? 'approval' : 'ongoing', ref: 'increment', diff: d };
  }
  if (joinDate) {
    const d = diffYMD(joinDate);
    const needsApproval = d.totalMonths >= 6 || d.totalDays >= 182; // approx 6 months
    return { category: needsApproval ? 'approval' : 'ongoing', ref: 'joining', diff: d };
  }
  return { category: 'ongoing', ref: 'none', diff: null };
}
function createStaffStatusSection() {
  const section = document.createElement('section');
  section.id = 'staff-status-section';
  section.className = 'mb-12';
  const header = document.createElement('div');
  header.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 border-purple-500';
  header.innerHTML = `<div><h2 class="text-2xl font-bold text-gray-800"><i class="fas fa-user-clock text-purple-600 mr-2"></i>Staff Status</h2></div>`;
  section.appendChild(header);

  // Aggregate staff across all branches (current staff only)
  const approvalList = [];
  const ongoingList = [];
  (allData || []).forEach(branch => {
    (branch.currentStaff || []).forEach(staff => {
      if (!staff || (staff['Full Name'] || '').toString().trim() === '') return;
      const status = getStaffStatusCategory(staff);
      const gapText = status.diff ? formatGapText(status.diff) : 'N/A';
      const payload = { staff, branchName: branch.branchName, gapText };
      if (status.category === 'approval') approvalList.push(payload); else ongoingList.push(payload);
    });
  });

  function buildGrid(title, list) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h3 class="text-xl font-semibold text-gray-700 mt-2 mb-4">${title}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
    if (list.length === 0) {
      grid.innerHTML = `<p class="text-gray-500 italic col-span-full">No staff in this section.</p>`;
    } else {
      list.forEach(({ staff, branchName, gapText }) => {
        grid.appendChild(createStaffCard(staff, branchName, { view: 'status', gapText }));
      });
    }
    wrap.appendChild(grid);
    return wrap;
  }

  section.appendChild(buildGrid('Increment Approval', approvalList));
  section.appendChild(buildGrid('On Going', ongoingList));
  return section;
}

// Render improved Staff Status modal with tabs, counts and search
function renderStaffStatusModal() {
  const body = document.getElementById('staff-status-body');
  if (!body) return;
  // Build UI shell (toolbar + two panels)
  body.innerHTML = `
    <div class="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div class="flex items-center gap-2">
        <span id="badge-approval" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          <i class=\"fas fa-arrow-up-wide-short mr-1\"></i> Approval <span id="staff-status-count-approval" class="ml-1">0</span>
        </span>
        <span id="badge-ongoing" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          <i class=\"fas fa-rotate mr-1\"></i> On Going <span id="staff-status-count-ongoing" class="ml-1">0</span>
        </span>
      </div>
      <div class="flex items-center gap-2">
        <div class="inline-flex rounded-md shadow-sm overflow-hidden border border-gray-200">
          <button id="staff-status-tab-approval" class="px-3 py-1.5 text-sm bg-indigo-600 text-white font-medium focus:outline-none">Increment Approval</button>
          <button id="staff-status-tab-ongoing" class="px-3 py-1.5 text-sm bg-white text-gray-700 hover:bg-indigo-50 focus:outline-none">On Going</button>
        </div>
        <div class="relative">
          <i class="fas fa-search absolute left-3 top-2.5 text-gray-400"></i>
          <input id="staff-status-search" type="text" class="modal-input pl-9 w-72" placeholder="Search (name, designation, branch, gap)">
        </div>
      </div>
    </div>
    <div id="staff-status-empty" class="hidden text-center text-gray-500 py-12">
      <i class="fas fa-circle-info text-3xl mb-2 block opacity-50"></i>
      No staff to show
    </div>
    <div id="staff-status-panel-approval">
      <h4 class="text-lg font-semibold text-gray-700 mb-2">Increment Approval</h4>
      <div id="staff-status-approval-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"></div>
    </div>
    <div id="staff-status-panel-ongoing" class="hidden">
      <h4 class="text-lg font-semibold text-gray-700 mb-2">On Going</h4>
      <div id="staff-status-ongoing-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"></div>
    </div>
  `;

  // Get data via existing categorization
  const section = createStaffStatusSection();
  const allH3 = section.querySelectorAll('h3');
  const approvalGridSrc = allH3[0]?.nextElementSibling || document.createElement('div');
  const ongoingGridSrc = allH3[1]?.nextElementSibling || document.createElement('div');

  const approvalGrid = document.getElementById('staff-status-approval-grid');
  const ongoingGrid = document.getElementById('staff-status-ongoing-grid');

  // Recreate cards to ensure datasets are present and consistent
  const approvalCards = Array.from(approvalGridSrc.querySelectorAll('.staff-card'));
  const ongoingCards = Array.from(ongoingGridSrc.querySelectorAll('.staff-card'));

  // Count badges
  const cntApproval = document.getElementById('staff-status-count-approval');
  const cntOngoing = document.getElementById('staff-status-count-ongoing');
  if (cntApproval) cntApproval.textContent = String(approvalCards.length);
  if (cntOngoing) cntOngoing.textContent = String(ongoingCards.length);

  // Move built cards into our modal grids
  approvalCards.forEach(card => approvalGrid.appendChild(card));
  ongoingCards.forEach(card => ongoingGrid.appendChild(card));

  // Handle empty state
  const empty = document.getElementById('staff-status-empty');
  if (empty) empty.classList.toggle('hidden', approvalCards.length + ongoingCards.length > 0);

  // Tabs switching
  const tabApproval = document.getElementById('staff-status-tab-approval');
  const tabOngoing = document.getElementById('staff-status-tab-ongoing');
  const panelApproval = document.getElementById('staff-status-panel-approval');
  const panelOngoing = document.getElementById('staff-status-panel-ongoing');

  function activateTab(which) {
    const isApproval = which === 'approval';
    panelApproval.classList.toggle('hidden', !isApproval);
    panelOngoing.classList.toggle('hidden', isApproval);
    tabApproval.classList.toggle('bg-indigo-600', isApproval);
    tabApproval.classList.toggle('text-white', isApproval);
    tabApproval.classList.toggle('bg-white', !isApproval);
    tabApproval.classList.toggle('text-gray-700', !isApproval);
    tabOngoing.classList.toggle('bg-indigo-600', !isApproval);
    tabOngoing.classList.toggle('text-white', !isApproval);
    tabOngoing.classList.toggle('bg-white', isApproval);
    tabOngoing.classList.toggle('text-gray-700', isApproval);

    // Toggle badges accent to follow active tab
    const badgeApproval = document.getElementById('badge-approval');
    const badgeOngoing = document.getElementById('badge-ongoing');
    if (badgeApproval && badgeOngoing) {
      if (isApproval) {
        badgeApproval.classList.add('bg-purple-100','text-purple-700');
        badgeApproval.classList.remove('bg-gray-100','text-gray-700');
        badgeOngoing.classList.add('bg-gray-100','text-gray-700');
        badgeOngoing.classList.remove('bg-purple-100','text-purple-700');
      } else {
        badgeApproval.classList.add('bg-gray-100','text-gray-700');
        badgeApproval.classList.remove('bg-purple-100','text-purple-700');
        badgeOngoing.classList.add('bg-purple-100','text-purple-700');
        badgeOngoing.classList.remove('bg-gray-100','text-gray-700');
      }
    }
  }
  if (tabApproval) tabApproval.onclick = () => { GLOBAL_STATE.staffStatusState = Object.assign({}, GLOBAL_STATE.staffStatusState, { activeTab: 'approval' }); activateTab('approval'); };
  if (tabOngoing) tabOngoing.onclick = () => { GLOBAL_STATE.staffStatusState = Object.assign({}, GLOBAL_STATE.staffStatusState, { activeTab: 'ongoing' }); activateTab('ongoing'); };
  // Restore previous tab
  const initialTab = (GLOBAL_STATE.staffStatusState && GLOBAL_STATE.staffStatusState.activeTab) || 'approval';
  activateTab(initialTab);

  // Search filter (applies to visible panel)
  const searchInput = document.getElementById('staff-status-search');
  function filterVisiblePanel() {
    const q = (searchInput?.value || '').toLowerCase();
    const panel = panelOngoing.classList.contains('hidden') ? approvalGrid : ongoingGrid;
    const cards = panel.querySelectorAll('.staff-card');
    let visible = 0;
    cards.forEach(card => {
      const name = (card.dataset.name || '').toLowerCase();
      const desig = (card.dataset.designation || '').toLowerCase();
      const mobile = (card.dataset.mobile || '').toLowerCase();
      const branch = (card.dataset.branch || '').toLowerCase();
      const gap = (card.dataset.gap || '').toLowerCase();
      const matches = !q || name.includes(q) || desig.includes(q) || mobile.includes(q) || branch.includes(q) || gap.includes(q);
      card.style.display = matches ? 'flex' : 'none';
      if (matches) visible++;
    });
    // Optional per-panel empty message could be added here
  }
  if (searchInput) {
    // Restore previous search value
    if (GLOBAL_STATE.staffStatusState && GLOBAL_STATE.staffStatusState.search) {
      searchInput.value = GLOBAL_STATE.staffStatusState.search;
      filterVisiblePanel();
    }
    searchInput.addEventListener('input', () => {
      GLOBAL_STATE.staffStatusState = Object.assign({}, GLOBAL_STATE.staffStatusState, { search: searchInput.value || '' });
      filterVisiblePanel();
    });
  }

  // Restore scroll position inside modal body
  const bodyEl = document.getElementById('staff-status-body');
  if (bodyEl) {
    if (GLOBAL_STATE.staffStatusState && typeof GLOBAL_STATE.staffStatusState.scrollTop === 'number') {
      bodyEl.scrollTop = GLOBAL_STATE.staffStatusState.scrollTop;
    }
    bodyEl.addEventListener('scroll', () => {
      GLOBAL_STATE.staffStatusState = Object.assign({}, GLOBAL_STATE.staffStatusState, { scrollTop: bodyEl.scrollTop });
    });
  }
}

function renderAllBranches() {
  const mainContent = $('#main-content');
  mainContent.innerHTML = '';
  // Do not render Staff Status on homepage; it will open in a fullscreen modal
  if (!allData || allData.length === 0) {
    mainContent.innerHTML += '<p class="text-center text-gray-500">No branches found. Admin can add a new branch.</p>';
    updateAdminUI();
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
function createStaffCard(staff, branchName, options = {}) {
  const card = document.createElement('div');
  card.className = 'staff-card fade-in cursor-pointer';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `View details for ${staff['Full Name'] || 'staff member'}`);
  // Add AOS animation hook for scroll-in
  try { card.setAttribute('data-aos', 'fade-up'); card.setAttribute('data-aos-offset', '50'); } catch (e) {}
  card.dataset.name = escapeHtml(staff['Full Name'] || '');
  card.dataset.designation = escapeHtml(staff['Designation'] || '');
  card.dataset.mobile = escapeHtml(formatMobile(staff['Mobile']) || '');
  card.dataset.branch = escapeHtml(branchName || '');

  const fullName = escapeHtml(staff['Full Name'] || 'N/A');
  const designation = escapeHtml(staff['Designation'] || 'N/A');
  const mobile = escapeHtml(formatMobile(staff['Mobile']) || 'N/A');
  const currentAddress = escapeHtml(staff['Current Address'] || 'N/A');
  
  // Determine staff status
  const isFormer = staff['isFormer'] || false;
  const statusClass = isFormer ? 'former' : 'active';
  
  // Get random gradient class for professional variety
  const gradientIndex = Math.floor(Math.random() * 6) + 1;
  const gradientClass = `staff-gradient-${gradientIndex}`;
  
  // Create layered card structure
  const backgroundLayer = document.createElement('div');
  backgroundLayer.className = `card-layer card-background ${gradientClass}`;
  
  // Add multi-layered wave SVG background matching reference design
  const uniqueId = `${gradientIndex}-${Date.now()}`;
  backgroundLayer.innerHTML = `
    <svg class="wave-svg" viewBox="0 0 280 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="purpleGradient-${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="25%" stop-color="#faf8ff"/>
          <stop offset="50%" stop-color="#f3f0ff"/>
          <stop offset="75%" stop-color="#e9e3ff"/>
          <stop offset="100%" stop-color="#ddd4ff"/>
        </linearGradient>
        <linearGradient id="waveGradient1-${uniqueId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ddd6fe"/>
          <stop offset="50%" stop-color="#e4d4fd"/>
          <stop offset="100%" stop-color="#ddd6fe"/>
        </linearGradient>
        <linearGradient id="waveGradient2-${uniqueId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#c4b5fd"/>
          <stop offset="50%" stop-color="#ddd6fe"/>
          <stop offset="100%" stop-color="#c4b5fd"/>
        </linearGradient>
        <linearGradient id="waveGradient3-${uniqueId}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#a78bfa"/>
          <stop offset="50%" stop-color="#c4b5fd"/>
          <stop offset="100%" stop-color="#a78bfa"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#purpleGradient-${uniqueId})"/>
      <path d="M0,220 C28,210 56,230 84,220 C112,210 140,230 168,220 C196,210 224,230 252,220 C270,215 275,220 280,215 L280,400 L0,400 Z" fill="url(#waveGradient1-${uniqueId})" opacity="0.7"/>
      <path d="M0,260 C37,250 75,270 112,260 C149,250 187,270 224,260 C261,250 270,260 280,255 L280,400 L0,400 Z" fill="url(#waveGradient2-${uniqueId})" opacity="0.8"/>
      <path d="M0,300 C47,290 93,310 140,300 C187,290 233,310 280,300 L280,400 L0,400 Z" fill="url(#waveGradient3-${uniqueId})" opacity="0.9"/>
    </svg>
  `;
  
  // Create frame layer with SVG
  const frameLayer = document.createElement('div');
  frameLayer.className = 'card-layer card-frame';
  frameLayer.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 280 400" xmlns="http://www.w3.org/2000/svg">
      <path class="frame-path" d="M15,15 L265,15 L265,385 L15,385 Z" />
    </svg>
  `;
  
  // Create content layer
  const contentLayer = document.createElement('div');
  contentLayer.className = 'card-layer card-content';
  
  // Fragment heading with photo
  const fragmentHeading = document.createElement('div');
  fragmentHeading.className = 'content-fragment fragment-heading';
  
  const photoContainer = document.createElement('div');
  photoContainer.className = 'staff-photo-container';
  
  const photo = document.createElement('img');
  photo.className = 'staff-photo skeleton';
  photo.alt = `Photo of ${fullName}`;
  photo.loading = 'lazy';
  photo.decoding = 'async';
  photo.referrerPolicy = 'no-referrer';
  
  // Use direct Photo URL as-is if present, else fallback
  let photoUrl = staff['Photo URL'] && staff['Photo URL'].trim() !== "" ? staff['Photo URL'].trim() : FALLBACK_THUMBNAIL;
  photo.src = photoUrl;
  photo.onerror = () => {
    photo.onerror = null;
    photo.src = FALLBACK_THUMBNAIL;
  };
  
  photoContainer.appendChild(photo);
  fragmentHeading.appendChild(photoContainer);
  
  // Staff name and designation
  const name = document.createElement('h3');
  name.className = 'staff-name';
  name.textContent = fullName;
  
  const designationEl = document.createElement('p');
  designationEl.className = 'staff-designation';
  designationEl.textContent = designation;
  
  fragmentHeading.appendChild(name);
  fragmentHeading.appendChild(designationEl);
  
  // Meta information
  const fragmentMeta = document.createElement('div');
  fragmentMeta.className = 'fragment-meta';
  fragmentMeta.innerHTML = `
    <div class="meta-line"></div>
    <span class="meta-text">STAFF</span>
    <div class="meta-line"></div>
  `;
  
  // Quick action buttons - positioned after STAFF meta and before contact info
  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions-compact';
  
  const callBtn = document.createElement('button');
  callBtn.className = 'quick-action-btn-compact';
  callBtn.innerHTML = '<i class="fas fa-phone"></i><span>Call</span>';
  callBtn.title = `Call ${fullName}`;
  callBtn.setAttribute('aria-label', `Call ${mobile}`);
  callBtn.setAttribute('data-action', 'call');
  quickActions.appendChild(callBtn);
  
  const messageBtn = document.createElement('button');
  messageBtn.className = 'quick-action-btn-compact';
  messageBtn.innerHTML = '<i class="fas fa-sms"></i><span>SMS</span>';
  messageBtn.title = 'Send Message';
  messageBtn.setAttribute('aria-label', `Send message to ${fullName}`);
  messageBtn.setAttribute('data-action', 'message');
  quickActions.appendChild(messageBtn);
  
  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'quick-action-btn-compact';
  detailsBtn.innerHTML = '<i class="fas fa-info-circle"></i><span>Details</span>';
  detailsBtn.title = 'View Details';
  detailsBtn.setAttribute('aria-label', `View full details for ${fullName}`);
  detailsBtn.setAttribute('data-action', 'details');
  quickActions.appendChild(detailsBtn);

  // Fragment body with enhanced staff info
  const fragmentBody = document.createElement('div');
  fragmentBody.className = 'content-fragment fragment-body';
  
  const staffInfo = document.createElement('div');
  staffInfo.className = 'staff-info-enhanced';

  if (options && options.view === 'status') {
    // Show branch name
    const branchEl = document.createElement('div');
    branchEl.className = 'info-item-enhanced';
    branchEl.innerHTML = `
      <div class="info-background-layer"></div>
      <div class="info-content">
        <i class="fas fa-code-branch"></i>
        <span>${escapeHtml(branchName || 'N/A')}</span>
      </div>
    `;
    branchEl.title = `Branch: ${branchName || 'N/A'}`;
    staffInfo.appendChild(branchEl);

    // Show gap text
    const gapText = options.gapText || 'N/A';
    // Store gap text for client-side filtering
    card.dataset.gap = gapText.toLowerCase();
    const gapEl = document.createElement('div');
    gapEl.className = 'info-item-enhanced';
    gapEl.innerHTML = `
      <div class="info-background-layer"></div>
      <div class="info-content">
        <i class="fas fa-hourglass-half"></i>
        <span>${escapeHtml(gapText)}</span>
      </div>
    `;
    gapEl.title = `Gap: ${gapText}`;
    staffInfo.appendChild(gapEl);
  } else {
    if (mobile && mobile !== 'N/A') {
      const mobileEl = document.createElement('div');
      mobileEl.className = 'info-item-enhanced';
      mobileEl.innerHTML = `
        <div class="info-background-layer"></div>
        <div class="info-content">
          <i class="fas fa-phone-alt"></i> 
          <span>${mobile}</span>
        </div>
      `;
      mobileEl.title = `Click to call ${mobile}`;
      mobileEl.setAttribute('data-action', 'call');
      staffInfo.appendChild(mobileEl);
    }
    if (currentAddress && currentAddress !== 'N/A') {
      const addressEl = document.createElement('div');
      addressEl.className = 'info-item-enhanced';
      addressEl.innerHTML = `
        <div class="info-background-layer"></div>
        <div class="info-content">
          <i class="fas fa-map-marker-alt"></i> 
          <span>${currentAddress}</span>
        </div>
      `;
      addressEl.title = `Address: ${currentAddress}`;
      staffInfo.appendChild(addressEl);
    }
  }

  fragmentBody.appendChild(staffInfo);
  
  // Status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.className = `status-indicator ${statusClass}`;
  statusIndicator.title = isFormer ? 'Former Staff' : 'Active Staff';
  
  // Enhanced admin controls
  const adminControls = document.createElement('div');
  adminControls.className = 'admin-controls';
  
  if (isAdmin) {
    const canEdit = adminHasRight('canEditStaff') && adminHasBranch(branchName);
    const canDelete = adminHasRight('canDeleteStaff') && adminHasBranch(branchName);
    
    if (canEdit) {
      const editBtn = document.createElement('button');
      editBtn.className = 'admin-control-btn edit';
      editBtn.innerHTML = '<i class="fas fa-edit"></i>';
      editBtn.title = 'Edit Staff';
      editBtn.setAttribute('aria-label', `Edit ${fullName}`);
      adminControls.appendChild(editBtn);
    }
    
    if (canDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'admin-control-btn delete';
      deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
      deleteBtn.title = 'Delete Staff';
      deleteBtn.setAttribute('aria-label', `Delete ${fullName}`);
      adminControls.appendChild(deleteBtn);
    }
  }
  
  // Assemble content layer
  contentLayer.appendChild(fragmentHeading);
  contentLayer.appendChild(fragmentMeta);
  contentLayer.appendChild(quickActions);
  contentLayer.appendChild(fragmentBody);
  
  // Assemble the layered card
  card.appendChild(backgroundLayer);
  card.appendChild(frameLayer);
  card.appendChild(contentLayer);
  card.appendChild(statusIndicator);
  card.appendChild(adminControls);
  
  // Enhanced image loading
  photo.addEventListener('load', () => {
    photo.classList.remove('skeleton');
    photo.style.opacity = '1';
    photo.classList.add('fade-in');
  }, { once: true });
  
  if (photo.complete) {
    requestAnimationFrame(() => {
      photo.classList.remove('skeleton');
      photo.style.opacity = '1';
      photo.classList.add('fade-in');
    });
  }
  
  // Add 3D mouse tracking and parallax effects
  let isHovering = false;
  
  card.addEventListener('mouseenter', () => {
    isHovering = true;
  });
  
  card.addEventListener('mouseleave', () => {
    isHovering = false;
    // Reset transforms on mouse leave
    backgroundLayer.style.transform = '';
    frameLayer.style.transform = '';
    contentLayer.style.transform = '';
    photoContainer.style.transform = '';
    card.style.transform = '';
  });
  
  card.addEventListener('mousemove', (e) => {
    if (!isHovering) return;
    
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation angles (limited range for subtle effect)
    const rotateX = (y - centerY) / centerY * -8; // Max 8 degrees
    const rotateY = (x - centerX) / centerX * 8;   // Max 8 degrees
    
    // Calculate parallax offsets
    const moveX = (x - centerX) / centerX * 10; // Max 10px movement
    const moveY = (y - centerY) / centerY * 10;
    
    // Apply 3D transform to main card
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
    
    // Apply layered parallax effects
    backgroundLayer.style.transform = `translateX(${moveX * 0.5}px) translateY(${moveY * 0.5}px) scale(1.02)`;
    frameLayer.style.transform = `translateX(${moveX * -0.3}px) translateY(${moveY * -0.3}px)`;
    contentLayer.style.transform = `translateX(${moveX * 0.2}px) translateY(${moveY * 0.2}px)`;
    photoContainer.style.transform = `translateX(${moveX * -0.4}px) translateY(${moveY * -0.4}px) scale(1.05)`;
  });
  // Enhanced event handling with delegation
  card.addEventListener('click', handleCardClick);
  card.addEventListener('keydown', handleCardKeydown);
  
  function handleCardClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    const adminBtn = e.target.closest('.admin-control-btn');
    
    if (adminBtn) {
      e.stopPropagation();
      handleAdminAction(adminBtn, staff, branchName);
      return;
    }
    
    if (action) {
      e.stopPropagation();
      handleQuickAction(action, staff, fullName, mobile);
      return;
    }
    
    // Default card click - show details
    showStaffDetailsModal(staff, branchName);
  }
  
  function handleCardKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showStaffDetailsModal(staff, branchName);
    }
  }
  
  function handleAdminAction(btn, staff, branchName) {
    if (btn.classList.contains('edit')) {
      if (!adminHasRight('canEditStaff') || !adminHasBranch(branchName)) {
        showNotification('Permission denied: Edit Staff', 'error');
        return;
      }
      // If Staff Status modal is open, keep it visible; otherwise hide other modals
      const statusModal = document.getElementById('staff-status-modal');
      const isStatusOpen = statusModal && !statusModal.classList.contains('hidden');
      if (!isStatusOpen) {
        $('.modal-container').forEach(m => m.classList.add('hidden'));
      }
      $('#modal-backdrop').classList.remove('hidden');
      openStaffModal(staff, branchName);
    } else if (btn.classList.contains('delete')) {
      if (!adminHasRight('canDeleteStaff') || !adminHasBranch(branchName)) {
        showNotification('Permission denied: Delete Staff', 'error');
        return;
      }
      deleteStaffHandler(staff, branchName);
    }
  }
  
  function handleQuickAction(action, staff, fullName, mobile) {
    switch (action) {
      case 'call':
        if (mobile && mobile !== 'N/A') {
          window.location.href = `tel:${mobile}`;
          showNotification(`Calling ${fullName}...`, 'info', 2000);
        } else {
          showNotification('No phone number available', 'error');
        }
        break;
      case 'message':
        if (mobile && mobile !== 'N/A') {
          window.location.href = `sms:${mobile}`;
          showNotification(`Opening messages for ${fullName}...`, 'info', 2000);
        } else {
          showNotification('No phone number available', 'error');
        }
        break;
      case 'details':
        showStaffDetailsModal(staff, branchName);
        break;
    }
  }
  return card;
}

// Enhanced card interactions and animations
function addCardInteractionEffects() {
  // Add stagger animation to cards when they load
  const cards = document.querySelectorAll('.staff-card');
  cards.forEach((card, index) => {
    card.style.animationDelay = `${index * 50}ms`;
  });
  
  // Add intersection observer for scroll animations
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    
    cards.forEach(card => {
      if (!card.classList.contains('fade-in')) {
        observer.observe(card);
      }
    });
  }
}

// Enhanced search with visual feedback
function enhancedSearch(searchTerm, container) {
  const cards = container.querySelectorAll('.staff-card');
  const normalizedSearch = searchTerm.toLowerCase();
  let visibleCount = 0;
  
  cards.forEach(card => {
    const name = card.dataset.name.toLowerCase();
    const designation = card.dataset.designation.toLowerCase();
    const mobile = card.dataset.mobile.toLowerCase();
    
    const matches = name.includes(normalizedSearch) || 
                   designation.includes(normalizedSearch) || 
                   mobile.includes(normalizedSearch);
    
    if (matches || !searchTerm) {
      card.style.display = 'flex';
      card.classList.add('fade-in');
      visibleCount++;
    } else {
      card.style.display = 'none';
      card.classList.remove('fade-in');
    }
  });
  
  // Show/hide no results message
  let noResultsMsg = container.querySelector('.no-results-message');
  if (visibleCount === 0 && searchTerm) {
    if (!noResultsMsg) {
      noResultsMsg = document.createElement('div');
      noResultsMsg.className = 'no-results-message col-span-full text-center py-8 text-gray-500';
      noResultsMsg.innerHTML = `
        <i class="fas fa-search text-4xl mb-4 opacity-50"></i>
        <p class="text-lg font-medium">No staff found</p>
        <p class="text-sm">Try adjusting your search terms</p>
      `;
      container.appendChild(noResultsMsg);
    }
    noResultsMsg.style.display = 'block';
  } else if (noResultsMsg) {
    noResultsMsg.style.display = 'none';
  }
  
  return visibleCount;
}
function handleSearch(event) {
  const searchTerm = event.target.value.toLowerCase();
  const normalizedSearch = searchTerm.startsWith('0') ? searchTerm : (searchTerm.match(/^\d+$/) ? '0' + searchTerm : searchTerm);
  const branchSection = event.target.closest('section');
  const cardsContainer = branchSection.querySelector('.grid');
  
  if (cardsContainer) {
    enhancedSearch(searchTerm, cardsContainer);
  }
  
  // Legacy fallback
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
  const staffStatusBtn = $('#staff-status-button');
  if (staffStatusBtn) {
    staffStatusBtn.classList.toggle('hidden', !isAdmin);
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