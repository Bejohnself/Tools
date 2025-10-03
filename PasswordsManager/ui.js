// DOM 元素
let loginPage, mainPage, queryPage, addPage, exportPage;
let loginForm, errorMessage, addPasswordForm, modPasswordForm, passwordList, searchInput;
let saveBtn, modCancelBtn, editId;

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

// 显示主页面
function showMainPage() {
    showPage('mainPage');
    // 确保在显示主页面时更新统计数据
    if (isAuthenticated) {
        updateStats();
    }
    document.getElementById('searchInput').value = ''
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
        case 'sync':  
            showPage('syncPage');
            initSyncPage();
            break;
    }
}

// 云同步页面初始化
function initSyncPage() {
    if (!isAuthenticated) return;
    
    // 填充已保存的 App Key 和 Secret
    const appKey = localStorage.getItem("app_key") || "";
    const appSecret = localStorage.getItem("app_secret") || "";
    
    document.getElementById("app_key").value = appKey;
    document.getElementById("app_secret").value = appSecret;
    
    // 检查授权状态并更新UI
    const isAuthorized = !!localStorage.getItem("dropbox_refresh_token");
    const syncStatusSection = document.getElementById("syncStatusSection");
    const statusDot = document.getElementById("statusDot");
    const authStatus = document.getElementById("authStatus");
    
    if (syncStatusSection) {
        syncStatusSection.style.display = isAuthorized ? "block" : "none";
    }
    
    if (statusDot && authStatus) {
        if (isAuthorized) {
            statusDot.className = "status-dot connected";
            authStatus.textContent = "已连接到 Dropbox";
        } else {
            statusDot.className = "status-dot disconnected";
            authStatus.textContent = "未连接到 Dropbox";
        }
    }
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
        document.getElementById('repetitiveRate').style.color = `rgb(0, 255, 0)`;
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

    // 替换 showSetMasterPassword 函数中的表单提交事件处理程序
    document.getElementById('setPasswordForm').addEventListener('submit', async function (e) {
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

        // 生成盐值并哈希密码
        const salt = generateSalt();
        const hashedPassword = await secureHash(newPassword, salt);

        // 存储盐值和哈希值
        const authData = {
            salt: salt,
            hash: hashedPassword
        };

        localStorage.setItem(MASTER_PASSWORD_KEY, JSON.stringify(authData));
        isAuthenticated = true;
        loadPasswords();
        showPage('mainPage');
        updateStats();
        showNotification('主密码设置成功！');
        // 确保首次设置密码后也显示密码列表
        renderPasswordList();
    });
}

// 显示导出搜索
function showExportSearch() {
    const section = document.getElementById('exportSearchSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
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

// 取消编辑
function cancelEdit() {
    resetForm('mod');
    showView('query');
    searchPasswords();
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
