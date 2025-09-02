// 主密码存储
const MASTER_PASSWORD_KEY = 'master_password_hash';
const PASSWORDS_KEY = 'encrypted_passwords';
const THEME_KEY = 'preferred_theme';
const CUSTOM_KEYS_KEY = 'custom_keys'; // 新增自定义快捷键存储键

// 当前会话状态
let isAuthenticated = false;
let passwords = [];
let currentView = 'main';

// 默认快捷键设置
const DEFAULT_KEYS = {
    query: 'a',
    add: 's',
    export: 'd',
    back: 'arrowleft',
    exitInput: 'escape'
};

// 当前快捷键设置
let customKeys = { ...DEFAULT_KEYS };

// DOM 元素
let loginPage, mainPage, queryPage, addPage, exportPage;
let loginForm, errorMessage, addPasswordForm, modPasswordForm, passwordList, searchInput;
let saveBtn, modCancelBtn, editId;

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    // 获取 DOM 元素
    loginPage = document.getElementById('loginPage');
    mainPage = document.getElementById('mainPage');
    queryPage = document.getElementById('queryPage');
    addPage = document.getElementById('addPage');
    exportPage = document.getElementById('exportPage');

    loginForm = document.getElementById('loginForm');
    errorMessage = document.getElementById('errorMessage');
    addPasswordForm = document.getElementById('addPasswordForm');
    modPasswordForm = document.getElementById('modPasswordForm');
    passwordList = document.getElementById('passwordList');
    searchInput = document.getElementById('searchInput');
    // saveBtn = document.getElementById('saveBtn');
    modCancelBtn = document.getElementById('modCancelBtn');
    editId = document.getElementById('editId');

    // 初始化主题
    initTheme();

    // 初始化自定义快捷键
    initCustomKeys();

    // 绑定主题切换事件
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const theme = this.dataset.theme;
            changeTheme(theme);
        });
    });

    // 强制初始化显示登录页面
    if (!loginPage.classList.contains('active')) {
        loginPage.classList.add('active');
    }

    checkAuthStatus();

    // 事件监听
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        handleLogin();
    });

    addPasswordForm.addEventListener('submit', function (e) {
        e.preventDefault();
        savePassword('add');
    });

    modPasswordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        savePassword('mod');
    });

    // 添加搜索框回车事件监听
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchPasswords();
        }
    });

    // 取消编辑事件
    modCancelBtn.addEventListener('click', cancelEdit);

    // 为快捷键输入框添加事件监听器
    setupKeyInputListeners();
});

// 初始化自定义快捷键
function initCustomKeys() {
    const savedKeys = localStorage.getItem(CUSTOM_KEYS_KEY);
    if (savedKeys) {
        try {
            customKeys = JSON.parse(savedKeys);
        } catch (e) {
            console.error('Failed to parse custom keys, using defaults');
            customKeys = { ...DEFAULT_KEYS };
        }
    }

    // 在设置页面显示当前快捷键
    if (document.getElementById('queryKey')) {
        document.getElementById('queryKey').value = customKeys.query === 'arrowleft' ? '←' : customKeys.query;
        document.getElementById('addKey').value = customKeys.add;
        document.getElementById('exportKey').value = customKeys.export;
        document.getElementById('backKey').value = customKeys.back === 'arrowleft' ? '←' : customKeys.back;
        document.getElementById('exitInputKey').value = customKeys.exitInput === 'escape' ? 'Esc' : customKeys.exitInput;
    }
}

// 设置快捷键输入框监听器
function setupKeyInputListeners() {
    const keyInputs = document.querySelectorAll('.key-input');
    keyInputs.forEach(input => {
        input.addEventListener('keydown', function (e) {
            e.preventDefault();
            // 处理特殊键
            if (e.key === 'ArrowLeft') {
                this.value = '←';
                this.dataset.keyValue = 'arrowleft';
            } else if (e.key === 'Escape') {
                this.value = 'Esc';
                this.dataset.keyValue = 'escape';
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                this.value = '';
                this.dataset.keyValue = '';
            } else if (e.key.length === 1) {
                this.value = e.key.toLowerCase();
                this.dataset.keyValue = e.key.toLowerCase();
            }
        });

        input.addEventListener('focus', function () {
            this.classList.add('recording');
            this.placeholder = '按任意键设置';
        });

        input.addEventListener('blur', function () {
            this.classList.remove('recording');
            if (!this.value) {
                this.placeholder = '按任意键设置';
            }
        });
    });
}

