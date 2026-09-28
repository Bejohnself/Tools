package com.bejohnself.passwordmanager.util

import java.security.SecureRandom

object PasswordGenerator {
    private const val CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"

    fun generate(length: Int = 16): String {
        val random = SecureRandom()
        return buildString(length) {
            repeat(length) { append(CHARSET[random.nextInt(CHARSET.length)]) }
        }
    }
}
