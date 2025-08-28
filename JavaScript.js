// Branch Staff Directory JavaScript (connected to Google Apps Script backend)

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpC3yx4TNwq-vEJiO2HeJ54X0TPWiKLZW_yypByCkbz2Cgc5_ABafmrWoZUBZJo2Kp/exec';

let allData = [];
let isAdmin = false;
let tempPhotoData = null;
let currentBranch = '';

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
    modalBackdrop.classList.add('hidden');
    modalElement.classList.add('hidden');
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
    const fields = [
        { label: "Serial No", value: getField(staff, ['Serial No']) },
        { label: "Full Name", value: getField(staff, ['Full Name']) },
        { label: "Father's Name", value: getField(staff, ["Father’s Name", "Father's Name", "Father ‘s Name", "Father ′s Name"]) },
        { label: "Mother's Name", value: getField(staff, ["Mother’s Name", "Mother's Name", "Mother ‘s Name", "Mother ′s Name"]) },
        { label: "Gender", value: getField(staff, ['Gender']) },
        { label: "Date of Birth", value: getField(staff, ['Date of Birth']) },
        { label: "NID / Birth Certificate", value: getField(staff, ["NID/Birth Certificate", "NID / Birth Certificate"]) },
        { label: "Mobile Number", value: getField(staff, ['Mobile', 'Mobile Number']) },
        { label: "Emergency Mobile Number", value: getField(staff, ['Emergency Mobile', 'Emergency Mobile Number']) },
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
            openStaffModal(staff, branchName);
        };
    } else {
        editBtn.classList.add('hidden');
    }
    openModal('staff-details-modal');
}

// --- Main Logic ---

document.addEventListener("DOMContentLoaded", () => {
    loadInitialData();
    // Ensure all modals are hidden on load, especially admin settings modal
    document.querySelectorAll('.modal-container').forEach(modal => {
        modal.classList.add('hidden');
    });
    // Extra: Hide modal-backdrop on load
    if (modalBackdrop) modalBackdrop.classList.add('hidden');
    document.querySelectorAll('.modal-close').forEach(btn => btn.onclick = () => {
        closeModal(btn.closest('.modal-container'));
    });

    // Global search logic
    const globalSearch = document.getElementById('global-search');
    const suggestionsBox = document.getElementById('search-suggestions');
        let lastQuery = '';
        function doGlobalSearch(query) {
            if (!query) {
                suggestionsBox.classList.remove('active');
                suggestionsBox.innerHTML = '';
                return;
            }
            if (!allData || allData.length === 0) {
                // Data not loaded yet, try again in 200ms
                setTimeout(() => doGlobalSearch(query), 200);
                return;
            }
            let matches = [];
            allData.forEach(branch => {
                branch.currentStaff.concat(branch.formerStaff).forEach(staff => {
                    if (!staff['Full Name']) return;
                    // Match by name or mobile (partial, case-insensitive)
                    if (
                        (staff['Full Name'] && staff['Full Name'].toLowerCase().includes(query)) ||
                        (staff['Mobile'] && staff['Mobile'].toLowerCase().includes(query))
                    ) {
                        matches.push({ staff, branch: branch.branchName });
                    }
                });
            });
            if (matches.length === 0) {
                suggestionsBox.innerHTML = '<div class="px-3 py-2 text-gray-500">No results found</div><div style="color:red;font-weight:bold;">[DEBUG: Suggestions Box Rendered]</div>';
                suggestionsBox.classList.add('active');
            } else {
                suggestionsBox.innerHTML = '<div style="color:red;font-weight:bold;">[DEBUG: Suggestions Box Rendered]</div>' + matches.slice(0, 20).map(({ staff, branch }) => {
                    let name = escapeHtml(staff['Full Name'] || '');
                    let mobile = escapeHtml(staff['Mobile'] || '');
                    return `<div class="px-3 py-2 cursor-pointer hover:bg-indigo-100 hover:text-gray-900 bg-white text-gray-900 border-b border-gray-200" data-branch="${escapeHtml(branch)}" data-name="${name}">
                        <span class="block font-mono text-base">${mobile ? mobile : name}</span>
                        ${mobile && name ? `<span class='block text-xs text-gray-500'>${name}</span>` : ''}
                    </div>`;
                }).join('');
                suggestionsBox.classList.add('active');
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
});

function loadInitialData() {
    showLoader();
    fetchData('getInitialData')
        .then(response => {
            if (response.status === 'success') {
                allData = response.data;
                renderAllBranches();
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
    card.className = 'staff-card bg-white rounded-lg shadow-md overflow-hidden transform fade-in cursor-pointer';
    card.dataset.name = escapeHtml(staff['Full Name'] || '');
    card.dataset.designation = escapeHtml(staff['Designation'] || '');

    const fullName = escapeHtml(staff['Full Name'] || 'N/A');
    const designation = escapeHtml(staff['Designation'] || 'N/A');
    const mobile = escapeHtml(staff['Mobile'] || 'N/A');
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
        <div class="relative">
            <div class="h-40 bg-gray-200 flex items-center justify-center">
                <img src="${photoUrl}" alt="Photo of ${fullName}" class="h-full w-full object-cover" onerror="this.onerror=null;this.src='${fallbackUrl}';">
            </div>
            ${adminCardButtons}
        </div>
        <div class="p-4">
            <h4 class="text-lg font-bold text-gray-900">${fullName}</h4>
            <p class="text-indigo-600 font-medium text-sm">${designation}</p>
            <div class="mt-3 text-xs text-gray-600 space-y-1">
                <p><i class="fas fa-phone-alt w-4"></i> ${mobile}</p>
                <p><i class="fas fa-map-marker-alt w-4"></i> ${currentAddress}</p>
            </div>
        </div>`;
    // Card click opens details modal
    card.onclick = (e) => {
        // Prevent admin button clicks from opening details
        if (e.target.closest('.edit-staff-btn') || e.target.closest('.delete-staff-btn')) return;
        showStaffDetailsModal(staff, branchName);
    };
    if (isAdmin) {
        card.querySelector('.edit-staff-btn').onclick = (ev) => {
            ev.stopPropagation();
            openStaffModal(staff, branchName);
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
    const branchSection = event.target.closest('section');
    const cards = branchSection.querySelectorAll('.staff-card');
    cards.forEach(card => {
        const name = card.dataset.name.toLowerCase();
        const designation = card.dataset.designation.toLowerCase();
        card.style.display = (name.includes(searchTerm) || designation.includes(searchTerm)) ? 'block' : 'none';
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
    showLoader();
    fetchData('verifyAdmin', { email, password })
        .then(response => {
            if (response.status === 'success' && response.verified) {
                isAdmin = true;
                currentAdmin = { email }; // Track current admin
                closeModal(document.getElementById('login-modal'));
                updateAdminUI();
                alert("Logged in as admin!");
            } else {
                alert('Invalid credentials.');
            }
        })
        .catch(() => alert('Login failed. Please try again.'))
        .finally(hideLoader);
});

logoutBtn.onclick = () => { isAdmin = false; updateAdminUI(); };

document.getElementById('add-branch-button').onclick = () => {
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

    if (staff) {
        form.querySelectorAll('[data-header]').forEach(input => {
            const header = input.dataset.header;
            input.value = staff[header] || '';
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
    document.querySelectorAll('#staff-form [data-header]').forEach(input => {
        staffData[input.dataset.header] = input.value;
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