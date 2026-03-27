const setupPanel = document.getElementById('setupPanel');
const unlockPanel = document.getElementById('unlockPanel');
const unlockedPanel = document.getElementById('unlockedPanel');
const messageEl = document.getElementById('message');
const vaultCountEl = document.getElementById('vaultCount');
const newSinceImportEl = document.getElementById('newSinceImport');
const statusBadgeEl = document.getElementById('statusBadge');
const bindingBadgeEl = document.getElementById('bindingBadge');
const themeToggleBtn = document.getElementById('themeToggleBtn');

const POPUP_THEME_KEY = 'pm_ext_popup_theme';

function applyTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  const isDark = normalized === 'dark';
  document.body.dataset.theme = normalized;
  if (themeToggleBtn) {
    themeToggleBtn.textContent = isDark ? '\u2600' : '\u263D';
    themeToggleBtn.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
    themeToggleBtn.setAttribute('title', isDark ? '切换到浅色模式' : '切换到深色模式');
  }
}

function initTheme() {
  const stored = localStorage.getItem(POPUP_THEME_KEY);
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
    return;
  }
  const preferredDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(preferredDark ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(POPUP_THEME_KEY, next);
}

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? 'var(--message-error)' : 'var(--message-ok)';
}


function setStatusBadge(text, type = 'warn') {
  if (!statusBadgeEl) {
    return;
  }
  statusBadgeEl.textContent = text;
  statusBadgeEl.classList.remove('ok', 'warn', 'danger');
  statusBadgeEl.classList.add(type);
}

function setBindingBadge(linked) {
  if (!bindingBadgeEl) {
    return;
  }
  bindingBadgeEl.textContent = linked ? '网页主密码：已绑定' : '网页主密码：未绑定';
  bindingBadgeEl.classList.toggle('unlinked', !linked);
}


function showPanel(panel) {
  setupPanel.classList.add('hidden');
  unlockPanel.classList.add('hidden');
  unlockedPanel.classList.add('hidden');
  panel.classList.remove('hidden');
}

async function sendMessage(payload) {
  return chrome.runtime.sendMessage(payload);
}

function formatImportTime(value) {
  if (!value) {
    return '尚未从网页导入';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }
  return `上次网页导入：${date.toLocaleString()}`;
}

function formatNoteTimestamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function generateRandomPassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += charset[random[i] % charset.length];
  }
  return result;
}


async function getActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab || null;
}

