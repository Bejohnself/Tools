if (!window.__PM_EXT_CONTENT_INITED__) {
  window.__PM_EXT_CONTENT_INITED__ = true;

function dispatchInputEvents(input) {

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const DEBUG_AUTOFILL = true;

function debugLog(...args) {
  if (!DEBUG_AUTOFILL) {
    return;
  }
  console.log('[PM_EXT][content]', ...args);
}


function collectInputsDeep(root, result = []) {
  if (!root?.querySelectorAll) {
    return result;
  }

  result.push(...root.querySelectorAll('input'));

  const allElements = root.querySelectorAll('*');
  for (const element of allElements) {
    if (element.shadowRoot) {
      collectInputsDeep(element.shadowRoot, result);
    }
  }

  return result;
}

function isUsableInput(input) {
  if (!input || input.disabled || input.readOnly) {
    return false;
  }

  if ((input.type || '').toLowerCase() === 'hidden') {
    return false;
  }

  const style = window.getComputedStyle(input);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // 祖先 display:none 时，input 自身的 computed display 仍可能是可见值，这里用布局信息兜底
  if (typeof input.getClientRects === 'function' && input.getClientRects().length === 0) {
    return false;
  }

  return true;
}

function getCandidateInputs(scope = document) {
  return collectInputsDeep(scope).filter(isUsableInput);
}

function pickUsernameInput(scope = document) {
  const inputs = getCandidateInputs(scope);
  return (
    inputs.find((i) => i.type === 'email') ||
    inputs.find((i) => i.autocomplete === 'username') ||
    inputs.find((i) => /user|email|account|login|name/i.test(i.name || i.id || i.placeholder || '')) ||
    inputs.find((i) => ['text', 'tel'].includes(i.type)) ||
    null
  );
}

function pickPasswordInput(scope = document) {
  const inputs = getCandidateInputs(scope);
  return inputs.find((i) => i.type === 'password') || null;
}

function pickFormPasswordInputs(form) {
  return getCandidateInputs(form).filter((i) => i.type === 'password');
}


let lastToastAt = 0;
let quickPanelEl = null;
let quickPanelTitleEl = null;
let quickPanelSubEl = null;
let quickPanelPickerEl = null;
let activeInput = null;
let activeCredentials = [];

const credentialCache = {
  url: '',
  at: 0,
  credentials: []
};

let pendingMasterRotation = null;
let lastKnownWebAuthRaw = '';
let syncingMasterRotation = false;
let pendingLoginMasterPassword = '';
let syncingWebLogin = false;
let webLoginAttemptToken = '';

function isContextInvalidatedError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('extension context invalidated');
}

async function safeRuntimeSendMessage(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (error) {
    if (!isContextInvalidatedError(error)) {
      throw error;
    }
    return null;
  }
}

function isPasswordManagerWebPage() {
  return Boolean(
    document.getElementById('changeMasterPasswordForm') &&
      document.getElementById('oldMasterPassword') &&
      document.getElementById('newMasterPassword')
  );
}

function isPasswordManagerWebApp() {
  return Boolean(
    document.getElementById('loginForm') &&
      document.getElementById('masterPassword') &&
      document.getElementById('mainPage')
  );
}

function isWebAppLoggedIn() {
  const mainPage = document.getElementById('mainPage');
  return Boolean(mainPage?.classList?.contains('active'));
}

function capturePendingMasterRotation() {
  const oldInput = document.getElementById('oldMasterPassword');
  const newInput = document.getElementById('newMasterPassword');
  const confirmInput = document.getElementById('confirmMasterPassword');
  if (!(oldInput instanceof HTMLInputElement) || !(newInput instanceof HTMLInputElement)) {
    return;
  }

  const oldPassword = oldInput.value || '';
  const newPassword = newInput.value || '';
  const confirmPassword = confirmInput instanceof HTMLInputElement ? confirmInput.value || '' : newPassword;
  if (!oldPassword || !newPassword || newPassword !== confirmPassword) {
    return;
  }

  pendingMasterRotation = {
    oldPassword,
    newPassword,
    at: Date.now()
  };
}

function clearPendingMasterRotation() {
  pendingMasterRotation = null;
}

async function trySyncMasterRotationIfNeeded() {
  if (!isPasswordManagerWebPage() || syncingMasterRotation) {
    return;
  }

  const currentAuthRaw = localStorage.getItem('master_password_hash') || '';
  if (!lastKnownWebAuthRaw) {
    lastKnownWebAuthRaw = currentAuthRaw;
    return;
  }

  if (currentAuthRaw === lastKnownWebAuthRaw) {
    return;
  }

  lastKnownWebAuthRaw = currentAuthRaw;

  const rotation = pendingMasterRotation;
  if (!rotation || Date.now() - rotation.at > 120000) {
    clearPendingMasterRotation();
    return;
  }

  syncingMasterRotation = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'ROTATE_MASTER_FROM_WEB',
      payload: {
        oldPassword: rotation.oldPassword,
        newPassword: rotation.newPassword,
        webAuthRaw: currentAuthRaw
      }
    });

    if (result?.ok) {
      showToast('扩展主密码已同步更新');
    } else {
      showToast(result?.message || '扩展主密码同步失败', true);
    }
  } catch {
    showToast('扩展主密码同步失败', true);
  } finally {
    clearPendingMasterRotation();
    syncingMasterRotation = false;
  }
}

