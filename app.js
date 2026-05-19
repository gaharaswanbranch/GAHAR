// Initial Mock Data
let state = {
    currentUser: null, // object containing user info
    users: [
        {
            id: 1,
            username: 'ahmed',
            password: '8080',
            role: 'admin',
            name: 'مدير الموارد البشرية (احمد)',
            balances: { regular: 0, casual: 0 }
        },
        {
            id: 4,
            username: 'hoda',
            password: '5050',
            role: 'hr_admin',
            name: 'مديرة الفرع ',
            balances: { regular: 0, casual: 0 }
        },
        {
            id: 2,
            username: 'emp1',
            password: '123',
            role: 'employee',
            name: 'أحمد محمد',
            balances: { regular: 21, casual: 7 }
        },
        {
            id: 3,
            username: 'emp2',
            password: '123',
            role: 'employee',
            name: 'سارة خالد',
            balances: { regular: 21, casual: 7 }
        }
    ],
    requests: [
        {
            id: 1,
            userId: 2,
            employeeName: 'أحمد محمد',
            type: 'regular',
            typeName: 'إجازة اعتيادية',
            start: '2026-06-01',
            end: '2026-06-05',
            days: 5,
            reason: 'السفر لقضاء العطلة',
            status: 'approved',
            substituteId: 3,
            substituteName: 'سارة خالد',
            substituteStatus: 'approved',
            branchStatus: 'approved',
            hrStatus: 'approved',
            date: '2026-05-10',
            category: 'leave'
        }
    ]
};

