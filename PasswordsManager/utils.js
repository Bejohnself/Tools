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

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('密码已复制到剪贴板！');
    }).catch(err => {
        showNotification('复制失败：' + err, 'error');
    });
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

// 在超出指定长度时进行截断并添加省略号
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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

// 获取输入框中的主密码
function getMasterPassword() {
    const masterPasswordElement = document.getElementById('masterPassword');
    if (masterPasswordElement) {
        return masterPasswordElement.value;
    }

    const newFirstMasterPasswordElement = document.getElementById('newFirstMasterPassword');
    if (newFirstMasterPasswordElement) {
        return newFirstMasterPasswordElement.value;
    }

    return '';
}
