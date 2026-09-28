package com.bejohnself.passwordmanager.crypto

import com.bejohnself.passwordmanager.data.model.EncryptedData
import com.bejohnself.passwordmanager.data.model.PasswordEntry
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CryptoEngineTest {

    private val masterPassword = "TestMaster@123"
    private val salt = "k3v8m9x2pq4rz5w1"
    private val webHash = "59aea8d6c4302d10fe26082ecf1689dcc9f1735e6474d29b307c317188b3bb7b"
    private val webKeyHex = "cadb1969da53956a9b48775becf9af32ff8ec621b5c5ab0244b4d92772daa5e7"
    private val fixedIv = ByteArray(12) { (it + 1).toByte() }
    private val webCiphertextRecord0 = intArrayOf(
        68, 119, 134, 4, 25, 202, 202, 19, 63, 235, 153, 226, 244, 8, 153, 214,
        138, 203, 199, 102, 226, 31, 122, 175, 204, 140, 46, 44, 31, 239, 16
    )

    private val webBlob = """[{"id":"1720000000000","website":"github.com","username":"bejohnself","password":{"ciphertext":[68,119,134,4,25,202,202,19,63,235,153,226,244,8,153,214,138,203,199,102,226,31,122,175,204,140,46,44,31,239,16],"iv":[1,2,3,4,5,6,7,8,9,10,11,12]},"notes":"","createdAt":"2026-08-01 10:30:00"},{"id":"1720000001000","website":"example.com","username":"demo","password":{"ciphertext":[91,71,144,25,61,159,203,22,127,201,211,167,142,78,118,135,128,7,101,87,186,4,225,195,65,30,145,155,17,83],"iv":[1,2,3,4,5,6,7,8,9,10,11,12]},"notes":"工作邮箱 2026-08-02 09:15:00","createdAt":"2026-08-02 09:15:00"},{"id":"1720000002000","website":"中文站.com","username":"管理员","password":{"ciphertext":[240,143,88,145,248,125,93,216,148,75,80,23,90,200,112,233,139,38,70,167,68,149,54,26,152,97,178,115,33,224,44,3,198,236,166,1,49],"iv":[1,2,3,4,5,6,7,8,9,10,11,12]},"notes":"备注含中文与,逗号","createdAt":"2026-08-03 11:45:30"}]"""

    @Test
    fun sha256HashMatchesWebFixture() {
        val hash = CryptoEngine.hashMasterPassword(masterPassword, salt)
        assertEquals(webHash, hash)
    }

    @Test
    fun pbkdf2KeyMatchesWebFixture() {
        val key = CryptoEngine.deriveKey(masterPassword, salt)
        assertEquals(webKeyHex, key.encoded.toHex())
    }

    @Test
    fun verifyMasterPasswordMatchesWebHash() {
        assertTrue(CryptoEngine.verifyMasterPassword(masterPassword, salt, webHash))
        assertTrue(!CryptoEngine.verifyMasterPassword("wrong", salt, webHash))
    }

    @Test
    fun decryptWebCiphertext() {
        val key = CryptoEngine.deriveKey(masterPassword, salt)
        val data = EncryptedData(webCiphertextRecord0, fixedIv.toIntArray())
        assertEquals("P@ssw0rd-GitHub", CryptoEngine.decrypt(data, key))
    }

    @Test
    fun encryptWithWebIvProducesSameCiphertext() {
        val key = CryptoEngine.deriveKey(masterPassword, salt)
        val data = CryptoEngine.encryptWithIv("P@ssw0rd-GitHub", key, fixedIv)
        assertArrayEquals(webCiphertextRecord0, data.ciphertext)
        assertArrayEquals(fixedIv.toIntArray(), data.iv)
    }

    @Test
    fun roundTripEncryptDecrypt() {
        val key = CryptoEngine.deriveKey(masterPassword, salt)
        val plaintext = "包含中文的特殊密码!@#xyz"
        val data = CryptoEngine.encrypt(plaintext, key)
        assertEquals(plaintext, CryptoEngine.decrypt(data, key))
    }

    @Test
    fun decryptFullWebBlob() {
        val key = CryptoEngine.deriveKey(masterPassword, salt)
        val type = object : TypeToken<List<PasswordEntry>>() {}.type
        val records: List<PasswordEntry> = Gson().fromJson(webBlob, type)

        assertEquals(3, records.size)
        val expected = listOf(
            Triple("github.com", "bejohnself", "P@ssw0rd-GitHub"),
            Triple("example.com", "demo", "OpenSesame#123"),
            Triple("中文站.com", "管理员", "中文密码测试!@#"),
        )
        records.forEachIndexed { i, entry ->
            assertEquals(expected[i].first, entry.website)
            assertEquals(expected[i].second, entry.username)
            assertEquals(expected[i].third, CryptoEngine.decrypt(entry.password, key))
        }
        assertEquals("备注含中文与,逗号", records[2].notes)
    }
}
