// Branch Staff Directory JavaScript (connected to Google Apps Script backend)

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpC3yx4TNwq-vEJiO2HeJ54X0TPWiKLZW_yypByCkbz2Cgc5_ABafmrWoZUBZJo2Kp/exec';

let allData = [];
let isAdmin = false;
let tempPhotoData = null;
let currentBranch = '';

async function checkAdminSession() {
  const token = localStorage.getItem('adminSessionToken');
  if (!token) {
    setAdminMode(false);
    return;
  }
  try {
    const response = await fetchData('checkSession', { sessionToken: token });
    if (response.valid) {
      setAdminMode(true);
      currentAdmin = { email: response.email };
    } else {
      localStorage.removeItem('adminSessionToken');
      setAdminMode(false);
    }
  } catch (e) {
    setAdminMode(false);
  }
}
function setAdminMode(isAdminActive) {
  isAdmin = !!isAdminActive;
  updateAdminUI();
}

let admins = []; // For admin management
let currentAdmin = null; // Track current admin for settings

const mainContent = document.getElementById('main-content');
const loader = document.getElementById('loader');
const adminLoginBtn = document.getElementById('admin-login-button');
const adminControls = document.getElementById('admin-controls');
const logoutBtn = document.getElementById('logout-button');
const modalBackdrop = document.getElementById('modal-backdrop');

// --- Utility Functions ---

function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

