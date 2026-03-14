import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let encryptionKey;

/**
 * Get the data directory path.
 */
function getDataDir() {
  const dataDir = process.env.DATA_DIR || path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', 'data'
  );
  return dataDir;
}

/**
 * Ensure an encryption key exists. Loads from env, or from .key file,
 * or generates a new one and persists it.
 */
export function ensureEncryptionKey() {
  // 1. Environment variable takes precedence
  if (process.env.ENCRYPTION_KEY) {
    encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (encryptionKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return;
  }

  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const keyPath = path.join(dataDir, '.key');

  // 2. Load from persisted file
  if (fs.existsSync(keyPath)) {
    const hex = fs.readFileSync(keyPath, 'utf-8').trim();
    encryptionKey = Buffer.from(hex, 'hex');
    return;
  }

  // 3. Generate new key and persist
  encryptionKey = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, encryptionKey.toString('hex'), { mode: 0o600 });
}

/**
 * Get the current encryption key.
 */
export function getEncryptionKey() {
  if (!encryptionKey) {
    throw new Error('Encryption key not initialized. Call ensureEncryptionKey() first.');
  }
  return encryptionKey;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a combined string: iv:authTag:ciphertext (all hex-encoded).
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Input format: iv:authTag:ciphertext (all hex-encoded).
 */
export function decrypt(encryptedStr) {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = encryptedStr.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

/**
 * Derive a JWT secret from the encryption key (different purpose, different derivation).
 */
export function deriveJwtSecret() {
  const key = getEncryptionKey();
  return crypto.createHmac('sha256', key).update('jwt-secret').digest();
}

/**
 * Mask a URL for display: show only the domain portion.
 * e.g., https://api.example.com/sub?token=abc123 → https://api.example.com/***
 */
export function maskUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/***`;
  } catch {
    return '***';
  }
}
