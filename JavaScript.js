// ...existing code...
// REMOVE <script> and </script> tags at the top and bottom

// Paste the URL of your deployed Apps Script Web App here
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpC3yx4TNwq-vEJiO2HeJ54X0TPWiKLZW_yypByCkbz2Cgc5_ABafmrWoZUBZJo2Kp/exec'; 

console.log("✅ JavaScript loaded");
let allData = [];
let isAdmin = false;
let tempPhotoData = null;

const mainContent = document.getElementById('main-content');
const loader = document.getElementById('loader');
const adminLoginBtn = document.getElementById('admin-login-button');
const adminControls = document.getElementById('admin-controls');
const logoutBtn = document.getElementById('logout-button');
const modalBackdrop = document.getElementById('modal-backdrop');

// Helper function for making a GET request to the Apps Script API
function fetchData(funcName, params = {}) {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('function', funcName);
    for (const key in params) {
        url.searchParams.append(key, params[key]);
    }
    return fetch(url).then(response => response.json());
}

// Helper function for making a POST request to the Apps Script API
function postData(funcName, payload) {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('function', funcName);
    return fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
    }).then(response => response.json());
}

// Original utility functions (keep them as is)
function showLoader() { 
    console.log('Showing loader...'); 
    loader.classList.remove('hidden'); 
}
function hideLoader() { 
    console.log('Hiding loader...'); 
    loader.classList.add('hidden'); 
}

