package com.bejohnself.passwordmanager.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.bejohnself.passwordmanager.AppContainer
import com.bejohnself.passwordmanager.PasswordManagerApplication

class ViewModelFactory<VM : ViewModel>(private val creator: () -> VM) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = creator() as T
}

@Composable
fun appContainer(): AppContainer {
    val context = LocalContext.current
    return (context.applicationContext as PasswordManagerApplication).container
}
