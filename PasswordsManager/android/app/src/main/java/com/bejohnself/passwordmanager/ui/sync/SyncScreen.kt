package com.bejohnself.passwordmanager.ui.sync

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.bejohnself.passwordmanager.data.dropbox.DropboxApi
import com.bejohnself.passwordmanager.data.dropbox.Pkce
import com.bejohnself.passwordmanager.data.repo.RemoteSyncData
import com.bejohnself.passwordmanager.ui.common.SecondaryScaffold
import com.bejohnself.passwordmanager.ui.common.appContainer
import com.bejohnself.passwordmanager.ui.common.toast
import kotlinx.coroutines.launch

private enum class PendingAction { UPLOAD, DOWNLOAD, MISMATCH_DOWNLOAD }

@Composable
fun SyncScreen(
    navController: NavHostController,
    onLoggedOut: () -> Unit,
) {
    val container = appContainer()
    val store = container.dropboxCredentialStore
    val syncRepo = container.syncRepository
    val repo = container.passwordRepository
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val connected by syncRepo.connected.collectAsState()

    var appKey by remember { mutableStateOf(store.appKey ?: "") }
    var appSecret by remember { mutableStateOf(store.appSecret ?: "") }
    var showSecret by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var pendingAction by remember { mutableStateOf<PendingAction?>(null) }
    var pendingRemote by remember { mutableStateOf<RemoteSyncData?>(null) }

    fun runBusy(task: suspend () -> Unit) {
        busy = true
        scope.launch {
            try {
                task()
            } finally {
                busy = false
            }
        }
    }

    fun doUpload() {
        pendingAction = PendingAction.UPLOAD
    }

    fun doDownload() {
        pendingAction = PendingAction.DOWNLOAD
    }

    fun connect() {
        if (appKey.isBlank() || appSecret.isBlank()) {
            message = "请填写 App Key 和 App Secret"
            return
        }
        store.appKey = appKey.trim()
        store.appSecret = appSecret.trim()
        val verifier = Pkce.generateVerifier()
        store.pendingCodeVerifier = verifier
        message = "已保存，正在打开 Dropbox 授权页面"
        val uri = Uri.parse(DropboxApi.AUTHORIZE_URL_PREFIX).buildUpon()
            .appendQueryParameter("client_id", appKey.trim())
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("token_access_type", "offline")
            .appendQueryParameter("redirect_uri", DropboxApi.REDIRECT_URI)
            .appendQueryParameter("code_challenge", Pkce.challenge(verifier))
            .appendQueryParameter("code_challenge_method", "S256")
            .build()
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }

    SecondaryScaffold(title = "云同步", navController = navController) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "填写 Dropbox App 的凭据并授权后，可将加密密码库同步到云端。请先在 Dropbox 应用控制台将重定向地址设置为 ${
                    DropboxApi.REDIRECT_URI
                }。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "注意：云同步为整个加密库的单向覆盖，主密码哈希随库一起上传，两端需使用相同主密码才能成功同步。同步完成后两端各自独立，如不再继续同步，可各自修改主密码。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )

            OutlinedTextField(
                value = appKey,
                onValueChange = { appKey = it },
                label = { Text("App Key") },
                singleLine = true,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = appSecret,
                onValueChange = { appSecret = it },
                label = { Text("App Secret") },
                singleLine = true,
                enabled = !busy,
                visualTransformation = if (showSecret) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { showSecret = !showSecret }) {
                        Text(if (showSecret) "隐藏" else "显示", style = MaterialTheme.typography.labelSmall)
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = ::connect,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("保存并连接 Dropbox")
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(
                            color = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                            shape = CircleShape
                        )
                )
                Text(
                    text = if (connected) "Dropbox 已连接" else "Dropbox 未连接",
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (connected) {
                HorizontalDivider()

                Button(
                    onClick = ::doUpload,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("上传到云端")
                }

                Button(
                    onClick = ::doDownload,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("从云端下载")
                }

                TextButton(
                    onClick = {
                        runBusy {
                            syncRepo.disconnect().onSuccess { message = "已解除 Dropbox 绑定" }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("解除绑定", color = MaterialTheme.colorScheme.error)
                }
            }

            if (busy) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text("处理中…", style = MaterialTheme.typography.bodyMedium)
                }
            }

            message?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }

    pendingAction?.let { action ->
        when (action) {
            PendingAction.UPLOAD -> AlertDialog(
                onDismissRequest = { pendingAction = null },
                title = { Text("上传到云端") },
                text = { Text("此操作将用本地数据覆盖云端备份，确认继续吗？") },
                confirmButton = {
                    TextButton(onClick = {
                        pendingAction = null
                        runBusy {
                            syncRepo.upload()
                                .onSuccess { message = "已上传到云端" }
                                .onFailure { message = "上传失败：${it.message}" }
                        }
                    }) { Text("确认上传") }
                },
                dismissButton = {
                    TextButton(onClick = { pendingAction = null }) { Text("取消") }
                }
            )

            PendingAction.DOWNLOAD -> AlertDialog(
                onDismissRequest = { pendingAction = null },
                title = { Text("从云端下载") },
                text = { Text("此操作将用云端数据覆盖本地数据，确认继续吗？") },
                confirmButton = {
                    TextButton(onClick = {
                        pendingAction = null
                        runBusy {
                            syncRepo.download()
                                .onSuccess { remote ->
                                    val master = repo.masterPassword ?: ""
                                    val matched = repo.verifyMasterAgainstAuth(master, remote.auth)
                                    if (matched) {
                                        repo.syncImport(remote.auth, remote.passwords, master)
                                            .onSuccess { message = "已从云端同步" }
                                            .onFailure { message = "同步失败：${it.message}" }
                                    } else {
                                        pendingRemote = remote
                                        pendingAction = PendingAction.MISMATCH_DOWNLOAD
                                    }
                                }
                                .onFailure { message = "下载失败：${it.message}" }
                        }
                    }) { Text("确认下载") }
                },
                dismissButton = {
                    TextButton(onClick = { pendingAction = null }) { Text("取消") }
                }
            )

            PendingAction.MISMATCH_DOWNLOAD -> AlertDialog(
                onDismissRequest = { pendingAction = null; pendingRemote = null },
                title = { Text("主密码不一致") },
                text = { Text("云端数据的主密码与本地不一致。下载后本地数据将被云端数据覆盖，且需使用云端主密码重新登录。是否继续？") },
                confirmButton = {
                    TextButton(onClick = {
                        val remote = pendingRemote
                        pendingAction = null
                        pendingRemote = null
                        if (remote != null) {
                            runBusy {
                                repo.syncImport(remote.auth, remote.passwords, repo.masterPassword ?: "")
                                    .onSuccess {
                                        container.savedSessionStore.clear()
                                        toast(context, "已用云端数据覆盖本地，请重新登录")
                                        onLoggedOut()
                                    }
                                    .onFailure { message = "同步失败：${it.message}" }
                            }
                        }
                    }) { Text("继续") }
                },
                dismissButton = {
                    TextButton(onClick = { pendingAction = null; pendingRemote = null }) { Text("取消") }
                }
            )
        }
    }
}