package com.bejohnself.passwordmanager.crypto

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object SaltGenerator {
    private const val CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789"

    fun generate(length: Int = 16): String {
        val random = SecureRandom()
        return buildString(length) {
            repeat(length) { append(CHARSET[random.nextInt(CHARSET.length)]) }
        }
    }
}
