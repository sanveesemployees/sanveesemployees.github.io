/*
* Cleaned-up and fixed Code.gs file
* Acts as a JSON API for your frontend hosted on GitHub.
* Handles admin, staff, and branch management.
*/

const SPREADSHEET_ID = "1v4irW2hoUsQ7KjuOHr6w4bcNQ4MQtYcJvwbjOZQT_vc"; 
const PHOTO_FOLDER_NAME = "Branch Staff Photos";
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

// ===== Password Hashing Helpers (Top-level) =====
// Store format: SHA256$<salt>$<hexhash>
function bytesToHex(bytes) {
  return bytes.map(function(b){
    b = (b < 0) ? b + 256 : b;
    var s = b.toString(16);
    return s.length === 1 ? '0' + s : s;
  }).join('');
}

// Delete an assigned admin (super admin only)
function handleDeleteAdmin(payload) {
  // Require a valid session token
  if (!payload || !payload.sessionToken) {
    return returnJson({ status: 'error', message: 'Session token required.' });
  }
  var session = verifySession(payload.sessionToken);
  if (!session.valid) return returnJson({ status: 'error', message: 'Invalid or expired session.' });
  // Only super admin can delete admins
  var ctx = getAdminContextByEmail(session.email);
  if (!ctx || !ctx.isMain) {
    return returnJson({ status: 'error', message: 'Only the super admin can delete admins.' });
  }
  var targetEmail = payload.email;
  if (!targetEmail) return returnJson({ status: 'error', message: 'Email required.' });
  // Prevent deleting self or main admin
  var main = getMainAdmin();
  if (main && main.email === targetEmail) {
    return returnJson({ status: 'error', message: 'Cannot delete the super admin.' });
  }
  if (session.email === targetEmail) {
    return returnJson({ status: 'error', message: 'Super admin cannot delete their own account.' });
  }
  // Perform deletion from script properties
  var admins = getAdminsMap();
  if (!admins[targetEmail]) {
    return returnJson({ status: 'error', message: 'Admin not found.' });
  }
  delete admins[targetEmail];
  PropertiesService.getScriptProperties().setProperty('admins', JSON.stringify(admins));
  return returnJson({ status: 'success', message: 'Admin deleted successfully.' });
}
function makePasswordRecord(password) {
  var salt = Utilities.getUuid();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password);
  var hex = bytesToHex(digest);
  return 'SHA256$' + salt + '$' + hex;
}
function verifyPasswordRecord(stored, password) {
  if (!stored) return false;
  if (stored.indexOf('SHA256$') === 0) {
    var parts = stored.split('$');
    if (parts.length !== 3) return false;
    var salt = parts[1];
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password);
    var hex = bytesToHex(digest);
    return ('SHA256$' + salt + '$' + hex) === stored;
  }
  // Backward-compat for legacy plaintext storage
  return stored === password;
}


function doGet(e) {
  if (!e.parameter.function) {
    return returnJson({ status: 'error', message: 'No function specified.' });
  }

  switch (e.parameter.function) {
    case 'getInitialData': return handleGetInitialData();
    case 'verifyAdmin': return handleVerifyAdmin({ email: e.parameter.email, password: e.parameter.password });
    case 'checkSession': return handleCheckSession(e.parameter.sessionToken);
    case 'getAllAdmins': return handleGetAllAdmins(e.parameter.sessionToken);
    // Add more GET endpoints here if needed
    default:
      return returnJson({ status: 'error', message: 'Function not found.' });
  }
}