function escapeHtml(unsafe) {
    return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openModal(modalId) {
    console.log(`Attempting to open modal: ${modalId}`);
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with ID "${modalId}" not found.`);
        return;
    }
    modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function closeModal(modalElement) {
    console.log('Attempting to close modal.');
    modalBackdrop.classList.add('hidden');
    modalElement.classList.add('hidden');
}

function openPromptModal({ title, message, confirmText, callback }) {
    console.log('Opening prompt modal with title:', title);
    document.getElementById('prompt-title').textContent = title;
    document.getElementById('prompt-message').textContent = message;
    const input = document.getElementById('prompt-input');
    input.value = '';
    const confirmBtn = document.getElementById('prompt-confirm');
    confirmBtn.textContent = confirmText;
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.onclick = () => {
        console.log('Prompt modal confirmed with value:', input.value);
        callback(input.value);
        closeModal(document.getElementById('prompt-modal'));
    };
    openModal('prompt-modal');
}

// Replace google.script.run with fetch API calls
document.addEventListener("DOMContentLoaded", () => {
    loadInitialData();

    // Move modal close event listeners here to ensure DOM is loaded
    document.querySelectorAll('.modal-close').forEach(btn => btn.onclick = () => {
        console.log('Modal close button clicked.'); // MODAL LOG
        closeModal(btn.closest('.modal-container'));
    });
});

function loadInitialData() {
    showLoader();
    console.log('Calling getInitialData() on server...');
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
            console.error('Error loading initial data:', err.message || err);
            mainContent.innerHTML = `<p class="text-red-500 text-center">Error loading data: ${err.message || err}</p>`;
        })
        .finally(() => {
            hideLoader();
        });
}

// Other functions remain the same
function renderAllBranches() {
    console.log('Rendering all branches. Total branches:', allData.length);
    mainContent.innerHTML = '';
    if (allData.length === 0) {
        mainContent.innerHTML = '<p class="text-center text-gray-500">No branches found. Admin can add a new branch.</p>';
        return;
    }
    allData.forEach(branch => {
        mainContent.appendChild(createBranchSection(branch));
    });
    updateAdminUI();
}

function createBranchSection(branch) {
    console.log('Creating section for branch:', branch.branchName);
    const section = document.createElement('section');
    section.className = 'mb-12';
    section.dataset.branchName = branch.branchName;
    const adminButtons = isAdmin ? `
        <div class="space-x-2">
            <button class="add-staff-btn text-sm py-2 px-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" data-branch="${branch.branchName}"><i class="fas fa-user-plus mr-1"></i> Add Staff</button>
            <button class="delete-branch-btn text-sm py-2 px-3 bg-red-600 text-white rounded-md hover:bg-red-700" data-branch="${branch.branchName}"><i class="fas fa-trash-alt mr-1"></i> Delete Branch</button>
        </div>` : '';
    section.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 border-indigo-500">
            <div><h2 class="text-2xl font-bold text-gray-800">` + escapeHtml(branch.branchName) + ` Staff</h2></div>
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
    console.log(`Creating ${title} grid for branch: ${branchName} with ${staffList.length} staff members.`);
    const container = document.createElement('div');
    if (staffList.length === 0 && title === 'Former Staff' && !isAdmin) return container;
    container.innerHTML = `<h3 class="text-xl font-semibold text-gray-700 mt-6 mb-4">${title}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
    if (staffList.length > 0) {
        staffList.forEach(staff => grid.appendChild(createStaffCard(staff, branchName)));
    } else {
        grid.innerHTML = `<p class="text-gray-500 italic col-span-full">No ${title.toLowerCase()} found.</p>`;
    }
    container.appendChild(grid);
    return container;
}

function createStaffCard(staff, branchName) {
    console.log('Creating card for staff:', staff['Full Name']);
    const card = document.createElement('div');
    card.className = 'staff-card bg-white rounded-lg shadow-md overflow-hidden transform fade-in';
    card.dataset.name = escapeHtml(staff['Full Name'] || '');
    card.dataset.designation = escapeHtml(staff['Designation'] || '');
    const adminCardButtons = isAdmin ? `
        <div class="absolute top-2 right-2 flex space-x-2">
            <button class="edit-staff-btn text-blue-500 hover:text-blue-700 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-staff-btn text-red-500 hover:text-red-700 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md"><i class="fas fa-trash-alt"></i></button>
        </div>` : '';

    const fallbackUrl = "https://drive.google.com/uc?export=download&id=1iUQhelba6oMDa5Lb3EuZL_B4_MS4plzC";
    const photoUrl = staff['Photo URL'] && staff['Photo URL'].trim() !== "" ? staff['Photo URL'] : fallbackUrl;

    card.innerHTML = `
        <div class="relative">
            <div class="h-40 bg-gray-200 flex items-center justify-center">
                <img src="${photoUrl}" alt="Photo of ${fullName}" class="h-full w-full object-cover"
                     onerror="this.onerror=null;this.src='${fallbackUrl}';">
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
    if (isAdmin) {
        card.querySelector('.edit-staff-btn').onclick = () => {
            console.log('Edit staff button clicked for:', staff['Full Name']);
            openStaffModal(staff, branchName);
        };
        card.querySelector('.delete-staff-btn').onclick = () => {
            console.log('Delete staff button clicked for:', staff['Full Name']);
            deleteStaffHandler(staff, branchName);
        };
    }
    return card;
}

function handleSearch(event) {
    console.log('Search initiated. Search term:', event.target.value);
    const searchTerm = event.target.value.toLowerCase();
    const branchSection = event.target.closest('section');
    const cards = branchSection.querySelectorAll('.staff-card');
    cards.forEach(card => {
        const name = card.dataset.name.toLowerCase();
        const designation = card.dataset.designation.toLowerCase();
        if (name.includes(searchTerm) || designation.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function updateAdminUI() {
    console.log('Updating Admin UI. isAdmin is:', isAdmin); // ADMIN LOG
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

adminLoginBtn.onclick = () => {
    console.log('Admin login button clicked.');
    openModal('login-modal');
};

// Use postData for login instead of fetchData and improve error handling
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    console.log('Login form submitted.'); // FORM SUBMISSION LOG
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    showLoader();
    postData('verifyAdmin', { email, password })
        .then(response => {
            console.log('Login verification response:', response);
            if (response.verified) {
                isAdmin = true;
                closeModal(document.getElementById('login-modal'));
                updateAdminUI();
            } else {
                alert('Invalid credentials.');
            }
        })
        .catch(err => {
            console.error('Login failed:', err.message || err);
            alert('Login failed. Please try again.');
        })
        .finally(() => {
            hideLoader();
        });
});

logoutBtn.onclick = () => { 
    console.log('Logout button clicked.');
    isAdmin = false; 
    updateAdminUI(); 
};

// Replace google.script.run with fetch API call
document.getElementById('add-branch-button').onclick = () => {
    console.log('Add new branch button clicked.');
    openPromptModal({
        title: "Add New Branch", message: "Enter the name for the new branch worksheet.", confirmText: "Create Branch",
        callback: (branchName) => {
            console.log('Add branch prompt confirmed with branch name:', branchName);
            if (!branchName) { alert('Branch name cannot be empty.'); return; }
            showLoader();
            postData('addBranch', { branchName })
                .then(response => {
                    console.log('Add branch server response:', response);
                    alert(response.message);
                    loadInitialData();
                })
                .catch(err => {
                    console.error('Add branch failed:', err.message || err);
                    alert('An error occurred while adding the branch.');
                })
                .finally(() => {
                    hideLoader();
                });
        }
    });
};

// Replace google.script.run with fetch API call
mainContent.addEventListener('click', e => {
    const deleteBtn = e.target.closest('.delete-branch-btn');
    if (deleteBtn) {
        const branchName = deleteBtn.dataset.branch;
        console.log('Delete branch button clicked for:', branchName);
        if (confirm(`Are you sure you want to permanently delete the "${branchName}" branch? This cannot be undone.`)) {
            showLoader();
            postData('deleteBranch', { branchName })
                .then(response => {
                    console.log('Delete branch server response:', response);
                    alert(response.message);
                    loadInitialData();
                })
                .catch(err => {
                    console.error('Delete branch failed:', err.message || err);
                    alert('An error occurred while deleting the branch.');
                })
                .finally(() => {
                    hideLoader();
                });
        }
    }
});

let currentBranch = '';
mainContent.addEventListener('click', e => {
    const addBtn = e.target.closest('.add-staff-btn');
    if (addBtn) {
        const branchName = addBtn.dataset.branch;
        console.log('Add staff button clicked for branch:', branchName);
        openStaffModal(null, branchName);
    }
});

function openStaffModal(staff, branchName) {
    console.log('Opening staff modal. Staff object:', staff, 'Branch:', branchName);
    const form = document.getElementById('staff-form');
    form.reset();
    tempPhotoData = null; // Reset photo data
    currentBranch = branchName;
    document.getElementById('staff-modal-title').textContent = staff ? `Edit Staff: ${escapeHtml(staff['Full Name'])}` : `Add New Staff to ${escapeHtml(branchName)}`;

    if (staff) {
        form.querySelectorAll('[data-header]').forEach(input => {
            const header = input.dataset.header;
            const value = staff[header] || '';
            input.value = value;
            console.log(`Setting input ${header} to value: ${value}`);
        });
        document.getElementById('rowIndex').value = staff.rowIndex;
        const branchData = allData.find(b => b.branchName === branchName);
        const isFormer = branchData.formerStaff.some(s => s.rowIndex === staff.rowIndex);
        document.getElementById('isFormer').checked = isFormer;
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
    console.log('Photo upload initiated.');
    const file = event.target.files[0];
    if (!file) {
        tempPhotoData = null;
        console.log('No file selected.');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        console.log('File read successfully. Setting photo preview.');
        document.getElementById('photo-preview').src = e.target.result;
        tempPhotoData = { base64: e.target.result, name: file.name };
    };
    reader.readAsDataURL(file);
};

// Replace google.script.run with fetch API call
document.getElementById('staff-form').addEventListener('submit', e => {
    e.preventDefault();
    console.log('Staff form submitted.');
    const staffData = { branchName: currentBranch };
    document.querySelectorAll('#staff-form [data-header]').forEach(input => {
        staffData[input.dataset.header] = input.value;
    });
    staffData.rowIndex = document.getElementById('rowIndex').value;
    staffData.isFormer = document.getElementById('isFormer').checked;
    if (tempPhotoData) {
        staffData.photo = tempPhotoData;
    }
    console.log('Staff data to be saved:', staffData);
    saveStaffData(staffData);
});

function saveStaffData(data) {
    console.log('Calling saveStaff() with data:', data);
    showLoader();
    closeModal(document.getElementById('staff-modal'));
    postData('saveStaff', data)
        .then(response => {
            console.log('Save staff server response:', response);
            if (response.status === 'success') {
                alert(response.message);
                loadInitialData();
            } else {
                alert(`Error: ${response.message}`);
            }
        })
        .catch(err => {
            console.error('Save staff failed:', err.message || err);
            alert('An error occurred while saving staff data.');
        })
        .finally(() => {
            hideLoader();
        });
}

// Replace google.script.run with fetch API call
function deleteStaffHandler(staff, branchName) {
    console.log('Calling deleteStaffHandler for:', staff['Full Name']);
    if (confirm(`Are you sure you want to delete ${escapeHtml(staff['Full Name'])}?`)) {
        showLoader();
        postData('deleteStaff', { branchName, rowIndex: staff.rowIndex })
            .then(response => {
                console.log('Delete staff server response:', response);
                alert(response.message);
                loadInitialData();
            })
            .catch(err => {
                console.error('Delete staff failed:', err.message || err);
                alert('An error occurred while deleting staff data.');
            })
            .finally(() => {
                hideLoader();
            });
    }
}

// Replace google.script.run with fetch API call
document.getElementById('change-password-button').onclick = () => {
    console.log('Change password button clicked.');
    openModal('password-modal');
};
document.getElementById('password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    console.log('Password change form submitted.');
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    console.log('New password data:', { currentPassword, newPassword });
    showLoader();
    postData('changePassword', { currentPassword, newPassword })
        .then(response => {
            console.log('Change password server response:', response);
            alert(response.message);
            if (response.message === 'Success') {
                closeModal(document.getElementById('password-modal'));
            }
        })
        .catch(err => {
            console.error('Change password failed:', err.message || err);
            alert('An error occurred while changing the password.');
        })
        .finally(() => {
            hideLoader();
        });
});
