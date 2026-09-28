package com.bejohnself.passwordmanager.data.repo

import com.bejohnself.passwordmanager.data.local.BlobStore
import com.bejohnself.passwordmanager.data.model.PasswordRecord
import com.bejohnself.passwordmanager.data.session.SessionManager
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PasswordRepositoryTest {

    private val authJson =
        """{"salt":"k3v8m9x2pq4rz5w1","hash":"59aea8d6c4302d10fe26082ecf1689dcc9f1735e6474d29b307c317188b3bb7b"}"""

    private val webBlob = """[{"id":"1720000000000","website":"github.com","username":"bejohnself","password":{"ciphertext":[68,119,134,4,25,202,202,19,63,235,153,226,244,8,153,214,138,203,199,102,226,31,122,175,204,140,46,44,31,239,16],"iv":[1,2,3,4,5,6,7,8,9,10,11,12]},"notes":"","createdAt":"2026-08-01 10:30:00"},{"id":"1720000001000","website":"example.com","username":"demo","password":{"ciphertext":[91,71,144,25,61,159,203,22,127,201,211,167,142,78,118,135,128,7,101,87,186,4,225,195,65,30,145,155,17,83],"iv":[1,2,3,4,5,6,7,8,9,10,11,12]},"notes":"工作邮箱 2026-08-02 09:15:00","createdAt":"2026-08-02 09:15:00"},{"id":"1720000002000","website":"中文站.com","username":"管理员","password":{"ciphertext":[240,143,88,145,248,125,93,216,148,75,80,23,90,200,112,233,139,38,70,167,68,149,54,26,152,97,178,115,33,224,44,3,198,236,166,1,49],"iv":[1,2,3,4,5,6,7,8,9,10,11,12]},"notes":"备注含中文与,逗号","createdAt":"2026-08-03 11:45:30"}]"""

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

    private fun repo(store: FakeBlobStore = FakeBlobStore(auth = authJson, passwords = webBlob)) =
        PasswordRepository(store, SessionManager())

    @Test
    fun loginDecryptsWebBlob() = runBlocking {
        val r = repo()
        val result = r.login("TestMaster@123")
        assertTrue(result.isSuccess)
        assertEquals(3, r.records.size)
        assertEquals("P@ssw0rd-GitHub", r.records[0].password)
        assertEquals("OpenSesame#123", r.records[1].password)
        assertEquals("中文密码测试!@#", r.records[2].password)
        assertEquals("备注含中文与,逗号", r.records[2].notes)
    }

    @Test
    fun wrongPasswordFails() = runBlocking {
        val r = repo()
        assertTrue(r.login("wrong-password").isFailure)
        assertTrue(!r.isAuthenticated)
    }

    @Test
    fun addUpdateDeleteRoundTrip() = runBlocking {
        val store = FakeBlobStore(auth = authJson, passwords = webBlob)
        val r = repo(store)
        r.login("TestMaster@123")

        val new = PasswordRecord("1", "NewSite.com", "alice", "secret@123", "备注", "2026-08-12 00:00:00")
        assertTrue(r.add(new).isSuccess)
        assertTrue(r.isDuplicate("newsite.com", "alice"))

        val updated = new.copy(password = "changed-pwd", notes = "修改后")
        assertTrue(r.update(updated).isSuccess)

        val fresh = repo(store)
        fresh.login("TestMaster@123")
        assertEquals(4, fresh.records.size)
        assertEquals("changed-pwd", fresh.records.last().password)
        assertEquals("修改后", fresh.records.last().notes)

        assertTrue(fresh.delete("1").isSuccess)
        val fresh2 = repo(store)
        fresh2.login("TestMaster@123")
        assertEquals(3, fresh2.records.size)
    }

    @Test
    fun duplicateAddRejected() = runBlocking {
        val r = repo()
        r.login("TestMaster@123")
        val dup = PasswordRecord("9", "github.com", "bejohnself", "x", "", "2026-08-12 00:00:00")
        assertTrue(r.add(dup).isFailure)
    }

    @Test
    fun changeMasterPasswordReencryptsAll() = runBlocking {
        val store = FakeBlobStore(auth = authJson, passwords = webBlob)
        val r = repo(store)
        r.login("TestMaster@123")

        assertTrue(r.changeMasterPassword("TestMaster@123", "NewMaster#456").isSuccess)
        assertTrue(!r.isAuthenticated)

        assertTrue(r.login("TestMaster@123").isFailure)
        val r2 = repo(store)
        val login2 = r2.login("NewMaster#456")
        assertTrue(login2.isSuccess)
        assertEquals(3, r2.records.size)
        assertEquals("P@ssw0rd-GitHub", r2.records[0].password)
    }

    @Test
    fun setupMasterPasswordPersists() = runBlocking {
        val store = FakeBlobStore()
        val r = repo(store)
        assertTrue(!r.hasMasterPassword())
        assertTrue(r.setupMasterPassword("FirstMaster@1").isSuccess)
        assertTrue(store.auth != null)
        assertTrue(store.passwords == "[]")

        val r2 = repo(store)
        assertTrue(r2.hasMasterPassword())
        assertTrue(r2.login("FirstMaster@1").isSuccess)
        assertEquals(0, r2.records.size)
    }
}