// Returns the list of all assigned admins and their context (for UI)
function handleGetAllAdmins(sessionToken) {
  try {
    if (sessionToken) {
      var perm = requirePermission(sessionToken, 'canManageAdmins');
      if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
    } else {
      return returnJson({ status: 'error', message: 'Session token required.' });
    }
    let admins = PropertiesService.getScriptProperties().getProperty('admins');
    admins = admins ? JSON.parse(admins) : {};
    // Convert to safe list without passwords
    let adminList = Object.keys(admins).map(email => ({
      email: email,
      branches: admins[email].branches || [],
      rights: admins[email].rights || {}
    }));
    return returnJson({ status: 'success', admins: adminList });
  } catch (e) {
    return returnJson({ status: 'error', message: 'Failed to retrieve admins: ' + e.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!payload.function) {
      return returnJson({ status: 'error', message: 'No function specified.' });
    }

    switch (payload.function) {
      case 'saveStaff': return handleSaveStaff(payload);
      case 'changePassword': return handleChangePassword(payload);
      case 'addBranch': return handleAddBranch(payload.branchName);
      case 'deleteBranch': return handleDeleteBranch(payload.branchName);
      case 'deleteStaff': return handleDeleteStaff(payload);
      // --- New endpoints below ---
      case 'renameBranch': return handleRenameBranch(payload.oldName, payload.newName);
      case 'updateAdminCredentials': return handleUpdateAdminCredentials(payload);
      case 'createAdmin': return handleCreateAdmin(payload);
      case 'setAdminPermissions': return handleSetAdminPermissions(payload);
      case 'removePhoto': return handleRemovePhoto(payload);
      case 'checkSession': return handleCheckSession(payload.sessionToken); // POST
      case 'assignAdmin': return handleAssignAdmin(payload); // NEW
      case 'updateAdmin': return handleUpdateAdmin(payload); // NEW
      case 'deleteAdmin': return handleDeleteAdmin(payload); // NEW
      default:
        return returnJson({ status: 'error', message: 'Function not found.' });
    }
  } catch (err) {
    return returnJson({ status: 'error', message: err.message });
  }
}

/* ========== HELPERS ========== */
function returnJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Permissions Helpers =====
function getRightsSchema() {
  return {
    canAddBranch: false,
    canDeleteBranch: false,
    canRenameBranch: false,
    canEditStaff: false,
    canDeleteStaff: false,
    canMoveStaff: false,
    canUpdatePhotos: false,
    canManagePermissions: false,
    canManageAdmins: false,
  };
}

function mergeRights(base, extra) {
  var out = Object.assign({}, base);
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function(k){ out[k] = !!extra[k]; });
  }
  return out;
}

function getMainAdmin() {
  var storedCreds = PropertiesService.getUserProperties().getProperty('adminCredentials');
  if (!storedCreds) return null;
  try { return JSON.parse(storedCreds); } catch(e){ return null; }
}

function getAdminsMap() {
  var admins = PropertiesService.getScriptProperties().getProperty('admins');
  return admins ? JSON.parse(admins) : {};
}

function getAdminContextByEmail(email) {
  var main = getMainAdmin();
  if (main && main.email === email) {
    // Super admin: all rights true and access to all branches
    var sheets = ss.getSheets();
    var allBranches = sheets.map(function(sh){ return sh.getName(); });
    var rights = getRightsSchema();
    Object.keys(rights).forEach(function(k){ rights[k] = true; });
    return { email: email, isMain: true, rights: rights, branches: allBranches };
  }
  var admins = getAdminsMap();
  var a = admins[email];
  if (!a) return null;
  var rightsBase = getRightsSchema();
  var rights = mergeRights(rightsBase, a.rights || {});
  return { email: email, isMain: false, rights: rights, branches: a.branches || [] };
}

function requirePermission(token, right, branchName) {
  var v = verifySession(token);
  if (!v.valid) return { ok: false, message: 'Invalid or expired session.' };
  var ctx = getAdminContextByEmail(v.email);
  if (!ctx) return { ok: false, message: 'Admin context not found.' };
  if (ctx.isMain) return { ok: true, ctx: ctx };
  if (right && !ctx.rights[right]) return { ok: false, message: 'Insufficient permission: ' + right };
  if (branchName) {
    if (ctx.branches.indexOf(branchName) === -1) return { ok: false, message: 'No access to branch: ' + branchName };
  }
  return { ok: true, ctx: ctx };
}

