/*
 * @Author: Sky.Sun 
 * @Date: 2018-08-22 14:53:48 
 * @Last Modified by: Sky.Sun
 * @Last Modified time: 2018-12-03 14:34:07
 */

function getPathValue(object, path, defaultVal = '') {
    let ret = defaultVal;
    if (object === null || typeof object !== 'object' || typeof path !== 'string') {
        return ret;
    }
    path = path.split(/[\.\[\]]/).filter(n => n != '');
    let index = -1;
    const len = path.length;
    let key;
    let result = true;
    while (++index < len) {
        key = path[index];
        if (!Object.prototype.hasOwnProperty.call(object, key) || object[key] == null) {
            result = false;
            break;
        }
        object = object[key];
    }
    if (result) {
        ret = object;
    }
    return ret;
}

let TableDataComp = {
    template: `
        <table>
            <thead>
                <tr>
                    <td>App name</td>
                    <td>id</td>
                    <td>mode</td>
                    <td>pid</td>
                    <td>status</td>
                    <td>restart</td>
                    <td>uptime</td>
                    <td>cpu</td>
                    <td>mem</td>
                    <td>user</td>
                    <td>action</td>
                </tr>
            </thead>
            <tbody>
                <tr v-if="data.length > 0" v-for="(item,index) in data" :key="'process-row-'+index">
                    <td>{{item.name}}</td>
                    <td>{{item.pmid}}</td>
                    <td>{{item.mode}}</td>
                    <td>{{item.pid}}</td>
                    <td :class="item.status">{{item.status}}</td>
                    <td>{{item.restart}}</td>
                    <td>{{item.uptime}}</td>
                    <td :class="getPathValue(item)">{{item.cpu}}</td>
                    <td>{{item.memory}}</td>
                    <td>{{item.user}}</td>
                    <td>
                        <button class="btn" @click="restart(item)" title="Restart" v-tippy="{ theme : 'mytheme' }"><i class="iconfont icon-undo"></i></button>
                        <button :disabled="item.status === 'stopped'" class="btn" @click="stop(item)" title="Stop" v-tippy="{ theme : 'mytheme' }"><i class="iconfont icofont-stop"></i></button>
                        <button :disabled="item.status === 'online'" class="btn" @click="start(item)" title="Start" v-tippy="{ theme : 'mytheme' }"><i class="iconfont icofont-play-alt-1"></i></button>
                    </td>
                </tr>
            </tbody>
        </table>
        `,
    data(){
        return {
            
        }
    },
    props: ['processdata'],
    mounted() {
        this.$nextTick(() => {
            console.log(this.processdata);
        })
    },
    computed: {
        data(){
            if (this.processdata && Array.isArray(this.processdata)){
                return this.processdata;
            }
            return [];
        }
    },
    methods: {
        getPathValue (item) {
            getPathValue(item, 'cpuCls')
        },
        restart(item){
            item.socket.emit('restart', item.pmid);
        },
        start(item){
            item.socket.emit('start', item.pmid);
        },
        stop(item){
            item.socket.emit('stop', item.pmid);
        }
    }
};

