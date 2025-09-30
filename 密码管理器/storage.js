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
