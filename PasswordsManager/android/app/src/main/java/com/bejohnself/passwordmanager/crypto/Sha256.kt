package com.bejohnself.passwordmanager.crypto

import java.security.MessageDigest

object Sha256 {
    fun hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(input.toByteArray(Charsets.UTF_8)).toHex()
    }
}