function bindMasterPasswordSync() {
  if (window.top !== window.self || !isPasswordManagerWebPage()) {
    return;
  }

  lastKnownWebAuthRaw = localStorage.getItem('master_password_hash') || '';

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest('button');
      if (!button) {
        return;
      }

      const form = button.closest('form');
      if (!form || form.id !== 'changeMasterPasswordForm') {
        return;
      }

      capturePendingMasterRotation();
      setTimeout(() => {
        void trySyncMasterRotationIfNeeded();
      }, 250);
      setTimeout(() => {
        void trySyncMasterRotationIfNeeded();
      }, 800);
    },
    true
  );

  document.addEventListener(
    'submit',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement) || target.id !== 'changeMasterPasswordForm') {
        return;
      }
      capturePendingMasterRotation();
      setTimeout(() => {
        void trySyncMasterRotationIfNeeded();
      }, 250);
    },
    true
  );

  setInterval(() => {
    void trySyncMasterRotationIfNeeded();
  }, 1000);
}

async function trySyncLoginFromWebIfNeeded() {
  if (!isPasswordManagerWebApp() || syncingWebLogin || !pendingLoginMasterPassword) {
    return;
  }

  if (!isWebAppLoggedIn()) {
    return;
  }

  const authRaw = localStorage.getItem('master_password_hash') || '';
  const passwordsRaw = localStorage.getItem('encrypted_passwords') || '[]';
  if (!authRaw) {
    return;
  }

  const attemptToken = webLoginAttemptToken;
  if (!attemptToken) {
    return;
  }

  syncingWebLogin = true;
  try {
    const result = await safeRuntimeSendMessage({
      type: 'SYNC_LOGIN_FROM_WEB',
      payload: {
        masterPassword: pendingLoginMasterPassword,
        authRaw,
        passwordsRaw,
        sourceUrl: location.href
      }
    });

    if (result?.ok && webLoginAttemptToken === attemptToken) {
      webLoginAttemptToken = '';
      pendingLoginMasterPassword = '';
    }
  } finally {
    syncingWebLogin = false;
  }
}

function bindWebLoginSync() {
  if (window.top !== window.self || !isPasswordManagerWebApp()) {
    return;
  }

  document.addEventListener(
    'submit',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement) || target.id !== 'loginForm') {
        return;
      }

      const masterInput = document.getElementById('masterPassword');
      if (!(masterInput instanceof HTMLInputElement)) {
        return;
      }

      pendingLoginMasterPassword = masterInput.value || '';
      if (!pendingLoginMasterPassword) {
        return;
      }

      webLoginAttemptToken = `${Date.now()}-${Math.random()}`;

      setTimeout(() => {
        void trySyncLoginFromWebIfNeeded();
      }, 220);
      setTimeout(() => {
        void trySyncLoginFromWebIfNeeded();
      }, 700);
      setTimeout(() => {
        void trySyncLoginFromWebIfNeeded();
      }, 1400);
    },
    true
  );
}

