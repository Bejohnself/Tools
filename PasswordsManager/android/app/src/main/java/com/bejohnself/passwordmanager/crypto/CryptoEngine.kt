package com.bejohnself.passwordmanager.crypto

import com.bejohnself.passwordmanager.data.model.EncryptedData
import javax.crypto.SecretKey

object CryptoEngine {
    const val PBKDF2_ITERATIONS = 100000
    private const val KEY_BITS = 256

    fun generateSalt(): String = SaltGenerator.generate()

    fun hashMasterPassword(password: String, salt: String): String =
        Sha256.hex(password + salt)

    fun deriveKey(masterPassword: String, salt: String): SecretKey =
        Pbkdf2.derive(masterPassword, salt, PBKDF2_ITERATIONS, KEY_BITS)

    fun verifyMasterPassword(password: String, salt: String, expectedHash: String): Boolean =
        hashMasterPassword(password, salt) == expectedHash

    fun encrypt(plaintext: String, key: SecretKey): EncryptedData =
        AesGcm.encrypt(plaintext, key)

    fun encryptWithIv(plaintext: String, key: SecretKey, iv: ByteArray): EncryptedData =
        AesGcm.encryptWithIv(plaintext, key, iv)

    fun decrypt(data: EncryptedData, key: SecretKey): String =
        AesGcm.decrypt(data, key)
}
