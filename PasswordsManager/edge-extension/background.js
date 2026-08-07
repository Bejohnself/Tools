import {
  secureHash,
  deriveEncryptionKey,
  encryptJson,
  decryptJson
} from './crypto.js';

import {
  getAuth,
  setAuth,
  getVault,
  setVault,
  getMeta,
  setMeta,
  getSessionMasterPassword,
  setSessionMasterPassword,
  clearSessionMasterPassword,
  getRememberDeviceToken,
  setRememberDeviceToken,
  clearRememberDeviceToken,
  getRememberDevicePreference,
  setRememberDevicePreference
} from './storage.js';

import {
  encryptRememberedMasterPassword,
  decryptRememberedMasterPassword
} from './remember-device.js';



let inMemoryMasterPassword = null;
const DEBUG_AUTOFILL = true;
const REMEMBER_DEVICE_DAYS = 7;


function debugLog(...args) {
  if (!DEBUG_AUTOFILL) {
    return;
  }
  console.log('[PM_EXT][bg]', ...args);
}


function normalizeDomain(urlString) {
  try {
    const { hostname } = new URL(urlString);
    return hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeDomainLoose(value) {
  if (!value) {
    return '';
  }

  const asUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const { hostname } = new URL(asUrl);
    return hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function toUnixMs(value) {
  const ts = Date.parse(value || 0);
  return Number.isNaN(ts) ? 0 : ts;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCredentialDomain(domain, website) {
  return normalizeDomainLoose(domain) || normalizeDomainLoose(website) || '';
}

function isSameCredential(left, right) {
  const leftId = String(left?.id || '');
  const rightId = String(right?.id || '');
  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  const leftDomain = resolveCredentialDomain(left?.domain, left?.website);
  const rightDomain = resolveCredentialDomain(right?.domain, right?.website);
  const leftUsername = normalizeUsername(left?.username);
  const rightUsername = normalizeUsername(right?.username);

  return Boolean(leftDomain && rightDomain && leftUsername && rightUsername && leftDomain === rightDomain && leftUsername === rightUsername);
}

function sanitizePendingDeletes(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((item) => item && (item.id || item.domain || item.website) && item.username)
    .map((item) => ({
      opId: item.opId || crypto.randomUUID(),
      id: item.id || '',
      domain: item.domain || '',
      website: item.website || '',
      username: String(item.username || '').trim(),
      deletedAt: item.deletedAt || new Date().toISOString()
    }));
}

function removeMatchedPendingDeletes(pendingDeletes, target) {
  return pendingDeletes.filter((item) => !isSameCredential(item, target));
}

function applyPendingDeletes(entries, pendingDeletes) {
  if (!Array.isArray(entries) || !pendingDeletes.length) {
    return Array.isArray(entries) ? entries : [];
  }
  return entries.filter((entry) => !pendingDeletes.some((deleted) => isSameCredential(entry, deleted)));
}

async function patchMeta(partial) {
  const currentMeta = await getMeta();
  const nextMeta = {
    ...(currentMeta || {}),
    ...(partial || {})
  };
  await setMeta(nextMeta);
  return nextMeta;
}

async function clearPendingDeleteForCredential(target) {
  const meta = await getMeta();
  const pendingDeletes = sanitizePendingDeletes(meta?.pendingDeletes);
  const nextPendingDeletes = removeMatchedPendingDeletes(pendingDeletes, target);
  if (nextPendingDeletes.length !== pendingDeletes.length) {
    await patchMeta({ pendingDeletes: nextPendingDeletes });
  }
}


async function decryptLegacyPassword(encryptedPassword, key) {

  const ciphertext = new Uint8Array(encryptedPassword.ciphertext);
  const iv = new Uint8Array(encryptedPassword.iv);
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintextBuffer);
}

async function encryptLegacyPassword(plainPassword, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    encoder.encode(plainPassword || '')
  );

  return {
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    iv: Array.from(iv)
  };
}


async function saveRememberDeviceToken(masterPassword, days = REMEMBER_DEVICE_DAYS) {
  const encrypted = await encryptRememberedMasterPassword(masterPassword);
  if (!encrypted) {
    return false;
  }

  const expiresAt = Date.now() + Math.max(1, Number(days || REMEMBER_DEVICE_DAYS)) * 24 * 60 * 60 * 1000;
  await setRememberDeviceToken({
    ...encrypted,
    expiresAt
  });
  return true;
}

async function loadRememberedMasterIfValid() {
  const token = await getRememberDeviceToken();
  if (!token) {
    return null;
  }

  const expiresAt = Number(token.expiresAt || 0);
  if (!expiresAt || Date.now() > expiresAt) {
    await clearRememberDeviceToken();
    return null;
  }

  const candidateMaster = await decryptRememberedMasterPassword(token);
  if (!candidateMaster) {
    await clearRememberDeviceToken();
    return null;
  }

  const auth = await getAuth();
  if (!auth?.salt || !auth?.hash) {
    await clearRememberDeviceToken();
    return null;
  }

  const hashedInput = await secureHash(candidateMaster, auth.salt);
  if (hashedInput !== auth.hash) {
    await clearRememberDeviceToken();
    return null;
  }

  return candidateMaster;
}

async function getRememberDeviceStatus() {
  const rememberDevicePreference = await getRememberDevicePreference();
  const token = await getRememberDeviceToken();
  if (!token) {
    return { rememberDevicePreference, rememberDeviceUntil: null };
  }

  const expiresAt = Number(token.expiresAt || 0);
  if (!expiresAt || Date.now() > expiresAt) {
    await clearRememberDeviceToken();
    return { rememberDevicePreference, rememberDeviceUntil: null };
  }

  return {
    rememberDevicePreference,
    rememberDeviceUntil: new Date(expiresAt).toISOString()
  };
}

async function getUnlockedMasterPassword() {
  if (inMemoryMasterPassword) {
    return inMemoryMasterPassword;
  }

  const sessionPassword = await getSessionMasterPassword();
  if (sessionPassword) {
    inMemoryMasterPassword = sessionPassword;
    return sessionPassword;
  }

  const rememberedPassword = await loadRememberedMasterIfValid();
  if (!rememberedPassword) {
    return null;
  }

  inMemoryMasterPassword = rememberedPassword;
  await setSessionMasterPassword(rememberedPassword);
  return rememberedPassword;
}


async function decryptVault() {
  const auth = await getAuth();
  const vaultPayload = await getVault();
  const masterPassword = await getUnlockedMasterPassword();

  if (!auth || !vaultPayload || !masterPassword) {
    return null;
  }

  const key = await deriveEncryptionKey(masterPassword, auth.salt);
  return decryptJson(vaultPayload, key);
}

async function encryptAndSaveVault(entries) {
  const auth = await getAuth();
  const masterPassword = await getUnlockedMasterPassword();
  if (!auth || !masterPassword) {
    throw new Error('NOT_UNLOCKED');
  }
  const key = await deriveEncryptionKey(masterPassword, auth.salt);
  const payload = await encryptJson(entries, key);
  await setVault(payload);
}

function pickCredentialsByDomain(entries, domain) {
  if (!domain) {
    return [];
  }

  return entries
    .filter((item) => item?.domain && (item.domain === domain || domain.endsWith(`.${item.domain}`)))
    .sort((a, b) => {
      const domainScore = b.domain.length - a.domain.length;
      if (domainScore !== 0) {
        return domainScore;
      }
      const bUsed = Date.parse(b.lastUsedAt || b.updatedAt || b.createdAt || 0) || 0;
      const aUsed = Date.parse(a.lastUsedAt || a.updatedAt || a.createdAt || 0) || 0;
      return bUsed - aUsed;
    });
}


async function getStatus() {
  const auth = await getAuth();
  const unlocked = Boolean(await getUnlockedMasterPassword());
  const meta = await getMeta();
  const rememberStatus = await getRememberDeviceStatus();
  const lastWebImportAt = meta?.lastWebImportAt || null;
  const pendingDeleteCount = sanitizePendingDeletes(meta?.pendingDeletes).length;
  let count = 0;
  let newSinceImport = 0;

  if (auth && unlocked) {
    try {
      const entries = await decryptVault();
      count = Array.isArray(entries) ? entries.length : 0;
      if (Array.isArray(entries) && lastWebImportAt) {
        const baseTs = toUnixMs(lastWebImportAt);
        newSinceImport = entries.filter((item) => toUnixMs(item?.createdAt) > baseTs).length;
      }
    } catch {
      count = 0;
      newSinceImport = 0;
    }
  }

  return {
    hasMaster: Boolean(auth),
    unlocked,
    count,
    lastWebImportAt,
    newSinceImport,
    pendingDeleteCount,
    rememberDevicePreference: rememberStatus.rememberDevicePreference,
    rememberDeviceUntil: rememberStatus.rememberDeviceUntil
  };
}






async function unlock(masterPassword, rememberDevice = false) {
  const auth = await getAuth();
  if (!auth) {
    return { ok: false, message: '请先从网页初始化扩展' };
  }

  const hashedInput = await secureHash(masterPassword, auth.salt);
  if (hashedInput !== auth.hash) {
    return { ok: false, message: '主密码错误' };
  }

  inMemoryMasterPassword = masterPassword;
  await setSessionMasterPassword(masterPassword);
  await setRememberDevicePreference(Boolean(rememberDevice));

  if (rememberDevice) {
    const remembered = await saveRememberDeviceToken(masterPassword, REMEMBER_DEVICE_DAYS);
    if (!remembered) {
      return { ok: true, message: '已解锁，但记住设备保存失败' };
    }
    return { ok: true };
  }

  await clearRememberDeviceToken();
  return { ok: true };
}

async function lock() {
  inMemoryMasterPassword = null;
  await clearSessionMasterPassword();
  await clearRememberDeviceToken();
  return { ok: true };
}


async function rotateMasterFromWeb(payload) {
  const oldPassword = String(payload?.oldPassword || '');
  const newPassword = String(payload?.newPassword || '');
  const webAuthRaw = String(payload?.webAuthRaw || '');

  if (!oldPassword || !newPassword || !webAuthRaw) {
    return { ok: false, message: '缺少改密同步参数' };
  }

  let webAuth;
  try {
    webAuth = JSON.parse(webAuthRaw);
  } catch {
    return { ok: false, message: '网页认证信息格式错误' };
  }

  if (!webAuth?.salt || !webAuth?.hash) {
    return { ok: false, message: '网页认证信息不完整' };
  }

  const auth = await getAuth();
  const vaultPayload = await getVault();
  if (!auth || !vaultPayload) {
    return { ok: false, message: '扩展尚未初始化，请先在扩展中完成一次初始化/导入' };
  }

  const oldHash = await secureHash(oldPassword, auth.salt);
  if (oldHash !== auth.hash) {
    return { ok: false, message: '扩展旧主密码校验失败，请先手动解锁扩展后重试' };
  }

  let entries;
  try {
    const oldKey = await deriveEncryptionKey(oldPassword, auth.salt);
    entries = await decryptJson(vaultPayload, oldKey);
  } catch {
    return { ok: false, message: '扩展数据解密失败，无法同步改密' };
  }

  const newVerifyHash = await secureHash(newPassword, webAuth.salt);
  if (newVerifyHash !== webAuth.hash) {
    return { ok: false, message: '网页新主密码校验失败，已取消同步' };
  }

  const newKey = await deriveEncryptionKey(newPassword, webAuth.salt);
  const newVaultPayload = await encryptJson(Array.isArray(entries) ? entries : [], newKey);

  await setAuth({ salt: webAuth.salt, hash: webAuth.hash });
  await setVault(newVaultPayload);
  inMemoryMasterPassword = newPassword;
  await setSessionMasterPassword(newPassword);

  const rememberPreference = await getRememberDevicePreference();
  await clearRememberDeviceToken();
  if (rememberPreference) {
    await saveRememberDeviceToken(newPassword, REMEMBER_DEVICE_DAYS);
  }

  return { ok: true, count: Array.isArray(entries) ? entries.length : 0 };
}


async function getCredentialsForUrl(url) {

  const entries = await decryptVault();
  if (!entries) {
    debugLog('GET_CREDENTIALS_FOR_URL: vault 未解锁');
    return { ok: false, reason: 'LOCKED' };
  }

  const domain = normalizeDomain(url);
  const credentials = pickCredentialsByDomain(entries, domain).map((item) => ({
    id: item.id,
    username: item.username,
    password: item.password,
    domain: item.domain,
    website: item.website || item.domain,
    lastUsedAt: item.lastUsedAt || null
  }));

  debugLog('GET_CREDENTIALS_FOR_URL', {
    domain,
    matchedCount: credentials.length,
    totalEntries: entries.length
  });

  return { ok: true, credentials };
}



async function markCredentialUsed(payload) {
  const entries = await decryptVault();
  if (!entries) {
    return { ok: false, reason: 'LOCKED' };
  }

  const domain = normalizeDomain(payload.url || `https://${payload.domain || ''}`);
  const targetId = payload.id || '';
  const targetUsername = (payload.username || '').trim();

  if (!domain || (!targetId && !targetUsername)) {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }

  const index = entries.findIndex(
    (item) =>
      item.domain === domain &&
      (item.id === targetId || (!targetId && item.username === targetUsername))
  );

  if (index === -1) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  entries[index] = {
    ...entries[index],
    lastUsedAt: new Date().toISOString(),
    updatedAt: entries[index].updatedAt || new Date().toISOString()
  };

  await encryptAndSaveVault(entries);
  return { ok: true };
}

async function saveSubmittedCredential(data) {

  const entries = await decryptVault();
  if (!entries) {
    return { ok: false, reason: 'LOCKED' };
  }

  const domain = normalizeDomain(data.url || `https://${data.domain || ''}`);
  if (!domain || !data.username || !data.password) {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }

  const existingIndex = entries.findIndex(
    (item) => item.domain === domain && item.username === data.username
  );

  if (data.isRegistration) {
    if (existingIndex !== -1) {
      return { ok: true, saved: false, reason: 'ALREADY_EXISTS' };
    }

    entries.push({
      id: crypto.randomUUID(),
      domain,
      website: domain,
      username: data.username,
      password: data.password,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'edge-extension'
    });

    await encryptAndSaveVault(entries);
    await clearPendingDeleteForCredential({
      id: entries[entries.length - 1]?.id,
      domain,
      username: data.username
    });
    return { ok: true, saved: true };
  }

  if (existingIndex !== -1) {
    const existing = entries[existingIndex];
    if (existing.password !== data.password) {
      entries[existingIndex] = {
        ...existing,
        password: data.password,
        updatedAt: new Date().toISOString()
      };
      await encryptAndSaveVault(entries);
      await clearPendingDeleteForCredential(entries[existingIndex]);
      return { ok: true, saved: true, updated: true };
    }
  }


  return { ok: true, saved: false };
}

async function mapWebPayloadToEntries(payload, masterPassword) {
  if (!payload?.authRaw || !payload?.passwordsRaw) {
    return { ok: false, message: '缺少网页版数据' };
  }

  let webAuth;
  let webEncryptedPasswords;

  try {
    webAuth = JSON.parse(payload.authRaw);
    webEncryptedPasswords = JSON.parse(payload.passwordsRaw);
  } catch {
    return { ok: false, message: '网页版数据格式不正确' };
  }

  const verifyHash = await secureHash(masterPassword, webAuth.salt || '');
  if (verifyHash !== webAuth.hash) {
    return { ok: false, message: '网页版主密码与扩展主密码不一致，无法导入' };
  }

  const webKey = await deriveEncryptionKey(masterPassword, webAuth.salt);
  const mappedEntries = [];

  for (const item of webEncryptedPasswords) {
    if (!item?.username || !item?.password?.ciphertext || !item?.password?.iv) {
      continue;
    }

    let plainPassword = '';
    try {
      plainPassword = await decryptLegacyPassword(item.password, webKey);
    } catch {
      continue;
    }

    const domain =
      normalizeDomainLoose(item.website) ||
      normalizeDomainLoose(item.domain) ||
      normalizeDomainLoose(payload.sourceUrl || '');

    if (!domain) {
      continue;
    }

    mappedEntries.push({
      id: item.id || crypto.randomUUID(),
      domain,
      website: item.website || domain,
      username: item.username,
      password: plainPassword,
      notes: item.notes || '',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'web-import'
    });
  }

  return { ok: true, entries: mappedEntries };
}

async function initializeFromWebApp(payload) {
  const auth = await getAuth();
  if (auth) {
    return { ok: false, message: '扩展已初始化，请直接解锁使用' };
  }

  const masterPassword = String(payload?.masterPassword || '');
  if (!masterPassword) {
    return { ok: false, message: '请输入网页主密码' };
  }

  let webAuth;
  try {
    webAuth = JSON.parse(payload?.authRaw || '{}');
  } catch {
    return { ok: false, message: '网页认证信息格式错误' };
  }

  if (!webAuth?.salt || !webAuth?.hash) {
    return { ok: false, message: '网页认证信息不完整' };
  }

  const mappedResult = await mapWebPayloadToEntries(payload, masterPassword);
  if (!mappedResult.ok) {
    return mappedResult;
  }

  await setAuth({ salt: webAuth.salt, hash: webAuth.hash });

  const key = await deriveEncryptionKey(masterPassword, webAuth.salt);
  const vaultPayload = await encryptJson(mappedResult.entries, key);
  await setVault(vaultPayload);

  inMemoryMasterPassword = masterPassword;
  await setSessionMasterPassword(masterPassword);
  await patchMeta({ lastWebImportAt: new Date().toISOString() });

  return { ok: true, count: mappedResult.entries.length };
}

async function syncLoginFromWeb(payload = {}) {
  const masterPassword = String(payload?.masterPassword || '');
  const authRaw = String(payload?.authRaw || '');
  const passwordsRaw = String(payload?.passwordsRaw || '[]');
  const sourceUrl = String(payload?.sourceUrl || '');

  if (!masterPassword || !authRaw) {
    return { ok: false, message: '缺少网页登录同步参数' };
  }

  const auth = await getAuth();
  if (!auth) {
    const initResult = await initializeFromWebApp({
      masterPassword,
      authRaw,
      passwordsRaw,
      sourceUrl
    });
    if (!initResult?.ok) {
      return initResult;
    }
    return {
      ok: true,
      initialized: true,
      unlocked: true,
      count: Number(initResult.count || 0)
    };
  }

  let webAuth;
  try {
    webAuth = JSON.parse(authRaw);
  } catch {
    return { ok: false, message: '网页认证信息格式错误' };
  }

  if (!webAuth?.salt || !webAuth?.hash) {
    return { ok: false, message: '网页认证信息不完整' };
  }

  if (auth.salt !== webAuth.salt || auth.hash !== webAuth.hash) {
    return { ok: false, message: '网页与扩展主密码不一致，请先在扩展中手动解锁/初始化' };
  }

  const hashedInput = await secureHash(masterPassword, auth.salt);
  if (hashedInput !== auth.hash) {
    return { ok: false, message: '网页登录密码校验失败，未同步解锁扩展' };
  }

  inMemoryMasterPassword = masterPassword;
  await setSessionMasterPassword(masterPassword);

  return { ok: true, initialized: false, unlocked: true };
}

async function importFromWebApp(payload) {
  const currentEntries = await decryptVault();
  const masterPassword = await getUnlockedMasterPassword();
  if (!currentEntries || !masterPassword) {
    return { ok: false, message: '扩展当前未解锁' };
  }


  const mappedResult = await mapWebPayloadToEntries(payload, masterPassword);
  if (!mappedResult.ok) {
    return mappedResult;
  }

  const mode = payload?.mode === 'replace' ? 'replace' : 'merge';
  const meta = await getMeta();
  const pendingDeletes = sanitizePendingDeletes(meta?.pendingDeletes);
  const importedEntries = applyPendingDeletes(mappedResult.entries, pendingDeletes);

  if (mode === 'replace') {
    await encryptAndSaveVault(importedEntries);
    await patchMeta({ lastWebImportAt: new Date().toISOString() });
    return { ok: true, mode, replaced: true, added: importedEntries.length, updated: 0 };
  }

  const entries = [...currentEntries];
  let added = 0;
  let updated = 0;

  for (const item of importedEntries) {
    const index = entries.findIndex(
      (entry) => entry.domain === item.domain && entry.username === item.username
    );

    if (index === -1) {
      entries.push(item);
      added += 1;
      continue;
    }

    if (entries[index].password !== item.password) {
      entries[index] = {
        ...entries[index],
        website: item.website || entries[index].website || item.domain,
        notes: item.notes || entries[index].notes || '',
        password: item.password,
        updatedAt: new Date().toISOString(),
        source: entries[index].source || 'web-import'
      };
      updated += 1;
    }
  }

  if (added > 0 || updated > 0) {
    await encryptAndSaveVault(entries);
  }

  await patchMeta({ lastWebImportAt: new Date().toISOString() });
  return { ok: true, mode, replaced: false, added, updated };
}

async function exportNewEntriesToWebApp(payload = {}) {
  const entries = await decryptVault();
  const masterPassword = await getUnlockedMasterPassword();
  if (!entries || !masterPassword) {
    return { ok: false, message: '扩展当前未解锁' };
  }

  const webAuthRaw = payload?.webAuthRaw || '';
  if (!webAuthRaw) {
    return { ok: false, message: '缺少网页认证信息' };
  }

  let webAuth;
  try {
    webAuth = JSON.parse(webAuthRaw);
  } catch {
    return { ok: false, message: '网页认证信息格式错误' };
  }

  if (!webAuth?.salt || !webAuth?.hash) {
    return { ok: false, message: '网页认证信息不完整' };
  }

  const verifyHash = await secureHash(masterPassword, webAuth.salt);
  if (verifyHash !== webAuth.hash) {
    return { ok: false, message: '主密码与网页不一致，无法写回网页' };
  }

  const meta = await getMeta();
  const lastWebImportAt = meta?.lastWebImportAt || null;
  const pendingDeletes = sanitizePendingDeletes(meta?.pendingDeletes);
  const baseTs = toUnixMs(lastWebImportAt);
  const newEntries = lastWebImportAt
    ? entries.filter((item) => toUnixMs(item?.createdAt) > baseTs)
    : [...entries];

  const webKey = await deriveEncryptionKey(masterPassword, webAuth.salt);
  const encryptedPasswords = [];

  for (const item of newEntries) {
    if (!item?.username || !item?.password) {
      continue;
    }

    encryptedPasswords.push({
      id: item.id || crypto.randomUUID(),
      website: item.website || item.domain || '',
      username: item.username,
      password: await encryptLegacyPassword(item.password, webKey),
      notes: item.notes || '',
      createdAt: item.createdAt || new Date().toISOString(),
      source: item.source || 'edge-extension'
    });
  }

  return {
    ok: true,
    authRaw: webAuthRaw,
    passwordsRaw: JSON.stringify(encryptedPasswords),
    deletesRaw: JSON.stringify(pendingDeletes),
    count: encryptedPasswords.length,
    deleteCount: pendingDeletes.length,
    deleteOpIds: pendingDeletes.map((item) => item.opId),
    fromLastImport: Boolean(lastWebImportAt),
    authSalt: String(webAuth.salt || '')
  };
}

async function confirmExportToWebApp(payload = {}) {
  const hadExport = Boolean(payload?.hadExport);
  const syncedDeleteOpIds = Array.isArray(payload?.syncedDeleteOpIds)
    ? payload.syncedDeleteOpIds.map((item) => String(item || '')).filter(Boolean)
    : [];

  const meta = await getMeta();
  const pendingDeletes = sanitizePendingDeletes(meta?.pendingDeletes);
  const nextPendingDeletes = syncedDeleteOpIds.length
    ? pendingDeletes.filter((item) => !syncedDeleteOpIds.includes(item.opId))
    : pendingDeletes;

  const patch = {
    pendingDeletes: nextPendingDeletes
  };

  if (hadExport) {
    patch.lastWebImportAt = new Date().toISOString();
  }

  await patchMeta(patch);

  return {
    ok: true,
    clearedDeletes: pendingDeletes.length - nextPendingDeletes.length,
    pendingDeletes: nextPendingDeletes.length
  };
}

async function deleteCredential(payload = {}) {
  const entries = await decryptVault();
  if (!entries) {
    return { ok: false, reason: 'LOCKED' };
  }

  const target = {
    id: String(payload?.id || ''),
    domain: payload?.domain || '',
    website: payload?.website || payload?.url || '',
    username: String(payload?.username || '').trim()
  };

  if (!target.id && !(target.username && resolveCredentialDomain(target.domain, target.website))) {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }

  const index = entries.findIndex((item) => isSameCredential(item, target));
  if (index === -1) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const [removed] = entries.splice(index, 1);
  await encryptAndSaveVault(entries);

  const meta = await getMeta();
  const pendingDeletes = sanitizePendingDeletes(meta?.pendingDeletes);
  const nextPendingDeletes = removeMatchedPendingDeletes(pendingDeletes, removed);
  nextPendingDeletes.push({
    opId: crypto.randomUUID(),
    id: removed?.id || '',
    domain: removed?.domain || '',
    website: removed?.website || removed?.domain || '',
    username: String(removed?.username || target.username || '').trim(),
    deletedAt: new Date().toISOString()
  });

  await patchMeta({ pendingDeletes: nextPendingDeletes });

  return {
    ok: true,
    deleted: true,
    pendingDeleteCount: nextPendingDeletes.length,
    remaining: entries.length
  };
}

async function addCredentialManual(payload) {


  const entries = await decryptVault();
  if (!entries) {
    return { ok: false, message: '扩展当前未解锁' };
  }

  const username = (payload?.username || '').trim();
  const password = payload?.password || '';
  const notes = (payload?.notes || '').trim();
  const websiteRaw = (payload?.website || payload?.domain || payload?.url || '').trim();
  const domain = normalizeDomainLoose(websiteRaw);

  if (!domain || !username || !password) {
    return { ok: false, message: '网站、用户名、密码均不能为空' };
  }

  const now = new Date().toISOString();
  const existingIndex = entries.findIndex(
    (item) => item.domain === domain && item.username === username
  );

  if (existingIndex !== -1) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      website: websiteRaw || entries[existingIndex].website || domain,
      password,
      notes: notes || entries[existingIndex].notes || '',
      updatedAt: now,
      source: 'ext-manual'
    };
    await encryptAndSaveVault(entries);
    await clearPendingDeleteForCredential(entries[existingIndex]);
    return { ok: true, added: false, updated: true };
  }

  entries.push({

    id: crypto.randomUUID(),
    domain,
    website: websiteRaw || domain,
    username,
    password,
    notes,
    createdAt: now,
    updatedAt: now,
    source: 'ext-manual'
  });

  await encryptAndSaveVault(entries);
  await clearPendingDeleteForCredential({
    id: entries[entries.length - 1]?.id,
    domain,
    username
  });
  return { ok: true, added: true, updated: false };
}


