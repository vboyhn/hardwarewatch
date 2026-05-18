module.exports = function (parent) {
    // Lưu tham chiếu tới server core
    var obj = {
        parent: parent,
        name: 'HardwareReporter'
    };

    // Hàm khởi tạo plugin
    obj.init = function () {
        console.log('HardwareReporter: Plugin đã khởi động thành công.');
    };

    // API: Lấy thông tin tổng hợp của tất cả thiết bị
    // Bạn có thể gọi API này từ phía Client (Web UI)
    obj.getHardwareSummary = function (args, cb) {
        // Lấy tất cả các thiết bị từ cơ sở dữ liệu
        parent.db.GetAllNodes(function (nodes) {
            if (!nodes) {
                cb({ error: 'Không tìm thấy thiết bị nào' });
                return;
            }

            // Tổng hợp thông tin từ các node
            var report = nodes.map(function (node) {
                // Kiểm tra xem node có thông tin phần cứng không
                // Dữ liệu thường nằm trong node.rinfo hoặc node.agent
                return {
                    id: node._id,
                    name: node.name,
                    os: node.os ? node.os.description : 'N/A',
                    cpu: node.cpu ? node.cpu.brand : 'N/A',
                    memory: node.ram ? (Math.round(node.ram / 1024 / 1024 / 1024 * 10) / 10) + ' GB' : 'N/A',
                    lastSeen: node.lastseen
                };
            });

            cb({ success: true, data: report });
        });
    };

    return obj;
};
