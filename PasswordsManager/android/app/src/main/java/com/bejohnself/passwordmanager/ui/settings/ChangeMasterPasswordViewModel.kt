package com.bejohnself.passwordmanager.ui.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bejohnself.passwordmanager.data.repo.PasswordRepository
import com.bejohnself.passwordmanager.data.session.SavedSessionStore
import kotlinx.coroutines.launch

class ChangeMasterPasswordViewModel(
    private val repo: PasswordRepository,
    private val savedSessionStore: SavedSessionStore,
) : ViewModel() {

    var loading by mutableStateOf(false)
        private set

    var message by mutableStateOf<String?>(null)
        private set

    var success by mutableStateOf(false)
        private set

    fun change(oldPassword: String, newPassword: String, confirmPassword: String) {
        if (loading) return
        when {
            oldPassword.isEmpty() -> {
                message = "请输入当前主密码"
                return
            }

            newPassword.length < 6 -> {
                message = "新密码长度至少6位"
                return
            }

            newPassword != confirmPassword -> {
                message = "新密码与确认密码不一致"
                return
            }
        }
        viewModelScope.launch {
            loading = true
            message = null
            repo.changeMasterPassword(oldPassword, newPassword)
                .onSuccess {
                    savedSessionStore.clear()
                    success = true
                }
                .onFailure {
                    message = it.message
                }
            loading = false
        }
    }
}