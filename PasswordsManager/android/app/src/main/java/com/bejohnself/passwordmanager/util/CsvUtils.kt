package com.bejohnself.passwordmanager.util

import com.bejohnself.passwordmanager.data.model.PasswordRecord

object CsvUtils {

    fun exportToCsv(records: List<PasswordRecord>): String {
        val sb = StringBuilder("\uFEFF")
        sb.append("id,website,username,password,notes,createdAt\n")
        records.forEach { r ->
            sb.append(csvCell(r.id)).append(',')
                .append(csvCell(r.website)).append(',')
                .append(csvCell(r.username)).append(',')
                .append(csvCell(r.password)).append(',')
                .append(csvCell(r.notes)).append(',')
                .append(csvCell(r.createdAt)).append('\n')
        }
        return sb.toString()
    }

    private fun csvCell(value: String): String {
        val needsQuotes = value.contains(',') || value.contains('\n') ||
            value.contains('\r') || value.contains('"')
        return if (needsQuotes) "\"" + value.replace("\"", "\"\"") + "\"" else value
    }
}