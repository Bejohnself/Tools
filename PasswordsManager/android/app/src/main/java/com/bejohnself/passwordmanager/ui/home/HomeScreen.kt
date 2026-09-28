package com.bejohnself.passwordmanager.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.bejohnself.passwordmanager.R
import com.bejohnself.passwordmanager.data.repo.PasswordRepository
import com.bejohnself.passwordmanager.ui.common.appContainer
import com.bejohnself.passwordmanager.ui.common.computeDuplicateRate
import com.bejohnself.passwordmanager.ui.common.toast
import com.bejohnself.passwordmanager.ui.navigation.Routes

@Composable
fun HomeScreen(
    repo: PasswordRepository,
    navController: NavHostController,
    onLoggedOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val container = appContainer()
    val context = LocalContext.current
    val records by repo.recordsFlow.collectAsState()
    val duplicateRate = remember(records) { computeDuplicateRate(records) }
    val rateColor = remember(duplicateRate) {
        val red = (duplicateRate * 2.55).toInt().coerceIn(0, 255)
        val green = (255 - duplicateRate * 2.55).toInt().coerceIn(0, 255)
        androidx.compose.ui.graphics.Color(red, green, 0)
    }
    var hasSavedSession by remember {
        mutableStateOf(container.savedSessionStore.loadMasterPassword() != null)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text("我的", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(4.dp))
        Text(
            "所有数据均以主密码加密后保存在本地",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(16.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        "密码总数",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "${records.size}",
                        style = MaterialTheme.typography.displayMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "密码重复率",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        String.format("%.2f%%", duplicateRate),
                        style = MaterialTheme.typography.displaySmall,
                        color = rateColor
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))
        Text("功能", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))

        FeatureItem(
            icon = R.drawable.ic_download,
            title = "导入导出",
            subtitle = "从 CSV/JSON 导入，导出为 CSV",
            onClick = { navController.navigate(Routes.EXPORT) }
        )
        FeatureItem(
            icon = R.drawable.ic_cloud,
            title = "云同步",
            subtitle = "通过 Dropbox 同步加密数据",
            onClick = { navController.navigate(Routes.SYNC) }
        )
        FeatureItem(
            icon = R.drawable.ic_settings,
            title = "设置",
            subtitle = "修改主密码等",
            onClick = { navController.navigate(Routes.SETTINGS) }
        )

        Spacer(Modifier.height(20.dp))
        Text("安全", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))

        if (hasSavedSession) {
            Card(
                onClick = {
                    container.savedSessionStore.clear()
                    hasSavedSession = false
                    toast(context, "已清除记住的主密码")
                },
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        painterResource(R.drawable.ic_trash),
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = MaterialTheme.colorScheme.error
                    )
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(
                            "清除已记住的主密码",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                        Text(
                            "下次打开需重新输入主密码登录",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        OutlinedButton(
            onClick = {
                container.savedSessionStore.clear()
                repo.logout()
                onLoggedOut()
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                painterResource(R.drawable.ic_logout),
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(8.dp))
            Text("退出登录")
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun FeatureItem(
    icon: Int,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painterResource(icon),
                contentDescription = null,
                modifier = Modifier.size(28.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(Modifier.width(16.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}