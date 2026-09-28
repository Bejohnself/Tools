package com.bejohnself.passwordmanager.data.session

import com.bejohnself.passwordmanager.data.model.PasswordRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.crypto.SecretKey

class SessionManager {
    private val _masterPassword = MutableStateFlow<String?>(null)
    private val _key = MutableStateFlow<SecretKey?>(null)
    private val _records = MutableStateFlow<List<PasswordRecord>>(emptyList())
    private val _isAuthenticated = MutableStateFlow(false)

    val masterPassword: StateFlow<String?> = _masterPassword
    val key: StateFlow<SecretKey?> = _key
    val records: StateFlow<List<PasswordRecord>> = _records
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated

    fun setMasterPassword(value: String?) {
        _masterPassword.value = value
    }

    fun setKey(value: SecretKey?) {
        _key.value = value
    }

    fun setRecords(value: List<PasswordRecord>) {
        _records.value = value
    }

    fun setAuthenticated(value: Boolean) {
        _isAuthenticated.value = value
    }

    fun logout() {
        _masterPassword.value = null
        _key.value = null
        _records.value = emptyList()
        _isAuthenticated.value = false
    }
}