// ============================================
// FIREBASE CONFIGURATION
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyC7GcDDHQqUsOVKrkux7WaSpH7gzYHEsXU",
    authDomain: "inventory-3650f.firebaseapp.com",
    databaseURL: "https://inventory-3650f-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "inventory-3650f",
    storageBucket: "inventory-3650f.firebasestorage.app",
    messagingSenderId: "788791862955",
    appId: "1:788791862955:web:280dc7b46f9ee5eb1a79ee",
    measurementId: "G-1NTLEP3DFE"
};

// ============================================
// INITIALIZE FIREBASE
// ============================================
let app, db, auth;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    updateFirebaseStatus(true);
    console.log("✅ Firebase initialized successfully");
} catch (error) {
    console.error("❌ Firebase initialization error:", error);
    updateFirebaseStatus(false);
}

function updateFirebaseStatus(connected) {
    const statusElement = document.getElementById('firebaseStatus');
    if (connected) {
        statusElement.className = "firebase-status status-connected";
        statusElement.innerHTML = '<i class="fas fa-plug"></i><span>Firebase: Connected</span>';
    } else {
        statusElement.className = "firebase-status status-disconnected";
        statusElement.innerHTML = '<i class="fas fa-plug"></i><span>Firebase: Disconnected</span>';
    }
}

// ============================================
// SITE CONFIGURATION
// ============================================
const siteConfig = {
    wtc: {
        name: "WTC",
        fullName: "Wijeya Television Corporation",
        icon: "fas fa-building",
        technicians: ["Adithya", "Minosh", "Niluksha", "Gayan"],
        departments: ["Engineering", "NEWS", "Scheduling", "MCR", "PCR 1", "PCR 2", "Marketing A/B", "Marketing C", "Research", "Political", "GFX", "Transmission", "Library", "Maintenance"],
        networkDiagram: "https://www.canva.com/design/DAG-MlkG1Bs/fTfu6FEhnj8pTLDKAXJZcQ/view?utm_content=DAG-MlkG1Bs&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h150b286d2a",
        firebaseCollection: "devices_wtc",
        logsCollection: "activityLogs_wtc",
        repairCollection: "repairHistory_wtc"
    },
    hls: {
        name: "HLS",
        fullName: "Hiru Live Streaming",
        icon: "fas fa-city",
        technicians: ["Navendra"],
        departments: ["Production", "PCR", "Engineering", "Camera", "Library", "Maintenance"],
        networkDiagram: "https://www.canva.com/design/DAG-e1F-ViA/nsJaRxmGmBmsY19qmF0SCg/view?utm_content=DAG-e1F-ViA&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h89c18793db",
        firebaseCollection: "devices_hls",
        logsCollection: "activityLogs_hls",
        repairCollection: "repairHistory_hls"
    }
};

// ============================================
// APPLICATION STATE
// ============================================
let currentSite = null;
let inventoryData = [];
let activityLogs = [];
let currentDeviceId = null;
let isEditMode = false;
let currentUser = "";
let realTimeUnsubscribe = null;
let logsUnsubscribe = null;

// ============================================
// TIMEZONE FUNCTIONS (Sri Lanka UTC+5:30)
// ============================================
function getSriLankaTime() {
    return new Date();
}

function formatSriLankaTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ============================================
// FIREBASE FUNCTIONS WITH SITE SUPPORT
// ============================================
async function saveDeviceToFirebase(deviceData) {
    if (!currentSite) return null;
    try {
        const deviceRef = await db.collection(currentSite.firebaseCollection).add({
            ...deviceData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser,
            site: currentSite.name
        });
        return deviceRef.id;
    } catch (error) {
        console.error("Error saving device:", error);
        return null;
    }
}

async function updateDeviceInFirebase(deviceId, deviceData) {
    if (!currentSite) return false;
    try {
        await db.collection(currentSite.firebaseCollection).doc(deviceId).update({
            ...deviceData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser
        });
        return true;
    } catch (error) {
        console.error("Error updating device:", error);
        return false;
    }
}

async function deleteDeviceFromFirebase(deviceId) {
    if (!currentSite) return false;
    try {
        await db.collection(currentSite.firebaseCollection).doc(deviceId).delete();
        return true;
    } catch (error) {
        console.error("Error deleting device:", error);
        return false;
    }
}

async function addLogToFirebase(logEntry) {
    if (!currentSite) return false;
    try {
        const sriLankaTime = getSriLankaTime();
        const timestamp = formatSriLankaTimestamp(sriLankaTime);

        await db.collection(currentSite.logsCollection).add({
            action: logEntry.action,
            details: logEntry.details,
            user: logEntry.user,
            site: currentSite.name,
            timestamp: timestamp,
            sriLankaTimestamp: timestamp,
            date: sriLankaTime.toISOString().split('T')[0],
            hour: sriLankaTime.getHours(),
            minute: sriLankaTime.getMinutes()
        });
        console.log("✅ Log saved to Firebase:", logEntry.action, "at", timestamp);
        return true;
    } catch (error) {
        console.error("❌ Error saving log:", error);
        return false;
    }
}

async function loadDevicesFromFirebase() {
    if (!currentSite) return [];
    try {
        const snapshot = await db.collection(currentSite.firebaseCollection)
            .orderBy('pcNumber', 'asc')
            .get();
        const devices = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            devices.push({
                id: doc.id,
                ...data
            });
        });
        return devices;
    } catch (error) {
        console.error("Error loading devices:", error);
        return [];
    }
}

async function loadLogsFromFirebase() {
    if (!currentSite) return [];
    try {
        const snapshot = await db.collection(currentSite.logsCollection)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        const logs = [];

        if (snapshot.empty) {
            console.log("No logs found in database");
            return logs;
        }

        snapshot.forEach(doc => {
            const data = doc.data();

            let timestamp = data.sriLankaTimestamp || data.timestamp || formatSriLankaTimestamp(getSriLankaTime());

            if (timestamp && timestamp.toDate) {
                try {
                    const date = timestamp.toDate();
                    timestamp = formatSriLankaTimestamp(date);
                } catch (e) {
                    console.error("Error converting timestamp:", e);
                }
            }

            logs.push({
                id: doc.id,
                timestamp: timestamp,
                action: data.action || 'Unknown Action',
                details: data.details || '',
                user: data.user || 'System',
                site: data.site || currentSite.name
            });
        });

        console.log(`📊 Loaded ${logs.length} logs from Firebase (Sri Lanka Time)`);
        return logs;
    } catch (error) {
        console.error("❌ Error loading logs:", error);
        return getSampleLogs();
    }
}

// ============================================
// REPAIR HISTORY & FAILURE REPORTS FUNCTIONS
// ============================================
async function addRepairHistoryEntry(deviceId, repairData) {
    if (!currentSite) return null;
    try {
        const repairRef = await db.collection(currentSite.repairCollection).add({
            deviceId: deviceId,
            site: currentSite.name,
            ...repairData,
            repairedAt: firebase.firestore.FieldValue.serverTimestamp(),
            repairedBy: currentUser
        });

        await db.collection(currentSite.firebaseCollection).doc(deviceId).update({
            lastRepairDate: repairData.date,
            lastRepairBy: repairData.repairedBy,
            lastRepairNotes: repairData.notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        return repairRef.id;
    } catch (error) {
        console.error("Error saving repair history:", error);
        return null;
    }
}

async function loadRepairHistory(deviceId) {
    if (!currentSite) return [];
    try {
        const snapshot = await db.collection(currentSite.repairCollection)
            .where('deviceId', '==', deviceId)
            .orderBy('repairedAt', 'desc')
            .get();

        const repairs = [];
        snapshot.forEach(doc => {
            const data = doc.data();

            let repairedAt = formatDateTime(getSriLankaTime());
            if (data.repairedAt && data.repairedAt.toDate) {
                try {
                    const date = data.repairedAt.toDate();
                    repairedAt = formatDateTime(new Date(date.getTime() + (5.5 * 3600000)));
                } catch (e) {
                    console.error("Error converting repair date:", e);
                }
            } else if (data.date) {
                repairedAt = data.date;
            }

            repairs.push({
                id: doc.id,
                date: repairedAt,
                repairedBy: data.repairedBy || currentUser,
                notes: data.notes || '',
                status: data.status || 'fixed'
            });
        });

        return repairs;
    } catch (error) {
        console.error("Error loading repair history:", error);
        return [];
    }
}

// ============================================
// EXCEL IMPORT/EXPORT FUNCTIONS - SINGLE SHEET
// ============================================
function exportToExcel(data, filename = 'devices') {
    try {
        const excelData = data.map(device => {
            let networkInfo = 'N/A';
            if (device.networkInterfaces && device.networkInterfaces.length > 0) {
                networkInfo = device.networkInterfaces.map(iface =>
                    `${iface.interfaceName || 'Interface'}: ${iface.ipAddress || 'N/A'}`
                ).join('; ');
            }

            let softwareInfo = 'N/A';
            if (device.softwareLicenses && device.softwareLicenses.length > 0) {
                softwareInfo = device.softwareLicenses.map(software =>
                    `${software.name || 'Software'} ${software.version || ''}`
                ).join('; ');
            }

            let monitorInfo = 'N/A';
            if (device.monitors && device.monitors.length > 0) {
                monitorInfo = device.monitors.map(monitor =>
                    `${monitor.model || 'Monitor'}: ${monitor.serial || 'N/A'}`
                ).join('; ');
            }

            return {
                'Device Number': device.pcNumber || 'N/A',
                'PC Model': device.pcModel || 'N/A',
                'PC Serial': device.pcSerial || 'N/A',
                'Department': device.department || 'N/A',
                'User Name': device.userName || 'N/A',
                'IP Address': networkInfo,
                'CPU': device.cpu || 'N/A',
                'GPU': device.gpu || 'N/A',
                'RAM': device.ram || 'N/A',
                'Storage': device.storage || 'N/A',
                'Monitors': monitorInfo,
                'Software Licenses': softwareInfo,
                'Status': device.status ? device.status.charAt(0).toUpperCase() + device.status.slice(1) : 'Active',
                'Created By': device.createdBy || 'N/A',
                'Created Date': device.createdAt ? (device.createdAt.toDate ? device.createdAt.toDate().toLocaleDateString() : device.createdAt) : 'N/A',
                'Updated By': device.updatedBy || 'N/A',
                'Updated Date': device.updatedAt ? (device.updatedAt.toDate ? device.updatedAt.toDate().toLocaleDateString() : device.updatedAt) : 'N/A',
                'Site': device.site || currentSite.name
            };
        });

        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        const wscols = [
            { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 },
            { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
            { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 30 },
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 10 }
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Devices');

        const dateStr = new Date().toISOString().split('T')[0];
        const exportFilename = `${filename}_${currentSite.name}_${dateStr}.xlsx`;

        XLSX.writeFile(wb, exportFilename);

        return true;
    } catch (error) {
        console.error("Error exporting to Excel:", error);
        alert("Error exporting to Excel: " + error.message);
        return false;
    }
}

function downloadTemplate() {
    try {
        const templateData = [
            {
                'Device Number': 'PC-001',
                'PC Model': 'Dell OptiPlex 7080',
                'PC Serial': 'ABC123456',
                'Department': 'Engineering',
                'User Name': 'John Doe',
                'IP Address': 'Primary Interface: 192.168.1.10',
                'CPU': 'Intel i7-10700',
                'GPU': 'NVIDIA GTX 1660',
                'RAM': '16GB DDR4',
                'Storage': '512GB SSD',
                'Monitors': 'Dell P2419H: MON123456',
                'Software Licenses': 'Microsoft Office 2021: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
                'Status': 'Active',
                'Created By': 'System',
                'Created Date': new Date().toLocaleDateString(),
                'Updated By': 'System',
                'Updated Date': new Date().toLocaleDateString(),
                'Site': currentSite.name
            }
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Devices');

        // Add instructions as a separate sheet
        const instructions = [
            ['IMPORT INSTRUCTIONS'],
            [''],
            ['1. Required columns: Device Number, PC Model, PC Serial, Department'],
            ['2. Status can be: Active, Failed, or Replaced'],
            ['3. All other columns are optional'],
            ['4. Do not change the column headers'],
            ['5. Maximum 100 devices per import'],
            ['6. Save file as Excel (.xlsx) format'],
            [''],
            ['COLUMN DESCRIPTIONS'],
            ['Device Number: Unique identifier (e.g., PC-001)'],
            ['PC Model: Model name/number'],
            ['PC Serial: Serial number of the device'],
            ['Department: Department where device is located'],
            ['User Name: Person using the device'],
            ['IP Address: Format: InterfaceName:IP; InterfaceName:IP'],
            ['CPU: Processor specifications'],
            ['GPU: Graphics card specifications'],
            ['RAM: Memory specifications'],
            ['Storage: Storage specifications'],
            ['Monitors: Format: Model:Serial; Model:Serial'],
            ['Software Licenses: Format: Software:Key; Software:Key'],
            ['Status: Device status (Active/Failed/Replaced)'],
            ['Site: Automatically filled during import']
        ];

        const ws2 = XLSX.utils.aoa_to_sheet(instructions);
        XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

        XLSX.writeFile(wb, `Device_Import_Template_${currentSite.name}.xlsx`);

    } catch (error) {
        console.error("Error downloading template:", error);
        alert("Error downloading template: " + error.message);
    }
}

async function importFromExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Look for a sheet named 'Devices' or use the first sheet
                let sheetName = workbook.SheetNames.find(name =>
                    name.toLowerCase().includes('device') ||
                    name.toLowerCase().includes('data')
                ) || workbook.SheetNames[0];

                const worksheet = workbook.Sheets[sheetName];

                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (!jsonData || jsonData.length === 0) {
                    reject(new Error("No data found in the Excel file"));
                    return;
                }

                if (jsonData.length > 100) {
                    reject(new Error("Maximum 100 devices allowed per import"));
                    return;
                }

                const results = {
                    total: jsonData.length,
                    success: 0,
                    failed: 0,
                    errors: []
                };

                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    const rowNum = i + 2;

                    try {
                        // Check required fields (handle different column name variations)
                        const deviceNumber = row['Device Number'] || row['DeviceNumber'] || row['PC Number'] || row['PCNumber'];
                        const pcModel = row['PC Model'] || row['PCModel'] || row['Model'];
                        const pcSerial = row['PC Serial'] || row['PCSerial'] || row['Serial'];
                        const department = row['Department'] || row['Dept'];

                        if (!deviceNumber || !pcModel || !pcSerial || !department) {
                            throw new Error(`Missing required fields. Found: Device Number: ${deviceNumber}, Model: ${pcModel}, Serial: ${pcSerial}, Department: ${department}`);
                        }

                        if (!currentSite.departments.includes(department)) {
                            throw new Error(`Invalid department. Valid departments: ${currentSite.departments.join(', ')}`);
                        }

                        const status = (row['Status'] || 'active').toLowerCase();
                        if (!['active', 'failed', 'replaced'].includes(status)) {
                            throw new Error("Status must be 'Active', 'Failed', or 'Replaced'");
                        }

                        const deviceData = {
                            pcNumber: String(deviceNumber).trim(),
                            pcModel: String(pcModel).trim(),
                            pcSerial: String(pcSerial).trim(),
                            department: String(department).trim(),
                            userName: (row['User Name'] || row['UserName'] || row['User'] || '').toString().trim(),
                            status: status,
                            networkInterfaces: [],
                            softwareLicenses: [],
                            monitors: [],
                            createdBy: currentUser,
                            site: currentSite.name
                        };

                        // Handle optional fields
                        deviceData.cpu = (row['CPU'] || '').toString().trim();
                        deviceData.gpu = (row['GPU'] || '').toString().trim();
                        deviceData.ram = (row['RAM'] || '').toString().trim();
                        deviceData.storage = (row['Storage'] || '').toString().trim();

                        // Parse network interfaces from IP Address column
                        if (row['IP Address'] || row['IPAddress']) {
                            const ipInfo = String(row['IP Address'] || row['IPAddress'] || '').trim();
                            if (ipInfo && ipInfo !== 'N/A') {
                                const interfacePairs = ipInfo.split(';').map(pair => pair.trim());
                                interfacePairs.forEach(pair => {
                                    const parts = pair.split(':').map(p => p.trim());
                                    if (parts.length >= 2) {
                                        deviceData.networkInterfaces.push({
                                            interfaceName: parts[0] || 'Interface',
                                            ipAddress: parts[1]
                                        });
                                    }
                                });
                            }
                        }

                        // Parse monitors
                        if (row['Monitors']) {
                            const monitorPairs = String(row['Monitors']).split(';').map(pair => pair.trim());
                            monitorPairs.forEach(pair => {
                                const parts = pair.split(':').map(p => p.trim());
                                if (parts.length >= 2) {
                                    deviceData.monitors.push({
                                        model: parts[0],
                                        serial: parts[1]
                                    });
                                }
                            });
                        }

                        // Parse software licenses
                        if (row['Software Licenses'] || row['SoftwareLicenses']) {
                            const softwarePairs = String(row['Software Licenses'] || row['SoftwareLicenses'] || '').split(';').map(pair => pair.trim());
                            softwarePairs.forEach(pair => {
                                const parts = pair.split(':').map(p => p.trim());
                                if (parts.length >= 2) {
                                    deviceData.softwareLicenses.push({
                                        name: parts[0],
                                        licenseKey: parts[1]
                                    });
                                }
                            });
                        }

                        await saveDeviceToFirebase(deviceData);
                        results.success++;

                    } catch (error) {
                        results.failed++;
                        results.errors.push(`Row ${rowNum}: ${error.message}`);
                    }

                    const progress = Math.round(((i + 1) / jsonData.length) * 100);
                    updateImportProgress(progress, i + 1, jsonData.length);
                }

                resolve(results);

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = function () {
            reject(new Error("Error reading file"));
        };

        reader.readAsArrayBuffer(file);
    });
}

