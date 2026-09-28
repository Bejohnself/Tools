package com.bejohnself.passwordmanager

import android.app.Application
import android.content.Context
import com.bejohnself.passwordmanager.data.dropbox.DropboxApi
import com.bejohnself.passwordmanager.data.dropbox.DropboxCredentialStore
import com.bejohnself.passwordmanager.data.local.FileBlobStore
import com.bejohnself.passwordmanager.data.repo.ImportExportService
import com.bejohnself.passwordmanager.data.repo.PasswordRepository
import com.bejohnself.passwordmanager.data.repo.SyncRepository
import com.bejohnself.passwordmanager.data.session.SavedSessionStore
import com.bejohnself.passwordmanager.data.session.SessionManager

class PasswordManagerApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

class AppContainer(context: Context) {
    val blobStore = FileBlobStore(context)
    val session = SessionManager()
    val savedSessionStore = SavedSessionStore(context)
    val passwordRepository = PasswordRepository(blobStore, session)
    val importExportService = ImportExportService(passwordRepository)
    val dropboxApi = DropboxApi()
    val dropboxCredentialStore = DropboxCredentialStore(context)
    val syncRepository = SyncRepository(dropboxApi, dropboxCredentialStore, passwordRepository)
}