function escapeHtml(unsafe) {
    return String(unsafe || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function fetchData(funcName, params = {}) {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('function', funcName);
    for (const key in params) url.searchParams.append(key, params[key]);
    return fetch(url).then(r => r.json());
}

function postData(funcName, payload) {
    const url = new URL(SCRIPT_URL);
    return fetch(url, {
        method: 'POST',
        body: JSON.stringify({ function: funcName, ...payload }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    }).then(r => r.json());
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function closeModal(modalElement) {
    modalElement.classList.add('hidden');
    // Check if any other modal is still open
    const anyOpen = Array.from(document.querySelectorAll('.modal-container')).some(m => !m.classList.contains('hidden'));
    if (!anyOpen) modalBackdrop.classList.add('hidden');
}

function openPromptModal({ title, message, confirmText, callback }) {
    document.getElementById('prompt-title').textContent = title;
    document.getElementById('prompt-message').textContent = message;
    const input = document.getElementById('prompt-input');
    input.value = '';
    const confirmBtn = document.getElementById('prompt-confirm');
    confirmBtn.textContent = confirmText;
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.onclick = () => {
        callback(input.value);
        closeModal(document.getElementById('prompt-modal'));
    };
    openModal('prompt-modal');
}

function showStaffDetailsModal(staff, branchName) {
    const modal = document.getElementById('staff-details-modal');
    const body = document.getElementById('staff-details-body');
    // Use the same fallback as staff card (Google Drive thumbnail)
    const fallbackUrl = "https://drive.google.com/thumbnail?id=1iUQhelba6oMDa5Lb3EuZL_B4_MS4plzC";
    let photoUrl = staff['Photo URL'] && String(staff['Photo URL']).trim() !== "" ? staff['Photo URL'] : fallbackUrl;
    // If the photoUrl is not a valid image, fallback will be handled by onerror
    // Define all fields to show, in order
    // Helper to get value by possible header variants (apostrophe, whitespace, etc)
    function getField(obj, keys) {
        for (let k of keys) {
            if (obj[k] && String(obj[k]).trim() !== "") return obj[k];
        }
        return '';
    }
    // Helper to format mobile numbers to always start with 0 if not empty
    function formatMobile(mobile) {
        if (!mobile || String(mobile).trim() === '') return '';
        mobile = String(mobile);
        return mobile.startsWith('0') ? mobile : '0' + mobile;
    }
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
    // Build a clean two-column grid UI
    let html = `
        <div class="flex flex-col items-center mb-6">
            <img src="${photoUrl}" alt="${escapeHtml(staff['Full Name'] || 'Staff Photo')}" class="w-32 h-32 object-cover rounded-full border-4 border-indigo-200 shadow-md mb-2" onerror="this.onerror=null;this.src='${fallbackUrl}';">
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
    document.getElementById('staff-details-title').textContent = staff['Full Name'] || 'Staff Details';
    // Show edit button if admin
    const editBtn = document.getElementById('edit-staff-btn-modal');
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

// --- Main Logic ---

document.addEventListener("DOMContentLoaded", () => {
    checkAdminSession();
    // Robust modal logic: close on .modal-close, backdrop; prevent accidental close on modal-content
    document.addEventListener('click', function(e) {
        // Close modal on .modal-close button
        if (e.target.classList.contains('modal-close')) {
            const modal = e.target.closest('.modal-container');
            if (modal) closeModal(modal);
            return;
        }
        // Close all modals on backdrop click
        if (e.target === modalBackdrop) {
            document.querySelectorAll('.modal-container').forEach(m => m.classList.add('hidden'));
            modalBackdrop.classList.add('hidden');
            return;
        }
        // Prevent clicks inside modal-content from closing modal (do nothing)
        if (e.target.closest('.modal-content')) {
            return;
        }
    });
    loadInitialData();
    // Ensure all modals are hidden on load, especially admin settings modal
    document.querySelectorAll('.modal-container').forEach(modal => {
        modal.classList.add('hidden');
    });
    // Extra: Hide modal-backdrop on load
    if (modalBackdrop) modalBackdrop.classList.add('hidden');
    // Robust modal close for all .modal-close buttons (including dynamically added)
    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-close')) {
            const modal = e.target.closest('.modal-container');
            if (modal) closeModal(modal);
        }
    });

    // Global search logic
    const globalSearch = document.getElementById('global-search');
    const suggestionsBox = document.getElementById('search-suggestions');
        let lastQuery = '';
        function doGlobalSearch(query) {
            if (!query) {
                suggestionsBox.classList.remove('active');
                suggestionsBox.classList.add('hidden');
                suggestionsBox.style.display = '';
                suggestionsBox.innerHTML = '';
                console.log('[GlobalSearch] Query empty, hiding suggestionsBox', suggestionsBox.className, suggestionsBox.style.display);
                return;
            }
            if (!allData || allData.length === 0) {
                // Data not loaded yet, try again in 200ms
                setTimeout(() => doGlobalSearch(query), 200);
                console.log('[GlobalSearch] Data not loaded, retrying...');
                return;
            }
            let matches = [];
            // Helper to normalize mobile for search (always starts with 0 if not empty)
            function normalizeMobile(mobile) {
                if (!mobile || String(mobile).trim() === '') return '';
                mobile = String(mobile);
                return mobile.startsWith('0') ? mobile : '0' + mobile;
            }
            // Also normalize query if it looks like a mobile number
            const normalizedQuery = query.startsWith('0') ? query : (query.match(/^\d+$/) ? '0' + query : query);
            allData.forEach(branch => {
                branch.currentStaff.concat(branch.formerStaff).forEach(staff => {
                    const name = staff['Full Name'] ? String(staff['Full Name']).toLowerCase() : '';
                    const mobile = staff['Mobile'] ? String(staff['Mobile']).toLowerCase() : '';
                    const normalizedMobile = normalizeMobile(staff['Mobile']);
                    if (!name) return;
                    // Match by name or mobile (partial, case-insensitive)
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
    document.body.addEventListener('click', () => suggestionsBox.classList.add('hidden'));
    // --- Branch Options Modal Logic ---
    const branchOptionsBtn = document.getElementById('branch-options-button');
    const branchOptionsModal = document.getElementById('branch-options-modal');
    const addBranchModal = document.getElementById('add-branch-modal');
    const removeBranchModal = document.getElementById('remove-branch-modal');
    const confirmRemoveModal = document.getElementById('confirm-remove-modal');
    const renameBranchModal = document.getElementById('rename-branch-modal');
    // Open Branch Options
    if (branchOptionsBtn) branchOptionsBtn.onclick = () => openModal('branch-options-modal');
    const openAddBranchBtn = document.getElementById('open-add-branch-modal');
    if (openAddBranchBtn) openAddBranchBtn.onclick = () => {
        closeModal(branchOptionsModal);
        const newBranchNameInput = document.getElementById('new-branch-name');
        if (newBranchNameInput) newBranchNameInput.value = '';
        openModal('add-branch-modal');
    };
    const openRemoveBranchBtn = document.getElementById('open-remove-branch-modal');
    if (openRemoveBranchBtn) openRemoveBranchBtn.onclick = () => {
        closeModal(branchOptionsModal);
        populateBranchSelect('remove-branch-select');
        openModal('remove-branch-modal');
    };
    const openRenameBranchBtn = document.getElementById('open-rename-branch-modal');
    if (openRenameBranchBtn) openRenameBranchBtn.onclick = () => {
        closeModal(branchOptionsModal);
        populateBranchSelect('rename-branch-select');
        const renameBranchNameInput = document.getElementById('rename-branch-name');
        if (renameBranchNameInput) renameBranchNameInput.value = '';
        openModal('rename-branch-modal');
    };
    const submitAddBranchBtn = document.getElementById('submit-add-branch');
    if (submitAddBranchBtn) submitAddBranchBtn.onclick = () => {
        const input = document.getElementById('new-branch-name');
        let name = input.value.trim();
        if (!name) { input.classList.add('border-red-500'); return; }
        input.classList.remove('border-red-500');
        // Always append ' Branch'
        if (!/ branch$/i.test(name)) name = name + ' Branch';
        showLoader();
        postData('addBranch', { branchName: name })
            .then(response => {
                alert(response.message);
                closeModal(addBranchModal);
                loadInitialData();
            })
            .catch(() => alert('An error occurred while adding the branch.'))
            .finally(hideLoader);
    };
    // Remove Branch logic
    let branchToRemove = '';
    document.getElementById('remove-branch-select').onchange = function() {
        branchToRemove = this.value;
    };
    document.getElementById('confirm-remove-branch').onclick = () => {
        branchToRemove = document.getElementById('remove-branch-select').value;
        if (!branchToRemove) return;
        closeModal(removeBranchModal);
        openModal('confirm-remove-modal');
    };
    document.getElementById('yes-remove-branch').onclick = () => {
        if (!branchToRemove) return;
        showLoader();
        postData('deleteBranch', { branchName: branchToRemove })
            .then(response => {
                alert(response.message);
                closeModal(confirmRemoveModal);
                loadInitialData();
            })
            .catch(() => alert('An error occurred while deleting the branch.'))
            .finally(hideLoader);
    };
    // Rename Branch logic
    document.getElementById('submit-rename-branch').onclick = () => {
        const select = document.getElementById('rename-branch-select');
        const oldName = select.value;
        let newName = document.getElementById('rename-branch-name').value.trim();
        if (!oldName || !newName) return;
        // Always append ' Branch'
        if (!/ branch$/i.test(newName)) newName = newName + ' Branch';
        showLoader();
        postData('renameBranch', { oldName, newName })
            .then(response => {
                alert(response.message);
                closeModal(renameBranchModal);
                loadInitialData();
            })
            .catch(() => alert('An error occurred while renaming the branch.'))
            .finally(hideLoader);
    };
    // Helper to populate branch selects
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
});

function loadInitialData() {
    showLoader();
    fetchData('getInitialData')
        .then(response => {
            if (response.status === 'success') {
                allData = response.data;
                renderAllBranches();
                // If user has typed in global search, trigger search now
                const globalSearch = document.getElementById('global-search');
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
            mainContent.innerHTML = `<p class="text-red-500 text-center">Error loading data: ${err.message || err}</p>`;
        })
        .finally(hideLoader);
}

function renderAllBranches() {
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
    const adminButtons = isAdmin ? `
        <div class="space-x-2">
            <button class="add-staff-btn text-sm py-2 px-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" data-branch="${branch.branchName}"><i class="fas fa-user-plus mr-1"></i> Add Staff</button>
            <button class="rename-branch-btn text-sm py-2 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700" data-branch="${branch.branchName}"><i class="fas fa-edit mr-1"></i> Rename Branch</button>
            <button class="delete-branch-btn text-sm py-2 px-3 bg-red-600 text-white rounded-md hover:bg-red-700" data-branch="${branch.branchName}"><i class="fas fa-trash-alt mr-1"></i> Delete Branch</button>
        </div>` : '';
    section.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 border-indigo-500">
            <div><h2 class="text-2xl font-bold text-gray-800">${escapeHtml(branch.branchName)} Staff</h2></div>
            ${adminButtons}
        </div>
        <div class="mb-4"><input type="text" placeholder="Search staff in ${escapeHtml(branch.branchName)}..." class="search-box w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"></div>`;
    section.appendChild(createStaffGrid('Current Staff', branch.currentStaff, branch.branchName));
    if (branch.formerStaff.length > 0 || isAdmin) {
        section.appendChild(createStaffGrid('Former Staff', branch.formerStaff, branch.branchName));
    }
    section.querySelector('.search-box').addEventListener('keyup', handleSearch);
    return section;
}

function createStaffGrid(title, staffList, branchName) {
    const container = document.createElement('div');
    if (staffList.length === 0 && title === 'Former Staff' && !isAdmin) return container;
    container.innerHTML = `<h3 class="text-xl font-semibold text-gray-700 mt-6 mb-4">${title}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
    // Only create cards for staff with Full Name
    const filteredList = staffList.filter(staff => staff['Full Name'] && staff['Full Name'].trim() !== '');
    if (filteredList.length > 0) {
        filteredList.forEach(staff => grid.appendChild(createStaffCard(staff, branchName)));
    } else {
        grid.innerHTML = `<p class="text-gray-500 italic col-span-full">No ${title.toLowerCase()} found.</p>`;
    }
    container.appendChild(grid);
    return container;
}

function createStaffCard(staff, branchName) {
    const card = document.createElement('div');
    card.className = 'staff-card fade-in cursor-pointer';
    card.dataset.name = escapeHtml(staff['Full Name'] || '');
    card.dataset.designation = escapeHtml(staff['Designation'] || '');

    const fullName = escapeHtml(staff['Full Name'] || 'N/A');
    const designation = escapeHtml(staff['Designation'] || 'N/A');
    // Format mobile number to always start with 0 if not empty
    function formatMobile(mobile) {
        if (!mobile || String(mobile).trim() === '') return '';
        mobile = String(mobile);
        return mobile.startsWith('0') ? mobile : '0' + mobile;
    }
    const mobile = escapeHtml(formatMobile(staff['Mobile']) || 'N/A');
    const currentAddress = escapeHtml(staff['Current Address'] || 'N/A');

    const adminCardButtons = isAdmin ? `
        <div class="absolute top-2 right-2 flex space-x-2">
            <button class="edit-staff-btn text-blue-500 hover:text-blue-700 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-staff-btn text-red-500 hover:text-red-700 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md"><i class="fas fa-trash-alt"></i></button>
        </div>` : '';

    // Use the provided Google Drive fallback image
    const fallbackUrl = "https://drive.google.com/thumbnail?id=1iUQhelba6oMDa5Lb3EuZL_B4_MS4plzC";
    let photoUrl = staff['Photo URL'] && staff['Photo URL'].trim() !== "" ? staff['Photo URL'] : fallbackUrl;

    card.innerHTML = `
        <img src="${photoUrl}" alt="Photo of ${fullName}" class="staff-photo" onerror="this.onerror=null;this.src='${fallbackUrl}';">
        <div class="staff-name">${fullName}</div>
        <div class="staff-designation">${designation}</div>
        <div class="staff-info">
            <p><i class="fas fa-phone-alt"></i> ${mobile}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${currentAddress}</p>
        </div>
        ${adminCardButtons}
    `;
    // Card click opens details modal
    card.onclick = (e) => {
        // Prevent admin button clicks from opening details
        if (e.target.closest('.edit-staff-btn') || e.target.closest('.delete-staff-btn')) return;
        showStaffDetailsModal(staff, branchName);
    };
    if (isAdmin) {
        card.querySelector('.edit-staff-btn').onclick = (ev) => {
            ev.stopPropagation();
            // Always close any open modals before opening edit modal
            document.querySelectorAll('.modal-container').forEach(m => m.classList.add('hidden'));
            modalBackdrop.classList.remove('hidden');
            setTimeout(() => openStaffModal(staff, branchName), 100);
        };
        card.querySelector('.delete-staff-btn').onclick = (ev) => {
            ev.stopPropagation();
            deleteStaffHandler(staff, branchName);
        };
    }
    return card;
}

function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    // Helper to normalize mobile for search (always starts with 0 if not empty)
    function normalizeMobile(mobile) {
        if (!mobile || String(mobile).trim() === '') return '';
        mobile = String(mobile);
        return mobile.startsWith('0') ? mobile : '0' + mobile;
    }
    const normalizedSearch = searchTerm.startsWith('0') ? searchTerm : (searchTerm.match(/^\d+$/) ? '0' + searchTerm : searchTerm);
    const branchSection = event.target.closest('section');
    const cards = branchSection.querySelectorAll('.staff-card');
    cards.forEach(card => {
        const name = card.dataset.name.toLowerCase();
        const designation = card.dataset.designation.toLowerCase();
        // Find the staff object for this card to get the mobile
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
    if (isAdmin) {
        adminLoginBtn.classList.add('hidden');
        adminControls.classList.remove('hidden');
        adminControls.classList.add('flex');
    } else {
        adminLoginBtn.classList.remove('hidden');
        adminControls.classList.add('hidden');
        adminControls.classList.remove('flex');
    }
}

// --- Admin Actions ---

adminLoginBtn.onclick = () => openModal('login-modal');

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginModal = document.getElementById('login-modal');
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
                setAdminMode(true);
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
            } else {
                setAdminMode(false);
                statusMsg.textContent = 'Invalid credentials. Please try again.';
                statusMsg.style.color = '#dc2626';
            }
        })
        .catch(() => {
            setAdminMode(false);
            statusMsg.textContent = 'Login failed. Please try again.';
            statusMsg.style.color = '#dc2626';
        })
        .finally(hideLoader);
});

logoutBtn.onclick = () => {
    setAdminMode(false);
    localStorage.removeItem('adminSessionToken');
    updateAdminUI();
};

const addBranchBtn = document.getElementById('add-branch-button');
if (addBranchBtn) {
    addBranchBtn.onclick = () => {
        openPromptModal({
            title: "Add New Branch",
            message: "Enter the name for the new branch worksheet.",
            confirmText: "Create Branch",
            callback: (branchName) => {
                if (!branchName) { alert('Branch name cannot be empty.'); return; }
                showLoader();
                postData('addBranch', { branchName })
                    .then(response => {
                        alert(response.message);
                        loadInitialData();
                    })
                    .catch(() => alert('An error occurred while adding the branch.'))
                    .finally(hideLoader);
            }
        });
    };
}

mainContent.addEventListener('click', e => {
    const deleteBtn = e.target.closest('.delete-branch-btn');
    if (deleteBtn) {
        const branchName = deleteBtn.dataset.branch;
        if (confirm(`Are you sure you want to permanently delete the "${branchName}" branch? This cannot be undone.`)) {
            showLoader();
            postData('deleteBranch', { branchName })
                .then(response => {
                    alert(response.message);
                    loadInitialData();
                })
                .catch(() => alert('An error occurred while deleting the branch.'))
                .finally(hideLoader);
        }
    }
    const addBtn = e.target.closest('.add-staff-btn');
    if (addBtn) {
        const branchName = addBtn.dataset.branch;
        openStaffModal(null, branchName);
    }
    const renameBtn = e.target.closest('.rename-branch-btn');
    if (renameBtn) {
        const branchName = renameBtn.dataset.branch;
        openPromptModal({
            title: "Rename Branch",
            message: `Enter a new name for branch "${branchName}":`,
            confirmText: "Rename",
            callback: (newName) => {
                if (!newName) { alert('Branch name cannot be empty.'); return; }
                showLoader();
                postData('renameBranch', { oldName: branchName, newName })
                    .then(response => {
                        alert(response.message);
                        loadInitialData();
                    })
                    .catch(() => alert('An error occurred while renaming the branch.'))
                    .finally(hideLoader);
            }
        });
    }
});

// --- Staff Modal ---

function openStaffModal(staff, branchName) {
    const form = document.getElementById('staff-form');
    form.reset();
    tempPhotoData = null;
    currentBranch = branchName;
    document.getElementById('staff-modal-title').textContent = staff ? `Edit Staff: ${escapeHtml(staff['Full Name'])}` : `Add New Staff to ${escapeHtml(branchName)}`;

    // --- Enhanced field population logic for header variants ---
    const headerMap = {
      "Father’s Name": ["Father’s Name", "Father's Name", "Father ‘s Name", "Father ′s Name"],
      "Mother’s Name": ["Mother’s Name", "Mother's Name", "Mother ‘s Name", "Mother ′s Name"],
      "NID/Birth Certificate": ["NID/Birth Certificate", "NID / Birth Certificate"]
    };
    let staffOriginal = staff ? { ...staff } : null;

    if (staff) {
      form.querySelectorAll('[data-header]').forEach(input => {
        const header = input.dataset.header;
        let value = '';
        // If it's a variant field, check all equivalents
        if (headerMap[header]) {
          for (let h of headerMap[header]) {
            if (staff[h] && String(staff[h]).trim() !== '') {
              value = staff[h];
              break;
            }
          }
        } else {
          value = staff[header] || '';
        }
        input.value = value;
      });
      document.getElementById('rowIndex').value = staff.rowIndex || '';
      document.getElementById('isFormer').checked = false;
    } else {
      document.getElementById('rowIndex').value = '';
      document.getElementById('isFormer').checked = false;
    }

    const fallbackUrl = "https://drive.google.com/uc?export=download&id=1iUQhelba6oMDa5Lb3EuZL_B4_MS4plzC";
    const photoUrl = (staff && staff['Photo URL']) ? staff['Photo URL'] : fallbackUrl;
    document.getElementById('photo-preview').src = photoUrl;

    // Remove Photo button logic
    let removeBtn = document.getElementById('remove-photo-btn');
    if (!removeBtn) {
      removeBtn = document.createElement('button');
      removeBtn.innerText = 'Remove Photo';
      removeBtn.id = 'remove-photo-btn';
      removeBtn.type = 'button';
      removeBtn.className = 'ml-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-700';
      document.getElementById('photo-upload').insertAdjacentElement('afterend', removeBtn);
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
                  document.getElementById('photo-preview').src = fallbackUrl;
                  // Optional: clear value in staff object in memory for the current modal usage
                  staff['Photo URL'] = '';
                  // No need to re-open, but resetting tempPhotoData so subsequent save clears
                  tempPhotoData = null;
                  alert('Photo removed.');
                } else {
                  alert(response.message);
                }
              })
              .catch(() => {
                alert('Error removing photo.');
              })
              .finally(hideLoader);
          } else {
            document.getElementById('photo-preview').src = fallbackUrl;
          }
        }
      });
    };

    openModal('staff-modal');
}

document.getElementById('photo-upload').onchange = (event) => {
    const file = event.target.files[0];
    if (!file) {
        tempPhotoData = null;
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('photo-preview').src = e.target.result;
        tempPhotoData = { base64: e.target.result, name: file.name };
    };
    reader.readAsDataURL(file);
};

document.getElementById('staff-form').addEventListener('submit', e => {
    e.preventDefault();
    const staffData = { branchName: currentBranch };
    // Grab the original loaded staff object for field backup
    let originalStaff = null;
    if (typeof staffOriginal !== 'undefined' && staffOriginal) originalStaff = staffOriginal;

    document.querySelectorAll('#staff-form [data-header]').forEach(input => {
        let header = input.dataset.header;
        let value = input.value;
        // Patch for header variants: only keep one main field per variant
        if (header === 'Father’s Name') {
          if (!value && originalStaff) {
            // Try getting backup from original loaded staff
            value = originalStaff["Father’s Name"] || originalStaff["Father's Name"] || originalStaff["Father ‘s Name"] || originalStaff["Father ′s Name"] || '';
          }
        } else if (header === 'Mother’s Name') {
          if (!value && originalStaff) {
            value = originalStaff["Mother’s Name"] || originalStaff["Mother's Name"] || originalStaff["Mother ‘s Name"] || originalStaff["Mother ′s Name"] || '';
          }
        } else if (header === 'NID/Birth Certificate') {
          if (!value && originalStaff) {
            value = originalStaff["NID/Birth Certificate"] || originalStaff["NID / Birth Certificate"] || '';
          }
        } else if (!value && originalStaff) {
          value = originalStaff[header] || '';
        }
        staffData[header] = value;
    });
    staffData.rowIndex = document.getElementById('rowIndex').value;
    staffData.isFormer = document.getElementById('isFormer').checked;
    if (tempPhotoData) staffData.photo = tempPhotoData;
    showLoader();
    closeModal(document.getElementById('staff-modal'));
    postData('saveStaff', staffData)
        .then(response => {
            if (response.status === 'success') {
                alert(response.message);
                loadInitialData();
            } else {
                alert(`Error: ${response.message}`);
            }
        })
        .catch(() => alert('An error occurred while saving staff data.'))
        .finally(hideLoader);
});

function deleteStaffHandler(staff, branchName) {
    if (confirm(`Are you sure you want to delete ${escapeHtml(staff['Full Name'])}?`)) {
        showLoader();
        postData('deleteStaff', { branchName, rowIndex: staff.rowIndex })
            .then(response => {
                alert(response.message);
                loadInitialData();
            })
            .catch(() => alert('An error occurred while deleting staff data.'))
            .finally(hideLoader);
    }
}

// --- Password Modal ---

document.getElementById('change-password-button').onclick = () => openModal('password-modal');

document.getElementById('password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    showLoader();
    postData('changePassword', { currentPassword, newPassword })
        .then(response => {
            alert(response.message);
            if (response.message === 'Success') {
                closeModal(document.getElementById('password-modal'));
            }
        })
        .catch(() => alert('An error occurred while changing the password.'))
        .finally(hideLoader);
});

// --- Admin Settings Modal Logic ---

document.getElementById('admin-settings-btn').onclick = () => {
    // Only allow opening if admin is logged in
    if (!isAdmin) return;
    document.getElementById('admin-edit-email').value = currentAdmin ? currentAdmin.email : '';
    document.getElementById('admin-edit-password').value = '';
    document.getElementById('new-admin-email').value = '';
    document.getElementById('new-admin-password').value = '';
    document.getElementById('assign-permissions-section').classList.add('hidden');
    openModal('admin-settings-modal');
};

document.getElementById('save-admin-credentials').onclick = () => {
    const email = document.getElementById('admin-edit-email').value.trim();
    const password = document.getElementById('admin-edit-password').value.trim();
    if (!email || !password) { alert('Email and password required.'); return; }
    showLoader();
    postData('updateAdminCredentials', { email, password })
        .then(response => {
            alert(response.message);
            closeModal(document.getElementById('admin-settings-modal'));
        })
        .catch(() => alert('Error updating credentials.'))
        .finally(hideLoader);
};

document.getElementById('assign-admin-btn').onclick = () => {
    const email = document.getElementById('new-admin-email').value.trim();
    const password = document.getElementById('new-admin-password').value.trim();
    if (!email || !password) { alert('Email and password required.'); return; }
    showLoader();
    postData('createAdmin', { email, password })
        .then(response => {
            if (response.status === 'success') {
                // Show permissions UI
                const permSection = document.getElementById('assign-permissions-section');
                permSection.classList.remove('hidden');
                // List all branches with checkboxes
                const list = document.getElementById('branch-permissions-list');
                list.innerHTML = '';
                allData.forEach(branch => {
                    const id = `perm-${branch.branchName.replace(/\s+/g, '-')}`;
                    list.innerHTML += `<div><label><input type="checkbox" class="branch-perm" value="${branch.branchName}" id="${id}"> ${escapeHtml(branch.branchName)}</label></div>`;
                });
                // Save permissions
                document.getElementById('save-permissions-btn').onclick = () => {
                    const perms = Array.from(document.querySelectorAll('.branch-perm:checked')).map(cb => cb.value);
                    if (perms.length === 0) { alert('Select at least one branch.'); return; }
                    showLoader();
                    postData('setAdminPermissions', { email, branches: perms })
                        .then(resp => {
                            alert(resp.message);
                            closeModal(document.getElementById('admin-settings-modal'));
                        })
                        .catch(() => alert('Error saving permissions.'))
                        .finally(hideLoader);
                };
            } else {
                alert(response.message);
            }
        })
        .catch(() => alert('Error creating admin.'))
        .finally(hideLoader);
};

document.getElementById('admin-logout-btn').onclick = () => {
    isAdmin = false;
    updateAdminUI();
    closeModal(document.getElementById('admin-settings-modal'));
};