function updateImportProgress(percent, current, total) {
    const progressBar = document.getElementById('importProgressBar');
    const progressText = document.getElementById('importProgressText');

    if (progressBar && progressText) {
        progressBar.style.width = percent + '%';
        progressText.textContent = `Processing ${current} of ${total} devices...`;
    }
}

// ============================================
// MONITOR MANAGEMENT
// ============================================
function createMonitorElement(monitorData = null, index = 0) {
    const monitorId = monitorData?.id || `monitor-${Date.now()}-${index}`;

    const div = document.createElement('div');
    div.className = 'monitor-entry';
    div.innerHTML = `
                <div class="monitor-header">
                    <h4><i class="fas fa-tv"></i> Monitor ${index + 1}</h4>
                    <button type="button" class="remove-monitor-btn" onclick="removeMonitor('${monitorId}')">
                        <i class="fas fa-times"></i> Remove
                    </button>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-tv"></i> Monitor Model *</label>
                        <input type="text" class="monitor-model form-field" value="${monitorData?.model || ''}" 
                               placeholder="e.g., Dell P2419H" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-barcode"></i> Monitor Serial *</label>
                        <input type="text" class="monitor-serial form-field" value="${monitorData?.serial || ''}" 
                               placeholder="e.g., MON123456" required>
                    </div>
                </div>
                <input type="hidden" class="monitor-id" value="${monitorId}">
            `;

    return div;
}

function removeMonitor(monitorId) {
    const monitorDiv = document.querySelector(`.monitor-entry input.monitor-id[value="${monitorId}"]`)?.closest('.monitor-entry');
    if (monitorDiv) {
        monitorDiv.remove();
        updateAllMonitorTitles();
    }
}

function updateAllMonitorTitles() {
    document.querySelectorAll('.monitor-entry').forEach((monitorDiv, index) => {
        const header = monitorDiv.querySelector('.monitor-header h4');
        header.innerHTML = `<i class="fas fa-tv"></i> Monitor ${index + 1}`;
    });
}

function collectMonitorsData() {
    const monitors = [];
    document.querySelectorAll('.monitor-entry').forEach(monitorDiv => {
        const monitorData = {
            id: monitorDiv.querySelector('.monitor-id').value,
            model: monitorDiv.querySelector('.monitor-model').value,
            serial: monitorDiv.querySelector('.monitor-serial').value
        };

        if (monitorData.model && monitorData.serial) {
            monitors.push(monitorData);
        }
    });
    return monitors;
}

// ============================================
// SOFTWARE LICENSE MANAGEMENT
// ============================================
function createSoftwareLicenseElement(softwareData = null, index = 0) {
    const softwareId = softwareData?.id || `software-${Date.now()}-${index}`;
    const softwareName = softwareData?.name || `Software ${index + 1}`;

    const div = document.createElement('div');
    div.className = 'software-license';
    div.innerHTML = `
                <div class="software-license-header">
                    <h4><i class="fas fa-copyright"></i> ${softwareName}</h4>
                    <button type="button" class="remove-software-btn" onclick="removeSoftwareLicense('${softwareId}')">
                        <i class="fas fa-times"></i> Remove
                    </button>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-file-signature"></i> Software Name *</label>
                        <input type="text" class="software-name form-field" value="${softwareName}" 
                               placeholder="e.g., Microsoft Office 2021" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-key"></i> License Key</label>
                        <input type="text" class="software-license-key form-field" value="${softwareData?.licenseKey || ''}" 
                               placeholder="Enter license key">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-calendar-alt"></i> Expiry Date</label>
                        <input type="date" class="software-expiry form-field" value="${softwareData?.expiryDate || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-user-tie"></i> Licensed To</label>
                        <input type="text" class="software-licensed-to form-field" value="${softwareData?.licensedTo || ''}" 
                               placeholder="Name of license holder">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-info-circle"></i> Version</label>
                        <input type="text" class="software-version form-field" value="${softwareData?.version || ''}" 
                               placeholder="e.g., 2021, v2.0">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-sticky-note"></i> Notes</label>
                        <textarea class="software-notes form-field" rows="2" placeholder="Any additional notes">${softwareData?.notes || ''}</textarea>
                    </div>
                </div>
                <input type="hidden" class="software-id" value="${softwareId}">
            `;

    return div;
}

function removeSoftwareLicense(softwareId) {
    const softwareDiv = document.querySelector(`.software-license input.software-id[value="${softwareId}"]`)?.closest('.software-license');
    if (softwareDiv) {
        softwareDiv.remove();
        updateAllSoftwareTitles();
    }
}

function updateAllSoftwareTitles() {
    document.querySelectorAll('.software-license').forEach((softwareDiv, index) => {
        const header = softwareDiv.querySelector('.software-license-header h4');
        const nameInput = softwareDiv.querySelector('.software-name');
        header.innerHTML = `<i class="fas fa-copyright"></i> ${nameInput.value || `Software ${index + 1}`}`;
    });
}

function collectSoftwareLicensesData() {
    const softwareLicenses = [];
    document.querySelectorAll('.software-license').forEach(softwareDiv => {
        const softwareData = {
            id: softwareDiv.querySelector('.software-id').value,
            name: softwareDiv.querySelector('.software-name').value || 'Unnamed Software',
            licenseKey: softwareDiv.querySelector('.software-license-key').value,
            expiryDate: softwareDiv.querySelector('.software-expiry').value,
            licensedTo: softwareDiv.querySelector('.software-licensed-to').value,
            version: softwareDiv.querySelector('.software-version').value,
            notes: softwareDiv.querySelector('.software-notes').value
        };

        if (softwareData.name) {
            softwareLicenses.push(softwareData);
        }
    });
    return softwareLicenses;
}

// ============================================
// NETWORK INTERFACES MANAGEMENT
// ============================================
function createNetworkInterfaceElement(interfaceData = null, index = 0) {
    const interfaceId = interfaceData?.id || `network-${Date.now()}-${index}`;
    const interfaceName = interfaceData?.interfaceName || `Interface ${index + 1}`;

    const div = document.createElement('div');
    div.className = 'network-interface';
    div.innerHTML = `
                <div class="network-interface-header">
                    <h4><i class="fas fa-network-wired"></i> ${interfaceName}</h4>
                    <button type="button" class="remove-network-btn" onclick="removeNetworkInterface('${interfaceId}')">
                        <i class="fas fa-times"></i> Remove
                    </button>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-ethernet"></i> Interface Name</label>
                        <input type="text" class="interface-name form-field" value="${interfaceName}" 
                               placeholder="e.g., Ethernet, WiFi, LAN" 
                               onchange="updateInterfaceTitle(this, '${interfaceId}')">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-network-wired"></i> IP Address</label>
                        <input type="text" class="interface-ip form-field" value="${interfaceData?.ipAddress || ''}" 
                               placeholder="e.g., 192.168.1.10">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-shield-alt"></i> Subnet Mask</label>
                        <input type="text" class="interface-subnet form-field" value="${interfaceData?.subnetMask || ''}" 
                               placeholder="e.g., 255.255.255.0">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-route"></i> Default Gateway</label>
                        <input type="text" class="interface-gateway form-field" value="${interfaceData?.gateway || ''}" 
                               placeholder="e.g., 192.168.1.1">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-server"></i> DNS Servers</label>
                        <input type="text" class="interface-dns form-field" value="${interfaceData?.dns || ''}" 
                               placeholder="e.g., 8.8.8.8, 8.8.4.4">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-sitemap"></i> MAC Address</label>
                        <input type="text" class="interface-mac form-field" value="${interfaceData?.macAddress || ''}" 
                               placeholder="e.g., 00:1A:2B:3C:4D:5E">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-plug"></i> Connection Type</label>
                        <select class="interface-type form-field">
                            <option value="ethernet" ${interfaceData?.type === 'ethernet' ? 'selected' : ''}>Ethernet</option>
                            <option value="wifi" ${interfaceData?.type === 'wifi' ? 'selected' : ''}>WiFi</option>
                            <option value="fiber" ${interfaceData?.type === 'fiber' ? 'selected' : ''}>Fiber</option>
                            <option value="other" ${interfaceData?.type === 'other' ? 'selected' : ''}>Other</option>
                        </select>
                    </div>
                </div>
                <input type="hidden" class="interface-id" value="${interfaceId}">
            `;

    return div;
}

