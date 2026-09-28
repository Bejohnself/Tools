package com.bejohnself.passwordmanager.data.repo

import com.bejohnself.passwordmanager.data.dropbox.DropboxApi
import com.bejohnself.passwordmanager.data.dropbox.DropboxCredentialStore
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.flow.StateFlow

data class SyncData(
    val passwords: String?,
    val auth: String?,
)

data class RemoteSyncData(
    val auth: String?,
    val passwords: String?,
)

class SyncRepository(
    private val api: DropboxApi,
    private val store: DropboxCredentialStore,
    private val repo: PasswordRepository,
) {
    private val gson = Gson()

    val connected: StateFlow<Boolean> get() = store.connected

    suspend fun exchangeCode(code: String, codeVerifier: String): Result<Unit> = runCatching {
        val appKey = store.appKey ?: error("请先在同步页填写 App Key")
        val tokens = api.exchangeCode(appKey, code, codeVerifier, DropboxApi.REDIRECT_URI).getOrThrow()
        val refresh = tokens.refreshToken ?: error("授权响应缺少 refresh_token")
        store.refreshToken = refresh
        store.pendingCodeVerifier = null
    }

    suspend fun upload(): Result<Unit> = runCatching {
        val accessToken = accessToken().getOrThrow()
        val auth = repo.authRaw() ?: error("缺少本地认证数据")
        val sync = SyncData(passwords = repo.passwordsRaw() ?: "[]", auth = auth)
        api.upload(accessToken, SYNC_PATH, gson.toJson(sync)).getOrThrow()
    }

    suspend fun download(): Result<RemoteSyncData> = runCatching {
        val accessToken = accessToken().getOrThrow()
        val text = api.download(accessToken, SYNC_PATH).getOrThrow()
        val obj = JsonParser.parseString(text).asJsonObject
        val auth = obj["auth"]?.takeIf { !it.isJsonNull }?.asString
        val passwords = obj["passwords"]?.takeIf { !it.isJsonNull }?.asString
        if (auth == null) error("云端数据缺少认证信息")
        if (passwords == null) error("云端数据缺少密码库")
        RemoteSyncData(auth = auth, passwords = passwords)
    }

    suspend fun disconnect(): Result<Unit> = runCatching {
        store.clear()
    }

    private suspend fun accessToken(): Result<String> {
        val appKey = store.appKey ?: return Result.failure(IllegalStateException("请先在同步页填写 App Key"))
        val appSecret = store.appSecret ?: return Result.failure(IllegalStateException("请先在同步页填写 App Secret"))
        val refreshToken = store.refreshToken ?: return Result.failure(IllegalStateException("尚未授权 Dropbox，请先点击连接"))
        return api.getAccessToken(appKey, appSecret, refreshToken)
    }

    companion object {
        const val SYNC_PATH = "/passwords/try.json"
    }
}