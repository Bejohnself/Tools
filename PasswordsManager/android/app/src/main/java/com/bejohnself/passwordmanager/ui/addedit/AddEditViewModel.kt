package com.bejohnself.passwordmanager.ui.addedit

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bejohnself.passwordmanager.data.model.PasswordRecord
import com.bejohnself.passwordmanager.data.repo.PasswordRepository
import com.bejohnself.passwordmanager.util.PasswordGenerator
import com.bejohnself.passwordmanager.util.TimeFormat
import kotlinx.coroutines.launch

class AddEditViewModel(
    private val repo: PasswordRepository,
    private val editId: String?,
) : ViewModel() {

    var website by mutableStateOf("")
        private set
    var username by mutableStateOf("")
        private set
    var password by mutableStateOf("")
        private set
    var notes by mutableStateOf("")
        private set
    var autoTimestamp by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var saving by mutableStateOf(false)
        private set
    var saved by mutableStateOf(false)
        private set

    val isEdit: Boolean get() = editId != null

    init {
        editId?.let { id ->
            val record = repo.records.find { it.id == id }
            if (record != null) {
                website = record.website
                username = record.username
                password = record.password
                notes = record.notes
            }
        }
    }

    fun onWebsiteChange(v: String) { website = v }
    fun onUsernameChange(v: String) { username = v }
    fun onPasswordChange(v: String) { password = v }
    fun onNotesChange(v: String) { notes = v }
    fun onAutoTimestampChange(v: Boolean) { autoTimestamp = v }

    fun generatePassword() {
        password = PasswordGenerator.generate()
    }

    fun save() {
        if (saving) return
        val w = website.trim()
        val u = username.trim()
        val p = password
        var n = notes.trim()

        if (w.isEmpty() || u.isEmpty() || p.isEmpty()) {
            message = "网站名称、用户名和密码均为必填项！"
            return
        }
        if (repo.isDuplicate(w, u, editId)) {
            message = "已存在相同网站和用户名的密码记录！"
            return
        }

        val now = TimeFormat.nowLocal()
        if (autoTimestamp) {
            n = if (n.isEmpty()) now else "$n $now"
        }

        val record = PasswordRecord(
            id = editId ?: System.currentTimeMillis().toString(),
            website = w,
            username = u,
            password = p,
            notes = n,
            createdAt = now,
        )

        viewModelScope.launch {
            saving = true
            message = null
            val result = if (editId == null) repo.add(record) else repo.update(record)
            saving = false
            result.onSuccess {
                saved = true
            }.onFailure {
                message = it.message
            }
        }
    }

    fun reset() {
        website = ""
        username = ""
        password = ""
        notes = ""
        autoTimestamp = false
        message = null
        saving = false
        saved = false
    }
}