// 保存自定义快捷键
function saveCustomKeys() {
    const queryKey = document.getElementById('queryKey').dataset.keyValue || document.getElementById('queryKey').value.toLowerCase();
    const addKey = document.getElementById('addKey').dataset.keyValue || document.getElementById('addKey').value.toLowerCase();
    const exportKey = document.getElementById('exportKey').dataset.keyValue || document.getElementById('exportKey').value.toLowerCase();
    const backKey = document.getElementById('backKey').dataset.keyValue || document.getElementById('backKey').value.toLowerCase();
    const exitInputKey = document.getElementById('exitInputKey').dataset.keyValue || document.getElementById('exitInputKey').value.toLowerCase();

    // 简单验证
    if (!queryKey || !addKey || !exportKey || !backKey || !exitInputKey) {
        showNotification('所有快捷键都必须设置！', 'error');
        return;
    }

    // 检查重复 (除了特殊键)
    const navKeys = [queryKey, addKey, exportKey].filter(key => !['arrowleft', 'escape'].includes(key));
    const hasDuplicates = new Set(navKeys).size !== navKeys.length;

    if (hasDuplicates) {
        showNotification('导航快捷键不能重复！', 'error');
        return;
    }

    customKeys = {
        query: queryKey,
        add: addKey,
        export: exportKey,
        back: backKey,
        exitInput: exitInputKey
    };

    localStorage.setItem(CUSTOM_KEYS_KEY, JSON.stringify(customKeys));
    showNotification('快捷键设置已保存！');

}

// 恢复默认快捷键
function resetDefaultKeys() {
    customKeys = { ...DEFAULT_KEYS };
    document.getElementById('queryKey').value = customKeys.query;
    document.getElementById('addKey').value = customKeys.add;
    document.getElementById('exportKey').value = customKeys.export;
    document.getElementById('backKey').value = customKeys.back;
    document.getElementById('exitInputKey').value = customKeys.exitInput;
    localStorage.setItem(CUSTOM_KEYS_KEY, JSON.stringify(customKeys));
    showNotification('已恢复默认快捷键');
}

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'blue';
    document.body.setAttribute('data-theme', savedTheme);

    // 更新主题按钮状态
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === savedTheme) {
            btn.classList.add('active');
        }
    });
}

// 切换主题
function changeTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    // 更新按钮状态
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === theme) {
            btn.classList.add('active');
        }
    });

    // 不再显示主题切换通知
}

// 获取主题名称
function getThemeName(theme) {
    const themes = {
        'blue': '经典蓝',
        'purple': '优雅紫',
        'green': '清新绿',
        'dark': '深邃黑'
    };
    return themes[theme] || '默认';
}

// 简单的哈希函数
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString();
}

// 检查认证状态
function checkAuthStatus() {
    const storedHash = localStorage.getItem(MASTER_PASSWORD_KEY);
    if (storedHash) {
        // 显示登录页面
        showPage('loginPage');
        // 强制将登录表单设置为当前活动页面
        document.getElementById('loginPage').classList.add('active');
    } else {
        showSetMasterPassword();
    }
}

// 添加键盘事件监听器
document.addEventListener('keydown', function (e) {
    // 只在主页面启用快捷键
    if (!isAuthenticated || !document.getElementById('mainPage').classList.contains('active')) {
        return;
    }

    // 阻止在输入框中触发快捷键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    // 使用自定义快捷键或默认快捷键
    switch (e.key.toLowerCase()) {
        case customKeys.query:
            e.preventDefault();
            showView('query');
            break;
        case customKeys.add:
            e.preventDefault();
            showView('add');
            break;
        case customKeys.export:
            e.preventDefault();
            showView('export');
            break;
    }
});

// 添加一个新的键盘事件监听器，专门用于处理返回键
document.addEventListener('keydown', function (e) {
    // 阻止在输入框中触发快捷键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    // 检查是否按下了返回键
    if (e.key === 'ArrowLeft' && customKeys.back === 'arrowleft' ||
        e.key.toLowerCase() === customKeys.back && customKeys.back !== 'arrowleft') {
        // 根据当前活动页面执行相应的返回操作
        if (document.getElementById('queryPage').classList.contains('active')) {
            e.preventDefault();
            showMainPage();
        } else if (document.getElementById('addPage').classList.contains('active')) {
            e.preventDefault();
            showMainPage();
        } else if (document.getElementById('exportPage').classList.contains('active')) {
            e.preventDefault();
            showMainPage();
        } else if (document.getElementById('settingsPage').classList.contains('active')) {
            e.preventDefault();
            showMainPage();
        }
    }
});

