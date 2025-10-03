// 主密码存储
const MASTER_PASSWORD_KEY = 'master_password_hash';
const PASSWORDS_KEY = 'encrypted_passwords';
const THEME_KEY = 'preferred_theme';
const CUSTOM_KEYS_KEY = 'custom_keys'; // 新增自定义快捷键存储键
const REDIRECT_URI = "https://bejohnself.github.io/Tools/PasswordsManager/"; // 必须和Dropbox后台一致

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
