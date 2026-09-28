package com.bejohnself.passwordmanager.ui.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bejohnself.passwordmanager.data.repo.PasswordRepository
import com.bejohnself.passwordmanager.data.session.SavedSessionStore
import kotlinx.coroutines.launch

class LoginViewModel(
    private val repo: PasswordRepository,
    private val savedSessionStore: SavedSessionStore,
) : ViewModel() {

    var isSetupMode by mutableStateOf(!repo.hasMasterPassword())
        private set

    var loading by mutableStateOf(false)
        private set

    var message by mutableStateOf<String?>(null)
        private set

    var success by mutableStateOf(false)
        private set

    var rememberPassword by mutableStateOf(savedSessionStore.loadMasterPassword() != null)
        private set

    init {
        val saved = savedSessionStore.loadMasterPassword()
        if (saved != null) {
            viewModelScope.launch {
                if (loading) return@launch
                loading = true
                val cachedKey = savedSessionStore.loadKey()
                val result = if (cachedKey != null) {
                    repo.restoreSession(saved, cachedKey)
                } else {
                    repo.login(saved)
                }
                result.onSuccess { success = true }
                    .onFailure {
                        savedSessionStore.clear()
                        rememberPassword = false
                        message = it.message
                    }
                loading = false
            }
        }
    }

    fun onRememberChange(value: Boolean) {
        rememberPassword = value
    }

    fun submit(password: String, confirm: String) {
        if (loading) return
        viewModelScope.launch {
            loading = true
            message = null
            val result = if (isSetupMode) {
                when {
                    password.isEmpty() -> {
                        message = "请输入主密码"; null
                    }

                    password.length < 6 -> {
                        message = "密码长度至少6位"; null
                    }

                    password != confirm -> {
                        message = "两次输入的密码不一致"; null
                    }

                    else -> repo.setupMasterPassword(password)
                }
            } else {
                if (password.isEmpty()) {
                    message = "请输入主密码"; null
                } else {
                    repo.login(password)
                }
            }
            loading = false
            result?.onSuccess {
                if (rememberPassword) {
                    val key = repo.sessionKey
                    if (key != null) {
                        savedSessionStore.save(password, key)
                    } else {
                        savedSessionStore.saveMasterPassword(password)
                    }
                } else {
                    savedSessionStore.clear()
                }
                success = true
            }?.onFailure {
                message = it.message
            }
        }
    }
}