function showToast(text, isError = false) {

  const now = Date.now();
  if (now - lastToastAt < 1000) {
    return;
  }
  lastToastAt = now;

  const toast = document.createElement('div');
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'fixed',
    right: '16px',
    top: '16px',
    zIndex: '2147483647',
    background: isError ? 'rgba(127, 29, 29, 0.95)' : 'rgba(15, 23, 42, 0.92)',
    color: '#e2e8f0',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity .2s ease'
  });

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 220);
  }, 1200);
}

function hasNearbyPasswordInput(input) {
  const containerHasPassword = (root) => {
    if (!root?.querySelectorAll) {
      return false;
    }
    for (const candidate of root.querySelectorAll('input[type="password"]')) {
      if (isUsableInput(candidate)) {
        return true;
      }
    }
    return false;
  };

  if (containerHasPassword(input.form)) {
    return true;
  }

  // 账号框和密码框可能分在相邻容器里（例如 login-form > div > input），往上找几层
  let container = input.parentElement;
  for (let depth = 0; container && depth < 4; depth += 1) {
    if (containerHasPassword(container)) {
      return true;
    }
    container = container.parentElement;
  }

  return false;
}

function isLikelyLoginInput(input) {
  const type = (input.type || '').toLowerCase();
  if (type === 'password' || type === 'email') {
    return true;
  }

  if (input.autocomplete === 'username' || input.autocomplete === 'current-password') {
    return true;
  }

  const marker = `${input.name || ''} ${input.id || ''} ${input.placeholder || ''}`;
  if (/user|email|account|login|name|phone|pass|pwd/i.test(marker)) {
    return true;
  }

  // 兜底：字段命名看不出来时，只要同一表单/邻近容器里有可见密码框，也算登录框
  if (['text', 'tel', 'email', ''].includes(type)) {
    return hasNearbyPasswordInput(input);
  }

  return false;
}

function getSelectedCredential() {
  if (!quickPanelPickerEl || !activeCredentials.length) {
    return null;
  }
  const index = Number(quickPanelPickerEl.value || '0');
  return activeCredentials[index] || activeCredentials[0] || null;
}

async function notifyCredentialUsed(credential) {
  if (!credential) {
    return;
  }
  await chrome.runtime
    .sendMessage({
      type: 'CREDENTIAL_USED',
      payload: {
        id: credential.id,
        username: credential.username,
        domain: location.host,
        url: location.href
      }
    })
    .catch(() => null);
}

