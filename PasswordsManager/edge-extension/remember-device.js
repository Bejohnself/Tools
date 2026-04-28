const DB_NAME = 'pm-ext-secure-db';
const STORE_NAME = 'secure';
const KEY_NAME = 'remember_device_key';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开 IndexedDB 失败'));
  });
}

function readKeyFromDb() {
  return new Promise(async (resolve, reject) => {
    let db;
    try {
      db = await openDb();
    } catch (error) {
      reject(error);
      return;
    }

    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(KEY_NAME);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('读取设备密钥失败'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
}

function writeKeyToDb(key) {
  return new Promise(async (resolve, reject) => {
    let db;
    try {
      db = await openDb();
    } catch (error) {
      reject(error);
      return;
    }

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(key, KEY_NAME);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('写入设备密钥失败'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
    tx.onabort = () => db.close();
  });
}

async function getOrCreateRememberKey() {
  try {
    const existing = await readKeyFromDb();
    if (existing) {
      return existing;
    }

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await writeKeyToDb(key);
    return key;
  } catch {
    return null;
  }
}

export async function encryptRememberedMasterPassword(masterPassword) {
  const key = await getOrCreateRememberKey();
  if (!key) {
    return null;
  }

  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(String(masterPassword || ''));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    return {
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      iv: Array.from(iv)
    };
  } catch {
    return null;
  }
}

export async function decryptRememberedMasterPassword(payload) {
  if (!payload?.ciphertext || !payload?.iv) {
    return null;
  }

  const key = await getOrCreateRememberKey();
  if (!key) {
    return null;
  }

  try {
    const ciphertext = new Uint8Array(payload.ciphertext);
    const iv = new Uint8Array(payload.iv);
    const plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintextBuffer);
  } catch {
    return null;
  }
}
