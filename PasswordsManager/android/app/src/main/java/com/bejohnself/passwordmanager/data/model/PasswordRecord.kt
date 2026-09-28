package com.bejohnself.passwordmanager.data.model

data class PasswordRecord(
    val id: String,
    val website: String,
    val username: String,
    val password: String,
    val notes: String,
    val createdAt: String,
)
