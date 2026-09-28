package com.bejohnself.passwordmanager.data.session

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

class SavedSessionStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "saved_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun save(masterPassword: String, key: SecretKey) {
        prefs.edit()
            .putString(KEY_MASTER_PASSWORD, masterPassword)
            .putString(KEY_KEY, Base64.encodeToString(key.encoded, Base64.NO_WRAP))
            .apply()
    }

    fun saveMasterPassword(masterPassword: String) {
        prefs.edit().putString(KEY_MASTER_PASSWORD, masterPassword).apply()
    }

    fun loadMasterPassword(): String? = prefs.getString(KEY_MASTER_PASSWORD, null)

    fun loadKey(): SecretKey? {
        val encoded = prefs.getString(KEY_KEY, null) ?: return null
        return try {
            SecretKeySpec(Base64.decode(encoded, Base64.NO_WRAP), "AES")
        } catch (e: Exception) {
            null
        }
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_MASTER_PASSWORD = "master_password"
        private const val KEY_KEY = "derived_key"
    }
}