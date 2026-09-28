package com.bejohnself.passwordmanager.ui.export

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.bejohnself.passwordmanager.R
import com.bejohnself.passwordmanager.ui.common.SecondaryScaffold
import com.bejohnself.passwordmanager.ui.common.appContainer
import com.bejohnself.passwordmanager.ui.common.queryDisplayName
import com.bejohnself.passwordmanager.ui.common.readUriText
import com.bejohnself.passwordmanager.ui.common.toast
import com.bejohnself.passwordmanager.ui.common.writeUriText
import com.bejohnself.passwordmanager.util.CsvUtils
import com.bejohnself.passwordmanager.util.TimeFormat
import kotlinx.coroutines.launch

@Composable
fun ExportScreen(navController: NavHostController) {
    val container = appContainer()
    val repo = container.passwordRepository
    val service = container.importExportService
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val records by repo.recordsFlow.collectAsState()

    var searchQuery by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var resultText by remember { mutableStateOf<String?>(null) }
    var resultIsError by remember { mutableStateOf(false) }

    val filtered = remember(records, searchQuery) {
        val q = searchQuery.trim()
        if (q.isEmpty()) records
        else records.filter {
            it.website.contains(q, ignoreCase = true) || it.username.contains(q, ignoreCase = true)
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                busy = true
                resultText = null
                val text = readUriText(context, uri)
                val name = queryDisplayName(context, uri)
                val isCsv = name?.endsWith(".csv", ignoreCase = true) == true
                service.importText(text, isCsv).onSuccess { result ->
                    resultText = "✅ 导入完成！\n成功导入 ${result.imported} 条\n格式错误 ${result.errors} 条\n重复跳过 ${result.duplicates} 条"
                    resultIsError = false
                }.onFailure { e ->
                    resultText = "⚠️ 导入失败：${e.message}"
                    resultIsError = true
                }
                busy = false
            }
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/csv")
    ) { uri ->
        if (uri != null) {
            scope.launch {
                busy = true
                writeUriText(context, uri, CsvUtils.exportToCsv(filtered))
                busy = false
                toast(context, "CSV 导出成功")
            }
        }
    }

    SecondaryScaffold(title = "导入导出", navController = navController) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            OutlinedButton(
                onClick = { importLauncher.launch(arrayOf("*/*")) },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(painterResource(R.drawable.ic_upload), contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("导入数据（CSV / JSON）")
            }
            Spacer(Modifier.height(20.dp))

            Text("导出", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("按搜索条件导出（可留空）") },
                singleLine = true,
                leadingIcon = { Icon(painterResource(R.drawable.ic_search), contentDescription = null) },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "当前将导出 ${filtered.size} 条记录",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))

            Row {
                Button(
                    onClick = {
                        exportLauncher.launch("密码数据_${TimeFormat.todayDate()}.csv")
                    },
                    enabled = !busy && filtered.isNotEmpty(),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("导出")
                }
                Spacer(Modifier.width(12.dp))
                OutlinedButton(
                    onClick = {
                        if (records.isEmpty()) toast(context, "没有数据可导出！")
                        else exportLauncher.launch("所有密码数据_${TimeFormat.todayDate()}.csv")
                    },
                    enabled = !busy,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("导出全部")
                }
            }

            Spacer(Modifier.height(20.dp))
            if (busy) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("处理中…")
                }
            }
            resultText?.let {
                Spacer(Modifier.height(16.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (resultIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}