function updateInterfaceTitle(input, interfaceId) {
    const interfaceDiv = input.closest('.network-interface');
    const header = interfaceDiv.querySelector('.network-interface-header h4');
    header.innerHTML = `<i class="fas fa-network-wired"></i> ${input.value}`;
}

function removeNetworkInterface(interfaceId) {
    const interfaceDiv = document.querySelector(`.network-interface input.interface-id[value="${interfaceId}"]`)?.closest('.network-interface');
    if (interfaceDiv) {
        interfaceDiv.remove();
        updateAllInterfaceTitles();
    }
}

function updateAllInterfaceTitles() {
    document.querySelectorAll('.network-interface').forEach((interfaceDiv, index) => {
        const header = interfaceDiv.querySelector('.network-interface-header h4');
        const nameInput = interfaceDiv.querySelector('.interface-name');
        header.innerHTML = `<i class="fas fa-network-wired"></i> ${nameInput.value || `Interface ${index + 1}`}`;
    });
}

function collectNetworkInterfacesData() {
    const interfaces = [];
    document.querySelectorAll('.network-interface').forEach(interfaceDiv => {
        const interfaceData = {
            id: interfaceDiv.querySelector('.interface-id').value,
            interfaceName: interfaceDiv.querySelector('.interface-name').value || 'Unnamed Interface',
            ipAddress: interfaceDiv.querySelector('.interface-ip').value,
            subnetMask: interfaceDiv.querySelector('.interface-subnet').value,
            gateway: interfaceDiv.querySelector('.interface-gateway').value,
            dns: interfaceDiv.querySelector('.interface-dns').value,
            macAddress: interfaceDiv.querySelector('.interface-mac').value,
            type: interfaceDiv.querySelector('.interface-type').value
        };

        if (interfaceData.ipAddress) {
            interfaces.push(interfaceData);
        }
    });
    return interfaces;
}

// ============================================
// GET DEVICE MODEL AND SERIAL FUNCTIONS
// ============================================
function getDeviceModel(device) {
    if (!device) return 'N/A';
    return device.pcModel || 'N/A';
}

function getDeviceSerial(device) {
    if (!device) return 'N/A';
    return device.pcSerial || 'N/A';
}

// ============================================
// SAMPLE LOGS FOR TESTING
// ============================================
function getSampleLogs() {
    const sriLankaTime = getSriLankaTime();
    const sampleLogs = [
        {
            id: 'sample-1',
            timestamp: formatSriLankaTimestamp(sriLankaTime),
            action: 'Login',
            details: `${currentUser} logged into the ${currentSite.name} system`,
            user: currentUser,
            site: currentSite.name
        },
        {
            id: 'sample-2',
            timestamp: formatSriLankaTimestamp(new Date(sriLankaTime.getTime() - 3600000)),
            action: 'Device Added',
            details: 'Added PC-001 (Dell OptiPlex 7080)',
            user: currentUser,
            site: currentSite.name
        }
    ];

    console.log("📝 Using sample logs for display");
    return sampleLogs;
}

// ============================================
// DOM ELEMENTS
// ============================================
const loginPage = document.getElementById('loginPage');
const siteSelectionPage = document.getElementById('siteSelectionPage');
const appContainer = document.getElementById('appContainer');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const switchSiteBtn = document.getElementById('switchSiteBtn');
const loginError = document.getElementById('loginError');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const passwordChangeModal = document.getElementById('passwordChangeModal');
const passwordChangeForm = document.getElementById('passwordChangeForm');
const passwordChangeError = document.getElementById('passwordChangeError');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const logoutFromPasswordChangeBtn = document.getElementById('logoutFromPasswordChangeBtn');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const wtcCard = document.getElementById('wtcCard');
const hlsCard = document.getElementById('hlsCard');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const siteTitle = document.getElementById('siteTitle');
const networkDiagramUrl = document.getElementById('networkDiagramUrl');

// Navigation
const sidebarItems = document.querySelectorAll('.sidebar-menu li');
const sections = document.querySelectorAll('.section');

// Inventory elements
const inventoryTableBody = document.getElementById('inventoryTableBody');
const searchBox = document.getElementById('searchBox');
const departmentFilter = document.getElementById('departmentFilter');
const addNewBtn = document.getElementById('addNewBtn');
const refreshBtn = document.getElementById('refreshBtn');
const noDataMessage = document.getElementById('noDataMessage');
const exportBtn = document.getElementById('exportBtn');

// Stats cards
const totalDevicesCard = document.getElementById('totalDevicesCard');
const activeDevicesCard = document.getElementById('activeDevicesCard');
const failedDevicesCard = document.getElementById('failedDevicesCard');
const replacedDevicesCard = document.getElementById('replacedDevicesCard');

// Network interfaces
const networkInterfacesList = document.getElementById('networkInterfacesList');
const addNetworkInterfaceBtn = document.getElementById('addNetworkInterfaceBtn');

// Monitors
const monitorsList = document.getElementById('monitorsList');
const addMonitorBtn = document.getElementById('addMonitorBtn');

// Software licenses
const softwareLicensesList = document.getElementById('softwareLicensesList');
const addSoftwareLicenseBtn = document.getElementById('addSoftwareLicenseBtn');

// Failed devices elements
const failedDevicesTableBody = document.getElementById('failedDevicesTableBody');
const failedSearchBox = document.getElementById('failedSearchBox');
const failedPriorityFilter = document.getElementById('failedPriorityFilter');
const refreshFailedBtn = document.getElementById('refreshFailedBtn');
const noFailedDataMessage = document.getElementById('noFailedDataMessage');

// Form elements
const deviceForm = document.getElementById('deviceForm');
const cancelBtn = document.getElementById('cancelBtn');
const saveDeviceBtn = document.getElementById('saveDeviceBtn');

// Report Failure
const failureReportForm = document.getElementById('failureReportForm');
const failureDevice = document.getElementById('failureDevice');
const reportFailureBtn = document.getElementById('reportFailureBtn');
const cancelFailureBtn = document.getElementById('cancelFailureBtn');
const reportedBySelect = document.getElementById('reportedBy');

// Replace Device
const replaceDeviceForm = document.getElementById('replaceDeviceForm');
const replaceDeviceSelect = document.getElementById('replaceDeviceSelect');
const replaceDeviceBtn = document.getElementById('replaceDeviceBtn');
const cancelReplaceFormBtn = document.getElementById('cancelReplaceFormBtn');
const replacedBySelect = document.getElementById('replacedBy');

// Excel Import/Export
const exportAllBtn = document.getElementById('exportAllBtn');
const exportActiveBtn = document.getElementById('exportActiveBtn');
const exportFailedBtn = document.getElementById('exportFailedBtn');
const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
const excelFileInput = document.getElementById('excelFileInput');
const importBtn = document.getElementById('importBtn');
const exportLogsBtn = document.getElementById('exportLogsBtn');

// Logs
const logsContainer = document.getElementById('logsContainer');
const logSearchBox = document.getElementById('logSearchBox');
const logTypeFilter = document.getElementById('logTypeFilter');
const refreshLogsBtn = document.getElementById('refreshLogsBtn');

// Modals
const deviceDetailsModal = document.getElementById('deviceDetailsModal');
const closeDetailsModal = document.getElementById('closeDetailsModal');
const deleteModal = document.getElementById('deleteModal');
const closeDeleteModal = document.getElementById('closeDeleteModal');
const markFixedModal = document.getElementById('markFixedModal');
const closeMarkFixedModal = document.getElementById('closeMarkFixedModal');
const repairHistoryModal = document.getElementById('repairHistoryModal');
const closeRepairHistoryModal = document.getElementById('closeRepairHistoryModal');

// Network diagram
const viewDiagramBtn = document.getElementById('viewDiagramBtn');

// Stats
const totalDevicesElement = document.getElementById('totalDevices');
const activeDevicesElement = document.getElementById('activeDevices');
const failedDevicesElement = document.getElementById('failedDevices');
const replacedDevicesElement = document.getElementById('replacedDevices');

// ============================================
// LOGIN FUNCTIONALITY
// ============================================
const AUTH_DOMAIN_SUFFIX = "@inventory.system";

loginBtn.addEventListener('click', async function () {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        showLoginError('Please enter both username and password');
        return;
    }

    // Map username to a virtual email for Firebase Auth
    const email = username.includes('@') ? username : username + AUTH_DOMAIN_SUFFIX;

    const originalButtonText = loginBtn.innerHTML;
    const originalButtonState = loginBtn.disabled;

    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
    loginBtn.disabled = true;
    loginError.style.display = 'none';

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        console.log("✅ Login successful:", user.uid);

        // Add a log entry for login
        await addLogToFirebase({
            action: 'Login',
            details: `${username} logged into the system`,
            user: username
        });

    } catch (error) {
        console.error("❌ Login error:", error);

        let errorMessage = "Invalid username or password";
        if (error.code === 'auth/user-not-found') {
            errorMessage = "User not found";
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = "Incorrect password";
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = "Too many failed attempts. Try again later.";
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = "Network error. Please check your connection.";
        }

        showLoginError(errorMessage);
    } finally {
        loginBtn.innerHTML = originalButtonText;
        loginBtn.disabled = originalButtonState;
    }
});

function showLoginError(message) {
    loginError.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    loginError.style.display = 'block';
    usernameInput.style.borderColor = "var(--danger-color)";
    passwordInput.style.borderColor = "var(--danger-color)";

    const loginBox = document.querySelector('.login-box');
    loginBox.style.animation = 'none';
    setTimeout(() => {
        loginBox.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
    }, 10);
}

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Determine username from email (remove suffix if present)
        const email = user.email || "";
        const displayUsername = email.includes(AUTH_DOMAIN_SUFFIX)
            ? email.replace(AUTH_DOMAIN_SUFFIX, "")
            : email.split('@')[0];

        currentUser = displayUsername;
        const userNameElement = document.getElementById('currentUserName');
        if (userNameElement) {
            userNameElement.textContent = displayUsername.charAt(0).toUpperCase() + displayUsername.slice(1);
        }

        // Check for first-time login / password change requirement
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            const userData = userDoc.data();

            if (!userDoc.exists || (userData && userData.needsPasswordChange !== false)) {
                console.log("🔄 First-time login detected. Prompting for password change.");
                passwordChangeModal.style.display = 'flex';
                loginPage.style.display = 'none'; // Hide login if we're here
                return;
            }
        } catch (error) {
            console.error("Error checking user status:", error);
        }

        // Session Persistence: Check if a site was previously selected
        const savedSite = localStorage.getItem('selectedSite');

        if (savedSite && siteConfig[savedSite]) {
            console.log(`🏠 Restoring session for site: ${savedSite}`);
            selectSite(savedSite, true); // true means skip animation
        } else if (loginPage.style.display !== 'none' || passwordChangeModal.style.display !== 'none') {
            // Transition to site selection if we're on login/password change
            passwordChangeModal.style.display = 'none';
            loginPage.style.animation = 'slideOut 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
            setTimeout(() => {
                loginPage.style.display = 'none';
                siteSelectionPage.style.display = 'flex';
                siteSelectionPage.style.animation = 'slideIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            }, 800);
        }
    } else {
        // User is signed out - ensure they are on the login page
        handleLogoutUI();
    }
});

async function handleLogout() {
    try {
        await auth.signOut();
        localStorage.removeItem('selectedSite');
        console.log("👋 Logged out successfully");
    } catch (error) {
        console.error("Error logging out:", error);
    }
}

function handleLogoutUI() {
    appContainer.style.display = 'none';
    siteSelectionPage.style.display = 'none';
    passwordChangeModal.style.display = 'none';
    loginPage.style.display = 'flex';
    loginPage.style.animation = 'fadeIn 0.8s ease-out';

    // Clear sensitive data
    currentSite = null;
    inventoryData = [];
    activityLogs = [];
    if (realTimeUnsubscribe) realTimeUnsubscribe();
    if (logsUnsubscribe) logsUnsubscribe();
}

const style = document.createElement('style');
style.textContent = `
            @keyframes shake {
                10%, 90% { transform: translate3d(-1px, 0, 0); }
                20%, 80% { transform: translate3d(2px, 0, 0); }
                30%, 50%, 70% { transform: translate3d(-3px, 0, 0); }
                40%, 60% { transform: translate3d(3px, 0, 0); }
            }
        `;
document.head.appendChild(style);

// ============================================
// SITE SELECTION
// ============================================
wtcCard.addEventListener('click', function () {
    selectSite('wtc');
});

hlsCard.addEventListener('click', function () {
    selectSite('hls');
});

backToLoginBtn.addEventListener('click', handleLogout);

logoutBtn.addEventListener('click', handleLogout);

if (logoutFromPasswordChangeBtn) {
    logoutFromPasswordChangeBtn.addEventListener('click', handleLogout);
}

switchSiteBtn.addEventListener('click', function () {
    localStorage.removeItem('selectedSite');
    appContainer.style.animation = 'slideOut 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';

    setTimeout(() => {
        appContainer.style.display = 'none';
        siteSelectionPage.style.display = 'flex';
        siteSelectionPage.style.animation = 'slideIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';

        if (realTimeUnsubscribe) {
            realTimeUnsubscribe();
        }
        if (logsUnsubscribe) {
            logsUnsubscribe();
        }

        currentSite = null;
        inventoryData = [];
        activityLogs = [];

    }, 800);
});

