package com.bejohnself.passwordmanager.ui.common

import com.bejohnself.passwordmanager.data.model.PasswordRecord

fun computeDuplicateRate(records: List<PasswordRecord>): Double {
    val n = records.size
    if (n < 2) return 0.0
    var dup = 0
    for (i in 0 until n) {
        for (j in i + 1 until n) {
            if (records[i].password == records[j].password) dup++
        }
    }
    return dup / (n * (n - 1) / 2.0) * 100
}