// 添加处理回车键进入输入框的事件监听器
document.addEventListener('keydown', function (e) {
    // 如果按下的不是回车键，直接返回
    if (e.key !== 'Enter') {
        return;
    }

    // 定义需要处理的页面及其第一个输入框的ID
    const pageInputMap = {
        'loginPage': 'masterPassword',
        'queryPage': 'searchInput',
        'addPage': 'website',
        'exportPage': 'exportSearch',
        'settingsPage': 'oldMasterPassword'
    };

    // 查找当前激活的页面
    let activePage = null;
    for (let pageId in pageInputMap) {
        const pageElement = document.getElementById(pageId);
        if (pageElement && pageElement.classList.contains('active')) {
            activePage = pageId;
            break;
        }
    }

    // 如果找到激活的页面且不在输入框中，则聚焦到该页面的第一个输入框
    if (activePage && (!e.target.tagName || (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA'))) {
        e.preventDefault();
        const firstInputId = pageInputMap[activePage];
        const firstInput = document.getElementById(firstInputId);
        if (firstInput) {
            firstInput.focus();
        }
    }
});

// 添加Esc键退出输入框的事件监听器
document.addEventListener('keydown', function (e) {
    // 仅在输入框或文本区域聚焦时处理退出输入框键
    if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') &&
        (e.key === 'Escape' && customKeys.exitInput === 'escape' ||
            e.key.toLowerCase() === customKeys.exitInput && customKeys.exitInput !== 'escape')) {
        e.preventDefault();
        e.target.blur(); // 移除焦点
        // showNotification('已退出输入框');
    }
});

// 显示页面
function showPage(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // 显示指定页面
    document.getElementById(pageId).classList.add('active');

    // 特殊处理：当显示主页面时确保数据已加载
    if (pageId === 'mainPage' && isAuthenticated) {
        updateStats();
    }

    // 特殊处理：当显示查询页面时确保密码列表已加载
    if (pageId === 'queryPage' && isAuthenticated) {
        renderPasswordList();
    }

    // 特殊处理：当显示设置页面时更新快捷键显示
    if (pageId === 'settingsPage') {
        document.getElementById('queryKey').value = customKeys.query === 'arrowleft' ? '←' : customKeys.query;
        document.getElementById('addKey').value = customKeys.add;
        document.getElementById('exportKey').value = customKeys.export;
        document.getElementById('backKey').value = customKeys.back === 'arrowleft' ? '←' : customKeys.back;
        document.getElementById('exitInputKey').value = customKeys.exitInput === 'escape' ? 'Esc' : customKeys.exitInput;
    }
}

// 处理登录
function handleLogin() {
    const masterPassword = document.getElementById('masterPassword').value;
    const storedHash = localStorage.getItem(MASTER_PASSWORD_KEY);

    if (!storedHash) {
        // 首次设置主密码
        localStorage.setItem(MASTER_PASSWORD_KEY, simpleHash(masterPassword));
        isAuthenticated = true;
        loadPasswords();
        showPage('mainPage');
        updateStats();
        showNotification('主密码设置成功！');
    } else {
        // 验证主密码
        if (simpleHash(masterPassword) === storedHash) {
            isAuthenticated = true;
            loadPasswords();
            showPage('mainPage');
            updateStats();
            showNotification('登录成功！');
            // 修复：确保登录后显示密码列表
            renderPasswordList();
        } else {
            showError('密码错误，请重试！');
        }
    }
}

// 显示设置主密码界面
function showSetMasterPassword() {
    const loginContainer = document.querySelector('.login-container');
    loginContainer.innerHTML = `
        <div class="login-header">
            <div class="logo">
                🔐
            </div>
            <h1>智能密码管理器</h1>
            <p class="subtitle">首次使用 - 设置主密码</p>
        </div>
        
        <form id="setPasswordForm" class="login-form">
            <div class="input-group">
                <label for="newMasterPassword">
                    🔑 设置主密码
                </label>
                <div class="password-input">
                    <input type="password" id="newMasterPassword" placeholder="请输入主密码" required>
                    <button type="button" class="toggle-password" onclick="togglePasswordVisibilityInput('newMasterPassword')">
                        👁️
                    </button>
                </div>
            </div>
            
            <div class="input-group">
                <label for="confirmMasterPassword">
                    ✅ 确认主密码
                </label>
                <div class="password-input">
                    <input type="password" id="confirmMasterPassword" placeholder="请再次输入主密码" required>
                    <button type="button" class="toggle-password" onclick="togglePasswordVisibilityInput('confirmMasterPassword')">
                        👁️
                    </button>
                </div>
            </div>
            
            <button type="submit" class="login-btn">
                💾 设置主密码
            </button>
            
            <div class="security-tips">
                <div class="tip-item">
                    ⚠️ 请务必记住主密码，丢失无法恢复
                </div>
                <div class="tip-item">
                    💡 建议使用强密码（包含大小写字母、数字、符号）
                </div>
            </div>
            
            <div class="error-message" id="setPasswordError">
                ⚠️ 
                <span></span>
            </div>
        </form>
    `;

    document.getElementById('setPasswordForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const newPassword = document.getElementById('newMasterPassword').value;
        const confirmPassword = document.getElementById('confirmMasterPassword').value;

        if (newPassword !== confirmPassword) {
            showError('两次输入的密码不一致！', 'setPasswordError');
            return;
        }

        if (newPassword.length < 6) {
            showError('密码长度至少6位！', 'setPasswordError');
            return;
        }

        localStorage.setItem(MASTER_PASSWORD_KEY, simpleHash(newPassword));
        isAuthenticated = true;
        loadPasswords();
        showPage('mainPage');
        updateStats();
        showNotification('主密码设置成功！');
        // 修复：确保首次设置密码后也显示密码列表
        renderPasswordList();
    });
}