function selectSite(siteName, skipAnimation = false) {
    currentSite = siteConfig[siteName];
    localStorage.setItem('selectedSite', siteName);

    siteTitle.textContent = `${currentSite.name} - IT Management Interface`;
    networkDiagramUrl.textContent = currentSite.networkDiagram;

    updateDepartmentDropdowns();
    updateTechnicianDropdowns();

    if (skipAnimation) {
        loginPage.style.display = 'none';
        siteSelectionPage.style.display = 'none';
        passwordChangeModal.style.display = 'none';
        appContainer.style.display = 'block';

        loadInventoryFromFirebase();
        loadLogsFromFirebase();
        startRealTimeUpdates();
        startRealTimeLogs();

        updateFailureDeviceDropdown();
        updateReplaceDeviceDropdown();

        addDefaultNetworkInterface();
        addDefaultMonitor();
        addDefaultSoftwareLicense();

        setupEnterKeyNavigation();
        return;
    }

    siteSelectionPage.style.animation = 'slideOut 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';

    setTimeout(() => {
        siteSelectionPage.style.display = 'none';
        appContainer.style.display = 'block';
        appContainer.style.animation = 'slideIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';

        addLogEntry('Login', `${currentUser} logged into ${currentSite.name} system`);
        loadInventoryFromFirebase();
        loadLogsFromFirebase();

        startRealTimeUpdates();
        startRealTimeLogs();

        updateFailureDeviceDropdown();
        updateReplaceDeviceDropdown();

        addDefaultNetworkInterface();
        addDefaultMonitor();
        addDefaultSoftwareLicense();

        setupEnterKeyNavigation();

    }, 800);
}

function updateDepartmentDropdowns() {
    if (!currentSite) return;

    departmentFilter.innerHTML = '<option value="">All Departments</option>';
    currentSite.departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        departmentFilter.appendChild(option);
    });

    const addDeviceDept = document.getElementById('department');
    addDeviceDept.innerHTML = '<option value="">Select Department</option>';
    currentSite.departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        addDeviceDept.appendChild(option);
    });
}

function updateTechnicianDropdowns() {
    if (!currentSite) return;

    reportedBySelect.innerHTML = '<option value="">Select Technician</option>';
    currentSite.technicians.forEach(tech => {
        const option = document.createElement('option');
        option.value = tech;
        option.textContent = tech;
        reportedBySelect.appendChild(option);
    });

    replacedBySelect.innerHTML = '<option value="">Select Technician</option>';
    currentSite.technicians.forEach(tech => {
        const option = document.createElement('option');
        option.value = tech;
        option.textContent = tech;
        replacedBySelect.appendChild(option);
    });
}

// ============================================
// EXCEL IMPORT/EXPORT EVENT HANDLERS - SINGLE SHEET
// ============================================
exportBtn.addEventListener('click', function () {
    if (!inventoryData || inventoryData.length === 0) {
        alert("No data to export");
        return;
    }

    exportToExcel(inventoryData, 'All_Devices');
    addLogEntry('Excel Export', `Exported all devices (${inventoryData.length} records) to Excel in single sheet`);
});

exportAllBtn.addEventListener('click', function () {
    if (!inventoryData || inventoryData.length === 0) {
        alert("No data to export");
        return;
    }

    exportToExcel(inventoryData, 'All_Devices');
    addLogEntry('Excel Export', `Exported all devices (${inventoryData.length} records) to Excel in single sheet`);
});

exportActiveBtn.addEventListener('click', function () {
    const activeDevices = inventoryData.filter(device => device.status === 'active');
    if (activeDevices.length === 0) {
        alert("No active devices to export");
        return;
    }

    exportToExcel(activeDevices, 'Active_Devices');
    addLogEntry('Excel Export', `Exported active devices (${activeDevices.length} records) to Excel`);
});

exportFailedBtn.addEventListener('click', function () {
    const failedDevices = inventoryData.filter(device => device.status === 'failed');
    if (failedDevices.length === 0) {
        alert("No failed devices to export");
        return;
    }

    exportToExcel(failedDevices, 'Failed_Devices');
    addLogEntry('Excel Export', `Exported failed devices (${failedDevices.length} records) to Excel`);
});

downloadTemplateBtn.addEventListener('click', function () {
    downloadTemplate();
    addLogEntry('Template Download', 'Downloaded Excel import template');
});

excelFileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        importBtn.disabled = false;
        importBtn.innerHTML = `<i class="fas fa-upload"></i> Import Devices (${file.name})`;
    }
});

