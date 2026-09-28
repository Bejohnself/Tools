package com.bejohnself.passwordmanager.data.repo

import com.bejohnself.passwordmanager.data.local.BlobStore
import com.bejohnself.passwordmanager.data.model.PasswordRecord
import com.bejohnself.passwordmanager.data.session.SessionManager
import com.bejohnself.passwordmanager.util.CsvUtils
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ImportExportServiceTest {

    private val authJson =
        """{"salt":"k3v8m9x2pq4rz5w1","hash":"59aea8d6c4302d10fe26082ecf1689dcc9f1735e6474d29b307c317188b3bb7b"}"""

    private class FakeBlobStore(
        internal var auth: String? = null,
        internal var passwords: String? = null,
    ) : BlobStore {
        override fun readPasswords(): String? = passwords
        override fun writePasswords(json: String) {
            passwords = json
        }

        override fun readAuth(): String? = auth
        override fun writeAuth(json: String) {
            auth = json
        }
    }

    private suspend fun loggedInRepo(store: FakeBlobStore = FakeBlobStore(auth = authJson, passwords = "[]")): PasswordRepository {
        val repo = PasswordRepository(store, SessionManager())
        repo.login("TestMaster@123")
        return repo
    }

    @Test
    fun exportCsvHasBomHeaderAndQuoting() {
        val records = listOf(
            PasswordRecord("1", "site.com", "user", "pwd", "含,逗号", "2026-08-01 00:00:00"),
            PasswordRecord("2", "x.com", "u", "p\"q", "含\"引号\"", "2026-08-02 00:00:00"),
        )
        val csv = CsvUtils.exportToCsv(records)
        assertTrue(csv.startsWith("\uFEFF"))
        assertTrue(csv.contains("id,website,username,password,notes,createdAt"))
        assertTrue(csv.contains("\"含,逗号\""))
        assertTrue(csv.contains("\"含\"\"引号\"\"\""))
    }

    @Test
    fun importCsvRoundTrip() = runBlocking {
        val store = FakeBlobStore(auth = authJson, passwords = "[]")
        val repo = loggedInRepo(store)
        repo.add(PasswordRecord("1", "github.com", "alice", "pw1", "备注", "2026-08-01 00:00:00"))
        val csv = CsvUtils.exportToCsv(repo.records)

        val freshStore = FakeBlobStore(auth = authJson, passwords = "[]")
        val freshRepo = loggedInRepo(freshStore)
        val service = ImportExportService(freshRepo)

        val result = service.importText(csv, isCsv = true).getOrThrow()
        assertEquals(1, result.imported)
        assertEquals(0, result.duplicates)
        assertEquals(1, freshRepo.records.size)
        assertEquals("备注", freshRepo.records.last().notes)
    }

    @Test
    fun importJson() = runBlocking {
        val store = FakeBlobStore(auth = authJson, passwords = "[]")
        val repo = loggedInRepo(store)
        val service = ImportExportService(repo)

        val json = """
            [
              {"website":"example.com","username":"demo","password":"secret123","notes":"n1"},
              {"website":"github.com","username":"bejohnself","password":"x","notes":""}
            ]
        """.trimIndent()

        val result = service.importText(json, isCsv = false).getOrThrow()
        assertEquals(2, result.imported)
        assertEquals(2, repo.records.size)
        assertEquals("secret123", repo.records[0].password)
    }

    @Test
    fun importSkipsInvalidAndDuplicates() = runBlocking {
        val store = FakeBlobStore(auth = authJson, passwords = "[]")
        val repo = loggedInRepo(store)
        val service = ImportExportService(repo)

        repo.add(PasswordRecord("1", "dupsite.com", "dupuser", "pw", "", "2026-08-01 00:00:00"))

        val csv = """
            website,username,password,notes
            dupsite.com,dupuser,pw1,重复跳过
            missing.com,,pw2,缺用户名
            newsite.com,newuser,newpwd,正常导入
        """.trimIndent()

        val result = service.importText(csv, isCsv = true).getOrThrow()
        assertEquals(1, result.imported)
        assertEquals(1, result.duplicates)
        assertEquals(1, result.errors)
        assertEquals(2, repo.records.size)
        assertEquals("newpwd", repo.records[1].password)
    }

    @Test
    fun importInvalidJsonFails() = runBlocking {
        val repo = loggedInRepo()
        val service = ImportExportService(repo)
        val result = service.importText("{\"not\":\"an array\"}", isCsv = false)
        assertTrue(result.isFailure)
    }
}