// 显示主页面
function showMainPage() {
    showPage('mainPage');
    // 确保在显示主页面时更新统计数据
    if (isAuthenticated) {
        updateStats();
    }
    document.getElementById('searchInput').value = ''
}

// 更新统计信息
function updateStats() {
    if (!isAuthenticated) return;

    document.getElementById('totalPasswords').textContent = passwords.length;

    // 计算密码重复率
    let duplicateCount = 0;
    const n = passwords.length;
    
    if (n > 1) {
        // 每个密码两两比较
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (passwords[i].password === passwords[j].password) {
                    duplicateCount++;
                }
            }
        }
        
        // 计算重复率：重复数除以n*(n-1)/2
        const totalComparisons = n * (n - 1) / 2;
        const duplicateRate = (duplicateCount / totalComparisons * 100).toFixed(2);

        // 分段颜色
        // const repetitiveRateColor = duplicateRate >= 70 ? '#ee4444ff':
        //                           duplicateRate >= 50 ? '#f15c1cff':
        //                           duplicateRate >= 15 ? '#f0bd15ff': '#47e784ff';
        
        // 创建渐变色效果（从绿色到红色）
        const red = Math.min(255, Math.floor(duplicateRate * 2.55)); // 0-100% -> 0-255
        const green = Math.max(0, 255 - Math.floor(duplicateRate * 2.55));
        const repetitiveRateColor = `rgb(${red}, ${green}, 0)`;
        document.getElementById('repetitiveRate').textContent = `${duplicateRate}%`;
        document.getElementById('repetitiveRate').style.color = repetitiveRateColor;
    } else {
        // 如果密码数量少于2个，重复率为0
        document.getElementById('repetitiveRate').textContent = '0.00%';
    }
}

// 显示视图
function showView(view) {
    switch (view) {
        case 'query':
            showPage('queryPage');
            // 确保在显示查询页面时渲染密码列表
            if (isAuthenticated) {
                renderPasswordList();
            }
            break;
        case 'add':
            showPage('addPage');
            resetForm();
            break;
        case 'export':
            showPage('exportPage');
            break;
        case 'modify':
            showPage('modifyPage');
            break;
    }
}

// 切换标签页
function switchTab(tabName) {
    // 更新标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // 显示对应内容
    document.getElementById('singleTab').style.display = tabName === 'single' ? 'block' : 'none';
    document.getElementById('batchTab').style.display = tabName === 'batch' ? 'block' : 'none';
    // document.getElementById('singleTab').classList.toggle('active', tabName === 'single');
    // document.getElementById('batchTab').classList.toggle('active', tabName === 'batch');
}

// 加载密码数据
function loadPasswords() {
    const encryptedData = localStorage.getItem(PASSWORDS_KEY);
    if (encryptedData) {
        try {
            // 将Base64转换为Uint8Array
            const byteArray = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            // 使用TextDecoder解码UTF-8
            const decoder = new TextDecoder();
            const jsonStr = decoder.decode(byteArray);
            passwords = JSON.parse(jsonStr);
        } catch (e) {
            console.error('加载密码失败:', e);
            passwords = [];
        }
    } else {
        passwords = [];
    }
}

// 保存密码数据（修改部分）
function savePasswords() {
    const jsonStr = JSON.stringify(passwords);
    // 使用TextEncoder处理UTF-8编码
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonStr);
    // 将Uint8Array转换为Base64
    const encryptedData = btoa(String.fromCharCode(...data));
    localStorage.setItem(PASSWORDS_KEY, encryptedData);
    updateStats();
}

