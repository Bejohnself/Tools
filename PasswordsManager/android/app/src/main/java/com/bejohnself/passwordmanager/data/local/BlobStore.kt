package com.bejohnself.passwordmanager.data.local

import android.content.Context
import java.io.File

interface BlobStore {
    fun readPasswords(): String?
    fun writePasswords(json: String)
    fun readAuth(): String?
    fun writeAuth(json: String)
}

class FileBlobStore(context: Context) : BlobStore {
    private val passwordsFile = File(context.filesDir, PASSWORDS_FILE)
    private val authFile = File(context.filesDir, AUTH_FILE)

    override fun readPasswords(): String? = read(passwordsFile)

    override fun writePasswords(json: String) = write(passwordsFile, json)

    override fun readAuth(): String? = read(authFile)

    override fun writeAuth(json: String) = write(authFile, json)

    private fun read(file: File): String? =
        if (file.exists()) file.readText(Charsets.UTF_8) else null

    private fun write(file: File, content: String) {
        file.writeText(content, Charsets.UTF_8)
    }

    companion object {
        const val PASSWORDS_FILE = "encrypted_passwords.json"
        const val AUTH_FILE = "master_password_hash.json"
    }
}