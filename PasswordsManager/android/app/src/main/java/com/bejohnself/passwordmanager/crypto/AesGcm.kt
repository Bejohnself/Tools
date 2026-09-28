package com.bejohnself.passwordmanager.crypto

import com.bejohnself.passwordmanager.data.model.EncryptedData
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object AesGcm {
    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val IV_LENGTH = 12
    private const val TAG_BITS = 128

    fun encrypt(plaintext: String, key: SecretKey): EncryptedData {
        val iv = ByteArray(IV_LENGTH).also { SecureRandom().nextBytes(it) }
        return encryptWithIv(plaintext, key, iv)
    }

    fun encryptWithIv(plaintext: String, key: SecretKey, iv: ByteArray): EncryptedData {
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return EncryptedData(ciphertext.toIntArray(), iv.toIntArray())
    }

    fun decrypt(data: EncryptedData, key: SecretKey): String {
        val cipher = Cipher.getInstance(ALGORITHM)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, data.iv.toByteArray()))
        val plaintext = cipher.doFinal(data.ciphertext.toByteArray())
        return String(plaintext, Charsets.UTF_8)
    }
}

internal fun ByteArray.toIntArray(): IntArray = IntArray(size) { this[it].toInt() and 0xFF }

internal fun IntArray.toByteArray(): ByteArray = ByteArray(size) { this[it].toByte() }