function ensureQuickPanel() {
  if (quickPanelEl || !document.body) {
    return;
  }

  const panel = document.createElement('div');
  const title = document.createElement('div');
  const sub = document.createElement('div');
  const picker = document.createElement('select');
  const fillBtn = document.createElement('button');
  const copyUserBtn = document.createElement('button');
  const copyPwdBtn = document.createElement('button');
  const deleteBtn = document.createElement('button');

  title.textContent = '匹配到账号';
  sub.textContent = '';

  fillBtn.textContent = '填充账号和密码';
  fillBtn.dataset.action = 'fill';

  copyUserBtn.textContent = '复制账号';
  copyUserBtn.dataset.action = 'copy-username';

  copyPwdBtn.textContent = '复制密码';
  copyPwdBtn.dataset.action = 'copy-password';

  deleteBtn.textContent = '删除';
  deleteBtn.dataset.action = 'delete-credential';


  Object.assign(panel.style, {
    position: 'fixed',
    zIndex: '2147483647',
    boxSizing: 'border-box',
    minWidth: '200px',
    maxWidth: '280px',
    padding: '8px',
    borderRadius: '10px',
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(2, 6, 23, 0.96)',
    color: '#e2e8f0',
    boxShadow: '0 8px 24px rgba(2,6,23,.45)',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: '12px',
    overflowY: 'auto',
    display: 'none'
  });

  Object.assign(title.style, {
    fontWeight: '600',
    fontSize: '12px',
    marginBottom: '2px'
  });

  Object.assign(sub.style, {
    color: '#94a3b8',
    fontSize: '11px',
    marginBottom: '6px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis'
  });

  Object.assign(picker.style, {
    display: 'block',
    width: '100%',
    border: '1px solid rgba(148,163,184,0.35)',
    borderRadius: '7px',
    padding: '5px 6px',
    fontSize: '12px',
    background: 'rgba(15,23,42,0.9)',
    color: '#e2e8f0'
  });

  Object.assign(fillBtn.style, {
    display: 'block',
    width: '100%',
    border: '0',
    borderRadius: '7px',
    padding: '7px 8px',
    marginTop: '6px',
    cursor: 'pointer',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    background: 'rgba(79, 70, 229, 0.95)'
  });

  const buttonRow = document.createElement('div');
  Object.assign(buttonRow.style, {
    display: 'flex',
    gap: '6px',
    marginTop: '6px'
  });

  for (const btn of [copyUserBtn, copyPwdBtn, deleteBtn]) {
    Object.assign(btn.style, {
      flex: '1',
      minWidth: '0',
      border: '0',
      borderRadius: '7px',
      padding: '6px 4px',
      cursor: 'pointer',
      color: '#e2e8f0',
      fontSize: '11px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      background: 'rgba(30,41,59,0.9)'
    });
  }

  deleteBtn.style.background = 'rgba(127, 29, 29, 0.92)';

  buttonRow.appendChild(copyUserBtn);
  buttonRow.appendChild(copyPwdBtn);
  buttonRow.appendChild(deleteBtn);

  panel.appendChild(title);
  panel.appendChild(sub);
  panel.appendChild(picker);
  panel.appendChild(fillBtn);
  panel.appendChild(buttonRow);




  panel.addEventListener('click', async (event) => {
    const target = event.target;
    const credential = getSelectedCredential();
    if (!(target instanceof HTMLButtonElement) || !credential) {
      return;
    }

    const action = target.dataset.action;
    if (action === 'fill') {
      const filled = fillCredential(credential, activeInput);
      if (filled) {
        await notifyCredentialUsed(credential);
        hideQuickPanel();
      }
      showToast(filled ? '已填充' : '未找到可填充输入框', !filled);
      return;
    }


    if (action === 'copy-username') {
      await copyText(credential.username, '账号');
      return;
    }

    if (action === 'copy-password') {
      await copyText(credential.password, '密码');
      return;
    }

    if (action === 'delete-credential') {
      const result = await safeRuntimeSendMessage({
        type: 'DELETE_CREDENTIAL',
        payload: {
          id: credential.id,
          username: credential.username,
          domain: credential.domain,
          website: credential.website,
          url: location.href
        }
      });

      if (!result?.ok) {
        const reason = result?.message || result?.reason || '删除失败';
        showToast(String(reason), true);
        return;
      }

      credentialCache.at = 0;
      credentialCache.credentials = [];
      const refreshed = await requestCredentialsForCurrentUrl();
      if (!refreshed.length) {
        hideQuickPanel();
      } else if (activeInput) {
        showQuickPanel(activeInput, refreshed);
      }
      showToast('已删除该账号');
    }
  });


  picker.addEventListener('change', () => {
    const credential = getSelectedCredential();
    if (!credential || !quickPanelSubEl) {
      return;
    }
    quickPanelSubEl.textContent = `${credential.username} @ ${credential.domain || location.host}`;
  });

  document.body.appendChild(panel);
  quickPanelEl = panel;
  quickPanelTitleEl = title;
  quickPanelSubEl = sub;
  quickPanelPickerEl = picker;
}


