package com.bejohnself.passwordmanager.data.dropbox

import android.util.Base64
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder

class DropboxApi(private val client: OkHttpClient = OkHttpClient()) {

    suspend fun getAccessToken(appKey: String, appSecret: String, refreshToken: String): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val form = "grant_type=refresh_token&refresh_token=${URLEncoder.encode(refreshToken, "UTF-8")}"
                val request = Request.Builder()
                    .url("https://api.dropboxapi.com/oauth2/token")
                    .header("Authorization", basicAuth(appKey, appSecret))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .post(form.toRequestBody("application/x-www-form-urlencoded".toMediaType()))
                    .build()
                val text = execute(request)
                JsonParser.parseString(text).asJsonObject.get("access_token").asString
            }
        }

    suspend fun exchangeCode(
        appKey: String,
        code: String,
        codeVerifier: String,
        redirectUri: String,
    ): Result<TokenResult> = withContext(Dispatchers.IO) {
        runCatching {
            val form = "grant_type=authorization_code" +
                "&code=${URLEncoder.encode(code, "UTF-8")}" +
                "&redirect_uri=${URLEncoder.encode(redirectUri, "UTF-8")}" +
                "&client_id=${URLEncoder.encode(appKey, "UTF-8")}" +
                "&code_verifier=${URLEncoder.encode(codeVerifier, "UTF-8")}"
            val request = Request.Builder()
                .url("https://api.dropboxapi.com/oauth2/token")
                .header("Content-Type", "application/x-www-form-urlencoded")
                .post(form.toRequestBody("application/x-www-form-urlencoded".toMediaType()))
                .build()
            val text = execute(request)
            val obj = JsonParser.parseString(text).asJsonObject
            TokenResult(
                accessToken = obj.get("access_token")?.asString,
                refreshToken = obj.get("refresh_token")?.asString,
            )
        }
    }

    suspend fun upload(accessToken: String, path: String, content: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val request = Request.Builder()
                    .url("https://content.dropboxapi.com/2/files/upload")
                    .header("Authorization", "Bearer $accessToken")
                    .header(
                        "Dropbox-API-Arg",
                        """{"path":"$path","mode":"overwrite","mute":false}"""
                    )
                    .header("Content-Type", "application/octet-stream")
                    .post(content.toByteArray(Charsets.UTF_8).toRequestBody("application/octet-stream".toMediaType()))
                    .build()
                execute(request)
                Unit
            }
        }

    suspend fun download(accessToken: String, path: String): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val request = Request.Builder()
                    .url("https://content.dropboxapi.com/2/files/download")
                    .header("Authorization", "Bearer $accessToken")
                    .header("Dropbox-API-Arg", """{"path":"$path"}""")
                    .post(ByteArray(0).toRequestBody(null))
                    .build()
                execute(request)
            }
        }

    private fun execute(request: Request): String {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}: $text")
            }
            return text
        }
    }

    private fun basicAuth(appKey: String, appSecret: String): String =
        "Basic " + Base64.encodeToString("$appKey:$appSecret".toByteArray(), Base64.NO_WRAP)

    data class TokenResult(
        val accessToken: String?,
        val refreshToken: String?,
    )

    companion object {
        const val AUTHORIZE_URL_PREFIX = "https://www.dropbox.com/oauth2/authorize"
        const val REDIRECT_URI = "passwordmanager://oauth"
    }
}