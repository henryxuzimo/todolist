// 待办事项应用
class TodoApp {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.webhookUrl = '';
        this.pendingPushTask = null;
        this.fileHandle = null; // File System Access API 文件句柄
        this.dbName = 'TodoAppDB';
        this.storeName = 'fileHandle';
        this.init();
    }

    async init() {
        console.log('开始初始化应用...');
        await this.initFileHandle();
        console.log('文件句柄初始化完成，状态:', this.fileHandle ? '已设置' : '未设置');
        await this.loadTasks();
        console.log('任务加载完成，任务数量:', this.tasks.length);
        this.loadWebhook();
        console.log('Webhook 配置加载完成:', this.webhookUrl ? '已配置' : '未配置');
        this.setupEventListeners();
        this.render();
        console.log('应用初始化完成');
    }

    // 初始化文件句柄（从 IndexedDB 恢复或创建新文件）
    async initFileHandle() {
        // 尝试从 IndexedDB 恢复文件句柄
        const handle = await this.getFileHandleFromDB();
        if (handle) {
            // 验证文件句柄是否仍然有效
            try {
                await handle.getFile();
                this.fileHandle = handle;
                console.log('已恢复文件句柄');
                return;
            } catch (e) {
                console.log('文件句柄已失效，需要重新选择');
                // 文件句柄失效，清除并重新创建
                await this.clearFileHandleFromDB();
            }
        }

        // 如果没有有效的文件句柄，尝试自动创建/打开文件
        await this.autoInitFile();
    }

    // 自动初始化文件（首次使用或文件句柄失效时）
    async autoInitFile() {
        if (!('showOpenFilePicker' in window) && !('showSaveFilePicker' in window)) {
            console.log('浏览器不支持文件系统访问 API，将使用 localStorage');
            return;
        }

        try {
            // 先尝试打开现有文件（在用户的工作目录中查找）
            let fileHandle;
            try {
                const handles = await window.showOpenFilePicker({
                    types: [{
                        description: 'JSON 文件',
                        accept: { 'application/json': ['.json'] }
                    }],
                    suggestedName: '待办事项数据.json',
                    multiple: false,
                    startIn: 'documents' // 从文档目录开始
                });
                fileHandle = handles[0];
            } catch (e) {
                // 如果打开失败（文件不存在或用户取消），尝试创建新文件
                if (e.name === 'AbortError') {
                    // 用户取消，不创建新文件，使用 localStorage
                    console.log('用户取消了文件选择，将使用 localStorage');
                    return;
                }
                // 创建新文件
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: '待办事项数据.json',
                    types: [{
                        description: 'JSON 文件',
                        accept: { 'application/json': ['.json'] }
                    }],
                    startIn: 'documents'
                });
            }

            if (fileHandle) {
                this.fileHandle = fileHandle;
                await this.saveFileHandleToDB(fileHandle);
                console.log('文件已自动初始化，文件句柄已保存');
                // 立即保存当前数据到文件（如果有数据的话）
                if (this.tasks.length > 0 || this.webhookUrl) {
                    await this.saveToFile();
                } else {
                    // 即使没有数据，也保存一个空文件，确保文件存在
                    await this.saveToFile();
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('自动初始化文件失败:', e);
                // 如果自动初始化失败，静默失败，使用 localStorage 作为后备
            }
        }
    }

    // 将文件句柄保存到 IndexedDB
    async saveFileHandleToDB(handle) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.close();
                    // 需要升级数据库
                    const upgradeRequest = indexedDB.open(this.dbName, 2);
                    upgradeRequest.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains(this.storeName)) {
                            db.createObjectStore(this.storeName);
                        }
                    };
                    upgradeRequest.onsuccess = () => {
                        const db = upgradeRequest.result;
                        const transaction = db.transaction([this.storeName], 'readwrite');
                        const store = transaction.objectStore(this.storeName);
                        store.put(handle, 'fileHandle');
                        resolve();
                    };
                    upgradeRequest.onerror = () => reject(upgradeRequest.error);
                } else {
                    const transaction = db.transaction([this.storeName], 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    store.put(handle, 'fileHandle');
                    resolve();
                }
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    // 从 IndexedDB 获取文件句柄
    async getFileHandleFromDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => resolve(null);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    resolve(null);
                    return;
                }
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const getRequest = store.get('fileHandle');
                getRequest.onsuccess = () => resolve(getRequest.result || null);
                getRequest.onerror = () => resolve(null);
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    // 清除 IndexedDB 中的文件句柄
    async clearFileHandleFromDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => resolve();
            request.onsuccess = () => {
                const db = request.result;
                if (db.objectStoreNames.contains(this.storeName)) {
                    const transaction = db.transaction([this.storeName], 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    store.delete('fileHandle');
                }
                resolve();
            };
        });
    }

    // 从本地文件或 localStorage 加载任务
    async loadTasks() {
        console.log('开始加载任务，文件句柄状态:', this.fileHandle ? '存在' : '不存在');
        
        // 优先从文件加载
        const fileData = await this.loadFromFile();
        if (fileData !== null) {
            // fileData 不为 null 说明文件句柄存在
            // 如果文件中有任务数据，使用文件数据；如果文件是空的，检查 localStorage
            if (fileData.tasks && fileData.tasks.length > 0) {
                // 文件中有任务，使用文件数据
                this.tasks = fileData.tasks;
                this.webhookUrl = fileData.webhookUrl || '';
                console.log(`从文件加载了 ${this.tasks.length} 个任务`);
                
                // 同步到 localStorage 作为备份
                localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
                if (this.webhookUrl) {
                    localStorage.setItem('wechatWebhook', this.webhookUrl);
                }
            } else {
                // 文件存在但是空的，尝试从 localStorage 加载（可能文件刚创建，数据还在 localStorage）
                console.log('文件存在但为空，尝试从 localStorage 加载');
                
                // 先尝试从文件数据中获取 webhookUrl
                this.webhookUrl = fileData.webhookUrl || '';
                
                // 如果文件中的 webhookUrl 为空，尝试从 localStorage 加载
                if (!this.webhookUrl) {
                    const savedWebhook = localStorage.getItem('wechatWebhook');
                    if (savedWebhook) {
                        this.webhookUrl = savedWebhook;
                        console.log('从 localStorage 恢复了 Webhook 配置');
                    }
                }
                
                const saved = localStorage.getItem('todoTasks');
                if (saved) {
                    try {
                        const savedTasks = JSON.parse(saved);
                        if (savedTasks && savedTasks.length > 0) {
                            // localStorage 有数据，使用 localStorage 的数据并同步到文件
                            this.tasks = savedTasks;
                            console.log(`从 localStorage 恢复了 ${this.tasks.length} 个任务，将同步到文件`);
                            // 立即同步到文件
                            await this.saveToFile();
                        } else {
                            // localStorage 也是空的
                            this.tasks = [];
                        }
                    } catch (e) {
                        console.error('从 localStorage 恢复失败:', e);
                        this.tasks = [];
                    }
                } else {
                    // localStorage 也没有数据
                    this.tasks = [];
                }
            }
        } else {
            // 如果文件加载失败（fileHandle 不存在或读取失败），从 localStorage 加载（兼容旧数据）
            console.log('从 localStorage 加载数据');
            const saved = localStorage.getItem('todoTasks');
            if (saved) {
                try {
                    this.tasks = JSON.parse(saved);
                    console.log(`从 localStorage 加载了 ${this.tasks.length} 个任务`);
                    // 如果有文件句柄，迁移到文件存储
                    if (this.fileHandle) {
                        await this.saveToFile();
                    }
                } catch (e) {
                    console.error('从 localStorage 加载任务失败:', e);
                    this.tasks = [];
                }
            } else {
                console.log('localStorage 中也没有数据，初始化为空数组');
                this.tasks = [];
            }
            
            // 从 localStorage 加载 webhook
            const savedWebhook = localStorage.getItem('wechatWebhook');
            if (savedWebhook) {
                this.webhookUrl = savedWebhook;
            }
        }
        
        console.log('最终加载的任务数量:', this.tasks.length);
        console.log('最终加载的 webhook:', this.webhookUrl ? '已配置' : '未配置');
    }

    // 保存任务到本地文件和 localStorage（作为备份）
    async saveTasks() {
        console.log('=== saveTasks 被调用 ===');
        console.log('当前 tasks 数组:', this.tasks);
        console.log('当前 tasks 数量:', this.tasks ? this.tasks.length : 0);
        console.log('当前 webhookUrl:', this.webhookUrl);
        
        // 在保存前，从 localStorage 恢复 tasks（防止在保存过程中被清空）
        const backupTasks = localStorage.getItem('todoTasks');
        if (backupTasks && (!this.tasks || this.tasks.length === 0)) {
            try {
                const parsed = JSON.parse(backupTasks);
                if (parsed && parsed.length > 0) {
                    console.warn('警告：检测到 tasks 为空，从 localStorage 恢复');
                    this.tasks = parsed;
                }
            } catch (e) {
                console.error('从备份恢复失败:', e);
            }
        }
        
        try {
            // 确保 tasks 是数组
            if (!Array.isArray(this.tasks)) {
                console.error('错误：tasks 不是数组！', typeof this.tasks, this.tasks);
                // 尝试从 localStorage 恢复
                const saved = localStorage.getItem('todoTasks');
                if (saved) {
                    try {
                        this.tasks = JSON.parse(saved);
                        console.log('从 localStorage 恢复了 tasks');
                    } catch (e) {
                        this.tasks = [];
                    }
                } else {
                    this.tasks = [];
                }
            }
            
            // 保存到 localStorage 作为备份（先保存，确保数据不丢失）
            const tasksJson = JSON.stringify(this.tasks);
            localStorage.setItem('todoTasks', tasksJson);
            console.log('已保存到 localStorage，数据长度:', tasksJson.length);
            console.log('保存的 tasks 内容:', tasksJson.substring(0, 200));
            
            // 验证 localStorage 保存
            const saved = localStorage.getItem('todoTasks');
            const savedTasks = JSON.parse(saved);
            console.log('验证 localStorage：保存的任务数量:', savedTasks.length);
            if (savedTasks.length !== this.tasks.length) {
                console.error('严重错误：保存的任务数量不匹配！');
            }
            
            // 保存到文件（如果已选择文件位置）
            await this.saveToFile();
            
            // 再次验证保存后 tasks 是否还在
            console.log('保存完成后 tasks 数量:', this.tasks.length);
        } catch (e) {
            console.error('保存任务失败:', e);
            console.error('错误堆栈:', e.stack);
            // 如果文件保存失败，至少保存到 localStorage
            try {
                localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
                console.log('已保存到 localStorage（错误恢复）');
            } catch (e2) {
                console.error('保存到 localStorage 也失败:', e2);
            }
        }
        console.log('=== saveTasks 完成 ===');
    }

    // 从本地文件加载数据
    async loadFromFile() {
        if (!this.fileHandle) {
            console.log('没有文件句柄，无法从文件加载');
            return null;
        }

        try {
            const file = await this.fileHandle.getFile();
            const text = await file.text();
            console.log('从文件读取的内容:', text.substring(0, 200)); // 调试
            
            if (text.trim()) {
                const data = JSON.parse(text);
                console.log('从文件解析的数据:', data); // 调试
                // 确保返回的数据结构正确
                return {
                    tasks: data.tasks || [],
                    webhookUrl: data.webhookUrl || ''
                };
            } else {
                // 文件存在但是空的，返回空数据结构
                console.log('文件存在但为空，返回空数据');
                return {
                    tasks: [],
                    webhookUrl: ''
                };
            }
        } catch (e) {
            console.error('从文件加载失败:', e);
            console.error('错误详情:', e.name, e.message);
            // 如果文件读取失败，可能是文件不存在或格式错误
            return null;
        }
    }

    // 保存到本地文件
    async saveToFile() {
        // 如果没有文件句柄，只保存到 localStorage
        if (!this.fileHandle) {
            console.log('没有文件句柄，只保存到 localStorage');
            try {
                localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
                if (this.webhookUrl) {
                    localStorage.setItem('wechatWebhook', this.webhookUrl);
                }
            } catch (e) {
                console.error('保存到 localStorage 失败:', e);
            }
            return;
        }

        try {
            console.log('开始保存到文件');
            console.log('当前任务数量:', this.tasks.length);
            console.log('当前任务数据:', JSON.stringify(this.tasks, null, 2));
            console.log('Webhook URL:', this.webhookUrl);
            
            const writable = await this.fileHandle.createWritable();
            const data = {
                tasks: this.tasks || [],  // 确保 tasks 至少是空数组
                webhookUrl: this.webhookUrl || '',
                version: '1.0',
                lastSaved: new Date().toISOString()
            };
            
            console.log('准备保存的完整数据:', JSON.stringify(data, null, 2));
            const jsonData = JSON.stringify(data, null, 2);
            console.log('准备写入的数据长度:', jsonData.length);
            console.log('准备写入的数据前500字符:', jsonData.substring(0, 500));
            
            await writable.write(jsonData);
            await writable.close();
            console.log('数据已成功保存到文件');
            
            // 验证保存是否成功：重新读取文件
            try {
                const file = await this.fileHandle.getFile();
                const savedText = await file.text();
                const savedData = JSON.parse(savedText);
                console.log('验证：保存后的文件内容，任务数量:', savedData.tasks ? savedData.tasks.length : 0);
                if (savedData.tasks && savedData.tasks.length !== this.tasks.length) {
                    console.error('警告：保存的任务数量不匹配！期望:', this.tasks.length, '实际:', savedData.tasks.length);
                }
            } catch (verifyError) {
                console.error('验证保存结果时出错:', verifyError);
            }
            
            // 同时保存到 localStorage 作为备份
            localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
            if (this.webhookUrl) {
                localStorage.setItem('wechatWebhook', this.webhookUrl);
            }
        } catch (e) {
            console.error('保存到文件失败:', e);
            console.error('错误类型:', e.name, '错误信息:', e.message);
            // 如果文件保存失败，清除无效的文件句柄
            if (e.name === 'NotFoundError' || e.name === 'InvalidStateError' || e.name === 'SecurityError') {
                console.log('文件句柄无效，清除并重新初始化');
                this.fileHandle = null;
                await this.clearFileHandleFromDB();
                // 下次页面加载时会自动重新初始化
            }
            // 无论如何都要保存到 localStorage 作为备份
            try {
                localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
                if (this.webhookUrl) {
                    localStorage.setItem('wechatWebhook', this.webhookUrl);
                }
                console.log('已保存到 localStorage 作为备份');
            } catch (e2) {
                console.error('保存到 localStorage 也失败:', e2);
            }
        }
    }

    // 从 localStorage 加载 Webhook 配置
    loadWebhook() {
        console.log('加载 Webhook 配置...');
        console.log('当前 webhookUrl:', this.webhookUrl);
        
        // 如果已经在 loadTasks 中加载了，就不需要再次加载
        if (this.webhookUrl) {
            console.log('Webhook 已在 loadTasks 中加载:', this.webhookUrl);
            return;
        }
        
        // 从 localStorage 加载（兼容旧数据）
        const saved = localStorage.getItem('wechatWebhook');
        if (saved) {
            this.webhookUrl = saved;
            console.log('从 localStorage 加载 Webhook:', this.webhookUrl);
        } else {
            console.log('localStorage 中也没有 Webhook 配置');
        }
    }

    // 保存 Webhook 配置
    async saveWebhook() {
        const input = document.getElementById('webhookInput');
        const url = input.value.trim();
        
        console.log('保存 Webhook 配置，当前任务数量:', this.tasks.length);
        
        if (url && this.isValidUrl(url)) {
            this.webhookUrl = url;
            // 保存到 localStorage 作为备份
            localStorage.setItem('wechatWebhook', url);
            
            // 确保 tasks 数据不会丢失
            console.log('保存前 tasks 数量:', this.tasks.length);
            console.log('保存前 tasks 数据:', JSON.stringify(this.tasks));
            
            // 保存到文件（会自动保存所有数据包括 webhook 和 tasks）
            await this.saveTasks();
            
            // 验证保存后 tasks 是否还在
            console.log('保存后 tasks 数量:', this.tasks.length);
            
            this.closeConfigModal();
            this.showMessage('配置已保存', 'success');
        } else {
            this.showMessage('请输入有效的 Webhook 地址', 'error');
        }
    }

    // 验证 URL 格式
    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    // 设置事件监听器
    setupEventListeners() {
        const addBtn = document.getElementById('addBtn');
        const taskInput = document.getElementById('taskInput');
        const configBtn = document.getElementById('configBtn');
        const pushAllBtn = document.getElementById('pushAllBtn');
        const filterBtns = document.querySelectorAll('.filter-btn');

        // 添加任务
        addBtn.addEventListener('click', () => this.addTask());
        
        // 支持在所有输入框中按Enter键添加任务
        const assigneeInput = document.getElementById('assigneeInput');
        const deadlineInput = document.getElementById('deadlineInput');
        
        [taskInput, assigneeInput, deadlineInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTask();
                }
            });
        });

        // 配置按钮
        configBtn.addEventListener('click', () => this.openConfigModal());

        // 文件管理按钮
        const fileBtn = document.getElementById('fileBtn');
        fileBtn.addEventListener('click', () => this.openFileModal());

        // 推送所有任务按钮
        pushAllBtn.addEventListener('click', () => this.pushAllTasks());

        // 筛选按钮
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.render();
            });
        });
    }

    // 添加任务
    async addTask() {
        const input = document.getElementById('taskInput');
        const assigneeInput = document.getElementById('assigneeInput');
        const deadlineInput = document.getElementById('deadlineInput');
        const text = input.value.trim();
        const assignee = assigneeInput.value.trim() || '子墨';
        const deadline = deadlineInput.value || null;

        if (text === '') {
            input.focus();
            return;
        }

        const task = {
            id: Date.now().toString(),
            text: text,
            assignee: assignee,
            deadline: deadline,
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.tasks.unshift(task);
        console.log('添加任务后，任务总数:', this.tasks.length);
        
        // 等待保存完成
        await this.saveTasks();
        
        input.value = '';
        assigneeInput.value = '子墨'; // 重置为默认值
        deadlineInput.value = ''; // 重置截止日期
        input.focus();
        this.render();
    }

    // 切换任务完成状态
    async toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            await this.saveTasks();
            this.render();
        }
    }

    // 删除任务
    async deleteTask(id) {
        const taskElement = document.querySelector(`[data-id="${id}"]`);
        if (taskElement) {
            taskElement.classList.add('removing');
            setTimeout(async () => {
                this.tasks = this.tasks.filter(t => t.id !== id);
                await this.saveTasks();
                this.render();
            }, 300);
        }
    }

    // 获取筛选后的任务列表
    getFilteredTasks() {
        switch (this.currentFilter) {
            case 'active':
                return this.tasks.filter(t => !t.completed);
            case 'completed':
                return this.tasks.filter(t => t.completed);
            default:
                return this.tasks;
        }
    }

    // 渲染任务列表
    render() {
        const taskList = document.getElementById('taskList');
        const emptyState = document.getElementById('emptyState');
        const filteredTasks = this.getFilteredTasks();

        // 清空列表
        taskList.innerHTML = '';

        // 显示/隐藏空状态
        if (filteredTasks.length === 0) {
            emptyState.classList.add('show');
        } else {
            emptyState.classList.remove('show');
        }

        // 渲染任务
        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            li.setAttribute('data-id', task.id);

            const deadlineText = task.deadline 
                ? new Date(task.deadline + 'T00:00:00').toLocaleDateString('zh-CN')
                : '无截止日期';
            const isOverdue = task.deadline && !task.completed && new Date(task.deadline + 'T23:59:59') < new Date();
            
            li.innerHTML = `
                <input 
                    type="checkbox" 
                    class="task-checkbox" 
                    ${task.completed ? 'checked' : ''}
                    onchange="app.toggleTask('${task.id}')"
                >
                <div class="task-content">
                    <span class="task-text">${this.escapeHtml(task.text)}</span>
                    <div class="task-meta">
                        <span class="task-assignee">负责人: ${this.escapeHtml(task.assignee || '子墨')}</span>
                        <span class="task-deadline ${isOverdue ? 'overdue' : ''}">截止: ${deadlineText}</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button 
                        class="btn-icon btn-push" 
                        onclick="app.pushToWeChat('${task.id}')"
                        title="推送到企业微信"
                    >
                        📤
                    </button>
                    <button 
                        class="btn-icon btn-delete" 
                        onclick="app.deleteTask('${task.id}')"
                        title="删除任务"
                    >
                        🗑️
                    </button>
                </div>
            `;

            taskList.appendChild(li);
        });

        // 更新统计信息
        this.updateStats();
    }

    // 更新统计信息
    updateStats() {
        const taskCount = document.getElementById('taskCount');
        const completedCount = document.getElementById('completedCount');
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;

        taskCount.textContent = `${total} 个任务`;
        completedCount.textContent = `${completed} 个已完成`;
    }

    // HTML 转义，防止 XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 打开配置对话框
    openConfigModal() {
        const modal = document.getElementById('configModal');
        const input = document.getElementById('webhookInput');
        input.value = this.webhookUrl;
        modal.classList.add('show');
    }

    // 关闭配置对话框
    closeConfigModal() {
        const modal = document.getElementById('configModal');
        modal.classList.remove('show');
    }

    // 推送到企业微信
    pushToWeChat(taskId) {
        console.log('点击推送按钮，任务ID:', taskId);
        console.log('当前任务列表:', this.tasks);
        console.log('当前 Webhook URL:', this.webhookUrl);
        
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            console.error('未找到任务，ID:', taskId);
            this.showMessage('未找到任务', 'error');
            return;
        }

        console.log('找到任务:', task);

        if (!this.webhookUrl) {
            console.warn('Webhook 地址未配置');
            this.showMessage('请先配置企业微信 Webhook 地址', 'error');
            this.openConfigModal();
            return;
        }

        this.pendingPushTask = task;
        this.openConfirmModal(task);
    }

    // 打开确认对话框
    openConfirmModal(task) {
        console.log('打开确认对话框，任务:', task);
        const modal = document.getElementById('confirmModal');
        const message = document.getElementById('confirmMessage');
        
        if (!modal || !message) {
            console.error('确认对话框元素不存在');
            return;
        }
        
        const deadlineText = task.deadline 
            ? new Date(task.deadline + 'T00:00:00').toLocaleDateString('zh-CN')
            : '无截止日期';
        const assignee = task.assignee || '子墨';
        const taskText = task.text || '未知任务';
        
        message.textContent = `确定要将任务"${taskText}"（负责人：${assignee}，截止日期：${deadlineText}）推送到企业微信吗？`;
        modal.classList.add('show');
        console.log('确认对话框已显示');
    }

    // 关闭确认对话框
    closeConfirmModal() {
        const modal = document.getElementById('confirmModal');
        modal.classList.remove('show');
        this.pendingPushTask = null;
    }

    // 确认推送
    confirmPush() {
        console.log('确认推送，pendingPushTask:', this.pendingPushTask);
        
        if (!this.pendingPushTask) {
            console.error('pendingPushTask 为空');
            this.closeConfirmModal();
            return;
        }

        const task = this.pendingPushTask;
        console.log('开始推送任务:', task);
        this.sendToWeChat(task);
        this.closeConfirmModal();
    }

    // 发送消息到企业微信
    async sendToWeChat(task) {
        console.log('=== 开始推送任务到企业微信 ===');
        console.log('任务信息:', task);
        console.log('Webhook URL:', this.webhookUrl);
        
        if (!this.webhookUrl) {
            console.error('Webhook 地址未配置');
            this.showMessage('Webhook 地址未配置', 'error');
            return;
        }

        // 确保任务数据完整
        if (!task) {
            console.error('任务数据为空');
            this.showMessage('任务数据错误', 'error');
            return;
        }

        const status = task.completed ? '已完成' : '待完成';
        const deadlineText = task.deadline 
            ? new Date(task.deadline + 'T00:00:00').toLocaleDateString('zh-CN')
            : '无截止日期';
        
        const assignee = task.assignee || '子墨';
        const taskText = task.text || '未知任务';
        const createdAt = task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN');
        
        const message = {
            msgtype: 'text',
            text: {
                content: `📝 待办事项通知\n\n任务：${taskText}\n负责人：${assignee}\n截止日期：${deadlineText}\n状态：${status}\n创建时间：${createdAt}`
            }
        };

        console.log('准备发送的消息:', JSON.stringify(message, null, 2));
        console.log('Webhook URL:', this.webhookUrl);

        try {
            // 通过代理服务器发送请求，解决 CORS 问题
            const proxyUrl = 'http://localhost:3001/proxy';
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    webhookUrl: this.webhookUrl,
                    message: message
                })
            });

            console.log('响应状态:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('HTTP 错误响应:', errorText);
                this.showMessage(`推送失败：HTTP ${response.status} ${response.statusText}`, 'error');
                return;
            }

            const result = await response.json();
            console.log('企业微信响应:', result);
            
            if (result.errcode === 0) {
                console.log('推送成功！');
                this.showMessage('推送成功！', 'success');
            } else {
                console.error('推送失败，错误码:', result.errcode, '错误信息:', result.errmsg);
                this.showMessage(`推送失败：${result.errmsg || '未知错误'} (错误码: ${result.errcode})`, 'error');
            }
        } catch (error) {
            console.error('推送失败，异常:', error);
            console.error('错误类型:', error.name);
            console.error('错误信息:', error.message);
            
            // 检查是否是代理服务器未启动
            if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                this.showMessage('推送失败：代理服务器未启动。请确保已启动代理服务器（运行 proxy-server.js）', 'error');
            } else {
                this.showMessage(`推送失败：${error.message || '网络错误'}`, 'error');
            }
        }
        console.log('=== 推送完成 ===');
    }

    // 推送所有待办任务
    pushAllTasks() {
        const activeTasks = this.tasks.filter(t => !t.completed);
        
        if (activeTasks.length === 0) {
            this.showMessage('没有待办任务可推送', 'info');
            return;
        }

        if (!this.webhookUrl) {
            this.showMessage('请先配置企业微信 Webhook 地址', 'error');
            this.openConfigModal();
            return;
        }

        // 确认推送
        const confirmMessage = `确定要推送 ${activeTasks.length} 个待办任务到企业微信吗？`;
        if (confirm(confirmMessage)) {
            this.sendAllTasksToWeChat(activeTasks);
        }
    }

    // 批量发送任务到企业微信
    async sendAllTasksToWeChat(tasks) {
        console.log('=== 开始批量推送任务 ===');
        console.log('任务数量:', tasks.length);
        console.log('Webhook URL:', this.webhookUrl);
        
        if (!this.webhookUrl) {
            console.error('Webhook 地址未配置');
            this.showMessage('Webhook 地址未配置', 'error');
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            console.log(`推送第 ${i + 1}/${tasks.length} 个任务:`, task.text);
            
            const status = task.completed ? '已完成' : '待完成';
            const deadlineText = task.deadline 
                ? new Date(task.deadline + 'T00:00:00').toLocaleDateString('zh-CN')
                : '无截止日期';
            const assignee = task.assignee || '子墨';
            const taskText = task.text || '未知任务';
            const createdAt = task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN');
            
            const message = {
                msgtype: 'text',
                text: {
                    content: `📝 待办事项通知\n\n任务：${taskText}\n负责人：${assignee}\n截止日期：${deadlineText}\n状态：${status}\n创建时间：${createdAt}`
                }
            };

            try {
                // 通过代理服务器发送请求，解决 CORS 问题
                const proxyUrl = 'http://localhost:3001/proxy';
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        webhookUrl: this.webhookUrl,
                        message: message
                    })
                });

                if (!response.ok) {
                    console.error(`任务 ${i + 1} 推送失败: HTTP ${response.status}`);
                    failCount++;
                    continue;
                }

                const result = await response.json();
                console.log(`任务 ${i + 1} 响应:`, result);
                
                if (result.errcode === 0) {
                    successCount++;
                    console.log(`任务 ${i + 1} 推送成功`);
                } else {
                    failCount++;
                    console.error(`任务 ${i + 1} 推送失败:`, result.errmsg);
                }

                // 避免请求过快，添加小延迟
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error(`任务 ${i + 1} 推送异常:`, error);
                failCount++;
            }
        }

        console.log('批量推送完成，成功:', successCount, '失败:', failCount);
        
        if (failCount === 0) {
            this.showMessage(`成功推送 ${successCount} 个任务！`, 'success');
        } else {
            this.showMessage(`推送完成：成功 ${successCount} 个，失败 ${failCount} 个`, failCount === tasks.length ? 'error' : 'info');
        }
    }

    // 打开文件管理对话框
    openFileModal() {
        const modal = document.getElementById('fileModal');
        modal.classList.add('show');
        this.updateFileStatus();
    }

    // 关闭文件管理对话框
    closeFileModal() {
        const modal = document.getElementById('fileModal');
        modal.classList.remove('show');
    }

    // 更新文件状态显示
    async updateFileStatus() {
        const status = document.getElementById('fileStatus');
        if (this.fileHandle) {
            try {
                const file = await this.fileHandle.getFile();
                status.textContent = `✅ 已连接到文件：${file.name}，数据将自动保存`;
                status.className = 'file-status show success';
            } catch (e) {
                status.textContent = '⚠️ 文件连接已失效，请重新选择文件';
                status.className = 'file-status show error';
            }
        } else {
            status.textContent = '⚠️ 未选择保存位置，请选择文件保存位置以确保数据持久化';
            status.className = 'file-status show info';
        }
    }

    // 选择文件保存位置（File System Access API）
    async selectFile() {
        if (!('showSaveFilePicker' in window) && !('showOpenFilePicker' in window)) {
            this.showMessage('您的浏览器不支持文件系统访问，请使用下载/上传功能', 'error');
            return;
        }

        try {
            let fileHandle;
            // 先尝试打开现有文件
            try {
                const handles = await window.showOpenFilePicker({
                    types: [{
                        description: 'JSON 文件',
                        accept: { 'application/json': ['.json'] }
                    }],
                    suggestedName: '待办事项数据.json',
                    multiple: false
                });
                fileHandle = handles[0];
            } catch (e) {
                // 如果打开失败，创建新文件
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: '待办事项数据.json',
                    types: [{
                        description: 'JSON 文件',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
            }

            this.fileHandle = fileHandle;
            // 保存文件句柄到 IndexedDB
            await this.saveFileHandleToDB(fileHandle);
            // 立即保存一次
            await this.saveToFile();
            this.updateFileStatus();
            this.showMessage('文件位置已选择，数据将自动保存', 'success');
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('选择文件失败:', e);
                this.showMessage('选择文件失败', 'error');
            }
        }
    }

    // 下载数据文件
    downloadData() {
        const data = {
            tasks: this.tasks,
            webhookUrl: this.webhookUrl,
            version: '1.0',
            lastSaved: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `待办事项数据_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage('数据已下载', 'success');
    }

    // 从文件导入数据
    uploadData() {
        const fileInput = document.getElementById('fileInput');
        
        // 移除旧的事件监听器，避免重复绑定
        const newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);
        
        newFileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                console.log('导入文件内容:', text.substring(0, 200)); // 调试：显示前200个字符
                const data = JSON.parse(text);
                console.log('解析后的数据:', data); // 调试：显示解析后的数据

                // 验证数据格式
                if (!data || typeof data !== 'object') {
                    throw new Error('无效的数据格式');
                }

                // 更新任务数据
                let importedCount = 0;
                if (data.tasks && Array.isArray(data.tasks)) {
                    this.tasks = data.tasks;
                    importedCount = data.tasks.length;
                    console.log(`已导入 ${importedCount} 个任务`, this.tasks); // 调试
                } else if (Array.isArray(data)) {
                    // 兼容旧格式：直接是任务数组
                    this.tasks = data;
                    importedCount = data.length;
                    console.log(`已导入 ${importedCount} 个任务（旧格式）`, this.tasks); // 调试
                } else {
                    this.tasks = [];
                    console.warn('数据中没有找到任务列表', data);
                }

                // 更新 Webhook 配置
                if (data.webhookUrl) {
                    this.webhookUrl = data.webhookUrl;
                    localStorage.setItem('wechatWebhook', data.webhookUrl);
                }

                // 确保数据已更新
                console.log('导入后的 tasks:', this.tasks); // 调试
                console.log('导入后的 tasks 长度:', this.tasks.length); // 调试

                // 先保存到 localStorage（确保即使文件保存失败也能有数据）
                try {
                    localStorage.setItem('todoTasks', JSON.stringify(this.tasks));
                    if (this.webhookUrl) {
                        localStorage.setItem('wechatWebhook', this.webhookUrl);
                    }
                    console.log('数据已保存到 localStorage'); // 调试
                } catch (e) {
                    console.error('保存到 localStorage 失败:', e);
                }

                // 然后尝试保存到文件（如果有文件句柄）
                await this.saveTasks();
                
                // 重置筛选器为"全部"，确保所有任务都显示
                this.currentFilter = 'all';
                const filterBtns = document.querySelectorAll('.filter-btn');
                filterBtns.forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.dataset.filter === 'all') {
                        btn.classList.add('active');
                    }
                });
                
                // 验证数据是否正确加载
                if (this.tasks.length === 0) {
                    console.warn('警告：导入后任务列表为空');
                } else {
                    console.log(`准备渲染 ${this.tasks.length} 个任务`);
                }
                
                // 强制重新渲染界面
                this.render();
                
                // 等待 DOM 更新后再次确认渲染后的状态
                setTimeout(() => {
                    const renderedTasks = document.querySelectorAll('.task-item');
                    console.log('渲染后的任务列表元素数量:', renderedTasks.length);
                    if (this.tasks.length > 0 && renderedTasks.length === 0) {
                        console.error('错误：任务数据存在但未渲染到界面');
                        // 强制再次渲染
                        this.render();
                    }
                }, 100);
                
                this.closeFileModal();
                
                if (importedCount > 0) {
                    this.showMessage(`数据导入成功！已导入 ${importedCount} 个任务`, 'success');
                } else {
                    this.showMessage('数据导入完成，但未找到任务数据', 'info');
                }
            } catch (e) {
                console.error('导入数据失败:', e);
                console.error('错误堆栈:', e.stack);
                this.showMessage(`导入数据失败：${e.message || '文件格式错误'}`, 'error');
            }

            // 重置文件输入
            newFileInput.value = '';
        };

        newFileInput.click();
    }

    // 显示消息提示
    showMessage(text, type = 'info') {
        // 创建消息元素
        const message = document.createElement('div');
        message.className = `message message-${type}`;
        message.textContent = text;
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 2000;
            animation: slideInRight 0.3s ease-out;
        `;

        document.body.appendChild(message);

        // 3秒后自动移除
        setTimeout(() => {
            message.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (message.parentNode) {
                    message.parentNode.removeChild(message);
                }
            }, 300);
        }, 3000);
    }
}

// 添加消息动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 点击模态框外部关闭
window.addEventListener('click', (e) => {
    const configModal = document.getElementById('configModal');
    const confirmModal = document.getElementById('confirmModal');
    
    if (e.target === configModal) {
        app.closeConfigModal();
    }
    if (e.target === confirmModal) {
        app.closeConfirmModal();
    }
});

// 初始化应用
const app = new TodoApp();