importBtn.addEventListener('click', async function () {
    const file = excelFileInput.files[0];
    if (!file) {
        alert("Please select an Excel file first");
        return;
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        alert("Please select an Excel file (.xlsx or .xls)");
        return;
    }

    const importProgress = document.getElementById('importProgress');
    const importResults = document.getElementById('importResults');
    importProgress.style.display = 'block';
    importResults.innerHTML = '';

    updateImportProgress(0, 0, 0);

    try {
        const results = await importFromExcel(file);

        importResults.innerHTML = `
                    <div style="padding: 15px; background: var(--secondary-light); border-radius: 8px; border: 1px solid var(--border-color);">
                        <h4 style="color: var(--primary-color); margin-bottom: 10px;">
                            <i class="fas fa-check-circle"></i> Import Complete
                        </h4>
                        <p>Total devices processed: <strong>${results.total}</strong></p>
                        <p>Successfully imported: <strong style="color: var(--success-color);">${results.success}</strong></p>
                        <p>Failed: <strong style="color: var(--danger-color);">${results.failed}</strong></p>
                        ${results.errors.length > 0 ? `
                            <div style="margin-top: 10px;">
                                <p><strong>Errors:</strong></p>
                                <div style="max-height: 150px; overflow-y: auto; background: var(--primary-white); padding: 10px; border-radius: 4px; font-size: 12px;">
                                    ${results.errors.map(error => `<div style="color: var(--danger-color); margin-bottom: 5px;">${error}</div>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;

        addLogEntry('Excel Import', `Imported ${results.success} devices from Excel (${results.failed} failed)`);

        setTimeout(() => {
            loadInventoryFromFirebase();
            importBtn.disabled = true;
            importBtn.innerHTML = `<i class="fas fa-upload"></i> Import Devices`;
            excelFileInput.value = '';
        }, 2000);

    } catch (error) {
        console.error("Import error:", error);
        importResults.innerHTML = `
                    <div style="padding: 15px; background: rgba(220, 53, 69, 0.1); border-radius: 8px; border: 1px solid var(--danger-color); color: var(--danger-color);">
                        <h4 style="margin-bottom: 10px;"><i class="fas fa-exclamation-circle"></i> Import Failed</h4>
                        <p>${error.message}</p>
                    </div>
                `;
    }
});

exportLogsBtn.addEventListener('click', function () {
    if (!activityLogs || activityLogs.length === 0) {
        alert("No logs to export");
        return;
    }

    try {
        const excelData = activityLogs.map(log => ({
            'Timestamp': log.timestamp || 'N/A',
            'Action': log.action || 'N/A',
            'Details': log.details || 'N/A',
            'User': log.user || 'N/A',
            'Site': log.site || 'N/A'
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);

        const wscols = [
            { wch: 20 }, { wch: 25 }, { wch: 40 }, { wch: 15 }, { wch: 10 }
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');

        const dateStr = new Date().toISOString().split('T')[0];
        const exportFilename = `Activity_Logs_${currentSite.name}_${dateStr}.xlsx`;

        XLSX.writeFile(wb, exportFilename);

        addLogEntry('Excel Export', `Exported activity logs (${activityLogs.length} records) to Excel`);

    } catch (error) {
        console.error("Error exporting logs to Excel:", error);
        alert("Error exporting logs to Excel: " + error.message);
    }
});

// ============================================
// ENTER KEY NAVIGATION
// ============================================
function setupEnterKeyNavigation() {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            const activeElement = document.activeElement;

            if (activeElement.classList.contains('form-field')) {
                e.preventDefault();

                const formFields = Array.from(document.querySelectorAll('.form-field'));
                const currentIndex = formFields.indexOf(activeElement);

                if (currentIndex !== -1 && currentIndex < formFields.length - 1) {
                    const nextField = formFields[currentIndex + 1];
                    nextField.focus();

                    if (nextField.tagName === 'SELECT') {
                        nextField.click();
                    }
                } else if (currentIndex === formFields.length - 1) {
                    const form = activeElement.closest('form');
                    if (form) {
                        const submitBtn = form.querySelector('button[type="submit"]');
                        if (submitBtn) {
                            submitBtn.click();
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// NETWORK INTERFACES INITIALIZATION
// ============================================
function addDefaultNetworkInterface() {
    networkInterfacesList.innerHTML = '';
    const defaultInterface = createNetworkInterfaceElement({
        id: 'default-interface',
        interfaceName: 'Primary Interface',
        ipAddress: '',
        subnetMask: '255.255.255.0',
        gateway: '',
        type: 'ethernet'
    }, 0);
    networkInterfacesList.appendChild(defaultInterface);
}

addNetworkInterfaceBtn.addEventListener('click', function () {
    const interfaceCount = document.querySelectorAll('.network-interface').length;
    const newInterface = createNetworkInterfaceElement(null, interfaceCount);
    networkInterfacesList.appendChild(newInterface);

    newInterface.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ============================================
// MONITORS INITIALIZATION
// ============================================
function addDefaultMonitor() {
    monitorsList.innerHTML = '';
    const defaultMonitor = createMonitorElement({
        id: 'default-monitor',
        model: '',
        serial: ''
    }, 0);
    monitorsList.appendChild(defaultMonitor);
}

addMonitorBtn.addEventListener('click', function () {
    const monitorCount = document.querySelectorAll('.monitor-entry').length;
    const newMonitor = createMonitorElement(null, monitorCount);
    monitorsList.appendChild(newMonitor);

    newMonitor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ============================================
// SOFTWARE LICENSES INITIALIZATION
// ============================================
function addDefaultSoftwareLicense() {
    softwareLicensesList.innerHTML = '';
    const defaultSoftware = createSoftwareLicenseElement({
        id: 'default-software',
        name: 'Operating System'
    }, 0);
    softwareLicensesList.appendChild(defaultSoftware);
}

addSoftwareLicenseBtn.addEventListener('click', function () {
    const softwareCount = document.querySelectorAll('.software-license').length;
    const newSoftware = createSoftwareLicenseElement(null, softwareCount);
    softwareLicensesList.appendChild(newSoftware);

    newSoftware.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ============================================
// REAL-TIME UPDATES
// ============================================
function startRealTimeUpdates() {
    if (realTimeUnsubscribe) {
        realTimeUnsubscribe();
    }

    if (!currentSite) return;

    realTimeUnsubscribe = db.collection(currentSite.firebaseCollection)
        .orderBy('pcNumber', 'asc')
        .onSnapshot((snapshot) => {
            console.log("🔄 Real-time update received for", currentSite.name);
            const updatedDevices = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                updatedDevices.push({
                    id: doc.id,
                    ...data
                });
            });

            inventoryData = updatedDevices;

            loadInventoryTable();
            updateStats();

            if (document.getElementById('failedDevices').classList.contains('active')) {
                loadFailedDevicesTable();
            }

            updateFailureDeviceDropdown();
            updateReplaceDeviceDropdown();

        }, (error) => {
            console.error("Real-time update error:", error);
        });
}

function startRealTimeLogs() {
    if (logsUnsubscribe) {
        logsUnsubscribe();
    }

    if (!currentSite) return;

    logsUnsubscribe = db.collection(currentSite.logsCollection)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot((snapshot) => {
            const updatedLogs = [];
            snapshot.forEach(doc => {
                const data = doc.data();

                let timestamp = data.sriLankaTimestamp || data.timestamp || formatSriLankaTimestamp(getSriLankaTime());

                if (timestamp && timestamp.toDate) {
                    try {
                        const date = timestamp.toDate();
                        timestamp = formatSriLankaTimestamp(date);
                    } catch (e) {
                        console.error("Error converting timestamp:", e);
                    }
                }

                updatedLogs.push({
                    id: doc.id,
                    timestamp: timestamp,
                    action: data.action || 'Unknown Action',
                    details: data.details || '',
                    user: data.user || 'System',
                    site: data.site || currentSite.name
                });
            });

            activityLogs = updatedLogs;

            if (document.getElementById('logs').classList.contains('active')) {
                loadLogs();
            }

            console.log("📝 Real-time logs updated for", currentSite.name);
        }, (error) => {
            console.error("Real-time logs error:", error);
        });
}

// ============================================
// STATS CARDS CLICK HANDLERS
// ============================================
totalDevicesCard.addEventListener('click', function () {
    departmentFilter.value = '';
    searchBox.value = '';
    loadInventoryTable();
    scrollToTop();
});

activeDevicesCard.addEventListener('click', function () {
    departmentFilter.value = '';
    searchBox.value = '';
    const filteredData = inventoryData.filter(device => device.status === 'active');
    loadFilteredTable(filteredData, 'Active Devices');
    scrollToTop();
});

failedDevicesCard.addEventListener('click', function () {
    departmentFilter.value = '';
    searchBox.value = '';
    const filteredData = inventoryData.filter(device => device.status === 'failed');
    loadFilteredTable(filteredData, 'Failed Devices');
    scrollToTop();
});

replacedDevicesCard.addEventListener('click', function () {
    departmentFilter.value = '';
    searchBox.value = '';
    const filteredData = inventoryData.filter(device => device.status === 'replaced');
    loadFilteredTable(filteredData, 'Replaced Devices');
    scrollToTop();
});

function loadFilteredTable(filteredData, title) {
    inventoryTableBody.innerHTML = '';

    if (filteredData.length === 0) {
        noDataMessage.style.display = 'block';
        noDataMessage.innerHTML = `
                    <i class="fas fa-laptop" style="font-size: 60px; color: var(--border-color); margin-bottom: 20px;"></i>
                    <h3 style="color: var(--text-gray); margin-bottom: 10px;">No ${title} Found</h3>
                `;
        return;
    } else {
        noDataMessage.style.display = 'none';
    }

    filteredData.forEach(device => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', device.id);
        row.classList.add('device-row');

        let primaryIP = 'N/A';
        if (device.networkInterfaces && device.networkInterfaces.length > 0) {
            primaryIP = device.networkInterfaces[0].ipAddress || 'N/A';
        } else if (device.ipAddress) {
            primaryIP = device.ipAddress;
        }

        let statusBadge = '';
        if (device.status === 'active') {
            statusBadge = '<span class="status-badge status-active"><i class="fas fa-check-circle"></i> Active</span>';
        } else if (device.status === 'failed') {
            statusBadge = '<span class="status-badge status-failed"><i class="fas fa-exclamation-triangle"></i> Failed</span>';
        } else if (device.status === 'replaced') {
            statusBadge = '<span class="status-badge status-replaced"><i class="fas fa-exchange-alt"></i> Replaced</span>';
        } else if (device.status === 'fixed') {
            statusBadge = '<span class="status-badge status-fixed"><i class="fas fa-wrench"></i> Fixed</span>';
        }

        const interfaceCount = device.networkInterfaces ? device.networkInterfaces.length : 0;
        const ipInfo = `
                    <strong>${primaryIP}</strong>
                    <div style="font-size: 12px; color: var(--text-gray);">
                        <div>Interfaces: ${interfaceCount}</div>
                        ${device.networkInterfaces && device.networkInterfaces.length > 1 ?
                '<div style="color: var(--accent-color);">+' + (interfaceCount - 1) + ' more</div>' : ''}
                    </div>
                `;

        row.innerHTML = `
                    <td><strong>${device.pcNumber || 'N/A'}</strong></td>
                    <td>${getDeviceModel(device)}</td>
                    <td>${ipInfo}</td>
                    <td><span class="status-badge" style="background: rgba(0, 49, 53, 0.1); color: var(--primary-color);">${device.department || 'N/A'}</span></td>
                    <td>${device.userName || 'N/A'}</td>
                    <td>${device.createdBy || (currentSite && currentSite.name === 'WTC' ? 'Adithya' : 'N/A')}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-primary btn-sm view-btn" data-id="${device.id}" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-warning btn-sm edit-btn" data-id="${device.id}" title="Edit Device">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${device.id}" title="Delete Device">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;

        inventoryTableBody.appendChild(row);
    });

    attachActionButtonListeners();
    attachRowClickListeners();

    const tableHeader = document.querySelector('#inventory h2');
    const originalTitle = '<i class="fas fa-laptop"></i> Device Inventory Dashboard';
    tableHeader.innerHTML = `<i class="fas fa-filter"></i> ${title} (${filteredData.length} devices)`;

    const actionsBar = document.querySelector('.actions-bar');
    if (!document.querySelector('#backToAllBtn')) {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn btn-info';
        backBtn.id = 'backToAllBtn';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to All Devices';
        backBtn.addEventListener('click', function () {
            tableHeader.innerHTML = originalTitle;
            backBtn.remove();
            loadInventoryTable();
        });
        actionsBar.querySelector('.action-buttons').prepend(backBtn);
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// LOGOUT FUNCTIONALITY
// ============================================
logoutBtn.addEventListener('click', async function () {
    try {
        if (currentSite) {
            await addLogEntry('Logout', `${currentUser} logged out from ${currentSite.name}`);
        }

        if (realTimeUnsubscribe) {
            realTimeUnsubscribe();
        }
        if (logsUnsubscribe) {
            logsUnsubscribe();
        }

        await firebase.auth().signOut();
        // UI transition is handled by onAuthStateChanged listener

        usernameInput.value = '';
        passwordInput.value = '';
        loginError.style.display = 'none';

        currentSite = null;
        inventoryData = [];
        activityLogs = [];
        inventoryTableBody.innerHTML = '';
        logsContainer.innerHTML = '';

    } catch (error) {
        console.error("Logout error:", error);
    }
});

// ============================================
// DATA LOADING
// ============================================
async function loadInventoryFromFirebase() {
    try {
        inventoryData = await loadDevicesFromFirebase();
        loadInventoryTable();
        loadFailedDevicesTable();
        updateStats();
    } catch (error) {
        console.error("Error loading inventory:", error);
    }
}

// ============================================
// NAVIGATION
// ============================================
sidebarItems.forEach(item => {
    item.addEventListener('click', function () {
        const sectionId = this.getAttribute('data-section');

        sidebarItems.forEach(i => i.classList.remove('active'));
        this.classList.add('active');

        sections.forEach(section => {
            section.classList.remove('active');
            if (section.id === sectionId) {
                section.classList.add('active');
            }
        });

        if (sectionId === 'inventory') {
            loadInventoryTable();
        } else if (sectionId === 'logs') {
            loadLogs();
        } else if (sectionId === 'failedDevices') {
            loadFailedDevicesTable();
        } else if (sectionId === 'networkDiagram') {
            networkDiagramUrl.textContent = currentSite.networkDiagram;
        } else if (sectionId === 'excelImport') {
            importBtn.disabled = true;
            importBtn.innerHTML = `<i class="fas fa-upload"></i> Import Devices`;
            excelFileInput.value = '';
            document.getElementById('importProgress').style.display = 'none';
        }
    });
});

// ============================================
// INVENTORY TABLE - UPDATED SEARCH FUNCTIONALITY
// ============================================
function loadInventoryTable() {
    const searchTerm = searchBox.value.toLowerCase();
    const department = departmentFilter.value;

    let filteredData = inventoryData.filter(device => {
        const matchesSearch =
            (device.pcNumber && device.pcNumber.toLowerCase().includes(searchTerm)) ||
            (getDeviceSerial(device) && getDeviceSerial(device).toLowerCase().includes(searchTerm)) ||
            (device.userName && device.userName.toLowerCase().includes(searchTerm)) ||
            (device.monitors && device.monitors.some(monitor =>
                monitor.serial && monitor.serial.toLowerCase().includes(searchTerm)
            )) ||
            (device.softwareLicenses && device.softwareLicenses.some(software =>
                software.licenseKey && software.licenseKey.toLowerCase().includes(searchTerm)
            ));

        const matchesDepartment = !department || device.department === department;

        return matchesSearch && matchesDepartment;
    });

    inventoryTableBody.innerHTML = '';

    if (filteredData.length === 0) {
        noDataMessage.style.display = 'block';
        return;
    } else {
        noDataMessage.style.display = 'none';
    }

    filteredData.forEach(device => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', device.id);
        row.classList.add('device-row');

        let primaryIP = 'N/A';
        if (device.networkInterfaces && device.networkInterfaces.length > 0) {
            primaryIP = device.networkInterfaces[0].ipAddress || 'N/A';
        } else if (device.ipAddress) {
            primaryIP = device.ipAddress;
        }

        let statusBadge = '';
        if (device.status === 'active') {
            statusBadge = '<span class="status-badge status-active"><i class="fas fa-check-circle"></i> Active</span>';
        } else if (device.status === 'failed') {
            statusBadge = '<span class="status-badge status-failed"><i class="fas fa-exclamation-triangle"></i> Failed</span>';
        } else if (device.status === 'replaced') {
            statusBadge = '<span class="status-badge status-replaced"><i class="fas fa-exchange-alt"></i> Replaced</span>';
        } else if (device.status === 'fixed') {
            statusBadge = '<span class="status-badge status-fixed"><i class="fas fa-wrench"></i> Fixed</span>';
        }

        const interfaceCount = device.networkInterfaces ? device.networkInterfaces.length : 0;
        const ipInfo = `
                    <strong>${primaryIP}</strong>
                    <div style="font-size: 12px; color: var(--text-gray);">
                        <div>Interfaces: ${interfaceCount}</div>
                        ${device.networkInterfaces && device.networkInterfaces.length > 1 ?
                '<div style="color: var(--accent-color);">+' + (interfaceCount - 1) + ' more</div>' : ''}
                    </div>
                `;

        row.innerHTML = `
                    <td><strong>${device.pcNumber || 'N/A'}</strong></td>
                    <td>${getDeviceModel(device)}</td>
                    <td>${ipInfo}</td>
                    <td><span class="status-badge" style="background: rgba(0, 49, 53, 0.1); color: var(--primary-color);">${device.department || 'N/A'}</span></td>
                    <td>${device.userName || 'N/A'}</td>
                    <td>${device.createdBy || (currentSite && currentSite.name === 'WTC' ? 'Adithya' : 'N/A')}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-primary btn-sm view-btn" data-id="${device.id}" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-warning btn-sm edit-btn" data-id="${device.id}" title="Edit Device">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${device.id}" title="Delete Device">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;

        inventoryTableBody.appendChild(row);
    });

    attachActionButtonListeners();
    attachRowClickListeners();
    updateStats();

    const tableHeader = document.querySelector('#inventory h2');
    const originalTitle = '<i class="fas fa-laptop"></i> Device Inventory Dashboard';
    if (!tableHeader.innerHTML.includes('Device Inventory Dashboard')) {
        tableHeader.innerHTML = originalTitle;
    }

    const backBtn = document.querySelector('#backToAllBtn');
    if (backBtn) {
        backBtn.remove();
    }
}

function attachRowClickListeners() {
    document.querySelectorAll('.device-row').forEach(row => {
        row.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;

            const deviceId = this.getAttribute('data-id');
            showDeviceDetails(deviceId);
        });
    });
}

// ============================================
// FAILED DEVICES TABLE
// ============================================
function loadFailedDevicesTable() {
    const searchTerm = failedSearchBox.value.toLowerCase();
    const priority = failedPriorityFilter.value;

    let failedDevices = inventoryData.filter(device => {
        if (device.status !== 'failed') return false;

        const matchesSearch =
            (device.pcNumber && device.pcNumber.toLowerCase().includes(searchTerm)) ||
            (getDeviceModel(device) && getDeviceModel(device).toLowerCase().includes(searchTerm)) ||
            (device.userName && device.userName.toLowerCase().includes(searchTerm)) ||
            (getDeviceSerial(device) && getDeviceSerial(device).toLowerCase().includes(searchTerm));

        const matchesPriority = !priority || (device.failureReport && device.failureReport.priority === priority);

        return matchesSearch && matchesPriority;
    });

    failedDevicesTableBody.innerHTML = '';

    if (failedDevices.length === 0) {
        noFailedDataMessage.style.display = 'block';
        return;
    } else {
        noFailedDataMessage.style.display = 'none';
    }

    failedDevices.forEach(device => {
        const row = document.createElement('tr');

        let priorityBadge = '';
        const priority = device.failureReport?.priority || 'medium';
        if (priority === 'low') {
            priorityBadge = '<span class="status-badge" style="background: rgba(40, 167, 69, 0.1); color: var(--success-color);">Low</span>';
        } else if (priority === 'medium') {
            priorityBadge = '<span class="status-badge" style="background: rgba(255, 193, 7, 0.1); color: var(--warning-color);">Medium</span>';
        } else if (priority === 'high') {
            priorityBadge = '<span class="status-badge" style="background: rgba(220, 53, 69, 0.1); color: var(--danger-color);">High</span>';
        } else if (priority === 'critical') {
            priorityBadge = '<span class="status-badge" style="background: rgba(111, 66, 193, 0.1); color: #6f42c1;">Critical</span>';
        }

        row.innerHTML = `
                    <td><strong>${device.pcNumber || 'N/A'}</strong></td>
                    <td>${getDeviceModel(device)}</td>
                    <td>${device.department || 'N/A'}</td>
                    <td>${device.failureReport?.reason?.substring(0, 50) || 'No reason provided'}...</td>
                    <td>${device.failureReport?.reportedBy || 'Unknown'}</td>
                    <td>${priorityBadge}</td>
                    <td>${device.failureReport?.date || 'Unknown'}</td>
                    <td>
                        <button class="btn btn-success btn-sm mark-fixed-btn" data-id="${device.id}" title="Mark as Fixed">
                            <i class="fas fa-wrench"></i> Fix
                        </button>
                        <button class="btn btn-info btn-sm view-failure-btn" data-id="${device.id}" title="View Failure Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                `;

        failedDevicesTableBody.appendChild(row);
    });

    document.querySelectorAll('.mark-fixed-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const deviceId = this.getAttribute('data-id');
            showMarkFixedModal(deviceId);
        });
    });

    document.querySelectorAll('.view-failure-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const deviceId = this.getAttribute('data-id');
            showDeviceDetails(deviceId);
        });
    });
}