function toKeyDomain(urlString = '') {
  try {
    const { hostname } = new URL(urlString);
    const host = String(hostname || '').toLowerCase().replace(/^www\./i, '');
    if (!host) {
      return '';
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return host;
    }

    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) {
      return host;
    }

    const commonSecondLevel = new Set(['com', 'net', 'org', 'gov', 'edu', 'ac']);
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    if (last.length === 2 && commonSecondLevel.has(secondLast) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

async function syncActiveWebsiteToInput() {
  const websiteInput = document.getElementById('addWebsite');
  if (!websiteInput) {
    return '';
  }

  const activeTab = await getActiveTab();
  const keyDomain = toKeyDomain(activeTab?.url || '');
  websiteInput.value = keyDomain;
  return keyDomain;
}


function extractSalt(authRaw) {
  try {
    const auth = JSON.parse(authRaw || '{}');
    return auth?.salt || '';
  } catch {
    return '';
  }
}

async function ensureContentScriptReady(tabId) {
  const firstProbe = await chrome.tabs.sendMessage(tabId, { type: 'EXPORT_WEBAPP_DATA' }).catch(() => null);
  if (firstProbe?.ok) {
    return { ok: true, data: firstProbe, injected: false };
  }


  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (error) {
    return { ok: false, message: `注入脚本失败：${String(error?.message || error)}` };
  }

  const secondProbe = await chrome.tabs.sendMessage(tabId, { type: 'EXPORT_WEBAPP_DATA' }).catch(() => null);
  if (!secondProbe?.ok) {
    return { ok: false, message: '脚本已注入，但页面仍未响应（请确认当前页是密码管理器网页）' };
  }

  return { ok: true, data: secondProbe, injected: true };
}

async function pushExtensionNewDataToWebApp(autoReload = false) {

  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    return { ok: false, stage: 'tab', message: '未找到当前标签页' };
  }

  const pageProbe = await ensureContentScriptReady(activeTab.id);
  if (!pageProbe?.ok) {
    return { ok: false, stage: 'probe', message: pageProbe.message || '当前页面未注入扩展脚本' };
  }


  const exportResult = await sendMessage({
    type: 'EXPORT_NEW_TO_WEB_APP',
    payload: {
      webAuthRaw: pageProbe?.data?.auth || ''
    }
  });

  if (!exportResult?.ok) {
    return { ok: false, stage: 'export', message: exportResult?.message || '读取扩展数据失败' };
  }

  const pageSalt = extractSalt(pageProbe?.data?.auth || '');
  const outgoingSalt = extractSalt(exportResult?.authRaw || '');
  if (pageSalt && outgoingSalt && pageSalt !== outgoingSalt) {
    return {
      ok: false,
      stage: 'export',
      message: `导出认证盐值异常（page: ${String(pageSalt).slice(0, 8)} vs out: ${String(outgoingSalt).slice(0, 8)}），请重载扩展后重试`
    };
  }

  if (!exportResult.count) {

    return {
      ok: true,
      count: 0,
      message: '没有需要同步到网页的新增记录',
      debug: { tabUrl: activeTab.url || '', exported: 0 }
    };
  }

  const writeResult = await chrome.tabs
    .sendMessage(activeTab.id, {
      type: 'IMPORT_WEBAPP_DATA',
      payload: {
        authRaw: exportResult.authRaw,
        passwordsRaw: exportResult.passwordsRaw,
        autoReload,
        mode: 'merge'
      }
    })
    .catch((error) => ({ ok: false, message: String(error?.message || error) }));

  if (!writeResult?.ok) {
    return {
      ok: false,
      stage: 'import',
      message: writeResult?.message || '写回网页失败',
      debug: { tabUrl: activeTab.url || '', exported: exportResult.count }
    };
  }

  return {
    ok: true,
    count: exportResult.count,
    reloaded: Boolean(writeResult.reloaded),
    debug: {
      tabUrl: activeTab.url || '',
      exported: exportResult.count,
      imported: writeResult.imported || 0,
      total: writeResult.total || 0
    }
  };
}


async function refreshStatus() {


  const status = await sendMessage({ type: 'GET_STATUS' });

  if (!status.hasMaster) {
    showPanel(setupPanel);
    setStatusBadge('未初始化', 'warn');
    setBindingBadge(false);
    setMessage('请切到网页版密码管理器后，输入网页主密码进行初始化');
    return;
  }



  if (!status.unlocked) {
    showPanel(unlockPanel);
    setStatusBadge('已锁定', 'danger');
    setBindingBadge(true);
    setMessage('扩展已锁定');
    return;
  }


  showPanel(unlockedPanel);
  setStatusBadge('已解锁', 'ok');
  setBindingBadge(true);

  vaultCountEl.textContent = `当前记录数：${status.count}`;
  if (newSinceImportEl) {
    const sinceText = formatImportTime(status.lastWebImportAt);
    newSinceImportEl.textContent = `自上次网页导入后新增：${status.newSinceImport || 0} 条（${sinceText}）`;
  }
  await syncActiveWebsiteToInput();
  setMessage('已解锁，点击输入框可手动填充');
}




document.getElementById('setupBtn').addEventListener('click', async () => {
  const pwd = document.getElementById('setupPassword').value;
  if (!pwd || pwd.length < 6) {
    setMessage('主密码至少 6 位', true);
    return;
  }

  setMessage('正在读取当前标签页网页数据...');

  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    setMessage('未找到当前标签页', true);
    return;
  }

  const probe = await ensureContentScriptReady(activeTab.id);
  if (!probe?.ok) {
    setMessage(probe?.message || '当前页面不是网页版密码管理器，或页面未就绪', true);
    return;
  }

  const pageData = probe.data;
  if (!pageData?.ok || !pageData.auth || !pageData.passwords) {
    setMessage('当前页面不是网页版密码管理器，或页面未就绪', true);
    return;
  }

  const result = await sendMessage({
    type: 'INIT_FROM_WEB_APP',
    payload: {
      authRaw: pageData.auth,
      passwordsRaw: pageData.passwords,
      sourceUrl: pageData.url,
      masterPassword: pwd
    }
  });

  if (!result?.ok) {
    setMessage(result?.message || '初始化失败', true);
    return;
  }

  setMessage(`初始化成功：已导入 ${result.count || 0} 条记录`);
  await refreshStatus();
});


document.getElementById('unlockBtn').addEventListener('click', async () => {
  const pwd = document.getElementById('unlockPassword').value;
  if (!pwd) {
    setMessage('请输入主密码', true);
    return;
  }

  const result = await sendMessage({ type: 'UNLOCK', masterPassword: pwd });
  if (!result.ok) {
    setMessage(result.message || '解锁失败', true);
    return;
  }

  await refreshStatus();
});

document.getElementById('lockBtn').addEventListener('click', async () => {
  await sendMessage({ type: 'LOCK' });
  await refreshStatus();
});

