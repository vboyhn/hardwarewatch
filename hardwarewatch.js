module.exports.hardwarewatch = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;

    obj.server_startup = function() {
        console.log('>>> [MeshCentral Plugin] HardwareWatch (by vboyhn) loaded! <<<');
    };

    obj.handleAdminReq = function(req, res, user) {
        
        // --- PHẦN 1: TẠO API TRẢ VỀ DỮ LIỆU ---
        if (req.query && req.query.action === 'getdata') {
            obj.meshServer.db.GetAllType('node', function (err, docs) {
                if (err || !docs) {
                    res.json({ success: false, error: 'Lỗi truy xuất Database' });
                    return;
                }
                
                var hardwareList = docs.map(function(node) {
                    
                    // 1. Logic lấy IP an toàn nhất (LAN hoặc WAN)
                    var ipAddress = 'N/A';
                    if (node.conn && node.conn.remoteAddress) {
                        ipAddress = node.conn.remoteAddress.replace(/^.*:/, ''); // Đang online
                    } else if (node.pname) {
                        ipAddress = node.pname; // IP Public
                    } else if (node.lastpname) {
                        ipAddress = node.lastpname; // IP Public lần cuối
                    }

                    // 2. Logic trích xuất phần cứng (CPU & RAM)
                    var hwRam = "N/A";
                    var hwCpu = "N/A";
                    
                    if (node.hardware) {
                        // Tìm xem OS là gì (windows, linux, mac,...)
                        var osKey = node.hardware.windows ? 'windows' : (node.hardware.linux ? 'linux' : (node.hardware.mac ? 'mac' : null));
                        
                        if (osKey && node.hardware[osKey]) {
                            var osHw = node.hardware[osKey];
                            
                            // Lấy RAM (Tính tổng nếu có nhiều thanh RAM)
                            if (osHw.memory && osHw.memory.length > 0) {
                                var totalRam = 0;
                                osHw.memory.forEach(function(m) {
                                    totalRam += parseInt(m.Capacity || 0);
                                });
                                if (totalRam > 0) {
                                    // Đổi từ Byte sang GB và làm tròn
                                    hwRam = (totalRam / (1024 * 1024 * 1024)).toFixed(1) + " GB";
                                }
                            }
                            
                            // Lấy CPU
                            if (osHw.cpu && osHw.cpu.length > 0) {
                                hwCpu = osHw.cpu[0].Name || osHw.cpu[0].Caption || osHw.cpu[0].Version || "N/A";
                            }
                        }
                    }

                    return {
                        name: node.name || 'Unknown',
                        os: node.osdesc || 'N/A',
                        ip: ipAddress,
                        cpu: hwCpu,
                        ram: hwRam,
                        lastSeen: node.lastconn ? new Date(node.lastconn).toLocaleString() : 'N/A'
                    };
                });
                
                res.json({ success: true, data: hardwareList });
            });
            return;
        }

        // --- PHẦN 2: TRẢ VỀ GIAO DIỆN HTML ---
        var html = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Bảng Giám Sát Phần Cứng (Hardware Watch)</h2>
                    <button onclick="loadHardwareData()" style="padding: 8px 16px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Làm mới dữ liệu</button>
                </div>
                <hr style="margin-bottom: 20px;" />
                
                <div id="hw-result" style="overflow-x: auto;">Đang tải dữ liệu thiết bị...</div>
            </div>
            
            <script>
            function loadHardwareData() {
                var resultDiv = document.getElementById('hw-result');
                resultDiv.innerHTML = '<i>Đang tải thông tin phần cứng...</i>';
                
                var url = window.location.href;
                url += (url.indexOf('?') !== -1 ? '&' : '?') + 'action=getdata';

                fetch(url)
                    .then(response => response.json())
                    .then(result => {
                        if(result.success) {
                            if (result.data.length === 0) {
                                resultDiv.innerHTML = '<p>Không có thiết bị nào trong Database.</p>';
                                return;
                            }

                            // Tạo bảng HTML bổ sung cột CPU và RAM
                            var table = '<table border="1" cellpadding="10" style="border-collapse: collapse; width: 100%; text-align: left; background: white;">';
                            table += '<tr style="background:#e9ecef; color: #333;">';
                            table += '<th>Tên Máy</th>';
                            table += '<th>Hệ Điều Hành</th>';
                            table += '<th>CPU</th>';
                            table += '<th>RAM</th>';
                            table += '<th>IP Truy Cập</th>';
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
            
            // Tự động chạy khi mở tab
            loadHardwareData();
            </script>
        `;
        
        res.send(html);
    };

    return obj;
};
