const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports.hardwarewatch = function (parent) {

    var obj = {};

    obj.parent = parent;
    obj.meshServer = parent.parent;

   

    // =====================================================
    // FILES
    // =====================================================

    const BASELINE_FILE = path.join(
        __dirname,
        'hardware-baseline.json'
    );

    const HISTORY_FILE = path.join(
        __dirname,
        'hardware-history.json'
    );

    // =====================================================
    // DATABASE
    // =====================================================

    let baselineDb = {};
    let historyDb = [];
    let alertQueue = [];

    // =====================================================
    // LOAD BASELINE
    // =====================================================

    try {

        if (fs.existsSync(BASELINE_FILE)) {

            baselineDb = JSON.parse(
                fs.readFileSync(BASELINE_FILE)
            );

        }

    }
    catch (e) {

        console.log(
            'Cannot load baseline file',
            e
        );

    }

    // =====================================================
    // LOAD HISTORY
    // =====================================================

    try {

        if (fs.existsSync(HISTORY_FILE)) {

            historyDb = JSON.parse(
                fs.readFileSync(HISTORY_FILE)
            );

        }

    }
    catch (e) {

        console.log(
            'Cannot load history file',
            e
        );

    }

    // =====================================================
    // SAVE BASELINE
    // =====================================================

    function saveBaseline() {

        try {

            fs.writeFileSync(
                BASELINE_FILE,
                JSON.stringify(
                    baselineDb,
                    null,
                    4
                )
            );

        }
        catch (e) {

            console.log(
                'Cannot save baseline',
                e
            );

        }

    }

    // =====================================================
    // SAVE HISTORY
    // =====================================================

    function saveHistory() {

        try {

            fs.writeFileSync(
                HISTORY_FILE,
                JSON.stringify(
                    historyDb,
                    null,
                    4
                )
            );

        }
        catch (e) {

            console.log(
                'Cannot save history',
                e
            );

        }

    }

    // =====================================================
    // CLEAN SERIAL
    // =====================================================

    function cleanSerial(v) {

        if (!v) return '';

        v = v.toString().trim();

        const invalid = [
            '',
            '00000000',
            'To Be Filled By O.E.M.',
            'Default string',
            'System Serial Number'
        ];

        if (invalid.includes(v)) {
            return '';
        }

        return v;
    }

    // =====================================================
    // HASH HARDWARE
    // =====================================================

    function hashHardware(hw) {

        return crypto
            .createHash('sha256')
            .update(JSON.stringify(hw))
            .digest('hex');

    }

    // =====================================================
    // EXTRACT HARDWARE
    // =====================================================

    function extractHardware(siData) {

        var result = {
            cpu: '',
            ram: [],
            disk: []
        };

        if (!siData || !siData.hardware) {
            return result;
        }

        var hw = siData.hardware;

        var osData =
            hw.windows ||
            hw.linux ||
            hw.mac ||
            hw.freebsd ||
            null;

        if (!osData) {
            return result;
        }

        // CPU
        if (
            osData.cpu &&
            Array.isArray(osData.cpu) &&
            osData.cpu[0]
        ) {

            result.cpu =
                osData.cpu[0].Name ||
                osData.cpu[0].Model ||
                '';

        }

        // RAM
        if (
            osData.memory &&
            Array.isArray(osData.memory)
        ) {

            result.ram =
                osData.memory.map(function (m) {

                    return {

                        serial: cleanSerial(
                            m.SerialNumber || ''
                        ),

                        size: parseInt(
                            m.Capacity || 0
                        )

                    };

                });

        }

        // DISK
        if (
            osData.drives &&
            Array.isArray(osData.drives)
        ) {

            result.disk =
                osData.drives.map(function (d) {

                    return {

                        model: d.Model || '',

                        serial: cleanSerial(
                            d.SerialNumber || ''
                        ),

                        size: parseInt(
                            d.Size || 0
                        )

                    };

                });

        }

        return result;
    }

    // =====================================================
    // COMPARE HARDWARE
    // =====================================================

    function compareHardware(oldHw, newHw) {

        var changes = [];

        if (
            oldHw.cpu !== newHw.cpu
        ) {

            changes.push(
                'CPU changed'
            );

        }

        if (
            JSON.stringify(oldHw.ram) !==
            JSON.stringify(newHw.ram)
        ) {

            changes.push(
                'RAM changed'
            );

        }

        if (
            JSON.stringify(oldHw.disk) !==
            JSON.stringify(newHw.disk)
        ) {

            changes.push(
                'Disk changed'
            );

        }

        return changes;
    }

    // =====================================================
    // CHECK HARDWARE
    // =====================================================

    function checkHardware(node, siData) {

        try {

            var hw =
                extractHardware(siData);

            var fingerprint =
                hashHardware(hw);

            var nodeid =
                node._id;

            // AUTO CREATE BASELINE

            if (
                !baselineDb[nodeid]
            ) {

                baselineDb[nodeid] = {

                    fingerprint:
                        fingerprint,

                    hardware:
                        hw,

                    updated:
                        new Date()

                };

                saveBaseline();

                console.log(
                    'AUTO BASELINE CREATED:',
                    node.name
                );

                return;
            }

            // NO CHANGE

            if (
                baselineDb[nodeid]
                    .fingerprint ===
                fingerprint
            ) {

                return;

            }

            // COMPARE

            var changes =
                compareHardware(
                    baselineDb[nodeid]
                        .hardware,
                    hw
                );

            if (
                changes.length > 0
            ) {

                console.log(
                    'HARDWARE CHANGE:',
                    node.name,
                    changes
                );

                // ALERT

                alertQueue.push({

                    id: Date.now(),

                    node: node.name,

                    changes: changes,

                    time: new Date()

                });

                // HISTORY

                historyDb.push({

                    id: Date.now(),

                    nodeid: node._id,

                    machine: node.name,

                    changes: changes,

                    oldHardware:
                        baselineDb[nodeid]
                            .hardware,

                    newHardware:
                        hw,

                    time:
                        new Date()

                });

                // LIMIT HISTORY

                if (
                    historyDb.length > 1000
                ) {

                    historyDb.shift();

                }

                saveHistory();

            }

        }
        catch (ex) {

            console.log(
                'Hardware Check Error:',
                ex
            );

        }

    }

    // =====================================================
    // SERVER STARTUP
    // =====================================================

    obj.server_startup = function () {

        console.log(
            'HardwareWatch Started'
        );

        obj.parent.AddEventDispatch(
            ['*'],
            function (source, event) {

                try {

                    if (
                        event.action ===
                            'nodeconnect' ||
                        event.action ===
                            'changenode'
                    ) {

                        var nodeid =
                            event.nodeid;

                        if (!nodeid) {
                            return;
                        }

                        obj.meshServer.db.Get(
                            nodeid,
                            function (
                                err,
                                nodes
                            ) {

                                if (
                                    err ||
                                    !nodes ||
                                    nodes.length === 0
                                ) {
                                    return;
                                }

                                var node =
                                    nodes[0];

                                obj.meshServer.db.GetAllType(
                                    'sysinfo',
                                    function (
                                        err,
                                        sysinfos
                                    ) {

                                        if (
                                            !sysinfos
                                        ) {
                                            return;
                                        }

                                        var nodeIdSuffix =
                                            node._id.split(
                                                '//'
                                            )[1];

                                        var siData =
                                            sysinfos.find(
                                                function (
                                                    s
                                                ) {

                                                    return (
                                                        s._id &&
                                                        s._id.includes(
                                                            nodeIdSuffix
                                                        )
                                                    );

                                                }
                                            );

                                        if (
                                            !siData
                                        ) {
                                            return;
                                        }

                                        checkHardware(
                                            node,
                                            siData
                                        );

                                    }
                                );

                            }
                        );

                    }

                }
                catch (ex) {

                    console.log(
                        'Event Error:',
                        ex
                    );

                }

            }
        );

    };

    // =====================================================
    // ADMIN PAGE
    // =====================================================

    obj.handleAdminReq = function(
        req,
        res,
        user
    ) {

        // ALERT API

        if (
            req.query.path ===
            'alerts'
        ) {

            res.json(alertQueue);

            alertQueue = [];

            return;
        }

        // HISTORY API

        if (
            req.query.path ===
            'history'
        ) {

            res.json(historyDb);

            return;
        }

        // UPDATE SINGLE BASELINE

        if (
            req.query.action ===
            'savebaseline'
        ) {

            var nodeid =
                req.query.nodeid;

            if (!nodeid) {

                res.send('NO NODEID');

                return;
            }

            obj.meshServer.db.Get(
                nodeid,
                function(err, nodes) {

                    if (
                        err ||
                        !nodes ||
                        nodes.length === 0
                    ) {

                        res.send(
                            'NODE NOT FOUND'
                        );

                        return;
                    }

                    var node =
                        nodes[0];

                    obj.meshServer.db.GetAllType(
                        'sysinfo',
                        function(
                            err,
                            sysinfos
                        ) {

                            if (
                                !sysinfos
                            ) {

                                res.send(
                                    'NO SYSINFO'
                                );

                                return;
                            }

                            var nodeIdSuffix =
                                node._id.split(
                                    '//'
                                )[1];

                            var siData =
                                sysinfos.find(
                                    function(s){

                                        return (
                                            s._id &&
                                            s._id.includes(
                                                nodeIdSuffix
                                            )
                                        );

                                    }
                                );

                            if (
                                !siData
                            ) {

                                res.send(
                                    'NO HARDWARE'
                                );

                                return;
                            }

                            var hw =
                                extractHardware(
                                    siData
                                );

                            baselineDb[
                                nodeid
                            ] = {

                                fingerprint:
                                    hashHardware(
                                        hw
                                    ),

                                hardware:
                                    hw,

                                updated:
                                    new Date()

                            };

                            saveBaseline();

                            res.send('OK');

                        }
                    );

                }
            );

            return;
        }

        // UPDATE ALL BASELINE

        if (
            req.query.action ===
            'saveallbaseline'
        ) {

            obj.meshServer.db.GetAllType(
                'node',
                function(err, nodes) {

                    obj.meshServer.db.GetAllType(
                        'sysinfo',
                        function(err, sysinfos) {

                            if (
                                !nodes ||
                                !sysinfos
                            ) {

                                res.send(
                                    'NO DATA'
                                );

                                return;
                            }

                            var updated = 0;

                            nodes.forEach(function(node){

                                try {

                                    var nodeIdSuffix =
                                        node._id.split(
                                            '//'
                                        )[1];

                                    var siData =
                                        sysinfos.find(
                                            function(s){

                                                return (
                                                    s._id &&
                                                    s._id.includes(
                                                        nodeIdSuffix
                                                    )
                                                );

                                            }
                                        );

                                    if (!siData) {
                                        return;
                                    }

                                    var hw =
                                        extractHardware(
                                            siData
                                        );

                                    baselineDb[
                                        node._id
                                    ] = {

                                        fingerprint:
                                            hashHardware(
                                                hw
                                            ),

                                        hardware:
                                            hw,

                                        updated:
                                            new Date()

                                    };

                                    updated++;

                                }
                                catch(ex) {

                                    console.log(ex);

                                }

                            });

                            saveBaseline();

                            res.send(
                                'OK: ' + updated
                            );

                        }
                    );

                }
            );

            return;
        }

        // DASHBOARD

        obj.meshServer.db.GetAllType(
            'node',
            function (
                err,
                nodes
            ) {

                obj.meshServer.db.GetAllType(
                    'sysinfo',
                    function (
                        err,
                        sysinfos
                    ) {

                        var data = [];

                        if (nodes) {

                            nodes.forEach(
                                function(node) {

                                    var siData =
                                        null;

                                    if (
                                        sysinfos
                                    ) {

                                        var nodeIdSuffix =
                                            node._id.split(
                                                '//'
                                            )[1];

                                        siData =
                                            sysinfos.find(
                                                function(
                                                    s
                                                ) {

                                                    return (
                                                        s._id &&
                                                        s._id.includes(
                                                            nodeIdSuffix
                                                        )
                                                    );

                                                }
                                            );
                                    }

                                    var cpu =
                                        'N/A';

                                    var ram =
                                        'N/A';

                                    var disk =
                                        'N/A';

                                    var changed =
                                        false;

                                    if (
                                        siData &&
                                        siData.hardware
                                    ) {

                                        var hw =
                                            siData.hardware;

                                        var osData =
                                            hw.windows ||
                                            hw.linux ||
                                            hw.mac ||
                                            hw.freebsd ||
                                            null;

                                        if (
                                            osData
                                        ) {

                                            if (
                                                osData.cpu &&
                                                Array.isArray(
                                                    osData.cpu
                                                ) &&
                                                osData.cpu[0]
                                            ) {

                                                cpu =
                                                    osData.cpu[0].Name ||
                                                    'Unknown CPU';

                                            }

                                            if (
                                                osData.memory &&
                                                Array.isArray(
                                                    osData.memory
                                                )
                                            ) {

                                                var bytes = 0;

                                                osData.memory.forEach(
                                                    function(m) {

                                                        bytes +=
                                                            parseInt(
                                                                m.Capacity || 0
                                                            );

                                                    }
                                                );

                                                ram =
                                                    (
                                                        bytes /
                                                        1024 /
                                                        1024 /
                                                        1024
                                                    ).toFixed(0) +
                                                    ' GB';

                                            }

                                            if (
                                                osData.drives &&
                                                Array.isArray(
                                                    osData.drives
                                                )
                                            ) {

                                                disk =
                                                    osData.drives.map(
                                                        function(d){

                                                            var sz =
                                                                (
                                                                    parseInt(
                                                                        d.Size || 0
                                                                    ) /
                                                                    1024 /
                                                                    1024 /
                                                                    1024
                                                                ).toFixed(0);

                                                            return `
<div>
<strong>${d.Model}</strong>
: ${sz}GB
</div>
`;

                                                        }
                                                    ).join('');

                                            }

                                            try {

                                                if (
                                                    baselineDb[node._id]
                                                ) {

                                                    var currentHw =
                                                        extractHardware(siData);

                                                    var currentHash =
                                                        hashHardware(currentHw);

                                                    if (
                                                        baselineDb[node._id]
                                                            .fingerprint !==
                                                        currentHash
                                                    ) {

                                                        changed = true;

                                                    }

                                                }

                                            }
                                            catch(ex){}

                                        }

                                    }

                                    data.push({

                                        nodeid:
                                            node._id,

                                        name:
                                            node.name,

                                        os:
                                            node.osdesc ||
                                            'N/A',

                                        ip:
                                            node.ip ||
                                            node.host ||
                                            'N/A',

                                        cpu:
                                            cpu,

                                        ram:
                                            ram,

                                        disk:
                                            disk,

                                        changed:
                                            changed

                                    });

                                }
                            );

                        }

                        var rows =
                            data.map(function(d){

                                return `
<tr>

<td>${d.name}</td>
<td>${d.os}</td>
<td>${d.ip}</td>
<td>${d.cpu}</td>
<td>${d.ram}</td>
<td>${d.disk}</td>

<td>

${d.changed ? `

<button
onclick="
updateBaseline(
'${d.nodeid}'
)
"
style="
background:#ff9800;
color:white;
border:none;
padding:6px 12px;
border-radius:6px;
cursor:pointer;
font-weight:bold;
"
>
Update Baseline
</button>

` : ''}

</td>

</tr>
`;

                            }).join('');

                        res.send(`

<style>

body{
    margin:0;
    font-family:Segoe UI;
    background:#f4f7f6;
}

.hw-container{
    padding:20px;
}

.hw-card{
    background:white;
    padding:20px;
    border-radius:10px;
    box-shadow:
        0 4px 6px rgba(
            0,
            0,
            0,
            0.1
        );
}

.hw-table{
    width:100%;
    border-collapse:collapse;
    margin-top:15px;
}

.hw-table th{
    background:#007bff;
    color:white;
    padding:12px;
    text-align:left;
}

.hw-table td{
    padding:12px;
    border-bottom:1px solid #eee;
}

.hw-search{
    width:100%;
    padding:10px;
    margin-bottom:15px;
}

.popup-overlay{
    position:fixed;
    inset:0;
    background:
        rgba(0,0,0,.5);
    display:none;
    justify-content:center;
    align-items:center;
    z-index:99999;
}

.popup{
    width:420px;
    background:white;
    border-radius:14px;
    overflow:hidden;
}

.popup-header{
    background:#ff4d4f;
    color:white;
    padding:16px;
    font-size:20px;
    font-weight:bold;
}

.popup-body{
    padding:20px;
}

.popup-footer{
    padding:16px;
    text-align:right;
}

.popup-btn{
    background:#007bff;
    color:white;
    border:none;
    padding:10px 18px;
    border-radius:6px;
    cursor:pointer;
}

.topbar{
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:15px;
}

.green-btn{
    background:#28a745;
    color:white;
    border:none;
    padding:10px 16px;
    border-radius:6px;
    cursor:pointer;
    font-weight:bold;
}

</style>

<div
class="popup-overlay"
id="popupOverlay"
>

<div class="popup">

<div class="popup-header">
⚠ Hardware Changed
</div>

<div class="popup-body">

<div id="popupMachine"></div>

<ul id="popupChanges"></ul>

</div>

<div class="popup-footer">

<button
class="popup-btn"
onclick="closePopup()"
>
OK
</button>

</div>

</div>

</div>

<div class="hw-container">

<div class="hw-card">

<div class="topbar">

<h2>
Hardware Watch Dashboard
</h2>

<button
class="green-btn"
onclick="saveAllBaseline()"
>
Update All Baseline
</button>

</div>

<input
type="text"
class="hw-search"
id="searchInput"
onkeyup="filterTable()"
placeholder="🔍 Search..."
>

<table class="hw-table">

<thead>

<tr>

<th>Machine</th>
<th>OS</th>
<th>IP</th>
<th>CPU</th>
<th>RAM</th>
<th>Disk</th>
<th>Action</th>

</tr>

</thead>

<tbody>

${rows}

</tbody>

</table>

</div>

</div>

<script>

function filterTable() {

var input =
document
.getElementById(
'searchInput'
)
.value
.toUpperCase();

var table =
document.querySelector(
'.hw-table'
);

var tr =
table.getElementsByTagName(
'tr'
);

for (
var i = 1;
i < tr.length;
i++
) {

var td =
tr[i]
.getElementsByTagName(
'td'
)[0];

if (td) {

tr[i].style.display =
td.innerText
.toUpperCase()
.indexOf(input) > -1
? ''
: 'none';

}

}

}

async function saveAllBaseline() {

if (
!confirm(
'Update ALL baseline?'
)
) {
return;
}

var res =
await fetch(

window.location.pathname +

'?pin=hardwarewatch' +

'&action=saveallbaseline'

);

alert(await res.text());

location.reload();

}

async function updateBaseline(
nodeid
) {

if (
!confirm(
'Update baseline for this machine?'
)
) {
return;
}

try {

var res =
await fetch(

window.location.pathname +

'?pin=hardwarewatch' +

'&action=savebaseline' +

'&nodeid=' +

encodeURIComponent(
nodeid
)

);

var txt =
await res.text();

alert(txt);

location.reload();

}
catch(ex) {

alert(ex);

}

}

function showPopup(
node,
changes
) {

document
.getElementById(
'popupOverlay'
)
.style.display =
'flex';

document
.getElementById(
'popupMachine'
)
.innerHTML =
'<strong>Machine:</strong> '
+ node;

document
.getElementById(
'popupChanges'
)
.innerHTML =
changes.map(
function(c){

return (
'<li>'
+ c +
'</li>'
);

}
).join('');

}

function closePopup() {

document
.getElementById(
'popupOverlay'
)
.style.display =
'none';

}

async function pollAlerts() {

try {

var res =
await fetch(

window.location.pathname +

'?pin=hardwarewatch' +

'&path=alerts'

);

var alerts =
await res.json();

if (
alerts &&
Array.isArray(
alerts
)
) {

alerts.forEach(
function(a){

showPopup(
a.node,
a.changes
);

}
);

}

}
catch(ex) {

console.log(ex);

}

}

setInterval(
pollAlerts,
3000
);

</script>

`);

                    }
                );

            }
        );

    };

    return obj;
	
	

};
