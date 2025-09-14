import { getPublicKey, getSharedSecret, utils } from "https://esm.sh/@noble/secp256k1@2.0.0";
import { Buffer } from 'https://esm.sh/buffer@6.0.3';

// Functions to run when the site loads
document.addEventListener("DOMContentLoaded", () => {
    loadPage();
    loadCurrentUser();
    loadDBFiles();
    loadUploadedFiles();
    keepRecurring(() => { loadRecievedFiles(), loadUploadedFiles();}, () => dbFiles.length > 0, 2);
  });

// Fallback curve order for secp256k1
const SECP256K1_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

// Modular reduction for Uint8Array
function modBigInt(bytes, modulus) {
    const hex = toHex(bytes);
    const value = BigInt('0x' + hex);
    return value % modulus;
}

// Pages
const dashboardPage = document.querySelector(".dashboard");
const sendPageMain = document.querySelector(".send");
const uploadPageMain = document.querySelector(".upload-page");
const profilePage = document.querySelector(".profile-page");
const popup = document.getElementById("popup");

// Lists?
const uploadList = document.querySelector(".upload-list");
const recievedList = document.querySelector(".recieved-list");

const uploadArea = document.querySelector(".upload");
const uploadArea2 = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const fileInput2 = document.getElementById("fileInput2");
const progress = document.querySelector(".upload-progress");
const selectedFilesList = document.getElementById("files-list");
const selectedFilesList2 = document.getElementById("files-list2");

const uploadHT = document.querySelectorAll(".upload-ht");

const userKeyInput = document.getElementById("userKey");
const userKeyInputUpload = document.getElementById("userKeyUpload");
const userNameInput = document.getElementById("userName");
const sendNote = document.getElementById("file-note-send");
const uploadNote = document.getElementById("file-note-upload");

// Buttons
const sendBtn = document.getElementById("sendBtn");
const uploadBtn = document.getElementById("uploadBtn");
const passwordEntry = document.getElementById("login-password-popup");
const passwordPopup = passwordEntry.value.trim();

// Dock Buttons
const dashboardPageBtn = document.getElementById("dashboard-page-btn");
const uploadPageBtn = document.getElementById("upload-page-btn");
const sendPageBtn = document.getElementById("send-page-btn");
const profilePageBtn = document.getElementById("profile-page-btn");

let selectedFiles = []; // [{ name, size, arrayBuffer }]

// Current User
let currentUser;

function loadCurrentUser() {
    currentUser = JSON.parse(localStorage.getItem("currentUser"));
}

// No of uploaded and sent files
let noOfUploadedFiles, noOfRecievedFiles;

// Recursive function to ensure that the functions to load files only work after the files have been loaded
// It's probably inefficient but as long as it works I can worry about efficiency later
function keepRecurring(func, condition, time) {
    if (condition()) {
        func();
    } else {
        console.log("Waiting to retry again");
        setTimeout(() => keepRecurring(func, condition, time), time * 1000);
    }
}


// Manage Page State
const state = {
    dashboard: true,
    sendPage: false,
    uploadPage: false,
    profile: false,
    fDashboard: function() { this.dashboard = true; this.sendPage = false; this.uploadPage = false; this.profile = false; },
    fSendPage: function() { this.dashboard = false; this.sendPage = true; this.uploadPage = false; this.profile = false; },
    fUploadPage: function() { this.dashboard = false; this.sendPage = false; this.uploadPage = true; this.profile = false; },
    fProfile: function() { this.dashboard = false; this.sendPage = false; this.uploadPage = false; this.profile = true; }
}

// Load all files
let dbFiles = [];
function loadDBFiles() {
    if(!currentUser.username) return alert("No User Found, Try loggin in again.")
 fetch(`http://127.0.0.1:5000/${currentUser.username}`)
  .then(response => {
    if (!response.ok) {
      throw new Error("Failed to fetch files.");
    }
    return response.json();
  })
  .then(data => {
    dbFiles = data;
  })
  .catch(error => {
    console.error("Error fetching files:", error);
  });
}

// Handle downloaded files
let dlbtn = {};
let delbtn = {}

