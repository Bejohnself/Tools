package com.bejohnself.passwordmanager.data.model

data class PasswordEntry(
    val id: String,
    val website: String,
    val username: String,
    val password: EncryptedData,
    val notes: String,
    val createdAt: String,
)
