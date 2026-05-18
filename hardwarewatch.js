// Export đúng tên shortName (hardwarewatch)
module.exports.hardwarewatch = function (parent) {
    var obj = {};
    obj.parent = parent;
    
    // Lấy đối tượng lõi của MeshCentral
    obj.meshServer = parent.parent;

    // HOOK 1: Khởi động Server
    obj.server_startup = function() {
        console.log('>>> [MeshCentral Plugin] HardwareWatch (by vboyhn) loaded! <<<');
    };

    // HOOK 2: Xử lý giao diện & API khi User truy cập tab Plugin
    obj.handleAdminReq = function(req, res, user) {
        
        // --- PHẦN 1: TẠO API TRẢ VỀ DỮ LIỆU ---
        // Nếu trình duyệt gọi AJAX kèm tham số action=getdata
        if (req.query && req.query.action === 'getdata') {
            // Truy vấn database của MeshCentral để lấy tất cả thiết bị (type = 'node')
            obj.meshServer.db.GetAllType('node', function (err, docs) {
                if (err || !docs) {
                    res.json({ success: false, error: 'Lỗi truy xuất Database' });
                    return;
                }
                
                // Trích xuất các trường thông tin cần thiết
                var hardwareList = docs.map(function(node) {
                    return {
                        name: node.name || 'Unknown',
                        os: node.osdesc || 'N/A', // Tên hệ điều hành
                        ip: node.lastipsext || 'N/A', // IP Public/Local lần cuối
                        // Nếu database của bạn có lưu cấu hình HW, có thể móc thêm ở đây
                        // (Bạn có thể in thử console.log(node) để xem thêm các field có sẵn)
                        lastSeen: node.lastconn ? new Date(node.lastconn).toLocaleString() : 'N/A'
                    };
                });
                
                res.json({ success: true, data: hardwareList });
            });
            return; // Dừng tại đây, không trả về HTML
        }

        // --- PHẦN 2: TRẢ VỀ GIAO DIỆN HTML ---
        var html = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Hardware Watch Dashboard</h2>
                    <button onclick="loadHardwareData()" style="padding: 8px 16px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px;">Làm mới dữ liệu</button>
                </div>
                <hr style="margin-bottom: 20px;" />
                
                <!-- Bảng chứa dữ liệu -->
                <div id="hw-result">Đang tải dữ liệu thiết bị...</div>
            </div>
            
            <script>
            function loadHardwareData() {
                var resultDiv = document.getElementById('hw-result');
                resultDiv.innerHTML = 'Đang tải...';
                
                // Lấy URL hiện tại của tab plugin và thêm action=getdata
                var url = window.location.href;
                url += (url.indexOf('?') !== -1 ? '&' : '?') + 'action=getdata';

                fetch(url)
                    .then(response => response.json())
                    .then(result => {
                        if(result.success) {
                            if (result.data.length === 0) {
                                resultDiv.innerHTML = '<p>Không có thiết bị nào.</p>';
                                return;
                            }

                            // Tạo bảng HTML
                            var table = '<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; text-align: left;">';
                            table += '<tr style="background:#f4f4f4"><th>Tên Máy (Node)</th><th>Hệ Điều Hành</th><th>IP Lần Cuối</th><th>Lần Cuối Online</th></tr>';
                            
                            result.data.forEach(function(item) {
                                table += '<tr>';
                                table += '<td><b>' + item.name + '</b></td>';
                                table += '<td>' + item.os + '</td>';
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
            
            // Tự động chạy khi vừa mở tab
            loadHardwareData();
            </script>
        `;
        
        res.send(html);
    };

    return obj;
};