chrome.runtime.onInstalled.addListener(() => {
  inMemoryMasterPassword = null;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'GET_STATUS':
        sendResponse(await getStatus());
        break;
      case 'UNLOCK':
        sendResponse(await unlock(message.masterPassword || '', Boolean(message.rememberDevice)));
        break;

      case 'LOCK':
        sendResponse(await lock());
        break;
      case 'SET_REMEMBER_DEVICE_PREFERENCE':
        await setRememberDevicePreference(Boolean(message.enabled));
        sendResponse({ ok: true });
        break;
      case 'GET_CREDENTIALS_FOR_URL':

        sendResponse(await getCredentialsForUrl(message.url || ''));
        break;
      case 'CREDENTIAL_USED':
        sendResponse(await markCredentialUsed(message.payload || {}));
        break;

      case 'FORM_SUBMITTED':
        sendResponse(await saveSubmittedCredential(message.payload || {}));
        break;
      case 'INIT_FROM_WEB_APP':
        sendResponse(await initializeFromWebApp(message.payload || {}));
        break;
      case 'SYNC_LOGIN_FROM_WEB':
        sendResponse(await syncLoginFromWeb(message.payload || {}));
        break;
      case 'IMPORT_FROM_WEB_APP':
        sendResponse(await importFromWebApp(message.payload || {}));
        break;

      case 'ADD_CREDENTIAL':
        sendResponse(await addCredentialManual(message.payload || {}));
        break;
      case 'DELETE_CREDENTIAL':
        sendResponse(await deleteCredential(message.payload || {}));
        break;
      case 'EXPORT_NEW_TO_WEB_APP':
        sendResponse(await exportNewEntriesToWebApp(message.payload || {}));
        break;
      case 'CONFIRM_EXPORT_TO_WEB_APP':
        sendResponse(await confirmExportToWebApp(message.payload || {}));
        break;
      case 'ROTATE_MASTER_FROM_WEB':
        sendResponse(await rotateMasterFromWeb(message.payload || {}));
        break;


      default:



        sendResponse({ ok: false, reason: 'UNKNOWN_ACTION' });
        break;
    }
  })().catch((error) => {
    sendResponse({ ok: false, reason: 'ERROR', message: String(error?.message || error) });
  });

  return true;
});
