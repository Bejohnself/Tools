package com.bejohnself.passwordmanager.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.bejohnself.passwordmanager.ui.common.PasswordField
import com.bejohnself.passwordmanager.ui.common.SecondaryScaffold
import com.bejohnself.passwordmanager.ui.common.ViewModelFactory
import com.bejohnself.passwordmanager.ui.common.appContainer
import com.bejohnself.passwordmanager.ui.common.toast

@Composable
fun ChangeMasterPasswordScreen(
    navController: NavHostController,
    onPasswordChanged: () -> Unit,
) {
    val container = appContainer()
    val context = LocalContext.current
    val vm: ChangeMasterPasswordViewModel = viewModel(
        factory = ViewModelFactory {
            ChangeMasterPasswordViewModel(container.passwordRepository, container.savedSessionStore)
        }
    )

    var oldPassword by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }
    var showOld by rememberSaveable { mutableStateOf(false) }
    var showNew by rememberSaveable { mutableStateOf(false) }
    var showConfirm by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(vm.success) {
        if (vm.success) {
            toast(context, "主密码修改成功！请重新登录")
            onPasswordChanged()
        }
    }

    SecondaryScaffold(title = "修改主密码", navController = navController) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text(
                text = "通过修改主密码来增强账户安全性",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(20.dp))

            PasswordField(
                value = oldPassword,
                onValueChange = { oldPassword = it },
                label = "旧主密码",
                showPassword = showOld,
                onToggle = { showOld = !showOld },
                enabled = !vm.loading,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            PasswordField(
                value = newPassword,
                onValueChange = { newPassword = it },
                label = "新主密码（至少6位）",
                showPassword = showNew,
                onToggle = { showNew = !showNew },
                enabled = !vm.loading,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            PasswordField(
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                label = "确认新主密码",
                showPassword = showConfirm,
                onToggle = { showConfirm = !showConfirm },
                enabled = !vm.loading,
                modifier = Modifier.fillMaxWidth()
            )

            vm.message?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Spacer(Modifier.height(20.dp))
            Button(
                onClick = { vm.change(oldPassword, newPassword, confirmPassword) },
                enabled = !vm.loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (vm.loading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("修改主密码")
                }
            }
        }
    }
}