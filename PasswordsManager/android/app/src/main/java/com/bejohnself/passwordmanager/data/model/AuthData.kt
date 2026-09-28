package com.bejohnself.passwordmanager.data.model

data class AuthData(
    val salt: String,
    val hash: String,
)
