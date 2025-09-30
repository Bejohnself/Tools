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

    // 强制初始化显示登录页面
    if (!loginPage.classList.contains('active')) {
        loginPage.classList.add('active');
    }

    checkAuthStatus();

    initEventListeners();

});

function initEventListeners() {

    // 绑定主题切换事件
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const theme = this.dataset.theme;
            changeTheme(theme);
        });
    });

    // 事件监听
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        handleLogin();
    });

    addPasswordForm.addEventListener('submit', function (e) {
        e.preventDefault();
        savePassword('add');
    });

    modPasswordForm.addEventListener('submit', function (e) {
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
}

