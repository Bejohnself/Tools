// 批量导入数据（修改部分）
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            let importedData = [];
            const content = e.target.result;

            // 处理CSV编码（添加BOM头检测）
            if (isCSV) {
                // 移除UTF-8 BOM头（\ufeff）
                const cleanContent = content.replace(/^\ufeff/, '');
                const csvResult = Papa.parse(cleanContent, {
                    header: true,
                    skipEmptyLines: true,
                    encoding: 'UTF-8' // 明确指定编码
                });
                if (csvResult.errors.length > 0) {
                    throw new Error(`CSV解析错误：${csvResult.errors[0].message}`);
                }
                importedData = csvResult.data;
            } else {
                importedData = JSON.parse(content);
            }

            // 在importData函数的错误处理部分修改：
            if (Array.isArray(importedData)) {
                let importedCount = 0;
                let errorCount = 0;
                let duplicateCount = 0;
                const errorRecords = []; // 存储格式错误的具体记录

                importedData.forEach((item, index) => {
                    const website = item.website?.trim();
                    const username = item.username?.trim();
                    const password = item.password?.trim();

                    if (!website || !username || !password) {
                        errorCount++;
                        // 记录具体错误信息（包含行号和缺失字段）
                        errorRecords.push({
                            index: index + 1, // CSV/JSON的行号（从1开始）
                            website: website || '未填写',
                            username: username || '未填写',
                            password: password || '未填写',
                            error: '缺少必填字段（网站/用户名/密码）'
                        });
                        return;
                    }

                    // 检查重复记录（与savePassword逻辑一致）
                    const isDuplicate = passwords.some(p =>
                        p.website.toLowerCase() === website.toLowerCase() &&
                        p.username.toLowerCase() === username.toLowerCase()
                    );

                    if (isDuplicate) {
                        duplicateCount++;
                        return;
                    }

                    // 添加新记录
                    passwords.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        website: website,
                        username: username,
                        password: password,
                        notes: item.notes?.trim() || '',
                        createdAt: new Date().toISOString()
                    });
                    importedCount++;
                });

                savePasswords();

                const resultDiv = document.getElementById('importResult');
                // 构建错误详情HTML（可折叠）
                const errorDetails = errorRecords.length > 0 ? `
                    <div class="error-details" style="margin-top: 15px; display: flex; flex-direction: column; align-items: center;">
                        <button class="logout-btn" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                            📝 查看具体错误（${errorCount}条）
                        </button>
                        <div style="display: none; margin-top: 10px; text-align: left; width: 100%;">
                            ${errorRecords.map(rec => `
                                <div style="padding: 8px; background: rgba(255,255,255,0.1); margin: 5px 0; border-radius: 6px; color:red;">
                                    第${rec.index}条记录：<br>
                                    网站: ${rec.website}<br>
                                    用户名: ${rec.username}<br>
                                    错误原因: ${rec.error}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : '';

                resultDiv.innerHTML = `
                    ✅ <strong>导入完成！</strong><br>
                    成功导入: ${importedCount} 条<br>
                    格式错误: ${errorCount} 条<br>
                    重复跳过: ${duplicateCount} 条
                    ${errorDetails}
                `;
                resultDiv.className = 'import-result success';
                resultDiv.style.display = 'block';

                showNotification(`成功导入 ${importedCount} 条密码！`);
            } else {
                throw new Error('无效的数据格式，请确保是JSON数组或CSV表格');
            }
        } catch (error) {
            const resultDiv = document.getElementById('importResult');
            resultDiv.innerHTML = `
                ⚠️ <strong>导入失败！</strong><br>
                ${error.message}
            `;
            resultDiv.className = 'import-result error';
            resultDiv.style.display = 'block';
            showNotification('导入失败：' + error.message, 'error');
        } finally {
            document.getElementById('importFile').value = '';
        }
    };

    // 根据文件类型选择读取方式
    if (isCSV) {
        reader.readAsText(file); // CSV默认按文本读取
    } else {
        reader.readAsText(file); // JSON同样按文本读取
    }
}

// 导出密码数据（只修改导出部分）
function exportPasswords(data, fileNamePrefix) {
    if (data.length === 0) {
        showNotification('没有数据可导出！');
        return;
    }

    // 将JSON数据转换为CSV格式
    const csvContent = jsonToCSV(data);
    
    // 添加BOM标记确保Excel正确识别UTF-8编码
    const BOM = '\ufeff';
    const csvContentWithBOM = BOM + csvContent;
    
    // 创建Blob对象，明确指定UTF-8编码
    const dataBlob = new Blob([csvContentWithBOM], { 
        type: 'text/csv;charset=utf-8' 
    });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('CSV数据导出成功！');
}

// 将JSON数据转换为CSV格式（只修改导出部分）
function jsonToCSV(jsonData) {
    if (jsonData.length === 0) return '';
    
    // 获取表头
    const headers = Object.keys(jsonData[0]);
    
    // 创建CSV内容
    let csvContent = headers.join(',') + '\n';
    
    // 添加数据行
    jsonData.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            // 确保正确处理字符串，保持原始编码
            // 使用String()确保转换为字符串，但不trim()以保留原始空格
            const strValue = String(value);
            
            // 检查是否需要引号包围（只对CSV特殊字符）
            const needsQuotes = strValue.includes(',') || 
                              strValue.includes('\n') || 
                              strValue.includes('\r') || 
                              strValue.includes('"');
            
            if (needsQuotes) {
                // 转义引号并包围
                return '"' + strValue.replace(/"/g, '""') + '"';
            }
            // 直接返回原始字符串，保留所有空格
            return strValue;
        });
        csvContent += values.join(',') + '\n';
    });
    
    return csvContent;
}

// 按搜索条件导出
function exportBySearch() {
    const searchTerm = document.getElementById('exportSearch').value;
    let filteredPasswords = passwords;

    if (searchTerm) {
        filteredPasswords = passwords.filter(p =>
            p.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    exportPasswords(filteredPasswords, `搜索"${searchTerm}"的结果`);
}

// 导出搜索结果
function exportFilteredData() {
    const searchTerm = document.getElementById('searchInput').value;
    let filteredPasswords = passwords;

    if (searchTerm) {
        filteredPasswords = passwords.filter(p =>
            p.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.username.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    exportPasswords(filteredPasswords, '搜索结果');
}

// 导出所有数据
function exportAllData() {
    exportPasswords(passwords, '所有密码数据');
}