document.getElementById('importBtn').addEventListener('click', async () => {
  setMessage('正在读取当前标签页数据...');

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    setMessage('未找到当前标签页', true);
    return;
  }

  const probe = await ensureContentScriptReady(activeTab.id);
  if (!probe?.ok) {
    setMessage(probe?.message || '当前页面不是网页版密码管理器，或页面未就绪', true);
    return;
  }

  const pageData = probe.data;
  if (!pageData?.ok || !pageData.auth || !pageData.passwords) {
    setMessage('当前页面不是网页版密码管理器，或页面未就绪', true);
    return;
  }


  const mode = document.getElementById('replaceMode')?.checked ? 'replace' : 'merge';
  const result = await sendMessage({
    type: 'IMPORT_FROM_WEB_APP',
    payload: {
      authRaw: pageData.auth,
      passwordsRaw: pageData.passwords,
      sourceUrl: pageData.url,
      mode
    }
  });

  if (!result?.ok) {
    setMessage(result?.message || '导入失败', true);
    return;
  }

  if (result.mode === 'replace') {
    setMessage(`覆盖导入完成：共 ${result.added} 条`);
  } else {
    setMessage(`导入完成：新增 ${result.added} 条，更新 ${result.updated} 条`);
  }
  await refreshStatus();
});


document.getElementById('syncToWebBtn').addEventListener('click', async () => {
  const autoReload = true;
  const result = await pushExtensionNewDataToWebApp(autoReload);
  await refreshStatus();

  if (!result?.ok) {
    const stageText = result?.stage ? `（阶段: ${result.stage}）` : '';
    setMessage(`${result?.message || '同步到网页失败'}${stageText}`, true);
    return;
  }

  const debugText = result?.debug
    ? ` | exported=${result.debug.exported ?? 0}, imported=${result.debug.imported ?? 0}, total=${result.debug.total ?? 0}`
    : '';
  setMessage(result.count ? `已同步 ${result.count} 条新增记录到网页${debugText}` : (result.message || '无需同步'));
});



document.getElementById('genPasswordBtn').addEventListener('click', () => {
  const passwordInput = document.getElementById('addPassword');
  passwordInput.value = generateRandomPassword(16);
  setMessage('已生成随机密码');
});

document.getElementById('addBtn').addEventListener('click', async () => {

  const website = (await syncActiveWebsiteToInput()) || document.getElementById('addWebsite').value;
  const username = document.getElementById('addUsername').value;
  const password = document.getElementById('addPassword').value;
  const rawNotes = document.getElementById('addNotes').value.trim();
  const autoTimestamp = Boolean(document.getElementById('addAutoTimestamp')?.checked);
  const notes = autoTimestamp
    ? `${rawNotes}${rawNotes ? ' ' : ''}${formatNoteTimestamp()}`
    : rawNotes;

  if (!website) {
    setMessage('无法识别当前网页域名，请切换到普通网页后重试', true);
    return;
  }

  localStorage.setItem('pm_ext_auto_timestamp', autoTimestamp ? 'true' : 'false');

  const result = await sendMessage({
    type: 'ADD_CREDENTIAL',
    payload: {
      website,
      username,
      password,
      notes
    }
  });

  if (!result?.ok) {
    setMessage(result?.message || '保存失败', true);
    return;
  }

  document.getElementById('addWebsite').value = '';
  document.getElementById('addUsername').value = '';
  document.getElementById('addPassword').value = '';
  document.getElementById('addNotes').value = '';

  const autoSyncToWeb = Boolean(document.getElementById('autoSyncToWeb')?.checked);
  if (autoSyncToWeb) {
    const syncResult = await pushExtensionNewDataToWebApp(false);
    if (syncResult?.ok) {
      const debugText = syncResult?.debug
        ? ` | exported=${syncResult.debug.exported ?? 0}, imported=${syncResult.debug.imported ?? 0}, total=${syncResult.debug.total ?? 0}`
        : '';
      setMessage(syncResult.count ? `保存成功，并已同步 ${syncResult.count} 条到网页${debugText}` : '保存成功，当前无新增可同步');
    } else {
      const stageText = syncResult?.stage ? `（阶段: ${syncResult.stage}）` : '';
      setMessage(`保存成功，但自动同步失败：${syncResult?.message || '未知错误'}${stageText}`, true);
    }
  } else {

    setMessage(result.added ? '新增成功' : '已存在同用户名记录，已更新密码');
  }
  await refreshStatus();
});


document.getElementById('refreshBtn').addEventListener('click', refreshStatus);
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', toggleTheme);
}

const addAutoTimestampEl = document.getElementById('addAutoTimestamp');

if (addAutoTimestampEl) {
  addAutoTimestampEl.checked = localStorage.getItem('pm_ext_auto_timestamp') === 'true';
}

initTheme();
syncActiveWebsiteToInput();
refreshStatus();