const app = new Vue({
    el: '.container',
    components: {
        'TableData' : TableDataComp
    },
    data: {
        interval: 1000,

        servers: servers,

        currentProject: Object.keys(servers)[0],

        socketQueue: [],

        year: new Date().getFullYear(),

        processData: ''
    },
    mounted() {
        const url = new URL(window.location.href);
        const server = url.searchParams.get('server');
        if (server) {
            this.currentProject = server;
        }

        this.resetSocket();
    },
    computed: {
        /**
         * 获取服务器的ip和端口
         */
        getIps: function () {
            return this.servers[this.currentProject];
        }
    },
    methods: {
        /**
         * 获取项目信息
         */
        getProjects: function () {
            return Object.keys(this.servers);
        },

        getPathValue: function(object, path, defaultVal = '') {
            let ret = defaultVal;
            if (object === null || typeof object !== 'object' || typeof path !== 'string') {
                return ret;
            }
            path = path.split(/[\.\[\]]/).filter(n => n != '');
            let index = -1;
            const len = path.length;
            let key;
            let result = true;
            while (++index < len) {
                key = path[index];
                if (!Object.prototype.hasOwnProperty.call(object, key) || object[key] == null) {
                    result = false;
                    break;
                }
                object = object[key];
            }
            if (result) {
                ret = object;
            }
            return ret;
        },

        /**
         * 重置WebSocket连接
         */
        resetSocket: function () {
            // 切换后，先关闭之前所有的websocket连接
            if (this.socketQueue.length > 0) {
                this.socketQueue.forEach(socket => {
                    socket.close();
                });
                this.socketQueue = [];
            }
            const ips = this.servers[this.currentProject];
            ips.forEach(item => {
                const socket = io(`ws://${item.ip}:${item.port + 3000}?interval=${this.interval}`, {
                    transports: ['websocket']
                });
                this.socketQueue.push(socket);
                const statsEl = document.getElementById(`ip${item.ip}:${item.port}`);
                socket.on('stats', data => {
                    console.log(data)
                    for (let i = 0; i < data.processData.length; i++) {
                        data.processData[i].socket = socket;
                    }
                    this.processData = data.processData;
                    // console.log(this.processData);
                    // stats-panel-title
                    statsEl.querySelector('.hostname').textContent = this.getPathValue(data, 'totalData.hostname', 'host');
                    statsEl.querySelector('.cpus').textContent = this.getPathValue(data, 'totalData.cpus', '0');
                    statsEl.querySelector('.cpuUsage').textContent = this.getPathValue(data, 'totalData.cpuUsage', '0%');
                    const cpuUsageCls = this.getPathValue(data, 'totalData.cpuUsageCls');
                    if (cpuUsageCls) {
                        statsEl.querySelector('.cpuUsage').classList.add(cpuUsageCls);
                    } else {
                        statsEl.querySelector('.cpuUsage').classList.remove('red');
                    }
                    statsEl.querySelector('.memUsage').textContent = this.getPathValue(data, 'totalData.memUsage', '0%');
                    statsEl.querySelector('.freemem').textContent = this.getPathValue(data, 'totalData.freemem', '0B');
                    statsEl.querySelector('.totalmem').textContent = this.getPathValue(data, 'totalData.totalmem', '0B');
                    statsEl.querySelector('.nodev').textContent = this.getPathValue(data, 'totalData.node_version', '0');
                    // statsEl.querySelector('.pm2v').textContent = this.getPathValue(data, 'totalData.pm_version', '0');
                    statsEl.querySelector('.godid').textContent = this.getPathValue(data, 'totalData.godid', '');

                    // stats-panel-row
                    statsEl.querySelector('.projectName').textContent = this.getPathValue(data, 'totalData.name', 'app');
                    statsEl.querySelector('.instances').textContent = this.getPathValue(data, 'totalData.instances', 'x0');
                    statsEl.querySelector('.cpu').textContent = this.getPathValue(data, 'totalData.cpu', '0%');
                    const cpuCls = this.getPathValue(data, 'totalData.cpuCls');
                    if (cpuCls) {
                        statsEl.querySelector('.cpu').classList.add(cpuCls);
                    } else {
                        statsEl.querySelector('.cpu').classList.remove('red');
                    }
                    
                    statsEl.querySelector('.memory').textContent = this.getPathValue(data, 'totalData.memory', '0B');
                    statsEl.querySelector('.restart').textContent = this.getPathValue(data, 'totalData.restart', '0');
                    statsEl.querySelector('.runtime').textContent = this.getPathValue(data, 'totalData.totalUptime', '0s');

                    // stats-panel-list
                    let html = '';
                    if (data.processData && data.processData.length > 0) {
                        data.processData.forEach(item => {
                            const cpuCls = this.getPathValue(item, 'cpuCls');
                            html += `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.pmid}</td>
                            <td>${item.mode}</td>
                            <td>${item.pid}</td>
                            <td class="${item.status}">${item.status}</td>
                            <td>${item.restart}</td>
                            <td>${item.uptime}</td>
                            <td class="${cpuCls}">${item.cpu}</td>
                            <td>${item.memory}</td>
                            <td>${item.user}</td>
                            <td>
                                <button title="Restart" v-tippy="{ theme : 'mytheme' }"><i class="restart-icon iconfont icon-undo"></i></button>
                            </td>
                        </tr>
                        `;
                        });
                    }
                    // statsEl.querySelector('.stats-panel-list tbody').innerHTML = html;
                });
            });
        }
    },
    watch: {
        currentProject: function () {
            const url = new URL(location.href);
            url.searchParams.set('server', this.currentProject);
            window.history.replaceState(null, '', url.href);
            this.$nextTick(() => {
                this.resetSocket();
            })
        }
    }
});