function createSession(email) {
  var token = Utilities.getUuid();
  var now = new Date().getTime();
  var session = { email: email, expires: now + 1000 * 60 * 60 * 2 }; // 2 hours
  var sessions = PropertiesService.getUserProperties().getProperty('sessions');
  sessions = sessions ? JSON.parse(sessions) : {};
  sessions[token] = session;
  PropertiesService.getUserProperties().setProperty('sessions', JSON.stringify(sessions));
  return token;
}

function verifySession(token) {
  var sessions = PropertiesService.getUserProperties().getProperty('sessions');
  if (!sessions) return { valid: false };
  sessions = JSON.parse(sessions);
  var session = sessions[token];
  if (!session) return { valid: false };
  var now = new Date().getTime();
  if (session.expires < now) {
    delete sessions[token];
    PropertiesService.getUserProperties().setProperty('sessions', JSON.stringify(sessions));
    return { valid: false };
  }
  return { valid: true, email: session.email };
}

function handleCheckSession(token) {
  var v = verifySession(token);
  if (!v.valid) return returnJson(v);
  var ctx = getAdminContextByEmail(v.email);
  if (!ctx) return returnJson({ valid: true, email: v.email, isMain: false });
  return returnJson({ valid: true, email: v.email, isMain: ctx.isMain, rights: ctx.rights, branches: ctx.branches });
}

/* ========== HANDLER WRAPPERS ========== */
function handleGetInitialData() {
  const data = getInitialData();
  return returnJson({ status: 'success', data });
}

function handleVerifyAdmin(credentials) {
  const result = verifyAdmin(credentials);
  if(result.status === 'success' && result.verified) {
    const token = createSession(credentials.email);
    return returnJson({ ...result, sessionToken: token });
  }
  return returnJson(result);
}

function handleSaveStaff(data) {
  const result = saveStaff(data);
  return returnJson(result);
}

function handleChangePassword(passwords) {
  const result = changePassword(passwords);
  return returnJson({ status: 'success', message: result });
}