function updateQuickPanelPosition() {
  if (!quickPanelEl || !activeInput) {
    return;
  }

  const margin = 8;
  const viewportWidth = Math.max(160, window.innerWidth);
  const viewportHeight = Math.max(120, window.innerHeight);
  const availableWidth = Math.max(140, viewportWidth - margin * 2);

  quickPanelEl.style.minWidth = `${Math.min(200, availableWidth)}px`;
  quickPanelEl.style.maxWidth = `${Math.min(280, availableWidth)}px`;
  quickPanelEl.style.maxHeight = `${Math.max(120, viewportHeight - margin * 2)}px`;

  const panelRect = quickPanelEl.getBoundingClientRect();
  const panelWidth = panelRect.width || Math.min(280, availableWidth);
  const panelHeight = panelRect.height || 150;
  const inputRect = activeInput.getBoundingClientRect();

  let left = inputRect.left;
  left = Math.min(left, viewportWidth - panelWidth - margin);
  left = Math.max(margin, left);

  // 默认放在输入框下方；下方放不下且上方更宽裕时翻到上方，最后夹进视口
  let top = inputRect.bottom + margin;
  const spaceBelow = viewportHeight - inputRect.bottom - margin * 2;
  const spaceAbove = inputRect.top - margin * 2;
  if (panelHeight > spaceBelow && spaceAbove > spaceBelow) {
    top = inputRect.top - panelHeight - margin;
  }
  top = Math.min(top, viewportHeight - panelHeight - margin);
  top = Math.max(margin, top);

  quickPanelEl.style.left = `${Math.round(left)}px`;
  quickPanelEl.style.top = `${Math.round(top)}px`;
}

function hideQuickPanel() {
  if (!quickPanelEl) {
    return;
  }
  quickPanelEl.style.display = 'none';
  activeInput = null;
  activeCredentials = [];
}

function showQuickPanel(input, credentials) {
  ensureQuickPanel();
  if (!quickPanelEl || !quickPanelTitleEl || !quickPanelSubEl || !quickPanelPickerEl) {
    return;
  }

  activeInput = input;
  activeCredentials = Array.isArray(credentials) ? credentials : [];
  if (!activeCredentials.length) {
    hideQuickPanel();
    return;
  }

  quickPanelTitleEl.textContent = `匹配到账号（${activeCredentials.length}）`;
  quickPanelPickerEl.innerHTML = '';

  activeCredentials.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = item.username;
    quickPanelPickerEl.appendChild(option);
  });

  const first = activeCredentials[0];
  quickPanelSubEl.textContent = `${first.username} @ ${first.domain || location.host}`;
  quickPanelEl.style.display = 'block';
  updateQuickPanelPosition();
}


function fillCredential(credential, anchorInput) {
  const scope = anchorInput?.form || document;
  let usernameInput = pickUsernameInput(scope) || pickUsernameInput(document);
  let passwordInput = pickPasswordInput(scope) || pickPasswordInput(document);

  if (anchorInput?.type === 'password') {
    passwordInput = anchorInput;
  }

  if (anchorInput && ['email', 'text', 'tel'].includes(anchorInput.type)) {
    usernameInput = anchorInput;
  }

  let filled = false;

  if (usernameInput) {
    usernameInput.value = credential.username;
    dispatchInputEvents(usernameInput);
    filled = true;
  }

  if (passwordInput) {
    passwordInput.value = credential.password;
    dispatchInputEvents(passwordInput);
    filled = true;
  }

  debugLog('手动触发填充', {
    domain: location.host,
    usernameFilled: Boolean(usernameInput),
    passwordFilled: Boolean(passwordInput)
  });

  return filled;
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text || '');
    showToast(`${label}已复制`);
  } catch {
    showToast(`${label}复制失败，请手动复制`, true);
  }
}

async function requestCredentialsForCurrentUrl() {
  const cacheFresh = credentialCache.url === location.href && Date.now() - credentialCache.at < 5000;
  if (cacheFresh) {
    return credentialCache.credentials;
  }

  // 子 frame（例如阿里云登录弹窗 iframe）也要能取到凭据，站点由后台按顶层页面换算
  const response = await safeRuntimeSendMessage({
    type: 'GET_CREDENTIALS_FOR_URL',
    url: location.href
  });

  if (!response?.ok) {
    debugLog('获取凭据失败', response?.reason || response?.message || 'UNKNOWN');
    credentialCache.url = location.href;
    credentialCache.at = Date.now();
    credentialCache.credentials = [];
    return [];
  }

  credentialCache.url = location.href;
  credentialCache.at = Date.now();
  credentialCache.credentials = Array.isArray(response.credentials) ? response.credentials : [];
  return credentialCache.credentials;
}


