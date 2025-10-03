// 获取 URL 参数
function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// 用 refresh_token 获取新的 access_token
async function getAccessToken() {
    const APP_KEY = localStorage.getItem("app_key");
    const APP_SECRET = localStorage.getItem("app_secret");
    const refreshToken = localStorage.getItem("dropbox_refresh_token");
    if (!refreshToken) return null;

    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
            "Authorization": "Basic " + btoa(APP_KEY + ":" + APP_SECRET),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            grant_type: "refresh_token"
        })
    });
    const data = await res.json();
    return data.access_token || null;
}

// 第一次授权获取 refresh_token
async function exchangeCodeForTokens(code) {
    const APP_KEY = localStorage.getItem("app_key");
    const APP_SECRET = localStorage.getItem("app_secret");
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
            "Authorization": "Basic " + btoa(APP_KEY + ":" + APP_SECRET),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            code: code,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI
        })
    });
    const data = await res.json();
    if (data.refresh_token) {
        localStorage.setItem("dropbox_refresh_token", data.refresh_token);
        alert("授权成功！refresh_token 已保存");
        window.history.replaceState({}, document.title, REDIRECT_URI); // 清除URL参数
    } else {
        alert("授权失败：" + JSON.stringify(data));
    }
}

// 跳转到 Dropbox 授权页
function startAuth() {
    const APP_KEY = document.getElementById("app_key").value;
    const APP_SECRET = document.getElementById("app_secret").value;
    // 保存到 localStorage
    localStorage.setItem("app_key", APP_KEY);
    localStorage.setItem("app_secret", APP_SECRET);
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${APP_KEY}&response_type=code&token_access_type=offline&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = authUrl;
}

// 上传文件到 Dropbox
async function saveToDropbox(id="try") {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        alert("请先授权 Dropbox");
        startAuth();
        return;
    }

    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Dropbox-API-Arg": JSON.stringify({
                path: `/passwords/${id}.json`,
                mode: "overwrite",
                mute: false
            }),
            "Content-Type": "application/octet-stream"
        },
        body: localStorage.getItem(PASSWORDS_KEY)
    });

    if (res.ok) {
        alert("已加密并上传到 Dropbox");
    } else {
        alert("上传失败：" + await res.text());
    }
}

// 从 Dropbox 下载文件
async function loadFromDropbox(id="try") {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        alert("请先授权 Dropbox");
        startAuth();
        return;
    }

    const res = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Dropbox-API-Arg": JSON.stringify({ path: `/passwords/${id}.json` })
        }
    });

    if (res.ok) {
        loadPasswords(from="cloud",res=res,save=true);
        savePasswords();
        showNotification("解密成功！");
    } else {
        showError("读取失败：" + await res.text());
    }
}