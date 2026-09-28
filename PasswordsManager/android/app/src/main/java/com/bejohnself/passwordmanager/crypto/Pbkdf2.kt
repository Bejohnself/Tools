package com.bejohnself.passwordmanager.crypto

import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

object Pbkdf2 {
    fun derive(masterPassword: String, salt: String, iterations: Int, keyBits: Int): SecretKey {
        val spec = PBEKeySpec(
            masterPassword.toCharArray(),
            salt.toByteArray(Charsets.UTF_8),
            iterations,
            keyBits
        )
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return SecretKeySpec(factory.generateSecret(spec).encoded, "AES")
    }
}