let downloadedFiles = [];

// Function to download a file
function downloadFile(fileId, passwordParam) {
    console.log("This is the file id: ", fileId);
    if(!currentUser.username) return alert("No User Found, Try loggin in again.")
    fetch(`http://127.0.0.1:5000/${currentUser.username}/${fileId}`)
    .then(response => {
        if (!response.ok) {
        throw new Error("Failed to fetch files.");
        }
        return response.json();
    })
    .then(data => {
        downloadedFiles.push(data); 
        decryptData(fileId, passwordParam);
    })
    .catch(error => {
        console.error("Error fetching files:", error);
    });
}

// Function to delete a file
async function deleteFile(fileId) {
    let fileData = dbFiles.find(m => m.id === fileId);
    let fileName = fileData?.name;

    const payload = {
        id: fileId,
        name: fileName,
        current_user: currentUser.username
    };

    console.log("Sending this payload: ", payload)

    const response = await fetch("http://127.0.0.1:5000/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.success) {
        alert('File has been deleted successfully');
        state.fDashboard();
        loadPage();
        loadDBFiles();
        loadRecievedFiles();
        loadUploadedFiles();
    }

    if (!data.success) {
        alert("File couldn't be deleted");
        console.log(data.message);
    }
}

// Create file element
function createFileElement(location, fileName, id, fileSize) {
    const file = document.createElement("div");
    file.className = "file";
    file.innerHTML =    `<div>
                            <div class="file-list-name">${fileName}</div>
                            <div class="file-list-size">${fileSize} MB</div>
                        </div>
                        <div class="buttons">
                            <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="trash-icon" id="deleteBtn-${id}">
                                <path d="M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6M14 10V17M10 10V17" stroke="#ff0000ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="download-file" id="downloadBtn-${id}">
                                <g id="Interface / Download">
                                    <path id="Vector" d="M6 21H18M12 3V17M12 17L17 12M12 17L7 12" stroke="#6495ed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </g>
                            </svg>
                        `; // I removed this line    <p class="download-file" id="downloadBtn-${id}" >download</p>
    location.append(file);
    dlbtn[`${id}`] = document.getElementById(`downloadBtn-${id}`);
    delbtn[`${id}`] = document.getElementById(`deleteBtn-${id}`);
    dlbtn[`${id}`].addEventListener("click", (e) => {
        showPopup(id)
    })
    delbtn[`${id}`].addEventListener("click", (e) => {
        showPopup(id, true)
    })
}

// Function to check password
async function checkPass(passwordParam, idParam, doWhat='download') {
    const payload = {
        username: currentUser.username,
        password: passwordParam
    };

    const response = await fetch("http://127.0.0.1:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.success) {
        if(doWhat == 'download') {
            downloadFile(idParam, passwordParam);
        }
        if(doWhat == 'delete') {
            deleteFile(idParam);
        }

    } else {
        return alert(`An error occurred, please try again`);
    }
}

// Function to show/hide popup
async function showPopup(idParam, delFile=false) {
    popup.style.display = 'flex';
    let passBtn = document.getElementById("passBtn");
    
    if (!delFile) {
        passBtn.addEventListener("click", () => {
        const currentPassword = document.getElementById("login-password-popup").value.trim();
        
        hidePopup();
        checkPass(currentPassword, idParam); // Pass the latest value
     });
    }

    if (delFile) {
        console.log("Deleting files... not really, this is just a test");
        passBtn.addEventListener("click", () => {
        const currentPassword = document.getElementById("login-password-popup").value.trim();
        
        hidePopup();
        checkPass(currentPassword, idParam, 'delete');
     });
    }
}

async function hidePopup() {
    popup.style.display = "none";
}

// Load Uploaded Files 
function loadUploadedFiles() {
    loadDBFiles(); // load the database before loading the uploaded files
    console.log(dbFiles);
    uploadList.innerHTML = ''; // Clear existing content
    let uploadedDbFiles = dbFiles.filter(f => f.tag == "uploaded");
    noOfUploadedFiles = uploadedDbFiles.length;
    for (const file of uploadedDbFiles) {
        createFileElement(uploadList, file.name, file.id, file.sizeInMB);
    }
}

