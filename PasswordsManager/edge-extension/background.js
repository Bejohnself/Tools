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


function debugLog(...args) {
  if (!DEBUG_AUTOFILL) {
    return;
  }
  console.log('[PM_EXT][bg]', ...args);
}


// 站点键 = host + 非默认端口（URL.host 会自动省略 80/443）。
// 这样 10.82.4.252:5173 与 10.82.4.252:5174 会被视为两个不同站点。
function parseSite(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { host: '', hostname: '' };
  }

  const asUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(asUrl);
    return {
      host: url.host.toLowerCase().replace(/^www\./i, ''),
      hostname: url.hostname.toLowerCase().replace(/^www\./i, '')
    };
  } catch {
    return { host: '', hostname: '' };
  }
}

function normalizeDomainLoose(value) {
  return parseSite(value).host;
}

function hostnameOf(host) {
  const target = String(host || '');
  if (!target) {
    return '';
  }
  if (target.startsWith('[')) {
    const end = target.indexOf(']');
    return end === -1 ? target : target.slice(0, end + 1);
  }
  const idx = target.lastIndexOf(':');
  return idx === -1 ? target : target.slice(0, idx);
}

function hasExplicitPort(host) {
  const target = String(host || '');
  return Boolean(target) && target !== hostnameOf(target);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

// iframe / about:blank 弹窗里的登录框：消息里的 location.href 是子 frame 的，
// 这里换算成顶层页面（或发起方 origin），让凭据仍然按用户实际访问的站点匹配。
function resolveSiteUrl(message, sender) {
  const explicitUrl = String(message?.url || message?.payload?.url || '').trim();
  const frameUrl = String(sender?.url || '').trim();
  const senderOrigin = String(sender?.origin || '').trim();
  const tabUrl = String(sender?.tab?.url || '').trim();
  const isTopFrame = Number(sender?.frameId || 0) === 0;

  const candidates = isTopFrame
    ? [explicitUrl, frameUrl, senderOrigin, tabUrl]
    : [tabUrl, senderOrigin, explicitUrl, frameUrl];

  return candidates.find(isHttpUrl) || explicitUrl || '';
}

function toUnixMs(value) {
  const ts = Date.parse(value || 0);
  return Number.isNaN(ts) ? 0 : ts;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCredentialDomain(domain, website) {
  const fromDomain = normalizeDomainLoose(domain);
  const fromWebsite = normalizeDomainLoose(website);

  if (!fromDomain) {
    return fromWebsite;
  }

  // 记录 key 里没有端口、但 website 原文带端口时（例如网页版导入的数据），以 website 为准，避免丢端口
  if (
    fromWebsite &&
    !hasExplicitPort(fromDomain) &&
    hasExplicitPort(fromWebsite) &&
    hostnameOf(fromWebsite) === fromDomain
  ) {
    return fromWebsite;
  }

  return fromDomain;
}

function websiteForEntry(entry) {
  const rawWebsite = String(entry?.website || '').trim();
  const domain = normalizeDomainLoose(entry?.domain) || normalizeDomainLoose(rawWebsite);

  if (!rawWebsite) {
    return domain;
  }

  // website 与记录 key 的 host 不一致（例如记录已带端口、website 还是无端口旧值）时，用带端口的 key 回写
  const websiteHost = normalizeDomainLoose(rawWebsite);
  if (domain && websiteHost !== domain) {
    return domain;
  }

  return rawWebsite;
}

function isSameDomainAndUsername(left, right) {
  const leftDomain = resolveCredentialDomain(left?.domain, left?.website);
  const rightDomain = resolveCredentialDomain(right?.domain, right?.website);
  const leftUsername = normalizeUsername(left?.username);
  const rightUsername = normalizeUsername(right?.username);

  return Boolean(leftDomain && rightDomain && leftUsername && rightUsername && leftDomain === rightDomain && leftUsername === rightUsername);
}

function isSameCredential(left, right) {
  const leftId = String(left?.id || '');
  const rightId = String(right?.id || '');
  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  return isSameDomainAndUsername(left, right);
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


async function saveRememberDeviceToken(masterPassword) {
  const encrypted = await encryptRememberedMasterPassword(masterPassword);
  if (!encrypted) {
    return false;
  }

  await setRememberDeviceToken(encrypted);
  return true;
}

async function loadRememberedMasterIfValid() {
  const token = await getRememberDeviceToken();
  if (!token) {
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

  return {
    rememberDevicePreference,
    rememberDeviceUntil: null
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
  await migrateVaultDomains();
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

const DOMAIN_SCHEMA_VERSION = 2;
let domainMigrationPromise = null;

// 一次性迁移：把 domain 从“无端口 hostname”升级为“host:port”。
// 端口信息来自旧记录的 website 原文；无法还原的记录保持原样（仍作为该主机的兜底）。
async function migrateVaultDomains() {
  if (domainMigrationPromise) {
    return domainMigrationPromise;
  }

  domainMigrationPromise = (async () => {
    const meta = await getMeta();
    if (Number(meta?.domainSchemaVersion || 0) >= DOMAIN_SCHEMA_VERSION) {
      return { ok: true, skipped: true, changed: 0 };
    }

    const entries = await decryptVault();
    if (!entries) {
      return { ok: false, reason: 'LOCKED', changed: 0 };
    }

    let changed = 0;
    const nextEntries = entries.map((entry) => {
      const currentDomain = normalizeDomainLoose(entry?.domain);
      const nextDomain = resolveCredentialDomain(entry?.domain, entry?.website);
      if (!nextDomain || nextDomain === currentDomain) {
        return entry;
      }
      changed += 1;
      return { ...entry, domain: nextDomain };
    });

    if (changed > 0) {
      await encryptAndSaveVault(nextEntries);
    }

    await patchMeta({ domainSchemaVersion: DOMAIN_SCHEMA_VERSION });
    debugLog('migrateVaultDomains', { changed, total: entries.length });
    return { ok: true, changed };
  })()
    .catch((error) => {
      debugLog('migrateVaultDomains failed', String(error?.message || error));
      return { ok: false, reason: 'MIGRATION_FAILED', changed: 0 };
    })
    .finally(() => {
      domainMigrationPromise = null;
    });

  return domainMigrationPromise;
}

function domainMatchRank(entryDomain, site) {
  const domain = normalizeDomainLoose(entryDomain);
  if (!domain || !site?.host) {
    return -1;
  }

  // 0：host:port 完全一致（当前端口专属记录）
  if (domain === site.host) {
    return 0;
  }

  // 1：无端口的旧记录，兼容同主机所有端口
  if (domain === site.hostname) {
    return 1;
  }

  const domainHostname = hostnameOf(domain);
  const domainHasPort = domain !== domainHostname;

  if (!domainHasPort && site.hostname.endsWith(`.${domain}`)) {
    return 2;
  }

  if (domainHasPort && site.host.endsWith(`.${domain}`)) {
    return 3;
  }

  return -1;
}

function pickCredentialsByDomain(entries, site) {
  if (!site?.host) {
    return [];
  }

  return entries
    .map((item) => ({ item, rank: domainMatchRank(item?.domain || item?.website, site) }))
    .filter((matched) => matched.rank >= 0)
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      const lengthDiff = String(b.item?.domain || '').length - String(a.item?.domain || '').length;
      if (lengthDiff !== 0) {
        return lengthDiff;
      }
      return entryRecencyScore(b.item) - entryRecencyScore(a.item);
    })
    .map((matched) => matched.item);
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
  await migrateVaultDomains();

  if (rememberDevice) {
    const remembered = await saveRememberDeviceToken(masterPassword);
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
    await saveRememberDeviceToken(newPassword);
  }

  return { ok: true, count: Array.isArray(entries) ? entries.length : 0 };
}


async function getCredentialsForUrl(url) {

  const entries = await decryptVault();
  if (!entries) {
    debugLog('GET_CREDENTIALS_FOR_URL: vault 未解锁');
    return { ok: false, reason: 'LOCKED' };
  }

  const site = parseSite(url);
  const credentials = pickCredentialsByDomain(entries, site).map((item) => ({
    id: item.id,
    username: item.username,
    password: item.password,
    domain: resolveCredentialDomain(item.domain, item.website),
    website: item.website || item.domain,
    lastUsedAt: item.lastUsedAt || null
  }));

  debugLog('GET_CREDENTIALS_FOR_URL', {
    domain: site.host,
    matchedCount: credentials.length,
    totalEntries: entries.length
  });

  return { ok: true, credentials };
}



function entryRecencyScore(entry) {
  return Date.parse(entry?.lastUsedAt || entry?.updatedAt || entry?.createdAt || 0) || 0;
}

function isEntryForDomain(entry, site) {
  return domainMatchRank(entry?.domain || entry?.website, site) >= 0;
}

async function searchCredentials(payload = {}) {
  const entries = await decryptVault();
  if (!entries) {
    return { ok: false, reason: 'LOCKED' };
  }

  const keyword = String(payload.keyword || '').trim().toLowerCase();
  if (!keyword) {
    return { ok: true, results: [] };
  }

  const tokens = keyword.split(/\s+/).filter(Boolean);
  const site = parseSite(payload.url || '');

  const matched = entries.filter((item) => {
    if (!item) {
      return false;
    }
    const haystack = [item.domain, item.website, item.username, item.notes]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return tokens.every((token) => haystack.includes(token));
  });

  matched.sort((a, b) => {
    const priorityDiff = Number(!isEntryForDomain(a, site)) - Number(!isEntryForDomain(b, site));
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return entryRecencyScore(b) - entryRecencyScore(a);
  });

  const results = matched.slice(0, 50).map((item) => ({
    id: item.id,
    domain: resolveCredentialDomain(item.domain, item.website),
    website: item.website || item.domain,
    username: item.username,
    password: item.password,
    notes: item.notes || '',
    lastUsedAt: item.lastUsedAt || null
  }));

  return { ok: true, results, total: entries.length };
}


async function markCredentialUsed(payload) {
  const entries = await decryptVault();
  if (!entries) {
    return { ok: false, reason: 'LOCKED' };
  }

  const site = parseSite(payload.url || `https://${payload.domain || ''}`);
  const targetId = payload.id || '';
  const targetUsername = (payload.username || '').trim();

  if (!site.host || (!targetId && !targetUsername)) {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }

  const index = entries.findIndex(
    (item) =>
      domainMatchRank(item?.domain || item?.website, site) >= 0 &&
      (targetId ? item.id === targetId : item.username === targetUsername)
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

  const site = parseSite(data.url || `https://${data.domain || ''}`);
  const domain = site.host;
  if (!domain || !data.username || !data.password) {
    return { ok: false, reason: 'INVALID_PAYLOAD' };
  }

  const existingIndex = entries.findIndex((item) =>
    isSameDomainAndUsername(item, { domain, website: data.url || '', username: data.username })
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
      resolveCredentialDomain(item.domain, item.website) ||
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
  await patchMeta({ lastWebImportAt: new Date().toISOString(), domainSchemaVersion: DOMAIN_SCHEMA_VERSION });

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
  await migrateVaultDomains();

  return { ok: true, initialized: false, unlocked: true };
}

async function importFromWebApp(payload) {
  await migrateVaultDomains();
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
    await patchMeta({ lastWebImportAt: new Date().toISOString(), domainSchemaVersion: DOMAIN_SCHEMA_VERSION });
    return { ok: true, mode, replaced: true, added: importedEntries.length, updated: 0 };
  }

  const entries = [...currentEntries];
  let added = 0;
  let updated = 0;

  for (const item of importedEntries) {
    const index = entries.findIndex((entry) => isSameDomainAndUsername(entry, item));

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
      website: websiteForEntry(item),
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
  const website = websiteForEntry({ domain, website: websiteRaw });

  if (!domain || !username || !password) {
    return { ok: false, message: '网站、用户名、密码均不能为空' };
  }

  const now = new Date().toISOString();
  const existingIndex = entries.findIndex((item) =>
    isSameDomainAndUsername(item, { domain, website, username })
  );

  if (existingIndex !== -1) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      website: website || entries[existingIndex].website || domain,
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
    website: website || domain,
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


// 扩展安装/更新/重新加载后，已打开页面里的旧 content script 会失效，
// 这里主动重置守卫并重新注入，避免用户必须刷新页面才能继续自动填充。
async function reinitializeContentScripts() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (error) {
    return;
  }

  for (const tab of tabs) {
    if (!tab?.id || tab.discarded || (tab.status && tab.status !== 'complete') || !isHttpUrl(tab.url || '')) {
      continue;
    }

    // 顶层脚本还活着就不动它，避免重复绑定事件
    const alive = await chrome.tabs
      .sendMessage(tab.id, { type: 'PM_EXT_PING' }, { frameId: 0 })
      .catch(() => null);
    if (alive?.ok) {
      continue;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          window.__PM_EXT_CONTENT_INITED__ = false;
        }
      });
    } catch (error) {
      // 受限 frame（沙箱/不支持注入的 URL）忽略
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js']
      });
    } catch (error) {
      // 受限页面（chrome://、扩展页等）忽略
    }
  }

  debugLog('reinitializeContentScripts', { tabs: tabs.length });
}

chrome.runtime.onInstalled.addListener(() => {
  inMemoryMasterPassword = null;
  reinitializeContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  reinitializeContentScripts();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const siteUrl = resolveSiteUrl(message, _sender);
  const withSiteUrl = (payload) => ({ ...(payload || {}), url: siteUrl || payload?.url || '' });

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

        sendResponse(await getCredentialsForUrl(siteUrl || message.url || ''));
        break;
      case 'SEARCH_CREDENTIALS':
        sendResponse(await searchCredentials(withSiteUrl(message.payload)));
        break;
      case 'CREDENTIAL_USED':
        sendResponse(await markCredentialUsed(withSiteUrl(message.payload)));
        break;

      case 'FORM_SUBMITTED':
        sendResponse(await saveSubmittedCredential(withSiteUrl(message.payload)));
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
