# encryption-service
A browser-based secure file sharing platform that combines end-to-end encryption with user-friendly cloud storage. Built with modern web technologies for privacy-focused file transfers.

## Key Features
- **End-to-End Encryption**: All files are encrypted client-side using AES-256 before uploading
- **Secure Key Exchange**: Elliptic-curve cryptography (secp256k1) for secure encryption key transmission
- **Dual Sharing Modes**: Send files to other users or upload to your personal encrypted storage
- **Zero-Knowledge Architecture**: Server never has access to unencrypted files or keys
- **Password-Derived Keys**: Private keys are derived from user passwords using PBKDF2

## Technical Implementation
- **Frontend**: Vanilla JavaScript with Web Crypto API
- **Cryptography**: AES-GCM encryption with ECC (secp256k1) for key exchange
- **Backend**: Compatible with Flask server (RESTful API)
- **Storage**: Encrypted files stored server-side, keys remain client-side

## Security Features
- Client-side encryption/decryption using Web Crypto API
- Secure key derivation with PBKDF2
- Encrypted AES keys shared via ECC public key cryptography
- Protection against self-sending and unauthorized access

## Current Collaborators 
kenmentor:[https://github.com/kenmentor]