// Load Recived Files
function loadRecievedFiles() {
    recievedList.innerHTML = ''; // Clear existing content
    let recievedDbFiles = dbFiles.filter(f => f.tag == "recieved");
    if(recievedDbFiles.length == 'undefined') { noOfRecievedFiles = 0;} else {noOfRecievedFiles = recievedDbFiles.length;}
    for (const file of recievedDbFiles) {
        createFileElement(recievedList, file.name, file.id, file.sizeInMB);
    }
}
// Function to decrypt data
async function decryptData(idParam, passwordParam) {
    console.log("Trying to decrypt the data...")
    let data = downloadedFiles.filter(x => x.id == idParam)[0];
    console.log("This is the encrypted data: ", data);
    let privateKey = await passwordToPrivateKeyandPublicKey(currentUser.username, passwordParam,'priv');
    let decryptedAESKey = window.decryptWithPrivKey(privateKey, data.encryptedAESKey);
    decryptFileData(data.encrypted, data.iv, decryptedAESKey, data.name);
}

async function sanitizeEncryptionKeyDecrypt(params) {
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                "raw",
                encoder.encode(params),
                "PBKDF2",
                false,
                ["deriveKey"]
            );
            return crypto.subtle.deriveKey(
                {
                    name: "PBKDF2",
                    salt: encoder.encode("static-salt"),
                    iterations: 100000,
                    hash: "SHA-256",
                },
                keyMaterial,
                {
                    name: "AES-GCM",
                    length: 256,
                },
                true,
                ["decrypt"]
            );
        }

async function decryptFileData(encryptedBase64, ivBase64, keyInput, fileName) {
            try {
                // Validate inputs
                if (!keyInput) throw new Error("Key input is required");
                if (!encryptedBase64) throw new Error("Encrypted data is required");
                if (!ivBase64) throw new Error("IV is required");

                // Derive AES key from input
                const aesKey = await sanitizeEncryptionKeyDecrypt(keyInput);

                // Decode base64 inputs
                const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
                const iv = Buffer.from(ivBase64, 'base64');
                console.log("Encrypted bytes:", encryptedBuffer);
                console.log("IV bytes:", iv);

                // Validate IV
                if (iv.length !== 12) throw new Error("IV must be 12 bytes");

                // Decrypt data
                const decrypted = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv },
                    aesKey,
                    encryptedBuffer
                );

                // Download decrypted file
                const mimeType = fileName.endsWith('.txt') ? 'text/plain' : fileName.endsWith('.png') ? 'image/png' : 'application/octet-stream';
                const blob = new Blob([decrypted], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);

                return new Uint8Array(decrypted);
            } catch (error) {
                console.error("Decryption error:", error);
                throw error;
            }
        }

// Function to load page, gotten from page state
function loadPage() {
    if (state.dashboard === true) {
        dashboardPage.style.display = "grid";
        sendPageMain.style.display = "none";
        uploadPageMain.style.display = 'none';
        profilePage.style.display = "none";
    };

    if (state.sendPage === true) {
        dashboardPage.style.display = "none";
        sendPageMain.style.display = "flex";
        uploadPageMain.style.display = 'none';
        profilePage.style.display = "none";
    };

    if (state.uploadPage === true) {
        dashboardPage.style.display = "none";
        sendPageMain.style.display = "none";
        uploadPageMain.style.display = 'flex';
        profilePage.style.display = "none";
    };

    if (state.profile === true) {
        dashboardPage.style.display = "none";
        sendPageMain.style.display = "none";
        uploadPageMain.style.display = 'none';
        profilePage.style.display = "grid";
    };
}