function handleAddBranch(arg) {
  // Back-compat: accept string branchName or payload { branchName, sessionToken }
  var branchName = typeof arg === 'string' ? arg : (arg && arg.branchName);
  var token = (arg && arg.sessionToken) || null;
  if (token) {
    var perm = requirePermission(token, 'canAddBranch');
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = addBranch(branchName);
  return returnJson({ status: 'success', message: result });
}

function handleDeleteBranch(arg) {
  var branchName = typeof arg === 'string' ? arg : (arg && arg.branchName);
  var token = (arg && arg.sessionToken) || null;
  if (token) {
    var perm = requirePermission(token, 'canDeleteBranch', branchName);
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = deleteBranch(branchName);
  return returnJson({ status: 'success', message: result });
}

function handleDeleteStaff(staffInfo) {
  // Enforce permissions if sessionToken present
  if (staffInfo && staffInfo.sessionToken) {
    var perm = requirePermission(staffInfo.sessionToken, 'canDeleteStaff', staffInfo.branchName);
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = deleteStaff(staffInfo);
  return returnJson({ status: 'success', message: result });
}

// --- Handler Wrappers for new endpoints ---
function extractDriveFileId(photoUrl) {
  // Try all common Google Drive ID formats
  let match = photoUrl.match(/[?&]id=([\w-]+)/);
  if (match) return match[1];
  match = photoUrl.match(/\/file\/d\/([\w-]+)/);
  if (match) return match[1];
  match = photoUrl.match(/\/uc\?.*id=([\w-]+)/);
  if (match) return match[1];
  // Just a fileId string
  if (/^[\w-]{20,}$/.test(photoUrl)) return photoUrl;
  return null;
}

function handleRemovePhoto(payload) {
  try {
    var { photoUrl, branchName, rowIndex } = payload;
    if (!photoUrl) return returnJson({ status: 'error', message: 'No Photo URL provided.' });
    var id = extractDriveFileId(photoUrl);
    if (!id) return returnJson({ status: 'error', message: 'Invalid Photo URL.' });
    try {
      var file = DriveApp.getFileById(id);
      file.setTrashed(true);
    } catch (e) {
      // Continue even if not found, as user wants to clear URL
    }
    // Clear the Photo URL in sheet
    if (branchName && rowIndex) {
      var sheet = ss.getSheetByName(branchName);
      if (sheet) {
        var headers = sheet.getRange('A2:Q2').getValues()[0];
        var photoCol = headers.indexOf('Photo URL');
        if (photoCol >= 0) {
          sheet.getRange(Number(rowIndex), photoCol + 1).setValue('');
        }
      }
    }
    return returnJson({ status: 'success' });
  } catch (err) {
    return returnJson({ status: 'error', message: err.message });
  }
}
function handleRenameBranch(arg1, arg2) {
  // Back-compat: (oldName, newName) or ({oldName, newName, sessionToken})
  var payload = (typeof arg1 === 'object' && arg1 !== null) ? arg1 : { oldName: arg1, newName: arg2 };
  if (payload.sessionToken) {
    var perm = requirePermission(payload.sessionToken, 'canRenameBranch', payload.oldName);
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = renameBranch(payload.oldName, payload.newName);
  return returnJson({ status: result.startsWith('Success') ? 'success' : 'error', message: result });
}

function handleUpdateAdminCredentials(payload) {
  if (payload && payload.sessionToken) {
    var perm = requirePermission(payload.sessionToken, 'canManageAdmins');
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = updateAdminCredentials(payload);
  return returnJson({ status: result.startsWith('Success') ? 'success' : 'error', message: result });
}

function handleCreateAdmin(payload) {
  if (payload && payload.sessionToken) {
    var perm = requirePermission(payload.sessionToken, 'canManageAdmins');
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = createAdmin(payload);
  return returnJson(result);
}

function handleSetAdminPermissions(payload) {
  if (payload && payload.sessionToken) {
    var perm = requirePermission(payload.sessionToken, 'canManagePermissions');
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  }
  const result = setAdminPermissions(payload);
  return returnJson(result);
}

/**
 * Assigns a new admin with branch- and UI-permissions context.
 * Stores email, password, allowed branches, assign rights, date/time, and can be extended later.
 */
function handleAssignAdmin(payload) {
  // Enforce that only admins with canManageAdmins can assign new admins
  if (payload && payload.sessionToken) {
    var perm = requirePermission(payload.sessionToken, 'canManageAdmins');
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  } else {
    return returnJson({ status: 'error', message: 'Session token required.' });
  }
  const {
    email,
    password,
    allowedBranches, // as JSON string from frontend
    rights = {},     // rights as object {canAddBranch: bool, ...}
  } = payload;
  if (!email || !password || !allowedBranches) {
    return returnJson({ status: 'error', message: 'Email, password, and branch permissions are required.' });
  }
  try {
    let admins = PropertiesService.getScriptProperties().getProperty('admins');
    admins = admins ? JSON.parse(admins) : {};
    if (admins[email]) {
      return returnJson({ status: 'error', message: 'Admin with this email already exists.' });
    }
    admins[email] = {
      password: makePasswordRecord(password),
      branches: Array.isArray(allowedBranches) ? allowedBranches : JSON.parse(allowedBranches),
      rights: typeof rights === 'object' ? rights : {},
    };
    PropertiesService.getScriptProperties().setProperty('admins', JSON.stringify(admins));
    return returnJson({ status: 'success', message: 'Admin assigned with permissions.', admin: admins[email] });
  } catch (e) {
    return returnJson({ status: 'error', message: 'Failed to assign admin: ' + e.message });
  }
}

// Update an existing admin's permissions/branches/creds
function handleUpdateAdmin(payload) {
  // Enforce that only admins with canManageAdmins can update admins
  if (payload && payload.sessionToken) {
    var perm = requirePermission(payload.sessionToken, 'canManageAdmins');
    if (!perm.ok) return returnJson({ status: 'error', message: perm.message });
  } else {
    return returnJson({ status: 'error', message: 'Session token required.' });
  }
  const {
    email,
    password,
    allowedBranches,
    rights = {},
  } = payload;
  if (!email || !password || !allowedBranches) {
    return returnJson({ status: 'error', message: 'Email, password, and branches required.' });
  }
  try {
    let admins = PropertiesService.getScriptProperties().getProperty('admins');
    admins = admins ? JSON.parse(admins) : {};
    if (!admins[email]) {
      return returnJson({ status: 'error', message: 'Admin not found.' });
    }
    admins[email].password = makePasswordRecord(password);
    admins[email].branches = Array.isArray(allowedBranches) ? allowedBranches : JSON.parse(allowedBranches);
    admins[email].rights = typeof rights === 'object' ? rights : {};
    PropertiesService.getScriptProperties().setProperty('admins', JSON.stringify(admins));
    return returnJson({ status: 'success', message: 'Admin updated.', admin: admins[email] });
  } catch(e){
    return returnJson({ status: 'error', message: 'Failed to update admin: ' + e.message });
  }
}

function getInitialData() {
  Logger.log('Starting getInitialData...');
  try {
    const sheets = ss.getSheets();
    const allBranchData = sheets.map(sheet => {
      const branchName = sheet.getName();
      const data = sheet.getDataRange().getValues();
      const headers = data.length > 1 ? data[1] : [];

      if (!headers || headers.length === 0) {
        throw new Error(`No headers found in sheet: ${branchName}`);
      }

      const currentStaff = [];
      const formerStaff = [];

      const isHead = branchName === 'Head Office';
      // Current staff rows
      // Head Office: rows 3–202 => indices 2..201 (slice end 202)
      // Others: rows 3–49 => indices 2..48 (slice end 49)
      const currentStaffData = isHead ? data.slice(2, 202) : data.slice(2, 49);
      currentStaffData.forEach((row, index) => {
        if (row[0] !== '') {
          let staffObj = {};
          headers.forEach((header, i) => {
            const value = row[i];
            if (header === 'Photo URL' && value) {
              staffObj[header] = `https://lh3.googleusercontent.com/d/${value}=s400`;
            } else {
              staffObj[header] = value instanceof Date ? Utilities.formatDate(value, "GMT", "yyyy-MM-dd") : value;
            }
          });
          staffObj.rowIndex = index + 3;
          currentStaff.push(staffObj);
        }
      });

      // Former staff rows
      // Head Office: headline row 203 (idx 202), headers row 204 (idx 203), data from row 205 (idx 204)
      // Others: data from row 52 (idx 51)
      const formerStaffData = isHead ? data.slice(204) : data.slice(51);
      formerStaffData.forEach((row, index) => {
        if (row[0] !== '') {
          let staffObj = {};
          headers.forEach((header, i) => {
            const value = row[i];
            if (header === 'Photo URL' && value) {
              staffObj[header] = `https://lh3.googleusercontent.com/d/${value}=s400`;
            } else {
              staffObj[header] = value instanceof Date ? Utilities.formatDate(value, "GMT", "yyyy-MM-dd") : value;
            }
          });
          staffObj.rowIndex = isHead ? (index + 205) : (index + 52);
          formerStaff.push(staffObj);
        }
      });

      return { branchName, currentStaff, formerStaff };
    });

    return allBranchData; // Changed: Return ALL branches (including empty/new ones)
  } catch (e) {
    if (e.message.includes('No sheet with the given ID')) {
      return { status: 'error', message: 'Invalid Spreadsheet ID.' };
    }
    return { status: 'error', message: e.message };
  }
}

function verifyAdmin(credentials) {
  const storedCreds = PropertiesService.getUserProperties().getProperty('adminCredentials');
  if (storedCreds) {
    const admin = JSON.parse(storedCreds);
    if (credentials.email === admin.email && verifyPasswordRecord(admin.password, credentials.password)) {
      return { status: 'success', verified: true, isMain: true };
    }
  }
  // Otherwise, check assigned admins (ScriptProperties)
  let admins = PropertiesService.getScriptProperties().getProperty('admins');
  admins = admins ? JSON.parse(admins) : {};
  const ta = admins[credentials.email];
  if (ta && verifyPasswordRecord(ta.password, credentials.password)) {
    return { status: 'success', verified: true, isMain: false, admin: { branches: ta.branches || [], rights: ta.rights || {} } };
  }
  return { status: 'success', verified: false };
}

function changePassword(passwords) {
  const storedCreds = PropertiesService.getUserProperties().getProperty('adminCredentials');
  if (!storedCreds) return "Admin not found.";

  let admin = JSON.parse(storedCreds);
  if (verifyPasswordRecord(admin.password, passwords.currentPassword)) {
    admin.password = makePasswordRecord(passwords.newPassword);
    PropertiesService.getUserProperties().setProperty('adminCredentials', JSON.stringify(admin));
    return "Success";
  } else {
    return "Current password does not match.";
  }
}

function addBranch(branchName) {
  if (ss.getSheetByName(branchName)) {
    return `Error: A branch named "${branchName}" already exists.`;
  }
  const templateSheet = ss.getSheets()[0];
  const newSheet = ss.insertSheet(branchName);
  const headers = templateSheet.getRange('A2:Q2').getValues();
  newSheet.getRange('A2:Q2').setValues(headers).setFontWeight('bold');
  newSheet.getRange('A1:Q1').merge()
    .setValue(`${branchName.toUpperCase()} STAFF`)
    .setHorizontalAlignment('center').setFontSize(14).setFontWeight('bold');

  // Add Former Staff section headers
  if (branchName === 'Head Office') {
    // Head Office: headline at 203, headers at 204
    newSheet.getRange('A203:Q203').merge()
      .setValue('FORMER STAFF')
      .setHorizontalAlignment('center').setFontSize(14).setFontWeight('bold');
    newSheet.getRange('A204:Q204').setValues(headers).setFontWeight('bold');
  } else {
    newSheet.getRange('A50:Q50').merge()
      .setValue('FORMER STAFF')
      .setHorizontalAlignment('center').setFontSize(14).setFontWeight('bold');
    newSheet.getRange('A51:Q51').setValues(headers).setFontWeight('bold');
  }
  return `Success: Branch "${branchName}" was created.`;
}

function deleteBranch(branchName) {
  const sheet = ss.getSheetByName(branchName);
  if (!sheet) {
    return `Error: Branch "${branchName}" not found.`;
  }
  ss.deleteSheet(sheet);
  return `Success: Branch "${branchName}" was deleted.`;
}

function uploadImageToDrive(base64Data, fileName) {
  try {
    const splitBase64 = base64Data.split(',');
    const contentType = splitBase64[0].split(';')[0].replace('data:', '');
    const bytes = Utilities.base64Decode(splitBase64[1]);
    const blob = Utilities.newBlob(bytes, contentType, fileName);

    let folder = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
    const targetFolder = folder.hasNext() ? folder.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);

    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getId();
  } catch (e) {
    Logger.log(`Image upload failed: ${e.message}`);
    throw new Error("Failed to upload image.");
  }
}

function saveStaff(staffData) {
  try {
    // Optional permission enforcement
    if (staffData && staffData.sessionToken) {
      var rightNeeded = 'canEditStaff';
      var branchNm = staffData.branchName;
      var perm = requirePermission(staffData.sessionToken, rightNeeded, branchNm);
      if (!perm.ok) return { status: 'error', message: perm.message };
    }
    const { branchName, photo, isFormer, rowIndex } = staffData;
    const sheet = ss.getSheetByName(branchName);
    if (!sheet) return { status: 'error', message: 'Branch not found.' };

    // Normalize any incoming Photo URL to a Drive fileId if possible
    let incomingPhoto = staffData['Photo URL'] || '';
    let photoFileId = incomingPhoto ? extractDriveFileId(incomingPhoto) : '';

    // 1. Find previous photoFileId if this is an update (rowIndex provided)
    let previousPhotoId = '';
    const headers = sheet.getRange('A2:Q2').getValues()[0];
    // Normalize headers to find the Photo column index robustly
    const normalizeHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isPhotoHeader = (h) => {
      const n = normalizeHeader(h);
      return n === 'photourl' || n === 'photo' || n === 'photoid' || n === 'photofileid' || n === 'photolink';
    };
    let photoColIdx = headers.findIndex(h => isPhotoHeader(h));
    if (photoColIdx === -1) {
      // fallback to last column
      photoColIdx = headers.length - 1;
    }
    if (rowIndex) {
      const prevVal = sheet.getRange(Number(rowIndex), photoColIdx + 1).getValue();
      previousPhotoId = extractDriveFileId(prevVal) || '';
    }

    // Upload new photo if provided
    if (photo && photo.base64) {
      const newPhotoId = uploadImageToDrive(photo.base64, photo.name);
      if (newPhotoId) {
        // 2. Delete old photo from Drive if it exists and is different
        if (previousPhotoId && previousPhotoId !== newPhotoId) {
          let prevId = extractDriveFileId(previousPhotoId);
          if (prevId) {
            try { DriveApp.getFileById(prevId).setTrashed(true); } catch (e) {}
          }
        }
        photoFileId = newPhotoId;
      } else {
        return { status: 'error', message: 'Failed to upload photo.' };
      }
    }

    // If no new photo provided and no valid incoming id, preserve the previous sheet value
    if (!photo || !photo.base64) {
      if (!photoFileId && previousPhotoId) {
        photoFileId = previousPhotoId; // already normalized to fileId
      }
    }

    // Build row data, forcing the detected photo column to carry photoFileId
    const rowData = headers.map((header, i) => i === photoColIdx ? photoFileId : (staffData[header] || ''));

    // Determine action: move between sections or update in place
    const isHead = branchName === 'Head Office';
    const currentStart = 3;
    const currentEnd = isHead ? 202 : 49;
    const formerHeadlineRow = isHead ? 203 : 50;
    const formerHeaderRow = isHead ? 204 : 51;
    const formerDataStart = isHead ? 205 : 52;
    let targetRow;
    if (rowIndex) {
      const srcRow = Number(rowIndex);
      const isSrcFormer = srcRow >= formerDataStart; // source location
      if (isFormer && !isSrcFormer) {
        // Move from current to former
        const lastRow = sheet.getLastRow();
        const startRow = formerDataStart;
        const endRow = Math.max(lastRow, formerDataStart);
        const formerStaffRange = sheet.getRange(`A${startRow}:A${endRow}`).getValues().flat();
        let emptyIndex = formerStaffRange.findIndex(cell => cell === '');
        targetRow = emptyIndex !== -1 ? (startRow + emptyIndex) : (endRow + 1);
        sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
        // Clear original row contents
        sheet.getRange(srcRow, 1, 1, headers.length).clearContent();
        return { status: 'success', message: 'Staff moved to Former Staff successfully!' };
      } else if (!isFormer && isSrcFormer) {
        // Move from former back to current
        const currentStaffRange = sheet.getRange(`A${currentStart}:A${currentEnd}`).getValues().flat();
        let emptyIndex = currentStaffRange.findIndex(cell => cell === '');
        if (emptyIndex === -1) {
          return { status: 'error', message: `No available slots for current staff (Rows ${currentStart}–${currentEnd} are full). Move aborted.` };
        }
        targetRow = emptyIndex + currentStart;
        sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
        // Clear original row contents
        sheet.getRange(srcRow, 1, 1, headers.length).clearContent();
        return { status: 'success', message: 'Staff moved to Current Staff successfully!' };
      } else {
        // Update in place
        targetRow = srcRow;
        sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
        return { status: 'success', message: 'Staff data updated successfully!' };
      }
    } else {
      // New entry
      if (isFormer) {
        // Former staff: rows from formerDataStart
        const lastRow = sheet.getLastRow();
        const startRow = formerDataStart;
        const endRow = Math.max(lastRow, formerDataStart);
        const formerStaffRange = sheet.getRange(`A${startRow}:A${endRow}`).getValues().flat();
        let emptyIndex = formerStaffRange.findIndex(cell => cell === '');
        targetRow = emptyIndex !== -1 ? (startRow + emptyIndex) : (endRow + 1);
      } else {
        // Current staff: rows currentStart–currentEnd
        const currentStaffRange = sheet.getRange(`A${currentStart}:A${currentEnd}`).getValues().flat();
        let emptyIndex = currentStaffRange.findIndex(cell => cell === '');
        if (emptyIndex === -1) {
          return { status: 'error', message: `No available slots for current staff (Rows ${currentStart}–${currentEnd} are full).` };
        }
        targetRow = emptyIndex + currentStart;
      }
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
      return { status: 'success', message: 'Staff data saved successfully!' };
    }
  } catch (e) {
    return { status: 'error', message: `An error occurred: ${e.message}` };
  }
}

function deleteStaff(staffInfo) {
  try {
    const sheet = ss.getSheetByName(staffInfo.branchName);
    sheet.deleteRow(staffInfo.rowIndex);
    return "Staff deleted successfully.";
  } catch (e) {
    return `Error: ${e.message}`;
  }
}


function renameBranch(oldName, newName) {
  if (!oldName || !newName) return "Error: Both old and new branch names are required.";
  if (ss.getSheetByName(newName)) return `Error: Branch \"${newName}\" already exists.`;
  const sheet = ss.getSheetByName(oldName);
  if (!sheet) return `Error: Branch \"${oldName}\" not found.`;
  sheet.setName(newName);
  // Optionally update the merged title cell
  sheet.getRange('A1:Q1').setValue(`${newName.toUpperCase()} STAFF`);
  return `Success: Branch renamed to \"${newName}\".`;
}

function updateAdminCredentials(payload) {
  const { email, password } = payload;
  if (!email || !password) return "Error: Email and password required.";
  const storedCreds = PropertiesService.getUserProperties().getProperty('adminCredentials');
  if (!storedCreds) return "Error: No admin credentials found.";
  let admin = JSON.parse(storedCreds);
  admin.email = email;
  admin.password = makePasswordRecord(password);
  PropertiesService.getUserProperties().setProperty('adminCredentials', JSON.stringify(admin));
  return "Success: Admin credentials updated.";
}

function createAdmin(payload) {
  const { email, password } = payload;
  if (!email || !password) return { status: 'error', message: 'Email and password required.' };
  // Store admins as a JSON object in script properties
  let admins = PropertiesService.getScriptProperties().getProperty('admins');
  admins = admins ? JSON.parse(admins) : {};
  if (admins[email]) return { status: 'error', message: 'Admin already exists.' };
  admins[email] = { password: makePasswordRecord(password), branches: [], rights: {} };
  PropertiesService.getScriptProperties().setProperty('admins', JSON.stringify(admins));
  return { status: 'success', message: 'Admin created.' };
}

function setAdminPermissions(payload) {
  const { email, branches } = payload;
  if (!email || !branches || !Array.isArray(branches)) return { status: 'error', message: 'Email and branches required.' };
  let admins = PropertiesService.getScriptProperties().getProperty('admins');
  admins = admins ? JSON.parse(admins) : {};
  if (!admins[email]) return { status: 'error', message: 'Admin not found.' };
  admins[email].branches = branches;
  PropertiesService.getScriptProperties().setProperty('admins', JSON.stringify(admins));
  return { status: 'success', message: 'Permissions updated.' };
}
