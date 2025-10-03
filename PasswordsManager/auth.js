// 生成随机盐值
function generateSalt() {
    return Math.random().toString(36).substring(2, 18);
}

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
        passwords = []; // 初始化空密码数组
        await savePasswords(); // 保存空数组
        showPage('mainPage');
        updateStats();
        showNotification('主密码设置成功！');
    } else {
        // 验证主密码
        const authData = JSON.parse(storedData);
        const hashedInput = await secureHash(masterPassword, authData.salt);
        
        if (hashedInput === authData.hash) {
            isAuthenticated = true;
            await loadPasswords();
            showPage('mainPage');
            updateStats();
            showNotification('登录成功！');
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

/**
 * 从主密码派生加密密钥
 * @param {string} masterPassword - 主密码
 * @param {string} salt - 盐值
 * @returns {Promise<CryptoKey>} 派生的加密密钥
 */
async function deriveEncryptionKey(masterPassword, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(masterPassword),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * 加密密码数据
 * @param {string} plaintext - 明文密码
 * @param {CryptoKey} key - 加密密钥
 * @returns {Promise<Object>} 包含加密数据和初始化向量的对象
 */
async function encryptPassword(plaintext, key) {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM推荐使用12字节IV
    
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encoder.encode(plaintext)
    );
    
    return {
        ciphertext: Array.from(new Uint8Array(ciphertext)),
        iv: Array.from(iv)
    };
}

/**
 * 解密密码数据
 * @param {Object} encryptedData - 加密数据对象
 * @param {CryptoKey} key - 解密密钥
 * @returns {Promise<string>} 解密后的明文密码
 */
async function decryptPassword(encryptedData, key) {
    const ciphertext = new Uint8Array(encryptedData.ciphertext);
    const iv = new Uint8Array(encryptedData.iv);
    
    const plaintext = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
}