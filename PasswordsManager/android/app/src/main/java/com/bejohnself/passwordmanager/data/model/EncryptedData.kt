package com.bejohnself.passwordmanager.data.model

data class EncryptedData(
    val ciphertext: IntArray,
    val iv: IntArray,
) {
    override fun equals(other: Any?): Boolean =
        other is EncryptedData &&
            ciphertext.contentEquals(other.ciphertext) &&
            iv.contentEquals(other.iv)

    override fun hashCode(): Int = 31 * ciphertext.contentHashCode() + iv.contentHashCode()
}