// Generate Public Key and Private Key from password input
function toHex(params) {
    return Array.from(params).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function passwordToPrivateKeyandPublicKey(username, password, key = 'all') {
    const encoder = new TextEncoder();
    const input = encoder.encode(username + password);

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        input,
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode("static-salt"),
            iterations: 100_000,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );

    const hashArray = new Uint8Array(derivedBits);

    // Convert to bigint
    let privateKey = modBigInt(hashArray, SECP256K1_ORDER);
    if (privateKey === 0n) {
        throw new Error("Generated private key is invalid (zero).");
    }

    const privateKeyBytes = new Uint8Array(privateKey.toString(16).padStart(64, '0').match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const publicKey = toHex(getPublicKey(privateKeyBytes, true));

    let result;
    switch (key) {
        case 'all':
            result = {
                priv_key: toHex(privateKeyBytes),
                pub_key: publicKey
            };
            break;
        case 'priv':
            result = toHex(privateKeyBytes);
            break;
        case 'pub':
            result = publicKey;
            break;
        default:
            result = null;
            break;
    }

    return result;
}

// Simulate fetching recipient RSA public key
async function getRecipientPublicKey(user) {
    try {
        const response = await fetch(`http://127.0.0.1:5000/publickey/${user}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch public key for ${user}`);
        }
        const data = await response.json();
        return data.publicKey; // Ensure the API returns the public key as a string
    } catch (error) {
        console.error("Fetch error:", error);
        throw error; // Rethrow to handle in the caller
    }
}

function clearSelectedList() {
    uploadHT.forEach(e => {
        e.style.display = 'flex';
    });
    selectedFilesList.innerHTML = '';
    selectedFilesList2.innerHTML = '';
    selectedFiles = [];
}

function handleFiles(files, isSendPage = true) {
    clearSelectedList();
    const arr_raw = Array.from(files);

    arr_raw.forEach(file => {
        const entry = document.createElement('div');
        entry.className = 'small-text';
        entry.textContent = file.name;
        if (isSendPage == true) {
            selectedFilesList.append(entry);
        }

        if (isSendPage == false) {
            selectedFilesList2.append(entry);
        }

        // selectedFilesList.innerHTML = '';


        // selectedFilesList2.innerHTML = '';

        const reader = new FileReader();

        reader.onload = function(event) {
            const arrayBuffer = event.target.result;
            selectedFiles.push({
                name: file.name,
                size: file.size,
                arrayBuffer
            });
        };

        reader.onerror = function(err) {
            console.error(`Error reading file ${file.name}:`, err);
        };

        reader.readAsArrayBuffer(file);
    });
}

// AES Helper Functions
async function sanitizeEncryptionKeyEncrypt(params) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(params),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode("static-salt"), // I used a static salt for simplicity, I don't think it affects security that much, btw this is not for production
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt"]
    );
}

async function encryptWithAES(arrayBuffer, aesKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
        },
        aesKey,
        arrayBuffer
    );
    return { encrypted, iv };
}

// Convert ArrayBuffer to Base64 for transmission
function arrayBufferToBase64(buffer) {
    const byteArray = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < byteArray.byteLength; i++) {
        binary += String.fromCharCode(byteArray[i]);
    }
    return window.btoa(binary);
}

// Send Handler
sendBtn.addEventListener("click", async () => {
    const name = userNameInput.value.trim();
    const encryptionKeyAES = userKeyInput.value.trim();
    if (!name) return alert("Please enter a name");
    if (!encryptionKeyAES) return alert("Please enter an encryption key");
    if (selectedFiles.length === 0) return alert("Please select a file to proceed!");
    if (name === currentUser.username) return alert("You can't send to yourself, Please use the upload feature to upload a file!");
    alert("The file is on it's way, please wait for a feedback message");

    const aesKey = await sanitizeEncryptionKeyEncrypt(encryptionKeyAES);
    const aesKey2 = encryptionKeyAES;

    let recipient = await getRecipientPublicKey(userNameInput.value.trim());
    const encryptedAESKey = window.encryptWithPubKey(recipient, aesKey2);

    const encryptedFiles = [];

    for (const file of selectedFiles) {
        const { encrypted, iv } = await encryptWithAES(file.arrayBuffer, aesKey);

        encryptedFiles.push({
            name: file.name,
            sizeInKB: (file.size / 1024).toFixed(2),
            sizeInMB: (file.size / (1024 * 1024)).toFixed(2),
            encrypted: arrayBufferToBase64(encrypted),
            iv: arrayBufferToBase64(iv),
            recipient: userNameInput.value
        });
    }

    const payload = {
        encryptedAESKey: encryptedAESKey,
        files: encryptedFiles,
        notes: sendNote.value.trim(),
        tag: 'recieved',
        sender: currentUser.username
    };

    console.log("Sending to server:", payload);
    try {
        const response = await fetch("http://127.0.0.1:5000/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            alert("Files encrypted and uploaded!");
        } else {
            alert("Failed to upload, please try again.");
        }
    } catch (err) {
        console.error("Upload failed:", err);
        alert("Failed to upload, please try again.");
    }
});

