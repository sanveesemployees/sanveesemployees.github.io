/*
* Cleaned-up and fixed Code.gs file
* Acts as a JSON API for your frontend hosted on GitHub.
* Handles admin, staff, and branch management.
*/

const SPREADSHEET_ID = "1v4irW2hoUsQ7KjuOHr6w4bcNQ4MQtYcJvwbjOZQT_vc"; 
const PHOTO_FOLDER_NAME = "Branch Staff Photos";
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);


function doGet(e) {
  if (!e.parameter.function) {
    return returnJson({ status: 'error', message: 'No function specified.' });
  }

  switch (e.parameter.function) {
    case 'getInitialData': return handleGetInitialData();
    case 'verifyAdmin': return handleVerifyAdmin({ email: e.parameter.email, password: e.parameter.password });
    case 'checkSession': return handleCheckSession(e.parameter.sessionToken);
    case 'getAllAdmins': return handleGetAllAdmins();
    // Add more GET endpoints here if needed
    default:
      return returnJson({ status: 'error', message: 'Function not found.' });
  }
}

// Returns the list of all assigned admins and their context (for UI)
function handleGetAllAdmins() {
  try {
    let admins = PropertiesService.getScriptProperties().getProperty('admins');
    admins = admins ? JSON.parse(admins) : {};
    // Convert to [{email, ...adminObj}, ...]
    let adminList = Object.keys(admins).map(email => ({ email, ...admins[email] }));
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
  return returnJson(verifySession(token));
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

function handleAddBranch(branchName) {
  const result = addBranch(branchName);
  return returnJson({ status: 'success', message: result });
}

function handleDeleteBranch(branchName) {
  const result = deleteBranch(branchName);
  return returnJson({ status: 'success', message: result });
}

function handleDeleteStaff(staffInfo) {
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
function handleRenameBranch(oldName, newName) {
  const result = renameBranch(oldName, newName);
  return returnJson({ status: result.startsWith('Success') ? 'success' : 'error', message: result });
}

function handleUpdateAdminCredentials(payload) {
  const result = updateAdminCredentials(payload);
  return returnJson({ status: result.startsWith('Success') ? 'success' : 'error', message: result });
}

function handleCreateAdmin(payload) {
  const result = createAdmin(payload);
  return returnJson(result);
}

function handleSetAdminPermissions(payload) {
  const result = setAdminPermissions(payload);
  return returnJson(result);
}

/**
 * Assigns a new admin with branch- and UI-permissions context.
 * Stores email, password, allowed branches, assign rights, date/time, and can be extended later.
 */
function handleAssignAdmin(payload) {
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
      password: password,
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
    admins[email].password = password;
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

      // Current staff rows 3–49 (index 2 to 48)
      const currentStaffData = data.slice(2, 49);
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

      // Former staff rows 52+
      const formerStaffData = data.slice(51);
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
          staffObj.rowIndex = index + 52;
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
  let mainAdminVerified = false;
  if (storedCreds) {
    const admin = JSON.parse(storedCreds);
    mainAdminVerified = credentials.email === admin.email && credentials.password === admin.password;
    if (mainAdminVerified) return { status: 'success', verified: true, isMain: true };
  }
  // Otherwise, check assigned admins (ScriptProperties)
  let admins = PropertiesService.getScriptProperties().getProperty('admins');
  admins = admins ? JSON.parse(admins) : {};
  if (admins[credentials.email] && admins[credentials.email].password === credentials.password) {
    return { status: 'success', verified: true, isMain: false, admin: admins[credentials.email] };
  }
  return { status: 'success', verified: false };
}

function changePassword(passwords) {
  const storedCreds = PropertiesService.getUserProperties().getProperty('adminCredentials');
  if (!storedCreds) return "Admin not found.";

  let admin = JSON.parse(storedCreds);
  if (passwords.currentPassword === admin.password) {
    admin.password = passwords.newPassword;
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
    const { branchName, photo, isFormer, rowIndex } = staffData;
    const sheet = ss.getSheetByName(branchName);
    if (!sheet) return { status: 'error', message: 'Branch not found.' };

    let photoFileId = staffData['Photo URL'] || '';

    // 1. Find previous photoFileId if this is an update (rowIndex provided)
    let previousPhotoId = '';
    if (rowIndex) {
      const headers = sheet.getRange('A2:Q2').getValues()[0];
      const photoCol = headers.indexOf('Photo URL');
      if (photoCol >= 0) {
        previousPhotoId = sheet.getRange(Number(rowIndex), photoCol + 1).getValue();
      }
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

    const headers = sheet.getRange('A2:Q2').getValues()[0];
    const rowData = headers.map(header => header === 'Photo URL' ? photoFileId : (staffData[header] || ''));

    let targetRow;
    if (rowIndex) {
      targetRow = rowIndex; // Update existing
    } else {
      if (isFormer) {
        // Former staff: rows 52+ (A52:A)
        const formerStaffRange = sheet.getRange('A52:A').getValues().flat();
        let emptyIndex = formerStaffRange.findIndex(cell => cell === '');
        targetRow = emptyIndex !== -1 ? emptyIndex + 52 : sheet.getLastRow() + 1;
      } else {
        // Current staff: rows 3–49 (A3:A49)
        const currentStaffRange = sheet.getRange('A3:A49').getValues().flat();
        let emptyIndex = currentStaffRange.findIndex(cell => cell === '');
        if (emptyIndex === -1) {
          return { status: 'error', message: 'No available slots for current staff (Rows 3–49 are full).' };
        }
        targetRow = emptyIndex + 3;
      }
    }

    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
    return { status: 'success', message: 'Staff data saved successfully!' };
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
  admin.password = password;
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
  admins[email] = { password, branches: [] };
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
