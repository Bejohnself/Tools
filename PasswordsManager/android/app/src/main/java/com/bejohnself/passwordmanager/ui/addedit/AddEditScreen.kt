package com.bejohnself.passwordmanager.ui.addedit

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bejohnself.passwordmanager.R
import com.bejohnself.passwordmanager.data.repo.PasswordRepository
import com.bejohnself.passwordmanager.ui.common.ViewModelFactory
import com.bejohnself.passwordmanager.ui.common.appContainer
import com.bejohnself.passwordmanager.ui.common.toast

@Composable
fun AddEditScreen(
    repo: PasswordRepository = appContainer().passwordRepository,
    editId: String?,
    onBack: (() -> Unit)?,
    onSaved: () -> Unit,
    showTopBar: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val vm: AddEditViewModel = viewModel(
        factory = ViewModelFactory { AddEditViewModel(repo, editId) }
    )
    val context = LocalContext.current

    var showPassword by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(vm.saved) {
        if (vm.saved) {
            val message = if (vm.isEdit) "密码更新成功！" else "密码添加成功！"
            toast(context, message)
            vm.reset()
            onSaved()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text(
            if (vm.isEdit) "编辑密码" else "添加密码",
            style = MaterialTheme.typography.headlineSmall
        )
        Spacer(Modifier.height(16.dp))

        OutlinedTextField(
            value = vm.website,
            onValueChange = vm::onWebsiteChange,
            label = { Text("网站名称") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = vm.username,
            onValueChange = vm::onUsernameChange,
            label = { Text("用户名") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = vm.password,
            onValueChange = vm::onPasswordChange,
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                Row {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(
                            painterResource(if (showPassword) R.drawable.ic_eye_off else R.drawable.ic_eye),
                            contentDescription = "显示/隐藏密码"
                        )
                    }
                    IconButton(onClick = { vm.generatePassword() }) {
                        Icon(
                            painterResource(R.drawable.ic_refresh),
                            contentDescription = "生成随机密码"
                        )
                    }
                }
            },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = vm.notes,
            onValueChange = vm::onNotesChange,
            label = { Text("备注（可选）") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = vm.autoTimestamp,
                onCheckedChange = vm::onAutoTimestampChange
            )
            Spacer(Modifier.width(4.dp))
            Text("保存时自动追加时间戳", style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(16.dp))

        vm.message?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(8.dp))
        }

        Button(
            onClick = vm::save,
            enabled = !vm.saving,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (vm.saving) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text(if (vm.isEdit) "保存修改" else "添加密码")
            }
        }
    }
}