export const AUTH_KEY = 'pm_ext_auth';
export const VAULT_KEY = 'pm_ext_vault';
export const META_KEY = 'pm_ext_meta';
export const SESSION_MASTER_KEY = 'pm_ext_session_master';


export async function getAuth() {
  const data = await chrome.storage.local.get(AUTH_KEY);
  return data[AUTH_KEY] || null;
}

export async function setAuth(value) {
  await chrome.storage.local.set({ [AUTH_KEY]: value });
}

export async function getVault() {
  const data = await chrome.storage.local.get(VAULT_KEY);
  return data[VAULT_KEY] || null;
}

export async function setVault(value) {
  await chrome.storage.local.set({ [VAULT_KEY]: value });
}

export async function getMeta() {
  const data = await chrome.storage.local.get(META_KEY);
  return data[META_KEY] || {};
}

export async function setMeta(value) {
  await chrome.storage.local.set({ [META_KEY]: value || {} });
}

export async function getSessionMasterPassword() {

  if (!chrome.storage.session) {
    return null;
  }
  const data = await chrome.storage.session.get(SESSION_MASTER_KEY);
  return data[SESSION_MASTER_KEY] || null;
}

export async function setSessionMasterPassword(masterPassword) {
  if (!chrome.storage.session) {
    return;
  }
  await chrome.storage.session.set({ [SESSION_MASTER_KEY]: masterPassword });
}

export async function clearSessionMasterPassword() {
  if (!chrome.storage.session) {
    return;
  }
  await chrome.storage.session.remove(SESSION_MASTER_KEY);
}
