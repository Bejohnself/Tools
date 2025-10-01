// 加载密码数据
async function loadPasswords() {
    const storedEncryptedPasswords = localStorage.getItem(PASSWORDS_KEY);
    if (!storedEncryptedPasswords) {
        passwords = [];
        return;
    }
    
    const masterPassword = document.getElementById('masterPassword').value;
    if (!masterPassword) return;
    
    // 获取主密码的盐值
    const storedData = localStorage.getItem(MASTER_PASSWORD_KEY);
    if (!storedData) return;
    
    const authData = JSON.parse(storedData);
    const salt = authData.salt;
    
    // 派生解密密钥
    const encryptionKey = await deriveEncryptionKey(masterPassword, salt);
    
    try {
        const encryptedPasswords = JSON.parse(storedEncryptedPasswords);
        passwords = [];
        
        // 解密所有密码
        for (const encryptedPassword of encryptedPasswords) {
            const decryptedPassword = await decryptPassword(encryptedPassword.password, encryptionKey);
            passwords.push({
                ...encryptedPassword,
                password: decryptedPassword
            });
        }
    } catch (error) {
        console.error('解密密码时出错:', error);
        passwords = [];
        showError('密码解密失败，请重新登录');
        logout();
    }
}

// 保存密码数据
async function savePasswords() {
    if (!isAuthenticated) return;
    
    const masterPassword = document.getElementById('masterPassword').value;
    if (!masterPassword) return;
    
    // 获取主密码的盐值
    const storedData = localStorage.getItem(MASTER_PASSWORD_KEY);
    if (!storedData) return;
    
    const authData = JSON.parse(storedData);
    const salt = authData.salt;
    
    try {
        // 派生加密密钥
        const encryptionKey = await deriveEncryptionKey(masterPassword, salt);
        
        // 加密所有密码
        const encryptedPasswords = [];
        for (const password of passwords) {
            const encryptedPassword = await encryptPassword(password.password, encryptionKey);
            encryptedPasswords.push({
                ...password,
                password: encryptedPassword
            });
        }
        
        // 存储加密后的密码数据
        localStorage.setItem(PASSWORDS_KEY, JSON.stringify(encryptedPasswords));
        updateStats();
    } catch (error) {
        console.error('加密密码时出错:', error);
        showError('密码保存失败');
    }
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