// Upload Handler
uploadBtn.addEventListener("click", async () => {
    if (!currentUser.username) return alert("Please Login to upload a file!");
    const name = currentUser.username;
    const encryptionKeyAES = userKeyUpload.value.trim();
    if (!encryptionKeyAES) return alert("Please enter an encryption key");
    if (selectedFiles.length === 0) return alert("Please select a file to proceed!");
    alert("The file is on it's way, please wait for a feedback message");

    const aesKey = await sanitizeEncryptionKeyEncrypt(encryptionKeyAES);
    const aesKey2 = encryptionKeyAES;

    let recipient = await getRecipientPublicKey(name);
    const encryptedAESKey = window.encryptWithPubKey(recipient, aesKey2);

    const encryptedFiles = [];

    for (const file of selectedFiles) {
        const { encrypted, iv } = await encryptWithAES(file.arrayBuffer, aesKey);

        encryptedFiles.push({
            name: file.name,
            sizeInKB: (file.size / 1024).toFixed(2),
            sizeInMB: (file.size / (1024 * 1024)).toFixed(2),
            encrypted: arrayBufferToBase64(encrypted),
            iv: arrayBufferToBase64(iv),
            recipient: currentUser.username
        });
    }

    const payload = {
        encryptedAESKey: encryptedAESKey,
        files: encryptedFiles,
        notes: uploadNote.value,
        tag: "uploaded",
        // sender: currentUser.username
    };

    console.log("Sending to server:", payload);

        try {
        const response = await fetch("http://127.0.0.1:5000/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            alert("Files encrypted and uploaded!");
        } else {
            alert("Failed to upload, please try again.");
        }
    } catch (err) {
        console.error("Upload failed:", err);
        alert("Failed to upload, please try again.");
    }
});

// UI Handlers
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea2.addEventListener('click', () => fileInput2.click());

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFiles(fileInput.files);
        fileInput.value = "";
    }
});

fileInput2.addEventListener('change', () => {
    if (fileInput2.files.length > 0) {
        handleFiles(fileInput2.files, false);
        fileInput2.value = "";
    }
});


uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFiles(files);
    }
});

uploadArea2.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFiles(files);
    }
});


uploadArea.addEventListener('dragover', e => e.preventDefault());
uploadArea.addEventListener('dragleave', e => e.preventDefault());

uploadArea2.addEventListener('dragover', e => e.preventDefault());
uploadArea2.addEventListener('dragleave', e => e.preventDefault());



dashboardPageBtn.addEventListener("click", () => {
    state.fDashboard();
    loadPage();
    loadUploadedFiles();
    console.log("Files should be updated without having to refresh");
})

uploadPageBtn.addEventListener("click", () => {
    state.fUploadPage();
    loadPage();
});

sendPageBtn.addEventListener("click", () => {
    state.fSendPage();
    loadPage();
});

profilePageBtn.addEventListener("click", () => {
    state.fProfile();
    profilePage.innerHTML = `<div><div>Username: <span style="color: cornflowerblue">${currentUser.username}</span></div>
        <div>Number of Uploaded Files: <span style="color: cornflowerblue">${noOfUploadedFiles}</span></div>
        <div>Number of Recieved Files: <span style="color: cornflowerblue">${noOfRecievedFiles}</span></div>
        </div>`
    loadPage();
});

document.querySelector('#popup form').addEventListener('submit', function(event) {
    event.preventDefault();
});
