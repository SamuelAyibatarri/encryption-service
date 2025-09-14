import { getPublicKey } from "https://esm.sh/@noble/secp256k1@2.0.0";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

// Fallback curve order for secp256k1
const SECP256K1_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

// Utility to convert Uint8Array to hex string
function toHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Modular reduction for Uint8Array
function modBigInt(bytes, modulus) {
    const hex = toHex(bytes);
    const value = BigInt('0x' + hex);
    return value % modulus;
}

// async function passwordToPrivateKeyandPublicKey(username, password, key = 'all') {
//     console.log("Username: ", username);
//     console.log("Type Of Username: ", typeof(username));
//     console.log("Password: ", password);
//     console.log("Type Of Password: ", typeof(password));
//     const encoder = new TextEncoder();
//     const input = encoder.encode(username + password); 
//     console.log("Input: ", input)
//     const keyMaterial = await crypto.subtle.importKey(
//         "raw",
//         input,
//         "PBKDF2",
//         false,
//         ["deriveBits"]
//     );

//     console.log("Key Material: ", keyMaterial);

//     const derivedBits = await crypto.subtle.deriveBits(
//         {
//             name: "PBKDF2",
//             salt: encoder.encode("static-salt"),
//             hash: "SHA-256"
//         },
//         keyMaterial,
//         256
//     );

//     const hashArray = new Uint8Array(derivedBits);

//     console.log("Hash array: ", hashArray);

//     // Convert to bigint
//     let privateKey = modBigInt(hashArray, SECP256K1_ORDER);
//     if (privateKey === 0n) {
//         throw new Error("Generated private key is invalid (zero).");
//     }
//     console.log("Private Key: ", privateKey);

//     const privateKeyBytes = new Uint8Array(privateKey.toString(16).padStart(64, '0').match(/.{1,2}/g).map(b => parseInt(b, 16)));
//     const publicKey = toHex(getPublicKey(privateKeyBytes, true));
//     console.log("Public Key: ", publicKey);

//     let result;
//     switch (key) {
//         case 'all':
//             result = {
//                 priv_key: toHex(privateKeyBytes),
//                 pub_key: publicKey
//             };
//             break;
//         case 'priv':
//             result = toHex(privateKeyBytes);
//             break;
//         case 'pub':
//             result = publicKey;
//             break;
//         default:
//             result = null;
//             break;
//     }
//     console.log(result);
//     return result;
// }

async function passwordToPrivateKeyandPublicKey(username, password, key = 'all') {
    console.log("Username:", username);
    console.log("Type Of Username:", typeof username);
    console.log("Password:", password);
    console.log("Type Of Password:", typeof password);

    if (!username || !password) {
        throw new Error("Username and password must not be empty");
    }

    const encoder = new TextEncoder();
    const input = encoder.encode(username + password);
    console.log("Input:", input);

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        input,
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    console.log("Key Material:", keyMaterial);

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode("static-salt"),
            hash: "SHA-256",
            iterations: 100000 // Specify iterations explicitly for consistency
        },
        keyMaterial,
        256
    );
    const hashArray = new Uint8Array(derivedBits);
    console.log("Hash Array:", hashArray, "Length:", hashArray.length);

    // Use hashArray directly as private key (after validation)
    let privateKey = modBigInt(hashArray, SECP256K1_ORDER);
    if (privateKey === 0n) {
        throw new Error("Generated private key is invalid (zero).");
    }
    console.log("Private Key (BigInt):", privateKey);

    // Convert BigInt to 32-byte Uint8Array
    const hexString = privateKey.toString(16).padStart(64, '0');
    const hexPairs = hexString.match(/.{1,2}/g);
    if (!hexPairs || hexPairs.length !== 32) {
        throw new Error(`Invalid hex string for private key: ${hexString}`);
    }

    const privateKeyBytes = new Uint8Array(hexPairs.map(b => {
        const byte = parseInt(b, 16);
        if (isNaN(byte)) {
            throw new Error(`Invalid byte in hex string: ${b}`);
        }
        return byte;
    }));
    console.log("Private Key Bytes:", privateKeyBytes, "Length:", privateKeyBytes.length);

    // Validate privateKeyBytes
    if (privateKeyBytes.length !== 32) {
        throw new Error(`Private key must be 32 bytes, got ${privateKeyBytes.length}`);
    }

    // Generate public key
    let publicKey;
    try {
        publicKey = toHex(getPublicKey(privateKeyBytes, true));
        console.log("Public Key:", publicKey);
    } catch (err) {
        console.error("getPublicKey failed:", err);
        throw new Error(`Failed to generate public key: ${err.message}`);
    }

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
    console.log("Result:", result);
    return result;
}


// Log in function
async function login(usernameParam, passwordParam) {
    const payload = {
        username: usernameParam,
        password: passwordParam
    };

    const response = await fetch("http://127.0.0.1:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.success) {
        localStorage.setItem("currentUser", JSON.stringify(data.user));
        window.location.href = "/index.html";
    } else {
        return alert(`${data.message} Please create a new account`);
    }
}

// Sign Up function
async function signUp(nameParam, passwordParam) {
    const fixedSalt = "$2b$12$1234567890123456789012"; // Must follow bcrypt salt format and be 29 characters
    const hash = bcrypt.hashSync(passwordParam, fixedSalt);
    const publicKey = await passwordToPrivateKeyandPublicKey(nameParam,passwordParam, 'pub');
    
    const userDetails = {
        username: nameParam,
        bcryptEncryptedPassword: hash,
        publicKey
    };
      
    return userDetails;
}


// Sign Up and Login Elements
const isLoginPage = !!document.querySelector(".login.form");

if (isLoginPage) {
    const loginBtn = document.getElementById("login-btn");
    const signUpBtn = document.getElementById("signup-btn");
    const signUpUsername = document.getElementById("signup-username");
    const passwordFirstEntry = document.getElementById("password-firstEntry");
    const passwordSecondEntry = document.getElementById("password-secondEntry");
    const loginUsername = document.getElementById("login-username");
    const loginPassword = document.getElementById("login-password");


    loginBtn.addEventListener("click", () => {
        const username = loginUsername?.value.trim();
        const password = loginPassword?.value.trim();

        if (!username || !password) {
            alert("Please enter both username and password.");
            return;
        }

        login(username, password);
    });

    signUpBtn.addEventListener("click", async () => {
        let userN = signUpUsername?.value.trim();
        let pass1 = passwordFirstEntry?.value.trim();
        let pass2 = passwordSecondEntry?.value.trim();
        
        if (!userN || !pass1 || !pass2) {
            return alert("Please fill all fields!");
        }
        
        if (pass1 !== pass2) {
            return alert("Your passwords don't match, please check them and try again!");
        }
        
        if (pass1.length < 8) {
            return alert("Password must be at least 8 characters!");
        }

        try {
            const payload = {
                user: await signUp(userN, pass2)
            };

            const response = await fetch("http://127.0.0.1:5000/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            alert("Account created successfully!");
            document.getElementById('check').checked = false;
        } catch (err) {
            console.error("Signup failed:", err);
            alert(`Failed to create account: ${err.message}. Please try again.`);
        }
    });
}