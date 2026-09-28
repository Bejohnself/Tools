package com.bejohnself.passwordmanager

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.bejohnself.passwordmanager.ui.common.toast
import com.bejohnself.passwordmanager.ui.navigation.PasswordManagerApp
import com.bejohnself.passwordmanager.ui.theme.PasswordManagerTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PasswordManagerTheme {
                PasswordManagerApp()
            }
        }
        handleOAuthIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuthIntent(intent)
    }

    private fun handleOAuthIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "passwordmanager") return
        val code = data.getQueryParameter("code")
        if (code == null) {
            toast(this, "Dropbox 授权失败：缺少授权码")
            return
        }
        val container = (application as PasswordManagerApplication).container
        val codeVerifier = container.dropboxCredentialStore.pendingCodeVerifier
        if (codeVerifier == null) {
            toast(this, "Dropbox 授权失败：缺少授权状态，请重新点击连接")
            return
        }
        lifecycleScope.launch {
            container.syncRepository.exchangeCode(code, codeVerifier)
                .onSuccess { toast(this@MainActivity, "Dropbox 授权成功") }
                .onFailure { toast(this@MainActivity, "Dropbox 授权失败：${it.message}") }
        }
    }
}