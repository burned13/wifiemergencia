import CryptoJS from 'crypto-js';

const RAW_KEY = process.env.EXPO_PUBLIC_ENCRYPTION_KEY || 'default-key-change-in-production';
const KEY_WORD = CryptoJS.enc.Utf8.parse(RAW_KEY.padEnd(32, '0').slice(0, 32));
const IV_WORD = CryptoJS.enc.Utf8.parse(RAW_KEY.padEnd(16, '0').slice(0, 16));
const SALTED_PREFIX = 'U2FsdGVkX1';

export const EncryptionService = {
  encrypt: (text: string): string => {
    try {
      const res = CryptoJS.AES.encrypt(text, KEY_WORD, {
        iv: IV_WORD,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      return res.toString();
    } catch {
      return text;
    }
  },

  decrypt: (encryptedText: string): string => {
    try {
      if (typeof encryptedText === 'string' && encryptedText.startsWith(SALTED_PREFIX)) {
        const bytesLegacy = CryptoJS.AES.decrypt(encryptedText, RAW_KEY);
        return bytesLegacy.toString(CryptoJS.enc.Utf8);
      }
      const bytes = CryptoJS.AES.decrypt(encryptedText, KEY_WORD, {
        iv: IV_WORD,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return '';
    }
  },

  hashDeviceId: (deviceId: string): string => {
    return CryptoJS.SHA256(deviceId).toString();
  },

  generateSecureToken: (): string => {
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let out = '';
      for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
      return out;
    } catch {
      return String(Date.now());
    }
  },

  hash: (text: string): string => {
    try {
      return CryptoJS.SHA256(text).toString();
    } catch {
      return '';
    }
  },
};
