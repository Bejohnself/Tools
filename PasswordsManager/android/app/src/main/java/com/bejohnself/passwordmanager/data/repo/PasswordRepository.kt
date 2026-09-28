package com.bejohnself.passwordmanager.data.repo

import com.bejohnself.passwordmanager.crypto.CryptoEngine
import com.bejohnself.passwordmanager.data.local.BlobStore
import com.bejohnself.passwordmanager.data.model.AuthData
import com.bejohnself.passwordmanager.data.model.PasswordEntry
import com.bejohnself.passwordmanager.data.model.PasswordRecord
import com.bejohnself.passwordmanager.data.session.SessionManager
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import javax.crypto.SecretKey

class PasswordRepository(
    private val blobStore: BlobStore,
    private val session: SessionManager,
) {
    private val gson = Gson()
    private val listType = object : TypeToken<List<PasswordEntry>>() {}.type

    val records: List<PasswordRecord> get() = session.records.value
    val recordsFlow: StateFlow<List<PasswordRecord>> get() = session.records
    val isAuthenticatedFlow: StateFlow<Boolean> get() = session.isAuthenticated
    val isAuthenticated: Boolean get() = session.isAuthenticated.value
    val masterPassword: String? get() = session.masterPassword.value
    val sessionKey: SecretKey? get() = session.key.value

    fun hasMasterPassword(): Boolean = blobStore.readAuth() != null

    fun authRaw(): String? = blobStore.readAuth()

    fun passwordsRaw(): String? = blobStore.readPasswords()

    suspend fun setupMasterPassword(masterPassword: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val salt = CryptoEngine.generateSalt()
            val hash = CryptoEngine.hashMasterPassword(masterPassword, salt)
            blobStore.writeAuth(gson.toJson(AuthData(salt, hash)))
            blobStore.writePasswords("[]")
            session.setMasterPassword(masterPassword)
            session.setKey(CryptoEngine.deriveKey(masterPassword, salt))
            session.setRecords(emptyList())
            session.setAuthenticated(true)
        }
    }

    suspend fun login(masterPassword: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val authJson = blobStore.readAuth() ?: error("尚未设置主密码")
            val auth = gson.fromJson(authJson, AuthData::class.java)
            if (!CryptoEngine.verifyMasterPassword(masterPassword, auth.salt, auth.hash)) {
                error("主密码错误，请重试")
            }
            val key = CryptoEngine.deriveKey(masterPassword, auth.salt)
            session.setMasterPassword(masterPassword)
            session.setKey(key)
            try {
                loadAndDecryptLocked()
            } catch (e: Exception) {
                session.logout()
                throw e
            }
            session.setAuthenticated(true)
        }
    }

    private fun loadAndDecryptLocked() {
        val key = session.key.value ?: return
        val json = blobStore.readPasswords()
        if (json.isNullOrEmpty()) {
            session.setRecords(emptyList())
            return
        }
        val entries: List<PasswordEntry> = try {
            gson.fromJson(json, listType)
        } catch (e: Exception) {
            throw RuntimeException("密码解密失败，请重新登录", e)
        }
        session.setRecords(entries.map { entry ->
            PasswordRecord(
                id = entry.id,
                website = entry.website,
                username = entry.username,
                password = CryptoEngine.decrypt(entry.password, key),
                notes = entry.notes,
                createdAt = entry.createdAt,
            )
        })
    }

    suspend fun save(): Result<Unit> {
        if (!session.isAuthenticated.value) return Result.success(Unit)
        val key = session.key.value ?: return Result.success(Unit)
        val snapshot = session.records.value
        return withContext(Dispatchers.IO) {
            runCatching {
                val entries = snapshot.map { record ->
                    PasswordEntry(
                        id = record.id,
                        website = record.website,
                        username = record.username,
                        password = CryptoEngine.encrypt(record.password, key),
                        notes = record.notes,
                        createdAt = record.createdAt,
                    )
                }
                blobStore.writePasswords(gson.toJson(entries))
            }
        }
    }

    fun isDuplicate(website: String, username: String, excludeId: String? = null): Boolean =
        session.records.value.any { record ->
            (excludeId == null || record.id != excludeId) &&
                record.website.equals(website, ignoreCase = true) &&
                record.username.equals(username, ignoreCase = true)
        }

    suspend fun add(record: PasswordRecord): Result<Unit> {
        if (isDuplicate(record.website, record.username)) {
            return Result.failure(IllegalArgumentException("已存在相同网站和用户名的密码记录"))
        }
        session.setRecords(session.records.value + record)
        return save()
    }

    suspend fun addAll(records: List<PasswordRecord>): Result<Unit> {
        if (records.isEmpty()) return Result.success(Unit)
        session.setRecords(session.records.value + records)
        return save()
    }

    suspend fun update(record: PasswordRecord): Result<Unit> {
        if (isDuplicate(record.website, record.username, record.id)) {
            return Result.failure(IllegalArgumentException("已存在相同网站和用户名的密码记录"))
        }
        session.setRecords(session.records.value.map {
            if (it.id == record.id) record else it
        })
        return save()
    }

    suspend fun delete(id: String): Result<Unit> {
        session.setRecords(session.records.value.filterNot { it.id == id })
        return save()
    }

    suspend fun deleteAll(): Result<Unit> {
        session.setRecords(emptyList())
        return save()
    }

    suspend fun changeMasterPassword(oldPassword: String, newPassword: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val authJson = blobStore.readAuth() ?: error("尚未设置主密码")
                val auth = gson.fromJson(authJson, AuthData::class.java)
                if (!CryptoEngine.verifyMasterPassword(oldPassword, auth.salt, auth.hash)) error("旧主密码错误")
                if (newPassword.length < 6) error("新密码长度至少6位")
                val newSalt = CryptoEngine.generateSalt()
                val newHash = CryptoEngine.hashMasterPassword(newPassword, newSalt)
                val newKey = CryptoEngine.deriveKey(newPassword, newSalt)
                val entries = session.records.value.map { record ->
                    PasswordEntry(
                        id = record.id,
                        website = record.website,
                        username = record.username,
                        password = CryptoEngine.encrypt(record.password, newKey),
                        notes = record.notes,
                        createdAt = record.createdAt,
                    )
                }
                blobStore.writeAuth(gson.toJson(AuthData(newSalt, newHash)))
                blobStore.writePasswords(gson.toJson(entries))
                logout()
            }
        }

    suspend fun restoreSession(masterPassword: String, key: SecretKey): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                session.setMasterPassword(masterPassword)
                session.setKey(key)
                try {
                    loadAndDecryptLocked()
                } catch (e: Exception) {
                    session.logout()
                    throw e
                }
                session.setAuthenticated(true)
            }
        }

    suspend fun syncImport(authJson: String?, passwordsJson: String?, masterPassword: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                if (authJson != null) blobStore.writeAuth(authJson)
                if (passwordsJson != null) blobStore.writePasswords(passwordsJson)
                if (authJson != null) {
                    val auth = gson.fromJson(authJson, AuthData::class.java)
                    val matched = CryptoEngine.verifyMasterPassword(masterPassword, auth.salt, auth.hash)
                    if (matched && passwordsJson != null) {
                        session.setMasterPassword(masterPassword)
                        session.setKey(CryptoEngine.deriveKey(masterPassword, auth.salt))
                        try {
                            loadAndDecryptLocked()
                        } catch (e: Exception) {
                            session.logout()
                            throw e
                        }
                        session.setAuthenticated(true)
                    } else {
                        logout()
                    }
                    matched
                } else {
                    logout()
                    false
                }
            }
        }

    fun verifyMasterAgainstAuth(masterPassword: String, authJson: String?): Boolean {
        if (authJson == null) return false
        return try {
            val auth = gson.fromJson(authJson, AuthData::class.java)
            CryptoEngine.verifyMasterPassword(masterPassword, auth.salt, auth.hash)
        } catch (e: Exception) {
            false
        }
    }

    fun logout() {
        session.logout()
    }
}