// 退出函数
function logout() {
    isAuthenticated = false;
    document.getElementById('masterPassword').value = '';
    showPage('loginPage');
    showNotification('已退出登录');
    // 数据保留在localStorage中，用户重新登录后可以访问
}

// 显示错误信息
function showError(message, elementId = 'errorMessage') {
    const errorElement = document.getElementById(elementId);
    if (elementId === 'errorMessage') {
        errorElement.textContent = '⚠️ ' + message;
        errorElement.style.display = 'block';
    } else {
        const span = errorElement.querySelector('span');
        span.textContent = message;
        errorElement.style.display = 'flex';
    }
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 3000);
}

// 保存密码
function savePassword(pageType = 'add') {
    const prefix = pageType === 'add' ? 'add' : 'mod';
    const website = document.getElementById(prefix + 'Website').value;
    const username = document.getElementById(prefix + 'Username').value;
    const password = document.getElementById(prefix + 'Password').value;
    let notes = document.getElementById(prefix + 'Notes').value.trim();
    const autoTimestamp = document.getElementById(prefix + 'AutoTimestamp').checked;

    // 如果启用自动时间戳则追加时间戳
    if (autoTimestamp) {
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        notes += ` ${formattedDate}`;
    }

    // 检查必填字段
    if (!website || !username || !password) {
        showNotification('网站名称、用户名和密码均为必填项！', 'error');
        return;
    }

    /// 新增：检查重复记录（相同网站+用户名）
    const currentEditId = editId.value ? String(editId.value) : null;
    const isDuplicate = passwords.some(p => {
        // 更新时排除当前编辑的记录
        const isCurrentRecord = currentEditId && String(p.id) === currentEditId;
        // 比较网站和用户名
        return !isCurrentRecord &&
            p.website.toLowerCase() === website.toLowerCase() &&
            p.username.toLowerCase() === username.toLowerCase();
    });

    if (isDuplicate) {
        showNotification('已存在相同网站和用户名的密码记录！', 'error');
        return;
    }
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const passwordData = {
        id: editId.value || Date.now().toString(),
        website: website,
        username: username,
        password: password,
        notes: notes, 
        createdAt: formattedDate
    };

    if (editId.value) {
        // 更新现有密码
        const index = passwords.findIndex(p => p.id === editId.value);
        if (index !== -1) {
            passwords[index] = passwordData;
        }
        showNotification('密码更新成功！');
        showView('query');
        searchPasswords();
    } else {
        // 添加新密码
        passwords.push(passwordData);
        showNotification('密码添加成功！');
    }

    // 保存到localStorage
    savePasswords();

    // 保存自动时间戳选项
    localStorage.setItem('autoTimestamp', autoTimestamp);

    // 重置表单
    resetForm();
}

