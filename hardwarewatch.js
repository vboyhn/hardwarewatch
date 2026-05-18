module.exports.hardwarewatch = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;

    obj.server_startup = function() {
        console.log('>>> [MeshCentral Plugin] HardwareWatch loaded! <<<');
    };

    obj.handleAdminReq = function(req, res, user) {
        if (req.query && req.query.action === 'getdata') {
            obj.meshServer.db.GetAllType('node', function (err, docs) {
                if (err || !docs) {
                    res.json({ success: false, error: 'Lỗi truy xuất Database' });
                    return;
                }
                
                var hardwareList = docs.map(function(node) {
                    // Helper: Loại bỏ các giá trị null, undefined hoặc chuỗi "null"
                    function getVal(v) {
                        return (v === null || v === undefined || v === '' || v === 'null') ? false : v;
                    }

                    // 1. Logic lấy IP (Lùng sục mọi trường có thể chứa IP trong DB)
                    var ipAddress = getVal(node.ip) || getVal(node.host) || getVal(node.pname) || getVal(node.lastpname) || 'N/A';

                    // 2. Logic trích xuất phần cứng (Quét sâu)
                    var hwRam = "N/A";
                    var hwCpu = "N/A";
                    
                    // Lấy object chứa dữ liệu (Bản mới dùng sysinfo, bản cũ dùng hardware)
                    var sys = node.sysinfo || node.hardware || {};
                    var hw = sys.hardware || sys; 
                    
                    if (hw) {
                        // Xác định xem thiết bị đang chạy OS gì để vào đúng thư mục
                        var osList = ['windows', 'linux', 'mac', 'freebsd'];
                        var osData = null;
                        for(var i = 0; i < osList.length; i++) {
                            if (hw[osList[i]]) {
                                osData = hw[osList[i]];
                                break;
                            }
                        }
                        
                        // Fallback nếu MeshCentral không chia theo nhánh OS
                        if (!osData && (hw.cpu || hw.memory || hw.ram)) {
                            osData = hw;
                        }

                        if (osData) {
                            // Bóc tách RAM
                            if (osData.memory && Array.isArray(osData.memory)) {
                                var totalRam = 0;
                                osData.memory.forEach(function(m) {
                                    // Bắt cả chữ hoa lẫn thường (Windows vs Linux)
                                    var cap = m.Capacity || m.capacity || m.Size || m.size || 0;
                                    totalRam += parseInt(cap);
                                });
                                if (totalRam > 0) {
                                    hwRam = (totalRam / (1024 * 1024 * 1024)).toFixed(1) + " GB";
                                }
                            } else if (osData.ram) {
                                hwRam = osData.ram;
                            }
                            
                            // Bóc tách CPU
                            if (osData.cpu && Array.isArray(osData.cpu) && osData.cpu.length > 0) {
                                var c = osData.cpu[0];
                                hwCpu = c.Name || c.name || c.Caption || c.caption || c.Version || c.brand || "Unknown CPU";
                            } else if (typeof osData.cpu === 'string') {
                                hwCpu = osData.cpu;
                            }
                        }
                    }

                    return {
                        name: node.name || 'Unknown',
                        os: getVal(node.osdesc) || getVal(node.os) || 'N/A',
                        ip: ipAddress,
                        cpu: hwCpu,
                        ram: hwRam,
                        lastSeen: node.lastconn ? new Date(node.lastconn).toLocaleString() : 'N/A'
                    };
                });
                
                // TRẢ VỀ API: Gửi kèm 2 thiết bị gốc đầu tiên để Debug
                res.json({ success: true, data: hardwareList, debugDocs: docs.slice(0, 2) });
            });
            return;
        }

        var html = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Bảng Giám Sát Phần Cứng (Hardware Watch)</h2>
                    <div>
                        <button onclick="toggleDebug()" style="padding: 8px 16px; margin-right: 10px; cursor: pointer; background: #6c757d; color: white; border: none; border-radius: 4px;">🕵️ Xem Database Gốc</button>
                        <button onclick="loadHardwareData()" style="padding: 8px 16px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px;">Làm mới dữ liệu</button>
                    </div>
                </div>
                <hr style="margin-bottom: 20px;" />
                
                <!-- Bảng Debug Ẩn -->
                <textarea id="debug-box" style="display:none; width:100%; height:300px; background:#212529; color:#20c997; margin-bottom:15px; font-family:monospace; padding:10px; border-radius:5px;" readonly></textarea>

                <div id="hw-result" style="overflow-x: auto;">Đang tải dữ liệu thiết bị...</div>
            </div>
            
            <script>
            window.rawDebugData = "Không có dữ liệu debug";

            function toggleDebug() {
                var box = document.getElementById('debug-box');
                if (box.style.display === 'none') {
                    box.style.display = 'block';
                    box.value = "=== DỮ LIỆU GỐC CỦA MÁY TỪ MESH CENTRAL ===\\n(Nếu bảng thiếu dữ liệu, hãy tìm xem CPU/RAM đang nằm ở biến nào trong đống này)\\n\\n" + JSON.stringify(window.rawDebugData, null, 2);
                } else {
                    box.style.display = 'none';
                }
            }

            function loadHardwareData() {
                var resultDiv = document.getElementById('hw-result');
                resultDiv.innerHTML = '<i>Đang tải thông tin phần cứng...</i>';
                
                var url = window.location.href;
                url += (url.indexOf('?') !== -1 ? '&' : '?') + 'action=getdata';

                fetch(url)
                    .then(response => response.json())
                    .then(result => {
                        if(result.success) {
                            // Lưu dữ liệu debug
                            window.rawDebugData = result.debugDocs;

                            if (result.data.length === 0) {
                                resultDiv.innerHTML = '<p>Không có thiết bị nào trong Database.</p>';
                                return;
                            }

                            var table = '<table border="1" cellpadding="10" style="border-collapse: collapse; width: 100%; text-align: left; background: white;">';
                            table += '<tr style="background:#e9ecef; color: #333;">';
                            table += '<th>Tên Máy</th>';
                            table += '<th>Hệ Điều Hành</th>';
                            table += '<th>CPU</th>';
                            table += '<th>RAM</th>';
                            table += '<th>IP</th>';
                            table += '<th>Lần Cuối Online</th>';
                            table += '</tr>';
                            
                            result.data.forEach(function(item) {
                                table += '<tr style="border-bottom: 1px solid #ddd;">';
                                table += '<td style="color: #0056b3;"><b>' + item.name + '</b></td>';
                                table += '<td>' + item.os + '</td>';
                                table += '<td>' + item.cpu + '</td>';
                                table += '<td><b>' + item.ram + '</b></td>';
                                table += '<td>' + item.ip + '</td>';
                                table += '<td>' + item.lastSeen + '</td>';
                                table += '</tr>';
                            });
                            table += '</table>';
                            
                            resultDiv.innerHTML = table;
                        } else {
                            resultDiv.innerHTML = '<p style="color:red;">Lỗi: ' + result.error + '</p>';
                        }
                    })
                    .catch(err => {
                        resultDiv.innerHTML = '<p style="color:red;">Lỗi kết nối tới Backend của Plugin!</p>';
                        console.error(err);
                    });
            }
            
            // Chạy ngay khi tải xong
            loadHardwareData();
            </script>
        `;
        
        res.send(html);
    };

    return obj;
};