function updateStats() {
    const total = inventoryData.length;
    const active = inventoryData.filter(d => d.status === 'active').length;
    const failed = inventoryData.filter(d => d.status === 'failed').length;
    const replaced = inventoryData.filter(d => d.status === 'replaced').length;

    totalDevicesElement.textContent = total;
    activeDevicesElement.textContent = active;
    failedDevicesElement.textContent = failed;
    replacedDevicesElement.textContent = replaced;
}

function updateFailureDeviceDropdown() {
    failureDevice.innerHTML = '<option value="">Select a device to report failure</option>';
    inventoryData.forEach(device => {
        if (device.status !== 'failed' && device.status !== 'replaced') {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `${device.pcNumber} - ${getDeviceModel(device)} (${device.userName || 'No User'})`;
            failureDevice.appendChild(option);
        }
    });
}

function updateReplaceDeviceDropdown() {
    replaceDeviceSelect.innerHTML = '<option value="">Select a device to replace</option>';
    inventoryData.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = `${device.pcNumber} - ${getDeviceModel(device)} (${device.userName || 'No User'})`;
        replaceDeviceSelect.appendChild(option);
    });
}

// ============================================
// ACTION BUTTONS
// ============================================
function attachActionButtonListeners() {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const deviceId = this.getAttribute('data-id');
            showDeviceDetails(deviceId);
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const deviceId = this.getAttribute('data-id');
            editDevice(deviceId);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const deviceId = this.getAttribute('data-id');
            showDeleteConfirmation(deviceId);
        });
    });
}