// 搜索密码
function searchPasswords() {
    const searchTerm = document.getElementById('searchInput').value;
    renderPasswordList(searchTerm);
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// 渲染密码列表
function renderPasswordList(searchTerm = '') {
    passwordList.innerHTML = '';

    let filteredPasswords = passwords;
    if (searchTerm) {
        filteredPasswords = passwords.filter(p =>
            p.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    // 更新结果数量
    document.getElementById('resultsCount').textContent = filteredPasswords.length;

    if (filteredPasswords.length === 0) {
        passwordList.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    🔍
                    <p>未找到匹配的密码</p>
                    <p style="font-size: 14px; margin-top: 10px;">尝试使用不同的搜索词</p>
                </td>
            </tr>
        `;
        return;
    }

    filteredPasswords.forEach(password => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="website-cell" title="${escapeHtml(password.website)}">${escapeHtml(password.website)}</td>
            <td class="username-cell" title="${escapeHtml(password.username)}">${escapeHtml(password.username)}</td>
            <td class="password-column password-cell">
                <span class="password-display hidden-password">${escapeHtml(password.password)}</span>
                <button class="show-password-btn" onclick="togglePasswordVisibility(this)">
                    👁️
                </button>
            </td>
            <td class="notes-cell" title="${escapeHtml(password.notes || '')}">${truncateText(escapeHtml(password.notes || ''), 50)}</td>
            <td class="action-buttons">
                <button onclick="editPassword('${password.id}')" class="btn-warning">
                    ✏️ 编辑
                </button>
                <button onclick="deletePassword('${password.id}')" class="btn-danger">
                    🗑️ 删除
                </button>
                <button onclick="copyToClipboard('${escapeHtml(password.password)}')" class="btn-success">
                    📋 复制
                </button>
            </td>
        `;
        passwordList.appendChild(row);
    });
}

// 编辑密码
function editPassword(id) {
    const password = passwords.find(p => p.id === id);
    if (password) {
        showView('modify');
        document.getElementById('modWebsite').value = password.website;
        document.getElementById('modUsername').value = password.username;
        document.getElementById('modPassword').value = password.password;
        document.getElementById('modNotes').value = password.notes || '';
        document.getElementById('modAutoTimestamp').checked = localStorage.getItem('autoTimestamp') === 'true';
        document.getElementById('editId').value = id;
    }
}

// 删除密码
function deletePassword(id) {
    if (confirm('确定要删除这个密码吗？\n此操作不可恢复！')) {
        passwords = passwords.filter(p => p.id !== id);
        savePasswords();
        searchPasswords(); // 重新搜索显示结果
        showNotification('密码删除成功！');
    }
}

// 取消编辑
function cancelEdit() {
    resetForm('mod');
    showView('query');
    searchPasswords();
}

// 重置表单
function resetForm(pageType = 'add') {
    const prefix = pageType === 'add' ? 'add' : 'mod';
    const form = document.getElementById(prefix + 'PasswordForm');
    if (form) {
        form.reset();
    }
    document.getElementById(prefix + 'AutoTimestamp').checked = localStorage.getItem('autoTimestamp') === 'true';
    document.getElementById('editId').value = '';
}

// 修改显示密码函数，添加ARIA属性更新
function togglePasswordVisibility(button) {
    const passwordSpan = button.previousElementSibling;

    if (passwordSpan.classList.contains('hidden-password')) {
        passwordSpan.classList.remove('hidden-password');
        button.innerHTML = '🙈';
        button.setAttribute('aria-label', '隐藏密码');
    } else {
        passwordSpan.classList.add('hidden-password');
        button.innerHTML = '👁️';
        button.setAttribute('aria-label', '显示密码');
    }
}

// 修改切换密码输入框显示/隐藏函数，添加ARIA属性更新
function togglePasswordVisibilityInput(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling || input.parentElement.querySelector('.toggle-password');

    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = '🙈';
        button.setAttribute('aria-label', '隐藏密码');
    } else {
        input.type = 'password';
        button.innerHTML = '👁️';
        button.setAttribute('aria-label', '显示密码');
    }
}

// 生成随机密码
function generatePassword(pageType = 'add') {
    const length = 16;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    const targetField = document.getElementById(pageType + 'Password');
    if (targetField) {
        targetField.value = password;
        showNotification('已生成随机密码');
    }
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('密码已复制到剪贴板！');
    }).catch(err => {
        showNotification('复制失败：' + err, 'error');
    });
}

// 批量导入数据（修改部分）
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            let importedData = [];
            const content = e.target.result;

            // 处理CSV编码（添加BOM头检测）
            if (isCSV) {
                // 移除UTF-8 BOM头（\ufeff）
                const cleanContent = content.replace(/^\ufeff/, '');
                const csvResult = Papa.parse(cleanContent, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: 'UTF-8' // 明确指定编码
                });
                if (csvResult.errors.length > 0) {
                    throw new Error(`CSV解析错误：${csvResult.errors[0].message}`);
                }
                importedData = csvResult.data;
            } else {
                importedData = JSON.parse(content);
            }

            // 在importData函数的错误处理部分修改：
            if (Array.isArray(importedData)) {
                let importedCount = 0;
                let errorCount = 0;
                let duplicateCount = 0;
                const errorRecords = []; // 存储格式错误的具体记录

                importedData.forEach((item, index) => {
                    const website = item.website?.trim();
                    const username = item.username?.trim();
                    const password = item.password?.trim();

                    if (!website || !username || !password) {
                        errorCount++;
                        // 记录具体错误信息（包含行号和缺失字段）
                        errorRecords.push({
                            index: index + 1, // CSV/JSON的行号（从1开始）
                            website: website || '未填写',
                            username: username || '未填写',
                            password: password || '未填写',
                            error: '缺少必填字段（网站/用户名/密码）'
                        });
                        return;
                    }

                    // 检查重复记录（与savePassword逻辑一致）
                    const isDuplicate = passwords.some(p =>
                        p.website.toLowerCase() === website.toLowerCase() &&
                        p.username.toLowerCase() === username.toLowerCase()
                    );

                    if (isDuplicate) {
                        duplicateCount++;
                        return;
                    }

                    // 添加新记录
                    passwords.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        website: website,
                        username: username,
                        password: password,
                        notes: item.notes?.trim() || '',
                        createdAt: new Date().toISOString()
                    });
                    importedCount++;
                });

                savePasswords();

                const resultDiv = document.getElementById('importResult');
                // 构建错误详情HTML（可折叠）
                const errorDetails = errorRecords.length > 0 ? `
                    <div class="error-details" style="margin-top: 15px; display: flex; flex-direction: column; align-items: center;">
                        <button class="logout-btn" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                            📝 查看具体错误（${errorCount}条）
                        </button>
                        <div style="display: none; margin-top: 10px; text-align: left; width: 100%;">
                            ${errorRecords.map(rec => `
                                <div style="padding: 8px; background: rgba(255,255,255,0.1); margin: 5px 0; border-radius: 6px; color:red;">
                                    第${rec.index}条记录：<br>
                                    网站: ${rec.website}<br>
                                    用户名: ${rec.username}<br>
                                    错误原因: ${rec.error}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : '';

                resultDiv.innerHTML = `
                    ✅ <strong>导入完成！</strong><br>
                    成功导入: ${importedCount} 条<br>
                    格式错误: ${errorCount} 条<br>
                    重复跳过: ${duplicateCount} 条
                    ${errorDetails}
                `;
                resultDiv.className = 'import-result success';
                resultDiv.style.display = 'block';

                showNotification(`成功导入 ${importedCount} 条密码！`);
            } else {
                throw new Error('无效的数据格式，请确保是JSON数组或CSV表格');
            }
        } catch (error) {
            const resultDiv = document.getElementById('importResult');
            resultDiv.innerHTML = `
                ⚠️ <strong>导入失败！</strong><br>
                ${error.message}
            `;
            resultDiv.className = 'import-result error';
            resultDiv.style.display = 'block';
            showNotification('导入失败：' + error.message, 'error');
        } finally {
            document.getElementById('importFile').value = '';
        }
    };

    // 根据文件类型选择读取方式
    if (isCSV) {
        reader.readAsText(file); // CSV默认按文本读取
    } else {
        reader.readAsText(file); // JSON同样按文本读取
    }
}

