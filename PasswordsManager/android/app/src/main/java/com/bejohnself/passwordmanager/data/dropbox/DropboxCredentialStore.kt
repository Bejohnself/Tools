package com.bejohnself.passwordmanager.data.dropbox

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class DropboxCredentialStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "dropbox_creds",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val _connected = MutableStateFlow(prefs.contains(KEY_REFRESH_TOKEN))
    val connected: StateFlow<Boolean> = _connected

    var appKey: String?
        get() = prefs.getString(KEY_APP_KEY, null)
        set(value) {
            prefs.edit().putString(KEY_APP_KEY, value).apply()
        }

    var appSecret: String?
        get() = prefs.getString(KEY_APP_SECRET, null)
        set(value) {
            prefs.edit().putString(KEY_APP_SECRET, value).apply()
        }

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_REFRESH_TOKEN, value).apply()
            _connected.value = value != null
        }

    var pendingCodeVerifier: String?
        get() = prefs.getString(KEY_CODE_VERIFIER, null)
        set(value) {
            if (value == null) {
                prefs.edit().remove(KEY_CODE_VERIFIER).apply()
            } else {
                prefs.edit().putString(KEY_CODE_VERIFIER, value).apply()
            }
        }

    fun clear() {
        prefs.edit().clear().apply()
        _connected.value = false
    }

    companion object {
        private const val KEY_APP_KEY = "app_key"
        private const val KEY_APP_SECRET = "app_secret"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_CODE_VERIFIER = "code_verifier"
    }
}