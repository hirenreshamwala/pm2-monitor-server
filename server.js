const config = require('./config.json');
const socketIo = require('socket.io');
const pm2 = require('pm2');
const os = require('os');
const ps = require('ps-node');
const http = require('http');
const osUtil = require('os-utils');
const hostname = os.hostname();
const disk = require('diskusage');
const cpus = os.cpus()
    .length;
const totalmemNum = os.totalmem();
const totalmem = memoryString(os.totalmem());
const nodev = process.version;
const godid = process.pid;

const port = 6001;

const cpuThreshold = 90;

const httpServer = http.createServer((req, res) => {
    if (req.url.startsWith('/killMonitor')) {
        ps.kill(process.pid);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Monitor process pid: ${godid}`);
});
httpServer.listen(port, () => {
    console.log(`listening on port ${port}`);
});
const io = socketIo(httpServer);

function memoryString(byteLen) {
    let mem = byteLen / 1024 / 1024;
    if (mem.toFixed() >= 1000) {
        mem = (mem / 1024)
            .toFixed(2);
        return `${mem}GB`;
    }
    mem = mem.toFixed(2);
    return `${mem}MB`;
}

function timeString(time, style = 1) {
    const date = new Date(time);
    const month = (date.getMonth() + 1)
        .toString()
        .length > 1 ? (date.getMonth() + 1) : `0${date.getMonth() + 1}`;
    const day = date.getDate()
        .toString()
        .length > 1 ? date.getDate() : `0${date.getDate()}`;
    const hour = date.getHours()
        .toString()
        .length > 1 ? date.getHours() : `0${date.getHours()}`;
    const minute = date.getMinutes()
        .toString()
        .length > 1 ? date.getMinutes() : `0${date.getMinutes()}`;
    const second = date.getSeconds()
        .toString()
        .length > 1 ? date.getSeconds() : `0${date.getSeconds()}`;
    let milliseconds = date.getMilliseconds().toString();
    if (milliseconds.length === 2) {
        milliseconds = `0${milliseconds}`;
    } else if (milliseconds.length === 1) {
        milliseconds = `00${milliseconds}`;
    }

    if (style === 1) {
        return `${month}/${day} ${hour}:${minute}:${second}`;
    }

    if (style === 2) {
        return `${month}-${day} ${hour}:${minute}:${second}.${milliseconds}`;
    }
}

function totalUptimeString(time) {
    const diff = Date.now() - time;
    const seconds = Math.round(diff / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.round(diff / 1000 / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.round(diff / 1000 / 60 / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    const days = Math.round(diff / 1000 / 60 / 60 / 24);
    return `${days}d`;
}

function pm2List() {
    return new Promise(resolve => {
        pm2.list((err, data) => {
            if (err) {
                return resolve([]);
            }
            resolve(data);
        });
    });
}

function getCpuUsage() {
    return new Promise(resolve => {
        osUtil.cpuUsage(val => {
            resolve(Math.round(val * 100));
        });
    });
}

function getDiskUsage(path) {
    return new Promise(resolve => {
        disk.check(path, (err, info) => {
            resolve({
                path: path,
                free: info.free,
                total: info.total,
                freeStr: memoryString(info.free),
                totalStr: memoryString(info.total),
            });
        });
    });
}

function getDiskUsages(paths){
    const pro = [];
    for (let i = 0; i < paths.length; i++) {
        pro.push(getDiskUsage(paths[i]));
    }
    return Promise.all(pro)
}

io.on('connection', socket => {
    console.log('websocket server connect!');
    let diskPaths = [];
    if (config && config.paths){
        diskPaths = config.paths;
    }
    const timer = setInterval(() => {
        Promise.all([
            pm2List(),
            getCpuUsage(),
            getDiskUsages(diskPaths)
        ]).then(val => {
            const data = val[0];
            const totalData = {
                hostname,
                cpus,
                diskUsage: val[2],
                cpuUsage: `${val[1]}%`,
                cpuUsageCls: val[1] >= cpuThreshold ? 'red' : '',
                totalmem,
                freemem: memoryString(os.freemem()),
                memUsage: `${Math.round((totalmemNum - os.freemem()) / totalmemNum * 100)}%`,
                node_version: nodev,
                godid,
                memory: 0,
                cpu: 0,
                restart: 0,
            };
            if (data && data.length > 0) {
                const processData = [];
                let totalUptime;
                let instances = 0;
                data.forEach(t => {
                    
                        const memory = t.monit ? Number(t.monit.memory) : 0;
                        totalData.memory += memory;
                        instances++;
                        const cpu = t.monit ? Math.min(parseInt(t.monit.cpu), 100) : 0;
                        totalData.cpu = totalData.cpu + cpu;
                        totalData.name = t.name;
                        totalData.pm_version = `v${t.pm2_env._pm2_version || 0}`;
                        totalData.restart += t.pm2_env.restart_time;

                        let mode = t.pm2_env.exec_mode;
                        if (mode.indexOf('_mode') > 0) {
                            mode = mode.substring(0, mode.indexOf('_mode'));
                        }

                        let processUptime = '-';
                        if (t.pm2_env.status === 'online') {
                            processUptime = timeString(t.pm2_env.pm_uptime);

                            if (!totalUptime) {
                                totalUptime = t.pm2_env.pm_uptime;
                            } else if (totalUptime > t.pm2_env.pm_uptime) {
                                totalUptime = t.pm2_env.pm_uptime;
                            }
                        }
                        //console.log(t)
                        processData.push({
                            name: t.name,
                            mode,
                            pmid: t.pm_id,
                            pid: t.pid,
                            memory: memoryString(memory),
                            cpu: `${cpu}%`,
                            cpuCls: cpu >= cpuThreshold ? 'red' : '',
                            uptime: processUptime,
                            restart: t.pm2_env.restart_time,
                            status: t.pm2_env.status,
                            user: t.pm2_env.username
                        });
                });
                totalData.instances = `x${instances}`;
                totalData.totalUptime = totalUptime ? totalUptimeString(totalUptime) : '0';
                totalData.cpu = `${Math.round(totalData.cpu / instances)}%`;
                totalData.cpuCls = Math.round(totalData.cpu / instances) >= cpuThreshold ? 'red' : '';
                totalData.memory = memoryString(totalData.memory / instances);
                socket.emit('stats', { totalData, processData });
            } else {
                socket.emit('stats', { totalData });
            }
        });
    }, socket.handshake.query.interval || 1000);

    socket.on('restart', (pmId) => {
        console.log('request restart',pmId);
        pm2.restart(pmId, function(err, proc) {
            if (err) {
                console.log("Restart process error: ", err);
                socket.emit('restartError', { error: err, pid: pmId });
                return;
            }
    
            // console.log("restartSuccess: ", proc);
            socket.emit('restartSuccess', { pid: pmId });
        });
    });

    socket.on('stop', (pmId) => {
        console.log('request stop',pmId);
        pm2.stop(pmId, function(err, proc) {
            if (err) {
                console.log("Stop process error: ", err);
                socket.emit('stopError', { error: err, pid: pmId });
                return;
            }
            // console.log("stopSuccess: ", proc);
            socket.emit('stopSuccess', { pid: pmId });
        });
    });

    socket.on('start', (pmId) => {
        console.log('request start',pmId);
        pm2.start(pmId.toString(), function(err, proc) {
            if (err) {
                console.log("Start process error: ", err);
                socket.emit('startError', { error: err, pid: pmId });
                return;
            }
    
            // console.log("startSuccess: ", proc);
            socket.emit('startSuccess', { pid: pmId });
        });
    });

    socket.on('disconnect', () => {
        console.log('disconnect!');
        clearInterval(timer);
    });
});