// 显示导出搜索
function showExportSearch() {
    const section = document.getElementById('exportSearchSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

// 导出所有数据
function exportAllData() {
    exportPasswords(passwords, '所有密码数据');
}

// 导出搜索结果
function exportFilteredData() {
    const searchTerm = document.getElementById('searchInput').value;
    let filteredPasswords = passwords;

    if (searchTerm) {
        filteredPasswords = passwords.filter(p =>
            p.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    exportPasswords(filteredPasswords, '搜索结果');
}

// 按搜索条件导出
function exportBySearch() {
    const searchTerm = document.getElementById('exportSearch').value;
    let filteredPasswords = passwords;

    if (searchTerm) {
        filteredPasswords = passwords.filter(p =>
            p.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    exportPasswords(filteredPasswords, `搜索"${searchTerm}"的结果`);
}

// 将JSON数据转换为CSV格式（只修改导出部分）
function jsonToCSV(jsonData) {
    if (jsonData.length === 0) return '';
    
    // 获取表头
    const headers = Object.keys(jsonData[0]);
    
    // 创建CSV内容
    let csvContent = headers.join(',') + '\n';
    
    // 添加数据行
    jsonData.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            // 确保正确处理字符串，保持原始编码
            // 使用String()确保转换为字符串，但不trim()以保留原始空格
            const strValue = String(value);
            
            // 检查是否需要引号包围（只对CSV特殊字符）
            const needsQuotes = strValue.includes(',') || 
                              strValue.includes('\n') || 
                              strValue.includes('\r') || 
                              strValue.includes('"');
            
            if (needsQuotes) {
                // 转义引号并包围
                return '"' + strValue.replace(/"/g, '""') + '"';
            }
            // 直接返回原始字符串，保留所有空格
            return strValue;
        });
        csvContent += values.join(',') + '\n';
    });
    
    return csvContent;
}

// 导出密码数据（只修改导出部分）
function exportPasswords(data, fileNamePrefix) {
    if (data.length === 0) {
        showNotification('没有数据可导出！');
        return;
    }

    // 将JSON数据转换为CSV格式
    const csvContent = jsonToCSV(data);
    
    // 添加BOM标记确保Excel正确识别UTF-8编码
    const BOM = '\ufeff';
    const csvContentWithBOM = BOM + csvContent;
    
    // 创建Blob对象，明确指定UTF-8编码
    const dataBlob = new Blob([csvContentWithBOM], { 
        type: 'text/csv;charset=utf-8' 
    });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('CSV数据导出成功！');
}

// 刷新结果
function refreshResults() {
    searchPasswords();
    showNotification('数据已刷新');
}

// 显示设置
function showSettings() {
    // 清空输入框内容
    document.getElementById('oldMasterPassword').value = '';
    document.getElementById('newMasterPassword').value = '';
    document.getElementById('confirmMasterPassword').value = '';
    // 清空错误提示
    document.getElementById('changePasswordError').style.display = 'none';
    showPage('settingsPage'); // 显示设置页面
}

// 处理主密码修改
function handleChangeMasterPassword() {
    const oldPassword = document.getElementById('oldMasterPassword').value;
    const newPassword = document.getElementById('newMasterPassword').value;
    const confirmPassword = document.getElementById('confirmMasterPassword').value;
    const errorElement = document.getElementById('changePasswordError');

    // 清空错误提示
    errorElement.style.display = 'none';

    // 验证旧密码是否正确
    const storedHash = localStorage.getItem(MASTER_PASSWORD_KEY);
    if (!storedHash || simpleHash(oldPassword) !== storedHash) {
        errorElement.textContent = '⚠️ 旧主密码错误！';
        errorElement.style.display = 'block';
        return;
    }

    // 验证新密码格式
    if (newPassword.length < 6) {
        errorElement.textContent = '⚠️ 新密码长度至少6位！';
        errorElement.style.display = 'block';
        return;
    }

    // 验证两次输入是否一致
    if (newPassword !== confirmPassword) {
        errorElement.textContent = '⚠️ 新密码与确认密码不一致！';
        errorElement.style.display = 'block';
        return;
    }

    // 更新主密码哈希值
    localStorage.setItem(MASTER_PASSWORD_KEY, simpleHash(newPassword));
    showNotification('主密码修改成功！请重新登录');
    logout(); // 修改成功后退出登录，要求用户用新密码重新登录
}

// 初始化时绑定修改密码表单提交事件
document.addEventListener('DOMContentLoaded', function () {
    const changePasswordForm = document.getElementById('changeMasterPasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function (e) {
            e.preventDefault();
            handleChangeMasterPassword();
        });
    }
});

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification ' + type;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 1500);
}

