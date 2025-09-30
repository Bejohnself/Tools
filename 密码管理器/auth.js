// 生成随机盐值
function generateSalt() {
    return Math.random().toString(36).substring(2, 18);
}

// // 简单的哈希函数
// function simpleHash(str) {
//     let hash = 0;
//     for (let i = 0; i < str.length; i++) {
//         const char = str.charCodeAt(i);
//         hash = ((hash << 5) - hash) + char;
//         hash = hash & hash;
//     }
//     return Math.abs(hash).toString();
// }

// 更安全的哈希函数 - 使用 Web Crypto API
async function secureHash(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    
    // 使用 SHA-256 哈希算法
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // 转换为十六进制字符串
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 检查认证状态
function checkAuthStatus() {
    const storedData = localStorage.getItem(MASTER_PASSWORD_KEY);
    if (storedData) {
        // 显示登录页面
        showPage('loginPage');
        // 强制将登录表单设置为当前活动页面
        document.getElementById('loginPage').classList.add('active');
    } else {
        showSetMasterPassword();
    }
}

// 处理登录 - 改进版本
// 修复 handleLogin 函数中的验证部分
async function handleLogin() {
    const masterPassword = document.getElementById('masterPassword').value;
    const storedData = localStorage.getItem(MASTER_PASSWORD_KEY);

    if (!storedData) {
        // 首次设置主密码
        const salt = generateSalt();
        const hashedPassword = await secureHash(masterPassword, salt);
        
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
    } else {
        // 验证主密码
        const authData = JSON.parse(storedData);
        const hashedInput = await secureHash(masterPassword, authData.salt);
        
        if (hashedInput === authData.hash) {
            isAuthenticated = true;
            loadPasswords();
            showPage('mainPage');
            updateStats();
            showNotification('登录成功！');
            // 确保登录后显示密码列表
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
