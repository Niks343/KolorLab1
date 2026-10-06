const databaseName = 'kolorlab-offline.v1';
const queueStoreName = 'requests';
const keyStoreName = 'keys';
const encryptionKeyId = 'queue-key';
let encryptionKeyPromise = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(queueStoreName)) {
        database.createObjectStore(queueStoreName, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(keyStoreName)) {
        database.createObjectStore(keyStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть очередь синхронизации.'));
  });
}

async function transaction(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = operation(store);
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error('Не удалось обработать очередь синхронизации.'));
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Не удалось сохранить очередь синхронизации.'));
    tx.onabort = () => reject(tx.error ?? new Error('Операция с очередью синхронизации отменена.'));
  });
}

async function getEncryptionKey(database) {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      const existing = await transaction(database, keyStoreName, 'readonly', (store) => store.get(encryptionKeyId));
      if (existing?.key) return existing.key;
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await transaction(database, keyStoreName, 'readwrite', (store) => store.put({ id: encryptionKeyId, key }));
      return key;
    })().catch((error) => {
      encryptionKeyPromise = null;
      throw error;
    });
  }
  return encryptionKeyPromise;
}

async function encryptRequest(value) {
  const database = await openDatabase();
  try {
    const key = await getEncryptionKey(database);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    const item = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
    };
    await transaction(database, queueStoreName, 'readwrite', (store) => store.put(item));
    return item.id;
  } finally {
    database.close();
  }
}

export async function enqueueOfflineRequest(value) {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
    throw new Error('Зашифрованная очередь недоступна в этом браузере; запись не поставлена в очередь.');
  }
  return encryptRequest(value);
}

export async function readOfflineRequests() {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) return [];
  const database = await openDatabase();
  try {
    const items = await transaction(database, queueStoreName, 'readonly', (store) => store.getAll());
    if (!items.length) return [];
    const key = await getEncryptionKey(database);
    const requests = await Promise.all(items
      .sort((left, right) => left.createdAt - right.createdAt)
      .map(async (item) => {
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(item.iv) },
          key,
          new Uint8Array(item.ciphertext),
        );
        return { id: item.id, createdAt: item.createdAt, request: JSON.parse(new TextDecoder().decode(plaintext)) };
      }));
    return requests;
  } finally {
    database.close();
  }
}

export async function removeOfflineRequest(id) {
  const database = await openDatabase();
  try {
    await transaction(database, queueStoreName, 'readwrite', (store) => store.delete(id));
  } finally {
    database.close();
  }
}
