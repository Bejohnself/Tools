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

// 退出函数
function logout() {
    isAuthenticated = false;
    document.getElementById('masterPassword').value = '';
    showPage('loginPage');
    showNotification('已退出登录');
    // 数据保留在localStorage中，用户重新登录后可以访问
}
