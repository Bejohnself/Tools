// 保存密码
async function savePassword(pageType = 'add') {
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

    // 新增：检查重复记录（相同网站+用户名）
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
    await savePasswords();

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
                    ${svg('search', 56)}
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
                    ${EYE_ICON}
                </button>
            </td>
            <td class="notes-cell" title="${escapeHtml(password.notes || '')}">${truncateText(escapeHtml(password.notes || ''), 50)}</td>
            <td class="action-buttons">
                <button onclick="editPassword('${password.id}')" class="btn-warning">
                    ${svg('edit', 14)}
                    编辑
                </button>
                <button onclick="deletePassword('${password.id}')" class="btn-danger">
                    ${svg('trash', 14)}
                    删除
                </button>
                <button onclick="copyToClipboard('${escapeHtml(password.password)}')" class="btn-success">
                    ${svg('copy', 14)}
                    复制
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

// 处理主密码修改
async function handleChangeMasterPassword() {
    const oldPassword = document.getElementById('oldMasterPassword').value;
    const newPassword = document.getElementById('newMasterPassword').value;
    const confirmPassword = document.getElementById('confirmMasterPassword').value;
    const errorElement = document.getElementById('changePasswordError');

    // 清空错误提示
    errorElement.style.display = 'none';

    // 验证旧密码是否正确
    const storedData = localStorage.getItem(MASTER_PASSWORD_KEY);
    if (!storedData) {
        errorElement.textContent = '⚠️ 尚未设置主密码！';
        errorElement.style.display = 'block';
        return;
    }

    const authData = JSON.parse(storedData);
    const hashedOldInput = await secureHash(oldPassword, authData.salt);

    if (hashedOldInput !== authData.hash) {
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
    const newSalt = generateSalt();
    const newHashedPassword = await secureHash(newPassword, newSalt);

    const newAuthData = {
        salt: newSalt,
        hash: newHashedPassword
    };

    localStorage.setItem(MASTER_PASSWORD_KEY, JSON.stringify(newAuthData));
    await savePasswords(_new=true);
    showNotification('主密码修改成功！请重新登录');
    logout(); // 修改成功后退出登录，要求用户用新密码重新登录
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
