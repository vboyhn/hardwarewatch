const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports.hardwarewatch = function (parent) {

    const obj = {};

    // =====================================================
    // DATABASE FILE
    // =====================================================

    const DATA_FILE = path.join(__dirname, 'data', 'hardware.json');

    let hardwareDb = {};

    // =====================================================
    // LOAD DATABASE
    // =====================================================

    try {

        if (fs.existsSync(DATA_FILE)) {

            hardwareDb = JSON.parse(
                fs.readFileSync(DATA_FILE)
            );

        }

    }
    catch (ex) {

        console.log('HardwareWatch DB Load Error:', ex);

    }

    // =====================================================
    // SAVE DATABASE
    // =====================================================

    function saveDb() {

        try {

            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(hardwareDb, null, 4)
            );

        }
        catch (ex) {

            console.log('HardwareWatch DB Save Error:', ex);

        }
    }

    // =====================================================
    // NORMALIZE ARRAY
    // =====================================================

    function normalizeArray(arr, field) {

        if (!Array.isArray(arr)) {
            return [];
        }

        return arr
            .filter(x => x)
            .sort((a, b) => {

                const av = (a[field] || '').toString();
                const bv = (b[field] || '').toString();

                return av.localeCompare(bv);

            });
    }

    // =====================================================
    // CLEAN SERIAL
    // =====================================================

    function cleanSerial(value) {

        if (!value) {
            return '';
        }

        value = value.toString().trim();

        const invalid = [
            '',
            '00000000',
            'To Be Filled By O.E.M.',
            'Default string',
            'System Serial Number'
        ];

        if (invalid.includes(value)) {
            return '';
        }

        return value;
    }

    // =====================================================
    // EXTRACT HARDWARE
    // =====================================================

    function extractHardware(node) {

        try {

            const hw = {
                cpu: '',
                bios: '',
                mainboard: '',
                ram: [],
                disk: []
            };

            // =================================================
            // DEBUG FIRST TIME
            // =================================================

            // Uncomment if needed
            // fs.writeFileSync(
            //     path.join(__dirname, 'debug-node.json'),
            //     JSON.stringify(node, null, 4)
            // );

            // =================================================
            // CPU
            // =================================================

            hw.cpu =
                node?.sys?.hardware?.identifiers?.cpu_name ||
                node?.hardware?.cpu_name ||
                '';

            // =================================================
            // BIOS
            // =================================================

            hw.bios = cleanSerial(
                node?.sys?.hardware?.identifiers?.bios_serial ||
                node?.hardware?.bios_serial ||
                ''
            );

            // =================================================
            // MAINBOARD
            // =================================================

            hw.mainboard = cleanSerial(
                node?.sys?.hardware?.identifiers?.board_serial ||
                node?.hardware?.board_serial ||
                ''
            );

            // =================================================
            // RAM
            // =================================================

            const ramList =
                node?.sys?.hardware?.memory ||
                node?.hardware?.memory ||
                [];

            hw.ram = normalizeArray(
                ramList.map(x => ({
                    serial: cleanSerial(x.serial || x.SerialNumber),
                    size: x.capacity || x.Capacity || 0
                })),
                'serial'
            );

            // =================================================
            // DISK
            // =================================================

            const diskList =
                node?.sys?.hardware?.storage_devices ||
                node?.hardware?.storage_devices ||
                [];

            hw.disk = normalizeArray(
                diskList.map(x => ({
                    serial: cleanSerial(x.serial || x.SerialNumber),
                    model: x.model || x.Model || '',
                    size: x.size || x.Size || 0
                })),
                'serial'
            );

            return hw;

        }
        catch (ex) {

            console.log('Hardware extract error:', ex);

            return null;

        }
    }

    // =====================================================
    // CREATE FINGERPRINT
    // =====================================================

    function createFingerprint(hw) {

        return crypto
            .createHash('sha256')
            .update(JSON.stringify(hw))
            .digest('hex');
    }

    // =====================================================
    // COMPARE
    // =====================================================

    function compareHardware(oldHw, newHw) {

        const changes = [];

        // CPU
        if (oldHw.cpu !== newHw.cpu) {

            changes.push({
                type: 'critical',
                message: 'CPU changed'
            });

        }

        // MAINBOARD
        if (oldHw.mainboard !== newHw.mainboard) {

            changes.push({
                type: 'critical',
                message: 'Mainboard changed'
            });

        }

        // BIOS
        if (oldHw.bios !== newHw.bios) {

            changes.push({
                type: 'critical',
                message: 'BIOS changed'
            });

        }

        // RAM
        if (JSON.stringify(oldHw.ram) !== JSON.stringify(newHw.ram)) {

            changes.push({
                type: 'warning',
                message: 'RAM changed'
            });

        }

        // DISK
        if (JSON.stringify(oldHw.disk) !== JSON.stringify(newHw.disk)) {

            changes.push({
                type: 'warning',
                message: 'Disk changed'
            });

        }

        return changes;
    }

    // =====================================================
    // CHECK HARDWARE
    // =====================================================

    function checkHardware(nodeid, hw) {

        const fingerprint = createFingerprint(hw);

        // FIRST TIME
        if (!hardwareDb[nodeid]) {

            hardwareDb[nodeid] = {
                fingerprint: fingerprint,
                hardware: hw,
                lastSeen: new Date()
            };

            saveDb();

            console.log(
                'HardwareWatch: New device registered:',
                nodeid
            );

            return;
        }

        const oldHw = hardwareDb[nodeid].hardware;

        // QUICK HASH CHECK
        if (hardwareDb[nodeid].fingerprint === fingerprint) {

            hardwareDb[nodeid].lastSeen = new Date();

            saveDb();

            console.log(
                'HardwareWatch: No changes:',
                nodeid
            );

            return;
        }

        // FULL COMPARE
        const changes = compareHardware(oldHw, hw);

        // CHANGED
        if (changes.length > 0) {

            console.log('=================================');
            console.log('HARDWARE CHANGE DETECTED');
            console.log('NODE:', nodeid);

            changes.forEach(c => {
                console.log(
                    `[${c.type.toUpperCase()}] ${c.message}`
                );
            });

            console.log('=================================');

            // MESH EVENT
            parent.DispatchEvent(
                ['*'],
                obj,
                {
                    etype: 'node',
                    action: 'hardwarechange',
                    nodeid: nodeid,
                    msg: changes.map(x => x.message).join(', ')
                }
            );

            // UPDATE DB
            hardwareDb[nodeid] = {
                fingerprint: fingerprint,
                hardware: hw,
                lastSeen: new Date()
            };

            saveDb();
        }
    }

    // =====================================================
    // DEVICE CONNECT
    // =====================================================

    obj.onDeviceConnect = function (nodeid) {

        console.log(
            'HardwareWatch Device Connected:',
            nodeid
        );

        try {

            parent.db.Get(nodeid, function (err, docs) {

                if (err) {

                    console.log('DB Error:', err);

                    return;
                }

                if (!docs || docs.length === 0) {

                    console.log(
                        'Node not found:',
                        nodeid
                    );

                    return;
                }

                const node = docs[0];

                const hw = extractHardware(node);

                if (!hw) {

                    console.log(
                        'No hardware info available'
                    );

                    return;
                }

                checkHardware(nodeid, hw);

            });

        }
        catch (ex) {

            console.log(
                'HardwareWatch Error:',
                ex
            );

        }
    };

    // =====================================================
    // ADMIN PAGE
    // =====================================================

    obj.handleAdminReq = function (req, res, user) {

        res.send(`
            <html>
            <head>
                <title>Hardware Watch</title>

                <style>
                    body{
                        font-family:Arial;
                        padding:20px;
                    }

                    pre{
                        background:#111;
                        color:#0f0;
                        padding:15px;
                        overflow:auto;
                    }
                </style>
            </head>

            <body>

                <h1>Hardware Watch</h1>

                <pre>
${JSON.stringify(hardwareDb, null, 4)}
                </pre>

            </body>
            </html>
        `);

    };

    // =====================================================
    // STARTUP
    // =====================================================

    obj.server_startup = function () {

        console.log('=================================');
        console.log('HardwareWatch Plugin Started');
        console.log('=================================');

    };

    return obj;
};