function bindManualFillInteraction() {
  document.addEventListener(
    'focusin',
    async (event) => {
      const target = event.target;

      if (target instanceof Node && quickPanelEl?.contains(target)) {
        return;
      }

      if (!(target instanceof HTMLInputElement) || !isUsableInput(target)) {
        hideQuickPanel();
        return;
      }

      if (!isLikelyLoginInput(target)) {
        hideQuickPanel();
        return;
      }

      const credentials = await requestCredentialsForCurrentUrl();

      if (!credentials.length) {
        hideQuickPanel();
        return;
      }

      showQuickPanel(target, credentials);

    },
    true
  );

  document.addEventListener(
    'mousedown',
    (event) => {
      if (!quickPanelEl || quickPanelEl.style.display === 'none') {
        return;
      }
      const target = event.target;
      if (target instanceof Node && (quickPanelEl.contains(target) || target === activeInput)) {
        return;
      }
      hideQuickPanel();
    },
    true
  );

  document.addEventListener(
    'scroll',
    () => {
      if (quickPanelEl?.style.display === 'block') {
        updateQuickPanelPosition();
      }
    },
    true
  );

  window.addEventListener('resize', () => {
    if (quickPanelEl?.style.display === 'block') {
      updateQuickPanelPosition();
    }
  });
}



function extractFormCredential(form) {
  const usernameInput = pickUsernameInput(form) || pickUsernameInput(document);
  const passwordInputs = pickFormPasswordInputs(form);

  if (!passwordInputs.length) {
    return null;
  }

  const passwordInput = passwordInputs[0];
  const confirmInput = passwordInputs[1] || null;
  const isRegistration = Boolean(confirmInput);

  if (!usernameInput?.value || !passwordInput?.value) {
    return null;
  }

  return {
    url: location.href,
    domain: location.host,
    username: usernameInput.value.trim(),
    password: passwordInput.value,
    isRegistration
  };
}

function bindFormSubmitListener() {
  document.addEventListener(
    'submit',
    async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const payload = extractFormCredential(form);
      if (!payload) {
        return;
      }

      await safeRuntimeSendMessage({
        type: 'FORM_SUBMITTED',
        payload
      });
    },
    true
  );
}

function init() {
  bindManualFillInteraction();
  bindFormSubmitListener();
  bindMasterPasswordSync();
  bindWebLoginSync();
}



chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
    if (message?.type === 'PM_EXT_PING') {
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === 'EXPORT_WEBAPP_DATA') {
      if (window.top !== window.self) {
        return undefined;
      }
      const auth = localStorage.getItem('master_password_hash');
      const passwords = localStorage.getItem('encrypted_passwords');
      sendResponse({ ok: true, auth, passwords, url: location.href });
      return true;
    }

    if (message?.type === 'IMPORT_WEBAPP_DATA') {
      if (window.top !== window.self) {
        return undefined;
      }
      const authRaw = message?.payload?.authRaw || '';
      const passwordsRaw = message?.payload?.passwordsRaw || '[]';
      const deletesRaw = message?.payload?.deletesRaw || '[]';
      const autoReload = Boolean(message?.payload?.autoReload);
      const mode = message?.payload?.mode === 'replace' ? 'replace' : 'merge';
      debugLog('收到写回网页请求', {
        mode,
        autoReload,
        hasAuthRaw: Boolean(authRaw),
        hasPasswordsRaw: Boolean(passwordsRaw),
        hasDeletesRaw: Boolean(deletesRaw)
      });

      if (!authRaw) {
        sendResponse({ ok: false, message: '缺少待写入数据' });
        return true;
      }

      let incoming = [];
      let incomingDeletes = [];
      try {
        incoming = JSON.parse(passwordsRaw || '[]');
      } catch {
        sendResponse({ ok: false, message: '待写入密码数据格式错误' });
        return true;
      }

      try {
        incomingDeletes = JSON.parse(deletesRaw || '[]');
      } catch {
        sendResponse({ ok: false, message: '待删除数据格式错误' });
        return true;
      }


      const currentAuthRaw = localStorage.getItem('master_password_hash') || '';
      if (currentAuthRaw) {
        let currentAuth = null;
        let incomingAuth = null;
        try {
          currentAuth = JSON.parse(currentAuthRaw);
          incomingAuth = JSON.parse(authRaw);
        } catch {
          currentAuth = null;
          incomingAuth = null;
        }

        const sameByFields =
          currentAuth &&
          incomingAuth &&
          currentAuth.salt === incomingAuth.salt &&
          currentAuth.hash === incomingAuth.hash;
        const sameByRaw = currentAuthRaw === authRaw;

        if (!sameByFields && !sameByRaw) {
          const currentSalt = currentAuth?.salt ? String(currentAuth.salt).slice(0, 8) : 'none';
          const incomingSalt = incomingAuth?.salt ? String(incomingAuth.salt).slice(0, 8) : 'none';
          sendResponse({
            ok: false,
            message: `网页主密码与扩展主密码不一致，拒绝写入（salt: ${currentSalt} vs ${incomingSalt}）`
          });
          return true;
        }

      }


      const parseDeleteSite = (value) => {
        if (!value) {
          return { host: '', hostname: '' };
        }
        const asUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        try {
          const url = new URL(asUrl);
          return {
            host: url.host.toLowerCase().replace(/^www\./i, ''),
            hostname: url.hostname.toLowerCase().replace(/^www\./i, '')
          };
        } catch {
          const fallback = String(value || '').trim().toLowerCase();
          return { host: fallback, hostname: fallback };
        }
      };

      const isSameSite = (left, right) => {
        if (!left.host || !right.host) {
          return false;
        }
        if (left.host === right.host) {
          return true;
        }
        // 无端口的旧记录兼容同主机所有端口
        if (left.host === left.hostname && left.hostname === right.hostname) {
          return true;
        }
        if (right.host === right.hostname && right.hostname === left.hostname) {
          return true;
        }
        return false;
      };

      const shouldDeleteItem = (item) => {
        return incomingDeletes.some((target) => {
          const targetId = String(target?.id || '');
          const itemId = String(item?.id || '');
          if (targetId && itemId && targetId === itemId) {
            return true;
          }

          const targetUsername = String(target?.username || '').trim().toLowerCase();
          const itemUsername = String(item?.username || '').trim().toLowerCase();
          const targetSite = parseDeleteSite(target?.domain || target?.website || '');
          const itemSite = parseDeleteSite(item?.domain || item?.website || '');
          return Boolean(targetUsername && itemUsername && targetUsername === itemUsername && isSameSite(targetSite, itemSite));
        });
      };

      let finalList = Array.isArray(incoming) ? [...incoming] : [];

      if (mode === 'merge') {
        let current = [];
        try {
          current = JSON.parse(localStorage.getItem('encrypted_passwords') || '[]');
        } catch {
          current = [];
        }

        const merged = Array.isArray(current) ? [...current] : [];
        for (const item of incoming) {
          const idx = merged.findIndex(
            (p) =>
              (p?.website || '').toLowerCase() === (item?.website || '').toLowerCase() &&
              (p?.username || '').toLowerCase() === (item?.username || '').toLowerCase()
          );
          if (idx === -1) {
            merged.push(item);
          } else {
            merged[idx] = { ...merged[idx], ...item };
          }
        }
        finalList = merged;
      }

      if (incomingDeletes.length > 0) {
        finalList = finalList.filter((item) => !shouldDeleteItem(item));
      }


      localStorage.setItem('master_password_hash', authRaw);
      localStorage.setItem('encrypted_passwords', JSON.stringify(finalList));

      if (autoReload) {
        setTimeout(() => {
          location.reload();
        }, 120);
      }

      sendResponse({
        ok: true,
        reloaded: autoReload,
        imported: incoming.length,
        deleted: incomingDeletes.length,
        total: finalList.length
      });
      return true;
    }

  } catch (error) {
    sendResponse({ ok: false, message: String(error?.message || error) });
    return true;
  }

  return undefined;
});


init();
}