// Main App Logic
const app = {
    async init() {
        // Try to load database.json from repository first to extract gistId
        let repoState = null;
        try {
            const response = await fetch('database.json');
            if (response.ok) {
                repoState = await response.json();
                if (repoState && repoState.gistId) {
                    localStorage.setItem('leaveAppGistId', repoState.gistId);
                }
            }
        } catch (err) {
            console.log('No repository database.json found or failed to load:', err);
        }

        // Load Gist config if exists
        const gistToken = localStorage.getItem('leaveAppGistToken') || '';
        const gistId = localStorage.getItem('leaveAppGistId') || '';
        
        let loaded = false;
        
        if (gistId) {
            try {
                // Fetch from Gist (token is optional now)
                const gistState = await this.fetchFromGist(gistToken, gistId);
                if (gistState && gistState.users && gistState.requests) {
                    state = gistState;
                    loaded = true;
                    console.log('Database loaded from GitHub Gist successfully');
                }
            } catch (err) {
                console.error('Failed to load from Gist, falling back to local/repo:', err);
            }
        }
        
        if (!loaded) {
            // Load state from localStorage if exists
            const savedState = localStorage.getItem('leaveAppState_v9');
            if (savedState) {
                state = JSON.parse(savedState);
                loaded = true;
            }
        }
        
        if (!loaded && repoState) {
            state = repoState;
            loaded = true;
            this.saveState(); // Cache it locally
            console.log('Database loaded from repo database.json successfully');
        }

        // Ensure user is logged out initially
        this.showView('login-view');
    },

    saveState() {
        localStorage.setItem('leaveAppState_v9', JSON.stringify(state));
        
        // If Gist is configured, upload in background asynchronously for real-time synchronization
        const gistToken = localStorage.getItem('leaveAppGistToken');
        const gistId = localStorage.getItem('leaveAppGistId');
        if (gistToken && gistId) {
            this.uploadToGist(gistToken, gistId, state)
                .then(() => console.log('Database auto-synced to GitHub Gist'))
                .catch(err => console.error('Failed to auto-sync to Gist:', err));
        }
    },

    handleLogin(e) {
        e.preventDefault();
        const userInp = document.getElementById('login-username').value;
        const passInp = document.getElementById('login-password').value;

        const user = state.users.find(u => u.username === userInp && u.password === passInp);

        if (user) {
            document.getElementById('login-error').style.display = 'none';
            document.getElementById('login-form').reset();
            this.login(user);
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    },

    login(user) {
        state.currentUser = user;
        if (user.role === 'employee') {
            document.getElementById('emp-name-display').innerText = user.name;
            this.showView('employee-view');
            this.renderEmployeeDashboard();
        } else if (user.role === 'admin' || user.role === 'hr_admin') {
            document.getElementById('admin-name-display').innerText = user.name;
            document.getElementById('admin-role-display').innerText = user.role === 'admin' ? 'مدير الفرع' : 'مدير الموارد البشرية';
            this.showView('admin-view');
            this.renderAdminDashboard();
        }
    },

    logout() {
        state.currentUser = null;
        this.showView('login-view');
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
            v.classList.add('hidden');
        });
        const target = document.getElementById(viewId);
        target.classList.remove('hidden');
        // Force reflow for animation
        void target.offsetWidth;
        target.classList.add('active');
    },

    // --- Employee Functions ---
    renderEmployeeDashboard() {
        const user = state.currentUser;
        if (!user) return;

        // Update Balances
        document.getElementById('emp-regular-balance').innerText = user.balances.regular;
        document.getElementById('emp-casual-balance').innerText = user.balances.casual;

        // Calculate Permissions used this month
        const currentMonth = new Date().getMonth();
        const usedPerms = state.requests.filter(r =>
            r.userId === user.id &&
            r.category === 'permission' &&
            new Date(r.start).getMonth() === currentMonth &&
            r.status !== 'rejected' &&
            r.status !== 'canceled'
        ).length;
        document.getElementById('emp-perm-used').innerText = usedPerms;

        // Update History List
        const myRequests = state.requests.filter(r => r.userId === user.id).sort((a, b) => b.id - a.id);
        const listContainer = document.getElementById('employee-leave-list');
        listContainer.innerHTML = '';

        if (myRequests.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد طلبات سابقة</p>';
        } else {
            myRequests.forEach(req => {
                listContainer.appendChild(this.createHistoryElement(req));
            });
        }

        // Update Substitute Requests (Where this user is the substitute)
        const subRequests = state.requests.filter(r => r.substituteId === user.id && r.status !== 'canceled');
        const subContainer = document.getElementById('employee-substitute-list');
        subContainer.innerHTML = '';

        if (subRequests.length === 0) {
            subContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد طلبات نيابة</p>';
        } else {
            subRequests.forEach(req => {
                subContainer.appendChild(this.createSubstituteElement(req));
            });
        }
    },

    openRequestModal() {
        // Populate substitute dropdown
        const subSelect = document.getElementById('leave-substitute');
        subSelect.innerHTML = '<option value="">بدون</option>';

        state.users.forEach(u => {
            if (u.role === 'employee' && u.id !== state.currentUser.id) {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.innerText = u.name;
                subSelect.appendChild(opt);
            }
        });

        document.getElementById('request-modal').classList.remove('hidden');
    },

    closeRequestModal() {
        document.getElementById('request-modal').classList.add('hidden');
        document.getElementById('leave-request-form').reset();
    },

    submitLeaveRequest(e) {
        e.preventDefault();

        const type = document.getElementById('leave-type').value;
        const subId = document.getElementById('leave-substitute').value;
        const start = document.getElementById('leave-start').value;
        const end = document.getElementById('leave-end').value;
        const reason = document.getElementById('leave-reason').value;

        // Calculate days excluding Fridays (5) and Saturdays (6)
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (endDate < startDate) {
            alert('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
            return;
        }

        let diffDays = 0;
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 5 && dayOfWeek !== 6) {
                diffDays++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (diffDays === 0) {
            alert('الفترة المحددة تتضمن أيام عطلات فقط (جمعة أو سبت)!');
            return;
        }

        // Check balance (only for regular and casual)
        if (type === 'regular' || type === 'casual') {
            if (state.currentUser.balances[type] < diffDays) {
                alert('رصيدك لا يكفي لهذا الطلب!');
                return;
            }
        }

        // Determine Type Name
        const typeNames = {
            'regular': 'إجازة اعتيادية',
            'casual': 'إجازة عارضة',
            'sick': 'إجازة مرضية'
        };

        let substituteName = null;
        let substituteStatus = null;
        if (subId) {
            const subUser = state.users.find(u => u.id == subId);
            if (subUser) {
                substituteName = subUser.name;
                substituteStatus = 'pending';
            }
        }

        // Create new request
        const newReq = {
            id: Date.now(),
            userId: state.currentUser.id,
            employeeName: state.currentUser.name,
            type: type,
            category: 'leave',
            typeName: typeNames[type],
            start: start,
            end: end,
            days: diffDays,
            reason: reason,
            status: 'pending',
            substituteId: subId ? parseInt(subId) : null,
            substituteName: substituteName,
            substituteStatus: substituteStatus,
            branchStatus: 'pending',
            hrStatus: 'pending',
            date: new Date().toISOString().split('T')[0]
        };

        state.requests.push(newReq);
        this.saveState();

        this.closeRequestModal();
        this.renderEmployeeDashboard();
    },

    openPermissionModal() {
        document.getElementById('permission-modal').classList.remove('hidden');
    },

    closePermissionModal() {
        document.getElementById('permission-modal').classList.add('hidden');
        document.getElementById('permission-request-form').reset();
    },

    submitPermissionRequest(e) {
        e.preventDefault();

        const type = document.getElementById('perm-type').value;
        const date = document.getElementById('perm-date').value;
        const reason = document.getElementById('perm-reason').value;

        // Check if exceeded 3 permissions this month
        const reqMonth = new Date(date).getMonth();
        const permsThisMonth = state.requests.filter(r =>
            r.userId === state.currentUser.id &&
            r.category === 'permission' &&
            new Date(r.start).getMonth() === reqMonth &&
            r.status !== 'rejected' &&
            r.status !== 'canceled'
        );

        if (permsThisMonth.length >= 3) {
            alert('لقد استنفذت الحد الأقصى للأذونات هذا الشهر (3 أذونات)');
            return;
        }

        const typeNames = {
            'perm_exit': 'إذن خروج (ساعتين)',
            'perm_late': 'إذن تأخير (ساعتين)',
            'perm_leave': 'إذن انصراف (ساعتين)'
        };

        const newReq = {
            id: Date.now(),
            userId: state.currentUser.id,
            employeeName: state.currentUser.name,
            type: type,
            category: 'permission',
            typeName: typeNames[type],
            start: date,
            end: date,
            days: 0,
            reason: reason,
            status: 'pending',
            substituteId: null,
            substituteName: null,
            substituteStatus: null,
            branchStatus: 'pending',
            hrStatus: 'pending',
            date: new Date().toISOString().split('T')[0]
        };

        state.requests.push(newReq);
        this.saveState();

        this.closePermissionModal();
        this.renderEmployeeDashboard();
    },

    createHistoryElement(req) {
        const div = document.createElement('div');
        div.className = 'list-item glass-card';

        let statusText = '';
        let statusClass = '';

        if (req.status === 'pending') {
            statusText = 'قيد الانتظار (الإدارة)';
            statusClass = 'status-pending';
        } else if (req.status === 'approved') {
            statusText = 'مقبول';
            statusClass = 'status-approved';
        } else if (req.status === 'rejected') {
            statusText = 'مرفوض';
            statusClass = 'status-rejected';
        } else if (req.status === 'canceled') {
            statusText = 'ملغى';
            statusClass = 'status-rejected';
        }

        let subInfo = '';
        if (req.substituteName) {
            let subStatusText = req.substituteStatus === 'pending' ? 'قيد الانتظار' : (req.substituteStatus === 'approved' ? 'موافق' : 'مرفوض');
            subInfo = `<div style="font-size: 0.8rem; margin-top: 4px; color: var(--warning-color);">القائم بالعمل (${req.substituteName}): ${subStatusText}</div>`;
        }

        let durationText = req.category === 'permission' ? 'ساعتين' : `${req.days} أيام`;

        let branchInfo = '';
        let hrInfo = '';
        if (req.branchStatus && req.branchStatus !== 'pending') {
            branchInfo = `<div style="font-size: 0.8rem; margin-top: 2px;">مدير الفرع: ${req.branchStatus === 'approved' ? 'موافق' : 'مرفوض'}</div>`;
        }
        if (req.hrStatus && req.hrStatus !== 'pending') {
            hrInfo = `<div style="font-size: 0.8rem; margin-top: 2px;">الموارد البشرية: ${req.hrStatus === 'approved' ? 'موافق' : 'مرفوض'}</div>`;
        }

        div.innerHTML = `
            <div class="item-info">
                <span class="item-title">${req.typeName} (${durationText})</span>
                <span class="item-date">${req.category === 'permission' ? req.start : req.start + ' إلى ' + req.end}</span>
                ${subInfo}
                ${branchInfo}
                ${hrInfo}
            </div>
            <div class="item-status ${statusClass}">${statusText}</div>
        `;
        return div;
    },

    createSubstituteElement(req) {
        const div = document.createElement('div');
        div.className = 'list-item glass-card';

        let actionButtons = '';
        if (req.substituteStatus === 'pending') {
            actionButtons = `
                <div class="admin-item-actions">
                    <button class="btn-action btn-approve" onclick="app.updateSubstituteStatus(${req.id}, 'approved')" title="قبول">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="btn-action btn-reject" onclick="app.updateSubstituteStatus(${req.id}, 'rejected')" title="رفض">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        } else {
            actionButtons = `<div class="item-status ${req.substituteStatus === 'approved' ? 'status-approved' : 'status-rejected'}">${req.substituteStatus === 'approved' ? 'موافق' : 'مرفوض'}</div>`;
        }

        div.innerHTML = `
            <div class="item-info">
                <span class="item-title">طلب من: ${req.employeeName}</span>
                <span class="item-date">${req.typeName} | ${req.start} إلى ${req.end}</span>
            </div>
            ${actionButtons}
        `;
        return div;
    },

    updateSubstituteStatus(reqId, newStatus) {
        const req = state.requests.find(r => r.id === reqId);
        if (req) {
            req.substituteStatus = newStatus;
            this.saveState();
            this.renderEmployeeDashboard();
        }
    },

    // --- Admin Functions ---
    renderAdminDashboard() {
        const allRequests = state.requests.sort((a, b) => b.id - a.id);
        const userRole = state.currentUser.role;

        let pendingRequests = [];
        if (userRole === 'hr_admin') {
            // HR sees requests pending their approval
            pendingRequests = allRequests.filter(r => r.hrStatus === 'pending' && r.status !== 'canceled');
        } else if (userRole === 'admin') {
            // Branch Manager sees requests approved by HR but pending Branch
            pendingRequests = allRequests.filter(r => r.hrStatus === 'approved' && r.branchStatus === 'pending' && r.status !== 'canceled');
        }

        const pendingCount = pendingRequests.length;

        // Update Count
        document.getElementById('admin-pending-count').innerText = pendingCount;

        // Update List
        const listContainer = document.getElementById('admin-pending-list');
        listContainer.innerHTML = '';

        if (allRequests.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد طلبات حالياً</p>';
            return;
        }

        allRequests.forEach(req => {
            // Only show action buttons if it requires this user's action
            let needsAction = false;
            if (userRole === 'hr_admin' && req.hrStatus === 'pending' && req.status !== 'canceled') needsAction = true;
            if (userRole === 'admin' && req.hrStatus === 'approved' && req.branchStatus === 'pending' && req.status !== 'canceled') needsAction = true;

            listContainer.appendChild(this.createAdminRequestElement(req, needsAction));
        });
    },

    createAdminRequestElement(req, needsAction) {
        const div = document.createElement('div');
        div.className = 'list-item glass-card';

        let subInfo = '';
        if (req.substituteName) {
            let subStatusText = req.substituteStatus === 'pending' ? 'قيد الانتظار' : (req.substituteStatus === 'approved' ? 'موافق' : 'مرفوض');
            subInfo = `<div style="font-size: 0.8rem; margin-top: 4px; color: var(--warning-color);">القائم بالعمل (${req.substituteName}): ${subStatusText}</div>`;
        }

        let branchInfo = '';
        let hrInfo = '';
        if (req.branchStatus !== 'pending') {
            branchInfo = `<div style="font-size: 0.8rem; margin-top: 2px;">مدير الفرع: ${req.branchStatus === 'approved' ? 'موافق' : 'مرفوض'}</div>`;
        }
        if (req.hrStatus !== 'pending') {
            hrInfo = `<div style="font-size: 0.8rem; margin-top: 2px;">الموارد البشرية: ${req.hrStatus === 'approved' ? 'موافق' : 'مرفوض'}</div>`;
        }

        let durationText = req.category === 'permission' ? 'ساعتين' : `${req.days} أيام`;

        let actionButtons = '';
        if (needsAction) {
            actionButtons = `
                <button class="btn-action btn-approve" onclick="app.updateRequestStatus(${req.id}, 'approved')" title="قبول">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button class="btn-action btn-reject" onclick="app.updateRequestStatus(${req.id}, 'rejected')" title="رفض">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
        } else if (req.status === 'approved' && state.currentUser.role === 'admin') {
            // Branch Manager can cancel an approved request
            actionButtons = `
                <button class="btn btn-secondary" onclick="app.cancelRequest(${req.id})" style="font-size: 0.8rem; padding: 4px 8px; color: var(--danger-color); border-color: var(--danger-color);">
                    إلغاء الطلب
                </button>
            `;
        } else {
            let statusText = '';
            if (req.status === 'canceled') statusText = 'ملغى';
            else if (req.status === 'rejected') statusText = 'مرفوض نهائياً';
            else if (req.status === 'approved') statusText = 'مقبول نهائياً';
            else statusText = 'قيد الانتظار';

            actionButtons = `<div class="item-status ${req.status === 'approved' ? 'status-approved' : (req.status === 'pending' ? 'status-pending' : 'status-rejected')}">${statusText}</div>`;
        }

        div.innerHTML = `
            <div class="item-info">
                <span class="item-title">${req.employeeName} - ${req.typeName}</span>
                <span class="item-date">${req.category === 'permission' ? req.start : req.start} | ${durationText}</span>
                <span class="item-date">السبب: ${req.reason}</span>
                ${subInfo}
                ${branchInfo}
                ${hrInfo}
            </div>
            <div class="admin-item-actions" style="align-items: center;">
                ${actionButtons}
            </div>
        `;
        return div;
    },

    updateRequestStatus(reqId, action) {
        const req = state.requests.find(r => r.id === reqId);
        if (!req) return;

        const userRole = state.currentUser.role;

        if (action === 'rejected') {
            req.status = 'rejected';
            if (userRole === 'admin') req.branchStatus = 'rejected';
            if (userRole === 'hr_admin') req.hrStatus = 'rejected';
        } else if (action === 'approved') {
            if (userRole === 'hr_admin') {
                req.hrStatus = 'approved';
                // Status remains pending until Branch approves
            } else if (userRole === 'admin') {
                req.branchStatus = 'approved';
                req.status = 'approved'; // Final Approval

                // Deduct balance
                if (req.type === 'regular' || req.type === 'casual') {
                    const userIndex = state.users.findIndex(u => u.id === req.userId);
                    if (userIndex !== -1) {
                        state.users[userIndex].balances[req.type] -= req.days;
                    }
                }
            }
        }

        this.saveState();
        this.renderAdminDashboard();
    },

    cancelRequest(reqId) {
        if (!confirm('هل أنت متأكد من إلغاء هذا الطلب وإرجاع الرصيد للموظف؟')) return;

        const req = state.requests.find(r => r.id === reqId);
        if (req && req.status === 'approved') {
            req.status = 'canceled';

            // Refund balance if it was regular or casual
            if (req.type === 'regular' || req.type === 'casual') {
                const userIndex = state.users.findIndex(u => u.id === req.userId);
                if (userIndex !== -1) {
                    state.users[userIndex].balances[req.type] += req.days;
                }
            }

            this.saveState();
            this.renderAdminDashboard();
        }
    },

    // --- Employee Management ---
    openEmployeeModal() {
        document.getElementById('employee-modal').classList.remove('hidden');
        this.renderEmployeeList();
    },

    closeEmployeeModal() {
        document.getElementById('employee-modal').classList.add('hidden');
        this.hideUserForm();
    },

    renderEmployeeList() {
        const container = document.getElementById('admin-employee-list');
        container.innerHTML = '';

        const employees = state.users.filter(u => u.role === 'employee');
        if (employees.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">لا يوجد موظفين</p>';
            return;
        }

        employees.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'list-item glass-card';
            div.innerHTML = `
                <div class="item-info">
                    <span class="item-title">${emp.name} (${emp.username})</span>
                    <span class="item-date">
                        اعتيادي: ${emp.balances.regular} | عارضة: ${emp.balances.casual}
                    </span>
                    <span class="item-date" style="font-family: monospace;">Password: ${emp.password}</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-secondary" onclick="app.editUser(${emp.id})" style="padding: 6px 12px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-secondary" onclick="app.deleteUser(${emp.id})" style="padding: 6px 12px; color: var(--danger-color); border-color: var(--danger-color);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    showAddUserForm() {
        document.getElementById('user-form').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('user-form-title').innerText = 'موظف جديد';
        document.getElementById('user-form').classList.remove('hidden');
    },

    hideUserForm() {
        document.getElementById('user-form').classList.add('hidden');
        document.getElementById('user-form').reset();
    },

    editUser(userId) {
        const user = state.users.find(u => u.id === userId);
        if (user) {
            document.getElementById('user-id').value = user.id;
            document.getElementById('user-name').value = user.name;
            document.getElementById('user-username').value = user.username;
            document.getElementById('user-password').value = user.password;
            document.getElementById('user-bal-regular').value = user.balances.regular;
            document.getElementById('user-bal-casual').value = user.balances.casual;

            document.getElementById('user-form-title').innerText = 'تعديل بيانات الموظف';
            document.getElementById('user-form').classList.remove('hidden');
        }
    },

    deleteUser(userId) {
        if (!confirm('هل أنت متأكد من حذف هذا الموظف بالكامل؟')) return;

        state.users = state.users.filter(u => u.id !== userId);

        // Delete requests made by this user
        state.requests = state.requests.filter(r => r.userId !== userId);

        // If this user was a substitute for someone else's request, remove them as substitute
        state.requests.forEach(r => {
            if (r.substituteId === userId) {
                r.substituteId = null;
                r.substituteName = null;
                r.substituteStatus = null;
            }
        });

        this.saveState();
        this.renderEmployeeList();

        // Update the dashboard to remove deleted user's requests from the UI immediately
        if (state.currentUser.role === 'admin' || state.currentUser.role === 'hr_admin') {
            this.renderAdminDashboard();
        }
    },

    saveUser(e) {
        e.preventDefault();

        const id = document.getElementById('user-id').value;
        const name = document.getElementById('user-name').value;
        const username = document.getElementById('user-username').value;
        const password = document.getElementById('user-password').value;
        const balRegular = parseInt(document.getElementById('user-bal-regular').value) || 0;
        const balCasual = parseInt(document.getElementById('user-bal-casual').value) || 0;

        if (id) {
            // Edit existing
            const user = state.users.find(u => u.id == id);
            if (user) {
                user.name = name;
                user.username = username;
                user.password = password;
                user.balances.regular = balRegular;
                user.balances.casual = balCasual;
            }
        } else {
            // Check if username exists
            if (state.users.some(u => u.username === username)) {
                alert('اسم المستخدم موجود مسبقاً!');
                return;
            }

            // Add new
            const newUser = {
                id: Date.now(),
                role: 'employee',
                name: name,
                username: username,
                password: password,
                balances: {
                    regular: balRegular,
                    casual: balCasual
                }
            };
            state.users.push(newUser);
        }

        this.saveState();
        this.hideUserForm();
        this.renderEmployeeList();
    },

    // --- GitHub Gist API Helpers ---
    async fetchFromGist(token, gistId) {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        const fileContent = data.files['vacations_db.json'].content;
        return JSON.parse(fileContent);
    },

    async uploadToGist(token, gistId, dataToUpload) {
        const body = {
            description: "Vacation Management System Database",
            files: {
                "vacations_db.json": {
                    content: JSON.stringify(dataToUpload, null, 2)
                }
            }
        };
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return true;
    },

    async createGist(token, dataToUpload) {
        const body = {
            description: "Vacation Management System Database (Private)",
            public: false,
            files: {
                "vacations_db.json": {
                    content: JSON.stringify(dataToUpload, null, 2)
                }
            }
        };
        const response = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        return data.id;
    },

    // --- Database & Sync Functions ---
    openDatabaseModal() {
        document.getElementById('database-modal').classList.remove('hidden');
        this.updateSyncUI();
    },

    closeDatabaseModal() {
        document.getElementById('database-modal').classList.add('hidden');
    },

    updateSyncUI() {
        const token = localStorage.getItem('leaveAppGistToken') || '';
        const gistId = localStorage.getItem('leaveAppGistId') || '';

        document.getElementById('gist-token').value = token;
        document.getElementById('gist-id').value = gistId;

        const badge = document.getElementById('sync-status-badge');
        const statusText = document.getElementById('sync-status-text');
        const syncNowBtn = document.getElementById('btn-sync-now');
        const disconnectBtn = document.getElementById('btn-disconnect-gist');
        const shareSection = document.getElementById('gist-share-section');
        const shareCodeInput = document.getElementById('gist-share-code');

        if (gistId) {
            badge.innerText = token ? 'متصل سحابياً (مالك)' : 'متصل سحابياً (موظف)';
            badge.className = 'item-status status-approved';
            statusText.innerText = `متصل بـ GitHub Gist (ID: ${gistId.substring(0, 8)}...)`;
            syncNowBtn.classList.remove('hidden');
            disconnectBtn.classList.remove('hidden');
            
            if (token) {
                // Generate Base64 Settings Code for easy sharing
                try {
                    const configObj = { token: token, id: gistId };
                    const shareCode = btoa(JSON.stringify(configObj));
                    shareCodeInput.value = shareCode;
                    shareSection.classList.remove('hidden');
                } catch (e) {
                    console.error('Error generating share code:', e);
                }
            } else {
                shareSection.classList.add('hidden');
            }
        } else {
            badge.innerText = 'محلي';
            badge.className = 'item-status status-pending';
            statusText.innerText = 'محلي (تخزين المتصفح / database.json)';
            syncNowBtn.classList.add('hidden');
            disconnectBtn.classList.add('hidden');
            shareSection.classList.add('hidden');
        }
    },

    async saveGistConfig(e) {
        e.preventDefault();
        const token = document.getElementById('gist-token').value.trim();
        let gistId = document.getElementById('gist-id').value.trim();

        if (!token) {
            alert('يرجى إدخال رمز الوصول الشخصي GitHub Token PAT أولاً!');
            return;
        }

        try {
            if (!gistId) {
                // Auto create Gist
                if (confirm('هل ترغب في إنشاء Gist جديد تلقائياً لحفظ قاعدة البيانات؟')) {
                    gistId = await this.createGist(token, state);
                    document.getElementById('gist-id').value = gistId;
                    alert(`تم إنشاء Gist جديد بنجاح! المعرف الخاص بك هو: ${gistId}\nيرجى الاحتفاظ به لحالات الطوارئ.`);
                } else {
                    return;
                }
            }

            // Verify Gist exists and can be updated
            await this.uploadToGist(token, gistId, state);

            localStorage.setItem('leaveAppGistToken', token);
            localStorage.setItem('leaveAppGistId', gistId);
            
            alert('تم حفظ الإعدادات والاتصال بقاعدة بيانات GitHub بنجاح!');
            this.updateSyncUI();
        } catch (err) {
            console.error(err);
            alert('فشل الاتصال: تأكد من صحة رمز الوصول ومعرف الـ Gist وصلاحياته!');
        }
    },

    disconnectGist() {
        if (confirm('هل أنت متأكد من إلغاء ربط المزامنة؟ سيتم العودة للتخزين المحلي فقط.')) {
            localStorage.removeItem('leaveAppGistToken');
            localStorage.removeItem('leaveAppGistId');
            alert('تم إلغاء ربط المزامنة بنجاح.');
            this.updateSyncUI();
        }
    },

    async syncWithGist() {
        const token = localStorage.getItem('leaveAppGistToken') || '';
        const gistId = localStorage.getItem('leaveAppGistId');
        if (!gistId) return;

        const btn = document.getElementById('btn-sync-now');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-sync fa-spin"></i> جاري المزامنة...';
        btn.disabled = true;

        try {
            // Fetch latest from Gist
            const remoteState = await this.fetchFromGist(token, gistId);
            if (remoteState && remoteState.users && remoteState.requests) {
                state = remoteState;
                this.saveState();
                
                // If admin is active, re-render their lists
                if (state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'hr_admin')) {
                    this.renderAdminDashboard();
                    if (!document.getElementById('employee-modal').classList.contains('hidden')) {
                        this.renderEmployeeList();
                    }
                }
                
                alert('تمت مزامنة وجلب أحدث البيانات من GitHub Gist بنجاح!');
            }
        } catch (err) {
            console.error(err);
            alert('فشلت المزامنة: يرجى التحقق من اتصال الإنترنت وصلاحيات الرمز الخاص بك.');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
            this.updateSyncUI();
        }
    },

    exportDatabase() {
        // Prepare clean database JSON (exclude active session keys, but include gistId if connected)
        const gistId = localStorage.getItem('leaveAppGistId') || '';
        const cleanState = {
            gistId: gistId,
            users: state.users,
            requests: state.requests
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanState, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "database.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    },

    importDatabase(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData.users && importedData.requests) {
                    if (confirm('هل أنت متأكد من استيراد قاعدة البيانات هذه؟ سيتم استبدال جميع البيانات الحالية.')) {
                        state.users = importedData.users;
                        state.requests = importedData.requests;
                        if (importedData.gistId) {
                            localStorage.setItem('leaveAppGistId', importedData.gistId);
                        }
                        this.saveState();
                        
                        // Re-render dashboards
                        if (state.currentUser) {
                            if (state.currentUser.role === 'employee') {
                                this.renderEmployeeDashboard();
                            } else {
                                this.renderAdminDashboard();
                                if (!document.getElementById('employee-modal').classList.contains('hidden')) {
                                    this.renderEmployeeList();
                                }
                            }
                        }
                        
                        alert('تم استيراد قاعدة البيانات بنجاح!');
                        this.closeDatabaseModal();
                    }
                } else {
                    alert('الملف المرفوع غير صالح! يجب أن يحتوي على المستخدمين والطلبات.');
                }
            } catch (err) {
                alert('فشل قراءة الملف: تأكد من أنه ملف JSON صحيح.');
            }
        };
        reader.readAsText(file);
    },

    promptLinkCode(e) {
        if (e) e.preventDefault();
        const code = prompt('الرجاء لصق كود ربط قاعدة البيانات السحابية المقدم من المسؤول:');
        if (!code) return;

        try {
            const decoded = atob(code.trim());
            const config = JSON.parse(decoded);
            if (config.token && config.id) {
                localStorage.setItem('leaveAppGistToken', config.token);
                localStorage.setItem('leaveAppGistId', config.id);
                alert('تم ربط قاعدة البيانات السحابية بنجاح! جاري إعادة تحميل الصفحة لمزامنة البيانات...');
                window.location.reload();
            } else {
                alert('كود الربط غير صالح! يرجى التأكد من نسخه بالكامل.');
            }
        } catch (err) {
            console.error(err);
            alert('فشل قراءة كود الربط: تأكد من نسخ الكود بشكل صحيح بدون فراغات.');
        }
    },

    copyShareCode() {
        const shareInput = document.getElementById('gist-share-code');
        if (shareInput && shareInput.value) {
            shareInput.select();
            shareInput.setSelectionRange(0, 99999); // For mobile devices
            navigator.clipboard.writeText(shareInput.value)
                .then(() => {
                    alert('تم نسخ كود الربط بنجاح! يمكنك الآن مشاركته مع موظفيك عبر واتساب أو أي وسيلة أخرى.');
                })
                .catch(err => {
                    alert('فشل النسخ التلقائي، يمكنك نسخ الكود يدوياً من الحقل.');
                });
        }
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