// ============================================
// DEVICE DETAILS (FULL SCREEN)
// ============================================
async function showDeviceDetails(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    currentDeviceId = deviceId;

    document.getElementById('deviceDetailsContent').innerHTML = `
                <div class="device-grid">
                    <div class="device-section">
                        <h3><i class="fas fa-info-circle"></i> Device Information</h3>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-hashtag"></i> Device Number:</div>
                            <div class="device-value">${device.pcNumber || 'N/A'}</div>
                        </div>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-laptop"></i> PC Model:</div>
                            <div class="device-value">${device.pcModel || 'N/A'}</div>
                        </div>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-barcode"></i> PC Serial:</div>
                            <div class="device-value">${device.pcSerial || 'N/A'}</div>
                        </div>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-building"></i> Department:</div>
                            <div class="device-value">${device.department || 'N/A'}</div>
                        </div>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-user"></i> User Name:</div>
                            <div class="device-value">${device.userName || 'N/A'}</div>
                        </div>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-user-edit"></i> Added By:</div>
                            <div class="device-value">${device.createdBy || (currentSite && currentSite.name === 'WTC' ? 'Adithya' : 'N/A')}</div>
                        </div>
                        <div class="device-item">
                            <div class="device-label"><i class="fas fa-info-circle"></i> Status:</div>
                            <div class="device-value">
                                ${device.status === 'active' ? '<span class="status-badge status-active"><i class="fas fa-check-circle"></i> Active</span>' : ''}
                                ${device.status === 'failed' ? '<span class="status-badge status-failed"><i class="fas fa-exclamation-triangle"></i> Failed</span>' : ''}
                                ${device.status === 'replaced' ? '<span class="status-badge status-replaced"><i class="fas fa-exchange-alt"></i> Replaced</span>' : ''}
                                ${device.status === 'fixed' ? '<span class="status-badge status-fixed"><i class="fas fa-wrench"></i> Fixed</span>' : ''}
                            </div>
                        </div>
                    </div>
                    
                    ${device.networkInterfaces && device.networkInterfaces.length > 0 ? `
                    <div class="device-section">
                        <h3><i class="fas fa-network-wired"></i> Network Information</h3>
                        <div class="network-interfaces-grid">
                            ${device.networkInterfaces.map(iface => `
                                <div class="network-interface-card">
                                    <h4><i class="fas fa-network-wired"></i> ${iface.interfaceName || 'Network Interface'}</h4>
                                    <div class="interface-detail">
                                        <span class="interface-label">IP Address:</span>
                                        <span class="interface-value">${iface.ipAddress || 'N/A'}</span>
                                    </div>
                                    ${iface.subnetMask ? `
                                    <div class="interface-detail">
                                        <span class="interface-label">Subnet Mask:</span>
                                        <span class="interface-value">${iface.subnetMask}</span>
                                    </div>
                                    ` : ''}
                                    ${iface.gateway ? `
                                    <div class="interface-detail">
                                        <span class="interface-label">Gateway:</span>
                                        <span class="interface-value">${iface.gateway}</span>
                                    </div>
                                    ` : ''}
                                    ${iface.macAddress ? `
                                    <div class="interface-detail">
                                        <span class="interface-label">MAC Address:</span>
                                        <span class="interface-value">${iface.macAddress}</span>
                                    </div>
                                    ` : ''}
                                    ${iface.type ? `
                                    <div class="interface-detail">
                                        <span class="interface-label">Type:</span>
                                        <span class="interface-value">${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)}</span>
                                    </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${device.monitors && device.monitors.length > 0 ? `
                    <div class="device-section">
                        <h3><i class="fas fa-tv"></i> Monitors</h3>
                        <div class="monitors-grid">
                            ${device.monitors.map((monitor, index) => `
                                <div class="monitor-card">
                                    <h4><i class="fas fa-tv"></i> Monitor ${index + 1}</h4>
                                    <div class="monitor-detail">
                                        <span class="monitor-label">Model:</span>
                                        <span class="monitor-value">${monitor.model || 'N/A'}</span>
                                    </div>
                                    <div class="monitor-detail">
                                        <span class="monitor-label">Serial:</span>
                                        <span class="monitor-value">${monitor.serial || 'N/A'}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${device.softwareLicenses && device.softwareLicenses.length > 0 ? `
                    <div class="device-section">
                        <h3><i class="fas fa-copyright"></i> Licensed Software</h3>
                        <div class="software-grid">
                            ${device.softwareLicenses.map(software => `
                                <div class="software-card">
                                    <h4><i class="fas fa-copyright"></i> ${software.name || 'Unnamed Software'}</h4>
                                    ${software.version ? `
                                    <div class="software-detail">
                                        <span class="software-label">Version:</span>
                                        <span class="software-value">${software.version}</span>
                                    </div>
                                    ` : ''}
                                    ${software.licenseKey ? `
                                    <div class="software-detail">
                                        <span class="software-label">License Key:</span>
                                        <span class="software-value">${software.licenseKey}</span>
                                    </div>
                                    ` : ''}
                                    ${software.licensedTo ? `
                                    <div class="software-detail">
                                        <span class="software-label">Licensed To:</span>
                                        <span class="software-value">${software.licensedTo}</span>
                                    </div>
                                    ` : ''}
                                    ${software.expiryDate ? `
                                    <div class="software-detail">
                                        <span class="software-label">Expiry Date:</span>
                                        <span class="software-value">${software.expiryDate}</span>
                                    </div>
                                    ` : ''}
                                    ${software.notes ? `
                                    <div class="software-detail">
                                        <span class="software-label">Notes:</span>
                                        <span class="software-value">${software.notes}</span>
                                    </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                ${(device.cpu || device.ram || device.storage) ? `
                <div class="device-section">
                    <h3><i class="fas fa-microchip"></i> Specifications</h3>
                    <div class="specs-grid-modal">
                        ${device.cpu ? `
                        <div class="spec-item">
                            <div class="spec-icon">
                                <i class="fas fa-microchip"></i>
                            </div>
                            <div class="spec-name">CPU</div>
                            <div class="spec-value">${device.cpu}</div>
                        </div>
                        ` : ''}
                        
                        ${device.gpu ? `
                        <div class="spec-item">
                            <div class="spec-icon">
                                <i class="fas fa-gamepad"></i>
                            </div>
                            <div class="spec-name">GPU</div>
                            <div class="spec-value">${device.gpu}</div>
                        </div>
                        ` : ''}
                        
                        ${device.ram ? `
                        <div class="spec-item">
                            <div class="spec-icon">
                                <i class="fas fa-memory"></i>
                            </div>
                            <div class="spec-name">RAM</div>
                            <div class="spec-value">${device.ram}</div>
                        </div>
                        ` : ''}
                        
                        ${device.storage ? `
                        <div class="spec-item">
                            <div class="spec-icon">
                                <i class="fas fa-hdd"></i>
                            </div>
                            <div class="spec-name">Storage</div>
                            <div class="spec-value">${device.storage}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                ${device.replacedBy ? `
                <div class="device-section" style="border-left: 5px solid var(--warning-color);">
                    <h3><i class="fas fa-exchange-alt"></i> Replacement Information</h3>
                    <div class="device-item">
                        <div class="device-label"><i class="fas fa-user-check"></i> Replaced By:</div>
                        <div class="device-value">${device.replacedBy || 'N/A'}</div>
                    </div>
                    <div class="device-item">
                        <div class="device-label"><i class="fas fa-comment-medical"></i> Reason:</div>
                        <div class="device-value">${device.replacementReason || 'N/A'}</div>
                    </div>
                    <div class="device-item">
                        <div class="device-label"><i class="fas fa-calendar-alt"></i> Replacement Date:</div>
                        <div class="device-value">${device.replacementDate || 'N/A'}</div>
                    </div>
                </div>
                ` : ''}
                
                <div class="device-actions">
                    <button class="btn btn-warning" onclick="editDevice('${deviceId}')">
                        <i class="fas fa-edit"></i> Edit This Device
                    </button>
                    <button class="btn btn-info" onclick="showRepairHistory('${deviceId}')">
                        <i class="fas fa-history"></i> View Repair History & Failure Reports
                    </button>
                    ${device.status === 'failed' ? `
                    <button class="btn btn-success" onclick="showMarkFixedModal('${deviceId}')">
                        <i class="fas fa-wrench"></i> Mark as Fixed
                    </button>
                    ` : ''}
                    <button class="btn btn-danger" onclick="showDeleteConfirmation('${deviceId}')">
                        <i class="fas fa-trash-alt"></i> Delete Device
                    </button>
                </div>
            `;

    deviceDetailsModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// ============================================
// REPAIR HISTORY & FAILURE REPORTS MODAL
// ============================================
async function showRepairHistory(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    const repairHistory = await loadRepairHistory(deviceId);

    let historyContent = '';

    if (device.failureReport) {
        historyContent += `
                    <div class="failure-report-item">
                        <div class="repair-history-header">
                            <div class="repair-history-date">
                                <i class="fas fa-exclamation-triangle"></i> ${device.failureReport.date || 'Unknown Date'}
                            </div>
                            <div class="repair-history-technician">
                                <i class="fas fa-user-check"></i> ${device.failureReport.reportedBy || 'Unknown'}
                            </div>
                        </div>
                        <div class="repair-history-notes">
                            <strong>Failure Report:</strong> ${device.failureReport.reason || 'No reason provided'}
                        </div>
                        <div class="repair-history-notes" style="margin-top: 5px;">
                            <strong>Priority:</strong> ${device.failureReport.priority ? device.failureReport.priority.charAt(0).toUpperCase() + device.failureReport.priority.slice(1) : 'Medium'}
                        </div>
                    </div>
                `;
    }

    if (repairHistory.length > 0) {
        historyContent += repairHistory.map(repair => `
                    <div class="repair-history-item">
                        <div class="repair-history-header">
                            <div class="repair-history-date">
                                <i class="fas fa-calendar-alt"></i> ${repair.date}
                            </div>
                            <div class="repair-history-technician">
                                <i class="fas fa-user-check"></i> ${repair.repairedBy}
                            </div>
                        </div>
                        <div class="repair-history-notes">
                            <strong>Repair Notes:</strong> ${repair.notes || 'No notes provided'}
                        </div>
                    </div>
                `).join('');
    }

    if (!device.failureReport && repairHistory.length === 0) {
        historyContent = `
                    <div style="text-align: center; padding: 40px; color: var(--text-gray);">
                        <i class="fas fa-history" style="font-size: 48px; margin-bottom: 15px;"></i>
                        <h4>No History Found</h4>
                        <p>This device has no recorded repair history or failure reports</p>
                    </div>
                `;
    }

    document.getElementById('repairHistoryModalContent').innerHTML = `
                <div style="padding: 20px;">
                    <div style="background: var(--secondary-light); padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid var(--primary-color);">
                        <p><strong>Device:</strong> ${device.pcNumber} - ${getDeviceModel(device)}</p>
                        <p><strong>Department:</strong> ${device.department}</p>
                        <p><strong>Status:</strong> ${device.status}</p>
                        <p><strong>Total Records:</strong> ${(device.failureReport ? 1 : 0) + repairHistory.length}</p>
                    </div>
                    
                    <h4 style="color: var(--primary-color); margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-tools"></i> Repair History & Failure Reports
                    </h4>
                    
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${historyContent}
                    </div>
                    
                    <div class="action-buttons" style="margin-top: 25px;">
                        <button class="btn btn-primary" id="closeRepairHistoryBtn">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </div>
            `;

    repairHistoryModal.style.display = 'flex';

    document.getElementById('closeRepairHistoryBtn').addEventListener('click', function () {
        repairHistoryModal.style.display = 'none';
    });
}

// ============================================
// ESC KEY SUPPORT FOR MODALS
// ============================================
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
        if (deviceDetailsModal.style.display === 'flex') {
            deviceDetailsModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        if (deleteModal.style.display === 'flex') {
            deleteModal.style.display = 'none';
        }
        if (markFixedModal.style.display === 'flex') {
            markFixedModal.style.display = 'none';
        }
        if (repairHistoryModal.style.display === 'flex') {
            repairHistoryModal.style.display = 'none';
        }
    }
});

// ============================================
// MARK AS FIXED MODAL
// ============================================
function showMarkFixedModal(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    currentDeviceId = deviceId;

    document.getElementById('markFixedModalContent').innerHTML = `
                <div style="padding: 20px;">
                    <p>Mark device as fixed:</p>
                    <div style="background: var(--secondary-light); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid var(--primary-color);">
                        <p><strong>Device Number:</strong> ${device.pcNumber}</p>
                        <p><strong>Model:</strong> ${getDeviceModel(device)}</p>
                        <p><strong>Department:</strong> ${device.department}</p>
                        <p><strong>Failure Reason:</strong> ${device.failureReport?.reason?.substring(0, 100) || 'No reason provided'}...</p>
                    </div>
                    
                    <div class="form-group">
                        <label for="fixedBy"><i class="fas fa-user-check"></i> Fixed By *</label>
                        <select id="fixedBy" required>
                            <option value="">Select Technician</option>
                            ${currentSite.technicians.map(tech => `<option value="${tech}">${tech}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="fixNotes"><i class="fas fa-comment-medical"></i> Fix Notes *</label>
                        <textarea id="fixNotes" rows="3" placeholder="Describe what was fixed..." required></textarea>
                    </div>
                    
                    <div class="action-buttons" style="margin-top: 25px;">
                        <button class="btn btn-success" id="confirmMarkFixedBtn">
                            <i class="fas fa-wrench"></i> Mark as Fixed
                        </button>
                        <button class="btn btn-warning" id="cancelMarkFixedBtn">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            `;

    markFixedModal.style.display = 'flex';

    document.getElementById('confirmMarkFixedBtn').addEventListener('click', async function () {
        await markDeviceAsFixed(currentDeviceId);
        markFixedModal.style.display = 'none';
        deviceDetailsModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    document.getElementById('cancelMarkFixedBtn').addEventListener('click', function () {
        markFixedModal.style.display = 'none';
    });
}

async function markDeviceAsFixed(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    const fixedBy = document.getElementById('fixedBy').value;
    const fixNotes = document.getElementById('fixNotes').value;

    if (!fixedBy || !fixNotes) {
        alert('Please fill in all required fields');
        return;
    }

    const repairData = {
        date: formatDateTime(getSriLankaTime()),
        repairedBy: fixedBy,
        notes: fixNotes,
        status: 'fixed'
    };

    try {
        await addRepairHistoryEntry(deviceId, repairData);

        const success = await updateDeviceInFirebase(deviceId, {
            status: 'active',
            fixedBy: fixedBy,
            fixNotes: fixNotes,
            fixedDate: new Date().toISOString().split('T')[0],
            lastRepairDate: repairData.date,
            lastRepairBy: fixedBy,
            lastRepairNotes: fixNotes
        });

        if (success) {
            const deviceModel = getDeviceModel(device);
            await addLogEntry('Device Fixed',
                `${device.pcNumber} (${deviceModel}) marked as fixed by ${fixedBy}. Notes: ${fixNotes}`);
        }
    } catch (error) {
        console.error("Error marking device as fixed:", error);
    }
}

// ============================================
// EDIT DEVICE
// ============================================
function editDevice(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    currentDeviceId = deviceId;
    isEditMode = true;

    document.getElementById('pcNumber').value = device.pcNumber || '';
    document.getElementById('pcModel').value = device.pcModel || '';
    document.getElementById('pcSerial').value = device.pcSerial || '';
    document.getElementById('department').value = device.department || '';
    document.getElementById('userName').value = device.userName || '';
    document.getElementById('status').value = device.status || 'active';
    document.getElementById('cpu').value = device.cpu || '';
    document.getElementById('gpu').value = device.gpu || '';
    document.getElementById('ram').value = device.ram || '';
    document.getElementById('storage').value = device.storage || '';

    networkInterfacesList.innerHTML = '';
    if (device.networkInterfaces && device.networkInterfaces.length > 0) {
        device.networkInterfaces.forEach((iface, index) => {
            const interfaceElement = createNetworkInterfaceElement(iface, index);
            networkInterfacesList.appendChild(interfaceElement);
        });
    } else {
        const defaultInterface = createNetworkInterfaceElement({
            id: 'default-interface',
            interfaceName: 'Primary Interface',
            ipAddress: device.ipAddress || '',
            subnetMask: device.subnetMask || '255.255.255.0',
            gateway: device.gateway || '',
            type: 'ethernet'
        }, 0);
        networkInterfacesList.appendChild(defaultInterface);
    }

    monitorsList.innerHTML = '';
    if (device.monitors && device.monitors.length > 0) {
        device.monitors.forEach((monitor, index) => {
            const monitorElement = createMonitorElement(monitor, index);
            monitorsList.appendChild(monitorElement);
        });
    } else {
        const defaultMonitor = createMonitorElement({
            id: 'default-monitor',
            model: '',
            serial: ''
        }, 0);
        monitorsList.appendChild(defaultMonitor);
    }

    softwareLicensesList.innerHTML = '';
    if (device.softwareLicenses && device.softwareLicenses.length > 0) {
        device.softwareLicenses.forEach((software, index) => {
            const softwareElement = createSoftwareLicenseElement(software, index);
            softwareLicensesList.appendChild(softwareElement);
        });
    } else {
        const defaultSoftware = createSoftwareLicenseElement({
            id: 'default-software',
            name: 'Operating System'
        }, 0);
        softwareLicensesList.appendChild(defaultSoftware);
    }

    sidebarItems.forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="addDevice"]').classList.add('active');

    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === 'addDevice') {
            section.classList.add('active');
            document.querySelector('#addDevice h2').innerHTML = '<i class="fas fa-edit"></i> Edit Device';
            document.getElementById('pcNumber').focus();
        }
    });

    deviceDetailsModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// ============================================
// DELETE DEVICE
// ============================================
function showDeleteConfirmation(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    currentDeviceId = deviceId;

    document.getElementById('deleteModalContent').innerHTML = `
                <div style="padding: 20px;">
                    <p>Are you sure you want to delete this device?</p>
                    <div style="background: var(--secondary-light); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid var(--danger-color);">
                        <p><strong>Device Number:</strong> ${device.pcNumber}</p>
                        <p><strong>Model:</strong> ${getDeviceModel(device)}</p>
                        <p><strong>Department:</strong> ${device.department}</p>
                        <p><strong>User:</strong> ${device.userName || 'N/A'}</p>
                    </div>
                    <p style="color: var(--danger-color); font-weight: 600; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-exclamation-triangle"></i> This action cannot be undone!
                    </p>
                    <div class="action-buttons" style="margin-top: 25px;">
                        <button class="btn btn-danger" id="confirmDeleteBtn">
                            <i class="fas fa-trash-alt"></i> Delete Device
                        </button>
                        <button class="btn btn-warning" id="cancelDeleteBtn">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            `;

    deleteModal.style.display = 'flex';

    document.getElementById('confirmDeleteBtn').addEventListener('click', async function () {
        await deleteDevice(currentDeviceId);
        deleteModal.style.display = 'none';
        deviceDetailsModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    document.getElementById('cancelDeleteBtn').addEventListener('click', function () {
        deleteModal.style.display = 'none';
    });
}

async function deleteDevice(deviceId) {
    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) return;

    try {
        const success = await deleteDeviceFromFirebase(deviceId);

        if (success) {
            const deviceModel = getDeviceModel(device);
            await addLogEntry('Device Deleted',
                `Deleted ${device.pcNumber} (${deviceModel}) from ${device.department}`);
        }
    } catch (error) {
        console.error("Error deleting device:", error);
    }
}

// ============================================
// FORM SUBMISSIONS
// ============================================
deviceForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    saveDeviceBtn.disabled = true;
    saveDeviceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const networkInterfaces = collectNetworkInterfacesData();
    const softwareLicenses = collectSoftwareLicensesData();
    const monitors = collectMonitorsData();

    const deviceData = {
        pcNumber: document.getElementById('pcNumber').value.trim(),
        pcModel: document.getElementById('pcModel').value.trim(),
        pcSerial: document.getElementById('pcSerial').value.trim(),
        department: document.getElementById('department').value,
        userName: document.getElementById('userName').value.trim(),
        status: document.getElementById('status').value,
        networkInterfaces: networkInterfaces,
        softwareLicenses: softwareLicenses,
        monitors: monitors,
        site: currentSite.name
    };

    deviceData.cpu = document.getElementById('cpu').value.trim();
    deviceData.gpu = document.getElementById('gpu').value.trim();
    deviceData.ram = document.getElementById('ram').value.trim();
    deviceData.storage = document.getElementById('storage').value.trim();

    if (networkInterfaces.length > 0) {
        deviceData.ipAddress = networkInterfaces[0].ipAddress || '';
        deviceData.subnetMask = networkInterfaces[0].subnetMask || '';
        deviceData.gateway = networkInterfaces[0].gateway || '';
    }

    try {
        if (isEditMode) {
            const success = await updateDeviceInFirebase(currentDeviceId, deviceData);

            if (success) {
                const deviceModel = getDeviceModel(deviceData);
                await addLogEntry('Device Edited',
                    `Updated ${deviceData.pcNumber} (${deviceModel})`);
            }
        } else {
            const newDeviceId = await saveDeviceToFirebase(deviceData);

            if (newDeviceId) {
                const deviceModel = getDeviceModel(deviceData);
                await addLogEntry('Device Added',
                    `Added ${deviceData.pcNumber} (${deviceModel}) to ${deviceData.department}`);
            }
        }

        sidebarItems.forEach(i => i.classList.remove('active'));
        document.querySelector('[data-section="inventory"]').classList.add('active');

        sections.forEach(section => {
            section.classList.remove('active');
            if (section.id === 'inventory') {
                section.classList.add('active');
            }
        });

        resetForm();

    } catch (error) {
        console.error("Error saving device:", error);
        alert("Error saving device: " + error.message);
    } finally {
        saveDeviceBtn.disabled = false;
        saveDeviceBtn.innerHTML = '<i class="fas fa-save"></i> Save Device';
    }
});

failureReportForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    reportFailureBtn.disabled = true;
    reportFailureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reporting...';

    const deviceId = failureDevice.value;
    const reason = document.getElementById('failureReason').value.trim();
    const date = document.getElementById('failureDate').value;
    const reportedBy = document.getElementById('reportedBy').value;
    const priority = document.getElementById('failurePriority').value;

    if (!deviceId || !reason || !date || !reportedBy) {
        reportFailureBtn.disabled = false;
        reportFailureBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Report Failure';
        return;
    }

    const device = inventoryData.find(d => d.id === deviceId);
    if (!device) {
        reportFailureBtn.disabled = false;
        reportFailureBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Report Failure';
        return;
    }

    try {
        const success = await updateDeviceInFirebase(deviceId, {
            status: 'failed',
            failureReport: {
                reason: reason,
                date: date,
                reportedBy: reportedBy,
                priority: priority
            }
        });

        if (success) {
            const deviceModel = getDeviceModel(device);
            await addLogEntry('Device Failure Reported',
                `${device.pcNumber} marked as failed. Reason: ${reason} (Priority: ${priority})`);

            failureReportForm.reset();
            document.getElementById('failureDate').valueAsDate = new Date();

            sidebarItems.forEach(i => i.classList.remove('active'));
            document.querySelector('[data-section="failedDevices"]').classList.add('active');

            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === 'failedDevices') {
                    section.classList.add('active');
                }
            });
        }
    } catch (error) {
        console.error("Error reporting failure:", error);
    } finally {
        reportFailureBtn.disabled = false;
        reportFailureBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Report Failure';
    }
});

replaceDeviceForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    replaceDeviceBtn.disabled = true;
    replaceDeviceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Replacing...';

    const oldDeviceId = replaceDeviceSelect.value;
    const newPcNumber = document.getElementById('replacementPcNumber').value.trim();
    const newPcModel = document.getElementById('replacementPcModel').value.trim();
    const newSerial = document.getElementById('replacementSerial').value.trim();
    const replacementDate = document.getElementById('replacementDate').value;
    const reason = document.getElementById('replacementReason').value.trim();
    const replacedBy = document.getElementById('replacedBy').value;

    if (!oldDeviceId || !newPcNumber || !newPcModel || !newSerial || !replacementDate || !replacedBy) {
        replaceDeviceBtn.disabled = false;
        replaceDeviceBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Replace Device';
        return;
    }

    const oldDevice = inventoryData.find(d => d.id === oldDeviceId);
    if (!oldDevice) {
        replaceDeviceBtn.disabled = false;
        replaceDeviceBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Replace Device';
        return;
    }

    try {
        const success1 = await updateDeviceInFirebase(oldDeviceId, {
            status: 'replaced',
            replacedBy: replacedBy,
            replacementDate: replacementDate,
            replacementReason: reason
        });

        const newDeviceData = {
            pcNumber: newPcNumber,
            pcModel: newPcModel,
            pcSerial: newSerial,
            department: oldDevice.department || '',
            userName: oldDevice.userName || '',
            status: 'active',
            replacedFrom: oldDeviceId,
            networkInterfaces: oldDevice.networkInterfaces || [],
            softwareLicenses: oldDevice.softwareLicenses || [],
            monitors: oldDevice.monitors || [],
            site: currentSite.name
        };

        newDeviceData.cpu = oldDevice.cpu || '';
        newDeviceData.gpu = oldDevice.gpu || '';
        newDeviceData.ram = oldDevice.ram || '';
        newDeviceData.storage = oldDevice.storage || '';

        const newDeviceId = await saveDeviceToFirebase(newDeviceData);

        if (success1 && newDeviceId) {
            const oldDeviceModel = getDeviceModel(oldDevice);
            await addLogEntry('Device Replaced',
                `${oldDevice.pcNumber} replaced with ${newPcNumber}. Reason: ${reason || 'Not specified'}`);

            replaceDeviceForm.reset();
            document.getElementById('replacementDate').valueAsDate = new Date();

            sidebarItems.forEach(i => i.classList.remove('active'));
            document.querySelector('[data-section="inventory"]').classList.add('active');

            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === 'inventory') {
                    section.classList.add('active');
                }
            });
        }
    } catch (error) {
        console.error("Error replacing device:", error);
    } finally {
        replaceDeviceBtn.disabled = false;
        replaceDeviceBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Replace Device';
    }
});

// ============================================
// LOGS FUNCTIONS
// ============================================
function loadLogs() {
    const searchTerm = logSearchBox.value.toLowerCase();
    const logType = logTypeFilter.value;

    let filteredLogs = activityLogs.filter(log => {
        const matchesSearch =
            (log.action && log.action.toLowerCase().includes(searchTerm)) ||
            (log.details && log.details.toLowerCase().includes(searchTerm)) ||
            (log.user && log.user.toLowerCase().includes(searchTerm));

        const matchesType = !logType || log.action === logType;

        return matchesSearch && matchesType;
    });

    logsContainer.innerHTML = '';

    if (filteredLogs.length === 0) {
        logsContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-gray);">
                        <i class="fas fa-history" style="font-size: 48px; margin-bottom: 15px;"></i>
                        <h4>No activity logs found</h4>
                        <p>Perform some actions in the system to see logs here</p>
                    </div>
                `;
        return;
    }

    filteredLogs.forEach(log => {
        let icon = 'fas fa-info-circle';
        if (log.action.includes('Login')) icon = 'fas fa-sign-in-alt';
        else if (log.action.includes('Added')) icon = 'fas fa-plus-circle';
        else if (log.action.includes('Edited')) icon = 'fas fa-edit';
        else if (log.action.includes('Deleted')) icon = 'fas fa-trash-alt';
        else if (log.action.includes('Failure')) icon = 'fas fa-exclamation-triangle';
        else if (log.action.includes('Fixed')) icon = 'fas fa-wrench';
        else if (log.action.includes('Replaced')) icon = 'fas fa-exchange-alt';
        else if (log.action.includes('Excel Import')) icon = 'fas fa-file-import';
        else if (log.action.includes('Excel Export')) icon = 'fas fa-file-export';

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
                    <div class="log-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="log-content">
                        <div class="log-timestamp">${log.timestamp}</div>
                        <div class="log-action">${log.action} (${log.site})</div>
                        <div class="log-details">${log.details}</div>
                        <div class="log-details" style="font-size: 12px; color: var(--text-gray); margin-top: 5px;">
                            <i class="fas fa-user"></i> ${log.user}
                        </div>
                    </div>
                `;
        logsContainer.appendChild(logEntry);
    });
}

async function addLogEntry(action, details) {
    const timestamp = formatSriLankaTimestamp(getSriLankaTime());

    const logEntry = {
        timestamp: timestamp,
        action: action,
        details: details,
        user: currentUser,
        site: currentSite.name
    };

    console.log("📝 Adding log entry:", action, details, "at", timestamp);

    await addLogToFirebase(logEntry);

    activityLogs.unshift({
        id: 'temp-' + Date.now(),
        timestamp: timestamp,
        action: action,
        details: details,
        user: currentUser,
        site: currentSite.name
    });

    if (document.getElementById('logs').classList.contains('active')) {
        loadLogs();
    }
}

// ============================================
// RESET FORM
// ============================================
function resetForm() {
    deviceForm.reset();
    isEditMode = false;
    currentDeviceId = null;
    document.querySelector('#addDevice h2').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Device';
    document.getElementById('department').value = '';
    document.getElementById('status').value = 'active';
    document.getElementById('cpu').value = '';
    document.getElementById('gpu').value = '';
    document.getElementById('ram').value = '';
    document.getElementById('storage').value = '';
    addDefaultNetworkInterface();
    addDefaultMonitor();
    addDefaultSoftwareLicense();
}

// ============================================
// EVENT LISTENERS
// ============================================
addNewBtn.addEventListener('click', function () {
    sidebarItems.forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="addDevice"]').classList.add('active');

    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === 'addDevice') {
            section.classList.add('active');
            resetForm();
            document.getElementById('pcNumber').focus();
        }
    });
});

cancelBtn.addEventListener('click', function () {
    sidebarItems.forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="inventory"]').classList.add('active');

    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === 'inventory') {
            section.classList.add('active');
        }
    });
});

cancelFailureBtn.addEventListener('click', function () {
    sidebarItems.forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="inventory"]').classList.add('active');

    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === 'inventory') {
            section.classList.add('active');
        }
    });
});

cancelReplaceFormBtn.addEventListener('click', function () {
    sidebarItems.forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="inventory"]').classList.add('active');

    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === 'inventory') {
            section.classList.add('active');
        }
    });
});

searchBox.addEventListener('input', loadInventoryTable);
departmentFilter.addEventListener('change', loadInventoryTable);
failedSearchBox.addEventListener('input', loadFailedDevicesTable);
failedPriorityFilter.addEventListener('change', loadFailedDevicesTable);
logSearchBox.addEventListener('input', loadLogs);
logTypeFilter.addEventListener('change', loadLogs);

refreshBtn.addEventListener('click', async function () {
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    await loadInventoryFromFirebase();
    this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
});

refreshFailedBtn.addEventListener('click', async function () {
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    await loadInventoryFromFirebase();
    this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
});

refreshLogsBtn.addEventListener('click', async function () {
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    if (logsUnsubscribe) {
        logsUnsubscribe();
    }
    startRealTimeLogs();
    this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
});

closeDetailsModal.addEventListener('click', function () {
    deviceDetailsModal.style.display = 'none';
    document.body.style.overflow = 'auto';
});

closeDeleteModal.addEventListener('click', function () {
    deleteModal.style.display = 'none';
});

closeMarkFixedModal.addEventListener('click', function () {
    markFixedModal.style.display = 'none';
});

closeRepairHistoryModal.addEventListener('click', function () {
    repairHistoryModal.style.display = 'none';
});

window.addEventListener('click', function (e) {
    if (e.target === deviceDetailsModal) {
        deviceDetailsModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    if (e.target === deleteModal) deleteModal.style.display = 'none';
    if (e.target === markFixedModal) markFixedModal.style.display = 'none';
    if (e.target === repairHistoryModal) repairHistoryModal.style.display = 'none';
});

viewDiagramBtn.addEventListener('click', function () {
    if (currentSite) {
        window.open(currentSite.networkDiagram, '_blank');
    }
});

addNetworkInterfaceBtn.addEventListener('click', function () {
    const interfaceCount = document.querySelectorAll('.network-interface').length;
    const newInterface = createNetworkInterfaceElement(null, interfaceCount);
    networkInterfacesList.appendChild(newInterface);

    newInterface.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

addMonitorBtn.addEventListener('click', function () {
    const monitorCount = document.querySelectorAll('.monitor-entry').length;
    const newMonitor = createMonitorElement(null, monitorCount);
    monitorsList.appendChild(newMonitor);

    newMonitor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

addSoftwareLicenseBtn.addEventListener('click', function () {
    const softwareCount = document.querySelectorAll('.software-license').length;
    const newSoftware = createSoftwareLicenseElement(null, softwareCount);
    softwareLicensesList.appendChild(newSoftware);

    newSoftware.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ============================================
// PASSWORD CHANGE FUNCTIONALITY
// ============================================
if (passwordChangeForm) {
    passwordChangeForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const user = auth.currentUser;

        if (!newPassword || !confirmPassword) {
            showPasswordError('Please fill in all fields');
            return;
        }

        if (newPassword !== confirmPassword) {
            showPasswordError('Passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            showPasswordError('Password must be at least 6 characters');
            return;
        }

        const submitBtn = this.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        submitBtn.disabled = true;
        passwordChangeError.style.display = 'none';

        try {
            // 1. Update password in Firebase Auth
            await user.updatePassword(newPassword);
            console.log("✅ Password updated in Auth");

            // 2. Update flag in Firestore
            await db.collection('users').doc(user.uid).set({
                username: currentUser,
                needsPasswordChange: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log("✅ User record updated in Firestore");

            // 3. Close modal and transition to site selection
            passwordChangeModal.style.display = 'none';

            if (loginPage.style.display !== 'none') {
                loginPage.style.animation = 'slideOut 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
                setTimeout(() => {
                    loginPage.style.display = 'none';
                    siteSelectionPage.style.display = 'flex';
                    siteSelectionPage.style.animation = 'slideIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
                }, 800);
            }

        } catch (error) {
            console.error("❌ Password change error:", error);
            let message = "Error updating password. Please try again.";
            if (error.code === 'auth/requires-recent-login') {
                message = "Session expired. Please log in again.";
                setTimeout(() => auth.signOut(), 2000);
            }
            showPasswordError(message);
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

function showPasswordError(message) {
    passwordChangeError.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    passwordChangeError.style.display = 'block';
}

// ============================================
// SIDEBAR FUNCTIONALITY
// ============================================
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
        sidebar.classList.toggle('minimized');
        const isMinimized = sidebar.classList.contains('minimized');
        localStorage.setItem('sidebarMinimized', isMinimized);

        // Update toggle icon
        const icon = sidebarToggle.querySelector('i');
        if (isMinimized) {
            icon.className = 'fas fa-chevron-right';
        } else {
            icon.className = 'fas fa-bars';
        }
    });
}

// Restore sidebar state
function restoreSidebarState() {
    const isMinimized = localStorage.getItem('sidebarMinimized') === 'true';
    if (isMinimized && sidebar) {
        sidebar.classList.add('minimized');
        const icon = sidebarToggle.querySelector('i');
        if (icon) icon.className = 'fas fa-chevron-right';
    }
}

// ============================================
// INITIALIZATION
// ============================================
passwordInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') loginBtn.click();
});

usernameInput.addEventListener('input', function () {
    this.style.borderColor = "#D1DDDE";
    loginError.style.display = 'none';
});

passwordInput.addEventListener('input', function () {
    this.style.borderColor = "#D1DDDE";
    loginError.style.display = 'none';
});

// Run initialization
document.addEventListener('DOMContentLoaded', async function () {
    restoreSidebarState();
    const today = new Date();
    document.getElementById('failureDate').valueAsDate = today;
    document.getElementById('replacementDate').valueAsDate = today;

    console.log("🚀 IT Management Interface Initialized");
    console.log("🎨 Theme: WTC Teal Theme (Both Sites)");
    console.log("🌐 Timezone: Sri Lanka Time (Local Browser Time)");
    console.log("🔗 Firebase Project: inventory-3650f");
    console.log("📊 Excel Support: Import/Export with SheetJS - Single Sheet Only");
    console.log("⚡ Features: Multi-site, Excel Import/Export, Switch Site");
    console.log("📝 Activity Logs: Site-specific logging enabled");
    console.log("⌨️ Enter Key Navigation: Enabled for forms");
    console.log("🔍 Search: Searches all device serials, monitor serials, and license keys");
    console.log("📄 Excel Format: All data in single sheet named 'Devices'");

    const currentTime = getSriLankaTime();
    console.log("🕒 Current Sri Lanka Time:", formatSriLankaTimestamp(currentTime));

    for (let i = 0; i < 5; i++) {
        const animation = document.createElement('div');
        animation.className = 'login-animation';
        animation.style.width = Math.random() * 80 + 40 + 'px';
        animation.style.height = animation.style.width;
        animation.style.top = Math.random() * 100 + '%';
        animation.style.left = Math.random() * 100 + '%';
        animation.style.animationDelay = Math.random() * 10 + 's';
        loginPage.appendChild(animation);
    }

    usernameInput.focus();
});