// 新增：切换快捷键帮助显示/隐藏
function toggleShortcutHelp() {
    const modal = document.getElementById('shortcutHelpModal');
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
    } else {
        modal.style.display = 'none';
    }

    // 更新快捷键帮助中的快捷键显示
    updateShortcutHelp();
}

// 更新快捷键帮助显示内容
function updateShortcutHelp() {
    const queryKeyDisplay = customKeys.query === 'arrowleft' ? '←' : customKeys.query.toUpperCase();
    const addKeyDisplay = customKeys.add.toUpperCase();
    const exportKeyDisplay = customKeys.export.toUpperCase();
    const backKeyDisplay = customKeys.back === 'arrowleft' ? '←' : customKeys.back.toUpperCase();
    const exitInputKeyDisplay = customKeys.exitInput === 'escape' ? 'Esc' : customKeys.exitInput.toUpperCase();

    const shortcutList = document.querySelector('.shortcut-list');
    if (shortcutList) {
        // 这里我们只更新导航快捷键部分
        const navShortcuts = document.querySelector('.shortcut-section:first-child .shortcut-list');
        if (navShortcuts) {
            navShortcuts.innerHTML = `
                <li><kbd>${queryKeyDisplay}</kbd> - 跳转到查询密码页面</li>
                <li><kbd>${addKeyDisplay}</kbd> - 跳转到添加密码页面</li>
                <li><kbd>${exportKeyDisplay}</kbd> - 跳转到导出数据页面</li>
                <li><kbd>${backKeyDisplay}</kbd> - 返回主页面</li>
                <li><kbd>Enter</kbd> - 聚焦到当前页面的第一个输入框</li>
            `;
        }

        // 更新功能快捷键部分
        const funcShortcuts = document.querySelectorAll('.shortcut-section')[1];
        if (funcShortcuts) {
            funcShortcuts.innerHTML = `
                <h3>功能快捷键</h3>
                <ul class="shortcut-list">
                    <li><kbd>Tab</kbd> - 在输入框之间切换</li>
                    <li><kbd>Enter</kbd> (在搜索框中) - 执行搜索</li>
                    <li><kbd>${exitInputKeyDisplay}</kbd> - 退出输入框，启用其他快捷键</li>
                </ul>
            `;
        }
    }
}

// 转义HTML特殊字符
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '<',
        '>': '>',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
}

// 删除全部密码记录
function deleteAllPasswords() {
    // 危险操作确认提示
    const confirmDelete = confirm('确定要删除所有密码记录吗？\n此操作将删除所有数据且不可恢复！');
    if (!confirmDelete) return;

    // 清空密码数组
    passwords = [];
    // 保存空数据到localStorage
    savePasswords();
    // 刷新密码列表（显示空状态）
    searchPasswords();
    // 显示通知
    showNotification('所有密码记录已删除！', 'error');
}
