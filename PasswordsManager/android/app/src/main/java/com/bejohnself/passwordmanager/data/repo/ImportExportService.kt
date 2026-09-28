package com.bejohnself.passwordmanager.data.repo

import com.bejohnself.passwordmanager.data.model.PasswordRecord
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.commons.csv.CSVFormat

class ImportExportService(private val repo: PasswordRepository) {

    data class ImportResult(
        val imported: Int,
        val errors: Int,
        val duplicates: Int,
        val errorDetails: List<String>,
    )

    suspend fun importText(content: String, isCsv: Boolean): Result<ImportResult> =
        withContext(Dispatchers.IO) {
            runCatching {
                val items: List<Map<String, String>> = if (isCsv) parseCsv(content) else parseJson(content)
                var imported = 0
                var errors = 0
                var duplicates = 0
                val errorDetails = mutableListOf<String>()
                val toAdd = mutableListOf<PasswordRecord>()

                items.forEachIndexed { index, item ->
                    val website = item["website"]?.trim() ?: ""
                    val username = item["username"]?.trim() ?: ""
                    val password = item["password"]?.trim() ?: ""
                    val notes = item["notes"]?.trim() ?: ""
                    val providedId = item["id"]?.trim().orEmpty()
                    val providedCreatedAt = item["createdAt"]?.trim().orEmpty()

                    if (website.isEmpty() || username.isEmpty() || password.isEmpty()) {
                        errors++
                        errorDetails.add("第${index + 1}条记录：网站/用户名/密码 缺失")
                        return@forEachIndexed
                    }
                    val id = providedId.ifEmpty {
                        System.currentTimeMillis().toString() +
                            kotlin.random.Random.nextLong().toString(36)
                    }
                    if (providedId.isNotEmpty() && repo.records.any { it.id == id }) {
                        duplicates++
                        return@forEachIndexed
                    }
                    val isDup = repo.isDuplicate(website, username) ||
                        toAdd.any { it.website.equals(website, true) && it.username.equals(username, true) }
                    if (isDup) {
                        duplicates++
                        return@forEachIndexed
                    }
                    toAdd.add(
                        PasswordRecord(
                            id = id,
                            website = website,
                            username = username,
                            password = password,
                            notes = notes,
                            createdAt = providedCreatedAt.ifEmpty { java.time.Instant.now().toString() },
                        )
                    )
                    imported++
                }

                if (toAdd.isNotEmpty()) {
                    repo.addAll(toAdd).getOrThrow()
                }
                ImportResult(imported, errors, duplicates, errorDetails)
            }
        }

    private fun parseCsv(content: String): List<Map<String, String>> {
        val clean = content.removePrefix("\uFEFF")
        val parser = CSVFormat.DEFAULT.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(true)
            .build()
            .parse(clean.reader())
        return parser.map { rec ->
            fun value(name: String): String = if (rec.isMapped(name)) rec[name] ?: "" else ""
            mapOf(
                "id" to value("id"),
                "website" to value("website"),
                "username" to value("username"),
                "password" to value("password"),
                "notes" to value("notes"),
                "createdAt" to value("createdAt"),
            )
        }
    }

    private fun parseJson(content: String): List<Map<String, String>> {
        val element = JsonParser.parseString(content)
        if (!element.isJsonArray) throw IllegalArgumentException("无效的数据格式，请确保是JSON数组或CSV表格")
        return element.asJsonArray.map { el ->
            if (!el.isJsonObject) throw IllegalArgumentException("无效的数据格式")
            val obj = el.asJsonObject
            mapOf(
                "id" to obj.stringOrEmpty("id"),
                "website" to obj.stringOrEmpty("website"),
                "username" to obj.stringOrEmpty("username"),
                "password" to obj.stringOrEmpty("password"),
                "notes" to obj.stringOrEmpty("notes"),
                "createdAt" to obj.stringOrEmpty("createdAt"),
            )
        }
    }

    private fun JsonObject.stringOrEmpty(key: String): String =
        if (has(key) && !get(key).isJsonNull) get(key).asString else ""
}