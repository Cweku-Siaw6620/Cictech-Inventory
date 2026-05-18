(function() {
        // ---------- API endpoint ----------
        const API_BASE = 'https://cictech-inventory-2se4.vercel.app/products';
        const BRANCH_API = 'https://cictech-inventory-2se4.vercel.app/products/branch/';
        const BULK_LIMIT = 15;

        let currentUser = null;
        let currentBranch = null;
        let userRole = null;

        const BRAND_OPTIONS = ['Dell','HP','Lenovo','Macbook','Asus','Acer','Apple','Samsung','MSI','Microsoft','Toshiba','Tv','Monitor'];
        const RAM_OPTIONS = ['4GB','8GB','12GB','16GB','32GB','64GB'];
        const PROCESSOR_OPTIONS = ['i3','i5','i7','i9','DUAL_CORE',"AMD",'M5'];
        const GEN_OPTIONS = ['3rd Gen','4th Gen', '5th Gen', '6th Gen', '7th Gen', '8th Gen', '9th Gen', '10th Gen', '11th Gen', '12th Gen', 'Ryzen 3','Ryzen 5','Ryzen 7','A8','A9','A10'];
        const STORAGE_OPTIONS = ['128GB','230GB','256GB','320GB','500GB','512GB','720GB','1TB','2TB',' 320/128 GB',' 500/128GB',' 512/256GB','1TB/128GB',' 1TB/256GB',' 1TB/512GB'];
        const STATUS_OPTIONS = ['Available', 'Sold', 'N/A'];

        // internal state
        let laptops = [];
        let filteredLaptops = [];
        let editingId = null;
        let pendingDeleteId = null;
        let allBranchData = {};
        let adminCharts = {};

        // Admin view mode: 'table' (default) or 'overview'
        let adminViewMode = 'table';

        // Replace with
        let approvedIds = new Set();

        async function loadApprovedIds() {
            const pin = localStorage.getItem('pin');
            try {
                const res = await fetch(API_BASE, { headers: { 'pin': pin } });
                if (!res.ok) return;
                const all = await res.json();
                approvedIds = new Set(
                    all.filter(p => p.approved === true).map(p => p._id || p.id)
                );
            } catch(err) {
                console.warn('Could not load approved IDs:', err);
            }
        }

        function normalizeText(value) {
            return String(value || '').trim().toLowerCase();
        }

        function getPurchaseDateTimestamp(product) {
            const ts = new Date(product?.purchaseDate || 0).getTime();
            return Number.isFinite(ts) ? ts : 0;
        }

        function toProductPayload(record) {
            const { _id, id, __v, createdAt, updatedAt, ...payload } = record || {};
            return payload;
        }

        function isSameProductInstance(a, b) {
            return normalizeText(a?.brand) === normalizeText(b?.brand)
                && normalizeText(a?.model) === normalizeText(b?.model)
                && normalizeText(a?.processor) === normalizeText(b?.processor)
                && normalizeText(a?.gen) === normalizeText(b?.gen)
                && normalizeText(a?.ram) === normalizeText(b?.ram)
                && normalizeText(a?.storage) === normalizeText(b?.storage);
        }

        // ---------- show toast notification ----------
        function showNotification(message, type = 'info', duration = 4000) {
            const container = document.getElementById('notificationContainer');
            const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
                <span class="toast-message">${message}</span>
                <button class="toast-close" aria-label="close">✕</button>
            `;
            container.appendChild(toast);
            requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

            const dismiss = () => {
                clearTimeout(timer);
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 280);
            };
            const timer = setTimeout(dismiss, duration);
            toast.querySelector('.toast-close').addEventListener('click', dismiss);
        }

        // ---------- toggle button loading state ----------
        function setButtonLoading(btn, isLoading, loadingText = '') {
            if (!btn) return;
            if (isLoading) {
                btn.dataset.originalHtml = btn.innerHTML;
                btn.classList.add('loading');
                btn.innerHTML = `<span class="btn-spinner"></span>${loadingText ? ' ' + loadingText : ''}`;
                btn.disabled = true;
            } else {
                btn.classList.remove('loading');
                btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
                btn.disabled = false;
            }
        }

        // DOM elements
        const tbody = document.getElementById('tableBody');
        const searchInput = document.getElementById('searchInput');
        const statusFilter = document.getElementById('statusFilter');
        const dateSoldFilter = document.getElementById('dateSoldFilter');
        const modalOverlay = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalForm = document.getElementById('modalForm');
        const modalHint = document.getElementById('modalHint');
        const statusRuleHint = document.getElementById('statusRuleHint');
        const openBulkBtn = document.getElementById('openBulkBtn');
        const bulkModal = document.getElementById('bulkModal');
        const bulkRows = document.getElementById('bulkRows');
        const bulkModalHint = document.getElementById('bulkModalHint');
        const bulkSaveBtn = document.getElementById('bulkSave');
        const modalBack = document.getElementById('modalBack');
        const bulkBack = document.getElementById('bulkBack');
        const confirmBack = document.getElementById('confirmBack');
        const loginBtn = document.getElementById("loginBtn");
        if (loginBtn) loginBtn.addEventListener("click", login);

        // ---------- render table ----------
        function renderTable() {
            const searchTerm = searchInput.value.toLowerCase();
            const statusVal = statusFilter.value;
            const dateSoldVal = dateSoldFilter.value;

            if (laptops === null) {
                tbody.innerHTML = `<tr><td colspan="12" class="loading-container"><div class="spinner"></div> Connecting to database...</td></tr>`;
                return;
            }

            if (!laptops.length) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="12">📭 inventory is empty — add your first laptop</td></tr>`;
                return;
            }

            // ✅ filter FIRST, then check if results are empty
            filteredLaptops = laptops.filter(lap => {
                const matchesSearch = (lap.serial?.toLowerCase() || '').includes(searchTerm) ||
                                    (lap.brand?.toLowerCase() || '').includes(searchTerm) ||
                                    (lap.model?.toLowerCase() || '').includes(searchTerm);
                const currentStatus = String(lap.status || '').trim();
                const matchesStatus = statusVal === '__other__'
                    ? (currentStatus !== 'Available' && currentStatus !== 'Sold' && currentStatus !== 'N/A')
                    : (statusVal ? currentStatus === statusVal : true);
                const purchaseDate = String(lap.purchaseDate || '').slice(0, 10);
                const matchesDateSold = dateSoldVal ? purchaseDate === dateSoldVal : true;
                return matchesSearch && matchesStatus && matchesDateSold;
            });

            if (filteredLaptops.length === 0) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="12">🔍 no matching laptops — adjust filters</td></tr>`;
                return;
            }

            // Ensure approved items are shown after unapproved ones
            const unapprovedLaps = filteredLaptops.filter(l => !approvedIds.has(l._id || l.id));
            const approvedLaps = filteredLaptops
                .filter(l => approvedIds.has(l._id || l.id))
                .sort((a, b) => getPurchaseDateTimestamp(b) - getPurchaseDateTimestamp(a));
            const orderedLaptops = [...unapprovedLaps, ...approvedLaps];

            let html = '';
            orderedLaptops.forEach(lap => {
                const id = lap._id || lap.id;
                const statusClassRaw = (lap.status || 'Available').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const knownClasses = ['available', 'sold', 'na'];
                const statusClass = statusClassRaw === 'n-a' ? 'na' : knownClasses.includes(statusClassRaw) ? statusClassRaw : 'custom';
                const isApproved = approvedIds.has(id);
                const canEdit = (userRole === 'admin' || currentBranch === currentUser?.branch) && !isApproved;

                html += `<tr${isApproved ? ' class="row-approved"' : ''}>
                    <td>${lap.brand || '-'}</td>
                    <td>${lap.model || '-'}</td>
                    <td>${lap.processor || '-'}</td>
                    <td>${lap.gen || '-'}</td>
                    <td>${lap.ram || '-'}</td>
                    <td>${lap.storage || '-'}</td>
                    <td>${lap.serial || '-'}</td>
                    <td><span class="price-highlight">${lap.price ? 'GHS ' + lap.price : '-'}</span></td>
                    <td>${lap.purchaseDate ? lap.purchaseDate.slice(0,10) : '--'}</td>
                    <td>${lap.customerNumber || '--'}</td>
                    <td><span class="status ${statusClass}"><span class="status-dot"></span> ${lap.status || 'Available'}</span></td>
                    <td>
                        <div class="row-actions">
                            ${isApproved
                                ? '<span class="approval-badge approved" style="font-size:0.72rem">✔ Approved</span>'
                                : canEdit
                                    ? `<button class="icon-btn edit-btn" data-id="${id}">✎</button>
                                       <button class="icon-btn delete-btn" data-id="${id}">🗑</button>`
                                    : '<span style="font-size:0.75rem;color:var(--text-muted)">view only</span>'
                            }
                        </div>
                    </td>
                 </tr>`;
            });
            tbody.innerHTML = html;

            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    openEditModal(id);
                });
            });
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    deleteLaptopFlow(id);
                });
            });
        }



             // ---------- API calls ----------
        async function login(){
            const pin = document.getElementById("pinInput").value;
            const errorBox = document.getElementById("loginError");

            if(pin.length !== 4){
                errorBox.innerText = "Enter valid PIN";
                return;
            }
            try{
                const res = await fetch("https://cictech-inventory-2se4.vercel.app/verify-pin",{
                    method:"POST",
                    headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({ pin })
                });
                const data = await res.json();

                if(!res.ok){
                    errorBox.innerText = "Invalid PIN";
                    return;
                }
                currentUser = data;
                currentBranch = data.branch;
                userRole = data.role;

                localStorage.setItem("pin", pin);
                localStorage.setItem("user", JSON.stringify(data));
                document.getElementById("loginScreen").style.display = "none";

                updateBranchUI();
                if (userRole === 'admin') {
                    showAdminDashboard();
                } else {
                    fetchLaptops();
                }
            }catch{
                errorBox.innerText = "Server error";
            }
        }

        const savedUser = localStorage.getItem("user");
        const savedPin = localStorage.getItem("pin");

        if(savedUser && savedPin){
            currentUser = JSON.parse(savedUser);
            currentBranch = currentUser.branch;
            userRole = currentUser.role;

            document.getElementById("loginScreen").style.display = "none";
            updateBranchUI();
        }

        // if user is already logged in, update UI and fetch data
        function updateBranchUI(){
            const badge = document.getElementById('userBadge');
            const badgeLabel = document.getElementById('userBadgeLabel');
            if (badge && badgeLabel && currentUser) {
                badge.style.display = 'inline-flex';
                badgeLabel.textContent = userRole === 'admin'
                    ? 'admin · all branches'
                    : `${currentUser.role} · ${currentUser.branch}`;
            }

            // Show admin tab only for admin role
            const adminTab = document.getElementById('adminTab');
            if (adminTab) {
                adminTab.style.display = userRole === 'admin' ? 'inline-flex' : 'none';
                if (userRole === 'admin') {
                    // Admin lands on Admin tab by default
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    adminTab.classList.add('active');
                    currentBranch = 'Admin';
                } else {
                    // Staff: activate their own branch tab
                    const staffBranchTab = Array.from(document.querySelectorAll('.tab')).find(t => t.dataset.branch === currentUser.branch);
                    if (staffBranchTab) {
                        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                        staffBranchTab.classList.add('active');
                    }
                }
            }
            
            // Show/disable New Laptop button: only admins can add products
            const addBtn = document.getElementById('addNewBtn');
            if (addBtn) {
                const isAdmin = userRole === 'admin';
                addBtn.style.display = isAdmin ? '' : 'none';
                addBtn.disabled = !isAdmin;
                addBtn.title = isAdmin ? '' : 'Only admin can add new products';
            }

            // Admin view toggle visibility (only for admin)
            const adminViewToggle = document.getElementById('adminViewToggle');
            if (adminViewToggle) {
                adminViewToggle.style.display = userRole === 'admin' ? '' : 'none';
            }
            
            // Apply view mode only if admin
            if (userRole === 'admin') {
                adminViewMode = 'table';
                applyAdminViewMode();
            }
        }

                // ---------- branch tabs ----------
        document.querySelectorAll(".tab").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
                btn.classList.add("active");
                currentBranch = btn.dataset.branch;

                if (currentBranch === 'Admin') {
                    showAdminDashboard();
                } else {
                    hideAdminDashboard();
                    fetchLaptops();
                }
            });
        });

        // Admin view toggle buttons - only wire if they exist
        const viewTableBtn = document.getElementById('viewTableBtn');
        const viewOverviewBtn = document.getElementById('viewOverviewBtn');
        if (viewTableBtn) {
            viewTableBtn.addEventListener('click', () => { 
                if (userRole !== 'admin') return;
                adminViewMode = 'table'; 
                applyAdminViewMode(); 
            });
        }
        if (viewOverviewBtn) {
            viewOverviewBtn.addEventListener('click', () => { 
                if (userRole !== 'admin') return;
                adminViewMode = 'overview'; 
                applyAdminViewMode(); 
            });
        }

        // ---------- API calls ----------
        async function fetchLaptops() {
            const refreshBtn = document.getElementById('refreshBtn');
            setButtonLoading(refreshBtn, true, 'syncing...');
            try {
                tbody.innerHTML = `<tr><td colspan="12" class="loading-container"><div class="spinner"></div> Loading inventory...</td></tr>`;
                await loadApprovedIds();
                const res = await fetch(BRANCH_API + currentBranch, {
                    headers: { "pin": localStorage.getItem("pin") }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                laptops = Array.isArray(data) ? data : (data.data || []);
                renderTable();
                modalHint.innerText = `✅ GET ${BRANCH_API}${currentBranch} · ${laptops.length} records`;
                showNotification(`Synced — ${laptops.length} laptop${laptops.length !== 1 ? 's' : ''} loaded`, 'success', 3000);
            } catch (err) {
                console.warn('fetch error', err);
                laptops = [];
                renderTable();
                modalHint.innerText = `⚠️ cannot reach ${BRANCH_API}${currentBranch} — check server`;
                showNotification('Could not reach the server. Check your connection.', 'error');
            } finally {
                setButtonLoading(refreshBtn, false);
            }
        }

        // ---------- Admin dashboard ----------
        async function fetchAllBranchData() {
            const pin = localStorage.getItem('pin');
            const branches = ['Admin', 'Central', 'Amanfrom', 'East-Legon'];
            const results = {};
            await Promise.all(branches.map(async branch => {
                try {
                    const res = await fetch(BRANCH_API + branch, { headers: { 'pin': pin } });
                    results[branch] = res.ok ? await res.json() : [];
                } catch { results[branch] = []; }
            }));
            return results;
        }

        function hideAdminDashboard() {
            const adminDashboard = document.getElementById('adminDashboard');
            if (adminDashboard) adminDashboard.style.display = 'none';
            const searchSection = document.getElementById('searchSection');
            if (searchSection) searchSection.style.display = '';
            const inventoryCard = document.querySelector('.inventory-card');
            if (inventoryCard) inventoryCard.style.display = '';
            const addNewBtn = document.getElementById('addNewBtn');
            if (addNewBtn) addNewBtn.style.display = 'none';
        }

        function applyAdminViewMode() {
            // Only apply if user is admin
            if (userRole !== 'admin') return;
            
            const adminSections = Array.from(document.querySelectorAll('.admin-stats-header, .kpi-row, .charts-grid, .admin-sold-section, .rev-section'));
            const searchSection = document.getElementById('searchSection');
            const inventoryCard = document.querySelector('.inventory-card');
            const bulkToolbar = document.getElementById('bulkReassignToolbar');
            const viewTableBtn = document.getElementById('viewTableBtn');
            const viewOverviewBtn = document.getElementById('viewOverviewBtn');

            if (adminViewMode === 'table') {
                // show table UI
                if (searchSection) searchSection.style.display = '';
                if (inventoryCard) inventoryCard.style.display = '';
                if (bulkToolbar) bulkToolbar.style.display = 'none'; // hide bulk toolbar initially
                // hide admin overview sections
                adminSections.forEach(s => { if (s) s.style.display = 'none'; });
                if (viewTableBtn) viewTableBtn.classList.add('active');
                if (viewOverviewBtn) viewOverviewBtn.classList.remove('active');
            } else {
                // show overview
                if (searchSection) searchSection.style.display = 'none';
                if (inventoryCard) inventoryCard.style.display = 'none';
                if (bulkToolbar) bulkToolbar.style.display = 'none';
                adminSections.forEach(s => { if (s) s.style.display = ''; });
                if (viewTableBtn) viewTableBtn.classList.remove('active');
                if (viewOverviewBtn) viewOverviewBtn.classList.add('active');
            }
        }

        async function showAdminDashboard() {
            const adminDashboard = document.getElementById('adminDashboard');
            if (adminDashboard) adminDashboard.style.display = 'block';
            
            const showAdminInventory = currentBranch === 'Admin';
            const canManageAdminInventory = userRole === 'admin' && currentBranch === 'Admin';
            
            const searchSection = document.getElementById('searchSection');
            if (searchSection) searchSection.style.display = showAdminInventory ? '' : 'none';
            
            const inventoryCard = document.querySelector('.inventory-card');
            if (inventoryCard) inventoryCard.style.display = showAdminInventory ? '' : 'none';
            
            const addNewBtn = document.getElementById('addNewBtn');
            if (addNewBtn) addNewBtn.style.display = canManageAdminInventory ? '' : 'none';

            const adminSections = document.querySelectorAll('.admin-stats-header, .kpi-row, .charts-grid, .admin-sold-section, .rev-section');
            adminSections.forEach(section => {
                if (section) section.style.display = 'none'; // Start hidden, overview button will show
            });

            const refreshBtn = document.getElementById('refreshBtn');
            setButtonLoading(refreshBtn, true, 'loading...');

            try {
                await loadApprovedIds();
                allBranchData = await fetchAllBranchData();
                renderAdminCharts(allBranchData);
                renderAdminSoldTable();
                renderRevenueCharts(allBranchData);
                if (showAdminInventory) {
                    await fetchLaptops();
                }
                // Apply view mode after data is loaded
                applyAdminViewMode();
            } catch(err) {
                showNotification('Failed to load admin data', 'error');
            } finally {
                setButtonLoading(refreshBtn, false);
            }

            const bf = document.getElementById('adminBranchFilter');
            const af = document.getElementById('adminApprovalFilter');
            const sf = document.getElementById('adminSoldSearchInput');
            if (bf) bf.onchange = renderAdminSoldTable;
            if (af) af.onchange = renderAdminSoldTable;
            if (sf) sf.oninput = renderAdminSoldTable;
        }

        function renderAdminSoldTable() {
            const branchFilter = document.getElementById('adminBranchFilter')?.value || '';
            const approvalFilter = document.getElementById('adminApprovalFilter')?.value;
            const searchTerm = (document.getElementById('adminSoldSearchInput')?.value || '').trim().toLowerCase();
            const soldTbody = document.getElementById('adminSoldBody');
            if (!soldTbody) return;

            const branches = ['Admin', 'Central', 'Amanfrom', 'East-Legon'];
            let soldItems = [];

            branches.forEach(branch => {
                (allBranchData[branch] || []).forEach(lap => {
                    if (lap.status === 'Sold') soldItems.push({ ...lap, _branch: branch });
                });
            });

            if (branchFilter) soldItems = soldItems.filter(l => l._branch === branchFilter);
            if (approvalFilter === 'pending') soldItems = soldItems.filter(l => !approvedIds.has(l._id || l.id));
            if (approvalFilter === 'approved') soldItems = soldItems.filter(l => approvedIds.has(l._id || l.id));
            if (searchTerm) {
                soldItems = soldItems.filter(l => {
                    const brand = String(l.brand || '').toLowerCase();
                    const model = String(l.model || '').toLowerCase();
                    const serial = String(l.serial || l.serialNumber || '').toLowerCase();
                    return brand.includes(searchTerm) || model.includes(searchTerm) || serial.includes(searchTerm);
                });
            }

            // Ensure approved sold items appear after pending/unapproved ones
            const unapprovedSold = soldItems.filter(l => !approvedIds.has(l._id || l.id));
            const approvedSold = soldItems
                .filter(l => approvedIds.has(l._id || l.id))
                .sort((a, b) => getPurchaseDateTimestamp(b) - getPurchaseDateTimestamp(a));
            soldItems = [...unapprovedSold, ...approvedSold];

            if (!soldItems.length) {
                soldTbody.innerHTML = `<tr class="empty-row"><td colspan="12">✅ No sold machines match this filter</td></tr>`;
                return;
            }

            let html = '';
            soldItems.forEach(lap => {
                const id = lap._id || lap.id;
                const isApproved = approvedIds.has(id);
                html += `<tr class="${isApproved ? 'row-approved' : ''}">
                    <td><span class="branch-pill branch-${(lap._branch || '').toLowerCase().replace('-', '')}">${lap._branch}</span></td>
                    <td>${lap.brand || '-'}</td>
                    <td>${lap.model || '-'}</td>
                    <td>${lap.processor || '-'} ${lap.gen || '-'}</td>
                    <td>${lap.ram || '-'}</td>
                    <td>${lap.storage || '-'}</td>
                    <td>${lap.serial || '-'}</td>
                    <td>${lap.purchaseDate ? lap.purchaseDate.slice(0, 10) : '--'}</td>
                    <td><span class="price-highlight">${lap.price ? 'GHS ' + lap.price : '-'}</span></td>
                    <td>
                        ${isApproved
                            ? '<span class="approval-badge approved">✔ Approved</span>'
                            : '<span class="approval-badge pending">⏳ Pending</span>'
                        }
                    </td>
                    <td>
                        <div class="row-actions">
                            <button class="icon-btn locate-btn" data-id="${id}" data-branch="${lap._branch}" title="Locate in branch tab">👁</button>
                            <div class="approve-wrapper" style="position:relative">
                                <button class="icon-btn approve-btn ${isApproved ? 'approved-active' : ''}" data-id="${id}" title="${isApproved ? 'Change approval' : 'Approve / Disapprove'}">✔</button>
                                <div class="approve-dropdown" id="dd-${id}" style="display:none">
                                    <button class="dd-option approve-option" data-id="${id}">✔ Approve</button>
                                    <button class="dd-option disapprove-option" data-id="${id}">✖ Disapprove</button>
                                </div>
                            </div>
                        </div>
                    </td>
                 </tr>`;
            });
            soldTbody.innerHTML = html;

            soldTbody.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dd = document.getElementById('dd-' + btn.dataset.id);
                    soldTbody.querySelectorAll('.approve-dropdown').forEach(d => {
                        if (d !== dd) d.style.display = 'none';
                    });
                    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
                });
            });

            soldTbody.querySelectorAll('.approve-option').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    await setApproval(id, true);
                    document.getElementById('dd-' + id).style.display = 'none';
                });
            });

            soldTbody.querySelectorAll('.disapprove-option').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    await setApproval(id, false);
                    document.getElementById('dd-' + id).style.display = 'none';
                });
            });

            soldTbody.querySelectorAll('.locate-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const branch = btn.dataset.branch;
                    const id = btn.dataset.id;
                    hideAdminDashboard();
                    document.querySelectorAll('.tab').forEach(t => {
                        t.classList.toggle('active', t.dataset.branch === branch);
                    });
                    currentBranch = branch;
                    fetchLaptops().then(() => {
                        setTimeout(() => {
                            const row = document.querySelector(`[data-id="${id}"]`)?.closest('tr');
                            if (row) {
                                row.classList.add('highlight-row');
                                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 400);
                    });
                });
            });

            document.addEventListener('click', () => {
                document.querySelectorAll('.approve-dropdown').forEach(d => d.style.display = 'none');
            }, { once: true });
        }

        async function setApproval(id, approved) {
            const pin = localStorage.getItem('pin');
            try {
                const res = await fetch(`${API_BASE}/${id}/approve`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'pin': pin },
                    body: JSON.stringify({ approved })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                if (approved) approvedIds.add(id);
                else approvedIds.delete(id);
                //localStorage.setItem('approvedIds', JSON.stringify([...approvedIds]));

                renderAdminSoldTable();
                allBranchData = await fetchAllBranchData();
                renderAdminCharts(allBranchData);
                renderRevenueCharts(allBranchData);

                showNotification(approved ? '✔ Sale approved' : 'Sale disapproved', approved ? 'success' : 'warning');
            } catch(err) {
                showNotification('Approval failed: ' + err.message, 'error');
            }
        }

        function renderAdminCharts(data) {
            const BRANCHES = ['Admin', 'Central', 'Amanfrom', 'East-Legon'];
            const COLORS = {
                Admin:       { bar: 'rgba(100,116,139,0.85)', border: '#64748B' },
                Central:     { bar: 'rgba(0,102,204,0.85)',    border: '#0066CC' },
                Amanfrom:    { bar: 'rgba(16,185,129,0.85)',   border: '#10B981' },
                'East-Legon':{ bar: 'rgba(245,158,11,0.85)',   border: '#F59E0B' },
            };

            // --- compute stats ---
            const totals    = {};
            const available = {};
            const sold      = {};
            let grandTotal  = 0;
            let grandAvail  = 0;
            let grandSold   = 0;

            BRANCHES.forEach(b => {
                const items = data[b] || [];
                totals[b]    = items.length;
                available[b] = items.filter(l => l.status === 'Available').length;
                sold[b]      = items.filter(l => l.status === 'Sold').length;
                grandTotal  += totals[b];
                grandAvail  += available[b];
                grandSold   += sold[b];
            });

            // --- KPI cards ---
            const kpiRow = document.getElementById('kpiRow');
            if (kpiRow) {
                kpiRow.innerHTML = [
                    { label: 'Total Laptops',  value: grandTotal,  icon: '💻', cls: 'kpi-total' },
                    { label: 'Available',      value: grandAvail,  icon: '✅', cls: 'kpi-available' },
                    { label: 'Sold',           value: grandSold,   icon: '🏷️', cls: 'kpi-sold' },
                    { label: 'Other',          value: grandTotal - grandAvail - grandSold, icon: '📦', cls: 'kpi-other' },
                ].map(k => `
                    <div class="kpi-card ${k.cls}">
                        <span class="kpi-icon">${k.icon}</span>
                        <span class="kpi-value">${k.value}</span>
                        <span class="kpi-label">${k.label}</span>
                    </div>
                `).join('');
            }

            // badge totals
            const overallBadge = document.getElementById('overallBadge');
            const availableBadge = document.getElementById('availableBadge');
            const soldBadge = document.getElementById('soldBadge');
            if (overallBadge) overallBadge.textContent = grandTotal + ' total';
            if (availableBadge) availableBadge.textContent = grandAvail + ' units';
            if (soldBadge) soldBadge.textContent = grandSold + ' units';

            const chartDefaults = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.y} laptops`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' } } },
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1 } }
                }
            };

            function makeChart(id, labels, values, colors, label) {
                if (adminCharts[id]) adminCharts[id].destroy();
                const canvas = document.getElementById(id);
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                adminCharts[id] = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label,
                            data: values,
                            backgroundColor: colors.map(c => c.bar),
                            borderColor: colors.map(c => c.border),
                            borderWidth: 2,
                            borderRadius: 8,
                            borderSkipped: false,
                        }]
                    },
                    options: chartDefaults
                });
            }

            // --- overall bar chart (grouped) ---
            const chartOverall = document.getElementById('chartOverall');
            if (chartOverall) {
                if (adminCharts['chartOverall']) adminCharts['chartOverall'].destroy();
                const overallCtx = chartOverall.getContext('2d');
                adminCharts['chartOverall'] = new Chart(overallCtx, {
                    type: 'bar',
                    data: {
                        labels: BRANCHES,
                        datasets: [
                            {
                                label: 'Available',
                                data: BRANCHES.map(b => available[b]),
                                backgroundColor: 'rgba(16,185,129,0.8)',
                                borderColor: '#10B981',
                                borderWidth: 2,
                                borderRadius: 6,
                            },
                            {
                                label: 'Sold',
                                data: BRANCHES.map(b => sold[b]),
                                backgroundColor: 'rgba(239,68,68,0.8)',
                                borderColor: '#EF4444',
                                borderWidth: 2,
                                borderRadius: 6,
                            },
                            {
                                label: 'Other',
                                data: BRANCHES.map(b => totals[b] - available[b] - sold[b]),
                                backgroundColor: 'rgba(148,163,184,0.8)',
                                borderColor: '#94A3B8',
                                borderWidth: 2,
                                borderRadius: 6,
                            }
                        ]
                    },
                    options: {
                        ...chartDefaults,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 } }
                            },
                            tooltip: { mode: 'index', intersect: false }
                        }
                    }
                });
            }

            // --- available per branch ---
            makeChart('chartAvailable', BRANCHES,
                BRANCHES.map(b => available[b]),
                BRANCHES.map(b => ({ bar: 'rgba(16,185,129,0.8)', border: '#10B981' })),
                'Available'
            );

            // --- sold per branch ---
            makeChart('chartSold', BRANCHES,
                BRANCHES.map(b => sold[b]),
                BRANCHES.map(b => ({ bar: 'rgba(239,68,68,0.8)', border: '#EF4444' })),
                'Sold'
            );
        }

        function getDateRangeFilter(filterVal) {
            const now = new Date();
            switch (filterVal) {
                case 'this_month': {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    return d => d && new Date(d) >= start;
                }
                case 'last_month': {
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const end = new Date(now.getFullYear(), now.getMonth(), 1);
                    return d => d && new Date(d) >= start && new Date(d) < end;
                }
                case 'last_3_months': {
                    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    return d => d && new Date(d) >= start;
                }
                case 'last_6_months': {
                    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                    return d => d && new Date(d) >= start;
                }
                case 'this_year': {
                    const start = new Date(now.getFullYear(), 0, 1);
                    return d => d && new Date(d) >= start;
                }
                case 'all_time':
                default:
                    return () => true;
            }
        }

        function renderRevenueCharts(data) {
            const BRANCHES = ['Admin', 'Central', 'Amanfrom', 'East-Legon'];
            const COLORS = [
                { bg: '#64748B', hover: '#475569' },
                { bg: '#0066CC', hover: '#004999' },
                { bg: '#10B981', hover: '#059669' },
                { bg: '#F59E0B', hover: '#D97706' },
            ];

            const filterVal = document.getElementById('revDateFilter')?.value || 'all_time';
            const dateFilter = getDateRangeFilter(filterVal);

            function fmt(n) {
                if (n >= 1000000) return 'GHS ' + (n / 1000000).toFixed(1) + 'M';
                if (n >= 1000) return 'GHS ' + (n / 1000).toFixed(1) + 'K';
                return 'GHS ' + n.toLocaleString();
            }

            // Chart 1: total inventory value (all products regardless of status)
            const totalRevByBranch = BRANCHES.map(b =>
                (data[b] || []).reduce((sum, l) => sum + (parseFloat(l.price) || 0), 0)
            );
            const grandTotalRev = totalRevByBranch.reduce((a, b) => a + b, 0);

            // Chart 2: approved sold value filtered by approval date range
            const approvedRevByBranch = BRANCHES.map(b =>
                (data[b] || [])
                    .filter(l => {
                        if (l.status !== 'Sold' || !approvedIds.has(l._id || l.id)) return false;
                        if (!l.approvedAt) return filterVal === 'all_time';
                        return dateFilter(l.approvedAt);
                    })
                    .reduce((sum, l) => sum + (parseFloat(l.price) || 0), 0)
            );
            const grandApprovedRev = approvedRevByBranch.reduce((a, b) => a + b, 0);

            const periodLabels = {
                this_month: 'This month only',
                last_month: 'Last month only',
                last_3_months: 'Last 3 months',
                last_6_months: 'Last 6 months',
                this_year: 'This year',
                all_time: 'Sold & approved machines · all time'
            };
            const approvedSub = document.querySelector('.rev-chart-card:last-child .rev-chart-sub');
            if (approvedSub) approvedSub.textContent = periodLabels[filterVal] || '';

            // update KPI revenue cards
            const revTotalVal = document.getElementById('revTotalVal');
            const revApprovedVal = document.getElementById('revApprovedVal');
            if (revTotalVal) revTotalVal.textContent = fmt(grandTotalRev);
            if (revApprovedVal) revApprovedVal.textContent = fmt(grandApprovedRev);

            function drawDonut(canvasId, values, grandTotal, centerLabel) {
                if (adminCharts[canvasId]) adminCharts[canvasId].destroy();
                const canvas = document.getElementById(canvasId);
                if (!canvas) return;
                const ctx = canvas.getContext('2d');

                adminCharts[canvasId] = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: BRANCHES,
                        datasets: [{
                            data: values,
                            backgroundColor: COLORS.map(c => c.bg),
                            hoverBackgroundColor: COLORS.map(c => c.hover),
                            borderWidth: 3,
                            borderColor: '#ffffff',
                            hoverOffset: 8,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '68%',
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: ctx => {
                                        const val = ctx.parsed;
                                        const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : 0;
                                        return ` ${fmt(val)}  (${pct}%)`;
                                    }
                                }
                            }
                        }
                    },
                    plugins: [{
                        id: 'centerText',
                        afterDraw(chart) {
                            const chartArea = chart.chartArea;
                            if (!chartArea) return;
                            const cx = chartArea.left + chartArea.width / 2;
                            const cy = chartArea.top + chartArea.height / 2;

                            ctx.save();
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#64748B';
                            ctx.font = '600 11px DM Sans, system-ui, sans-serif';
                            ctx.fillText(centerLabel, cx, cy - 14);
                            ctx.fillStyle = '#0a1628';
                            ctx.font = 'bold 15px DM Sans, system-ui, sans-serif';
                            ctx.fillText(fmt(grandTotal), cx, cy + 4);
                            ctx.restore();
                        }
                    }]
                });
            }

            drawDonut('chartRevTotal', totalRevByBranch, grandTotalRev, 'TOTAL VALUE');
            drawDonut('chartRevApproved', approvedRevByBranch, grandApprovedRev, 'APPROVED SALES');

            // render legend rows
            ['revTotalLegend', 'revApprovedLegend'].forEach((legendId, ci) => {
                const vals = ci === 0 ? totalRevByBranch : approvedRevByBranch;
                const grand = ci === 0 ? grandTotalRev : grandApprovedRev;
                const el = document.getElementById(legendId);
                if (!el) return;
                el.innerHTML = BRANCHES.map((b, i) => {
                    const pct = grand > 0 ? ((vals[i] / grand) * 100).toFixed(1) : '0.0';
                    return `<div class="rev-legend-item">
                        <span class="rev-legend-dot" style="background:${COLORS[i].bg}"></span>
                        <div class="rev-legend-info">
                            <span class="rev-legend-branch">${b}</span>
                            <span class="rev-legend-amount">${fmt(vals[i])} <em>(${pct}%)</em></span>
                        </div>
                    </div>`;
                }).join('');
            });
        }

        async function createLaptop(laptopData) {
            const pin = localStorage.getItem("pin");
            if (!pin) {
                showNotification('Session expired. Please log in again.', 'error');
                return;
            }
            const saveBtn = document.getElementById('modalSave');
            setButtonLoading(saveBtn, true, 'saving...');
            try {
                const { dateSold, ...createData } = laptopData;
                createData.branch = currentBranch === 'Admin' ? 'Admin' : currentBranch;
                
                const res = await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'pin': pin },
                    body: JSON.stringify(createData)
                });
                if (!res.ok) throw new Error(`POST failed: ${res.status}`);

            const newLap = await res.json();
            modalOverlay.classList.remove('show');
            showNotification(`${newLap.serial || newLap.model || 'Laptop'} added to inventory`, 'success');
            modalHint.innerText = `✅ created via POST ${API_BASE}`;
            await fetchLaptops(); // re-fetches from the correct branch endpoint

            } catch (err) {
                modalHint.innerText = `❌ create error: ${err.message}`;
                showNotification(`Failed to save: ${err.message}`, 'error');
            } finally {
                setButtonLoading(saveBtn, false);
            }
        }

        async function updateLaptop(id, laptopData) {
            const pin = localStorage.getItem("pin");
            if (!pin) {
                showNotification('Session expired. Please log in again.', 'error');
                return;
            }
            
            // Restrict price updates to admin only
            if (userRole !== 'admin' && laptopData?.price !== undefined) {
                showNotification('Only admin can update product prices', 'warning');
                return;
            }
            
            const saveBtn = document.getElementById('modalSave');
            setButtonLoading(saveBtn, true, 'updating...');
            try {
                const previous = laptops.find(l => (l._id === id || l.id === id));
                const previousPrice = String(previous?.price ?? '').trim();
                const nextPrice = String(laptopData?.price ?? '').trim();
                const hasEmptyPrice = (value) => String(value ?? '').trim() === '';

                const res = await fetch(`${API_BASE}/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'pin': pin },
                    body: JSON.stringify(laptopData)
                });
                if (!res.ok) throw new Error(`PUT failed: ${res.status}`);
                const updated = await res.json();
                laptops = laptops.map(l => (l._id === id || l.id === id) ? updated : l);

                let propagatedCount = 0;

                // Auto-fill price only when editing an item that previously had no price.
                // Matching items that already have a price are never overwritten.
                if (previous && previousPrice !== nextPrice && hasEmptyPrice(previousPrice) && !hasEmptyPrice(nextPrice)) {
                    const allProductsRes = await fetch(API_BASE, {
                        headers: { 'pin': pin }
                    });
                    if (!allProductsRes.ok) throw new Error(`GET failed: ${allProductsRes.status}`);

                    const allProductsData = await allProductsRes.json();
                    const allProducts = Array.isArray(allProductsData)
                        ? allProductsData
                        : (allProductsData.data || []);

                    const matches = allProducts.filter(l => {
                        const recordId = l._id || l.id;
                        const itemPrice = String(l?.price ?? '').trim();
                        return recordId !== id && isSameProductInstance(l, previous) && hasEmptyPrice(itemPrice);
                    });

                    if (matches.length) {
                        const updateResults = await Promise.allSettled(
                            matches.map(async (item) => {
                                const itemId = item._id || item.id;
                                const payload = { ...toProductPayload(item), price: nextPrice };
                                const itemRes = await fetch(`${API_BASE}/${itemId}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'pin': pin },
                                    body: JSON.stringify(payload)
                                });
                                if (!itemRes.ok) throw new Error(`PUT failed: ${itemRes.status}`);
                                const itemUpdated = await itemRes.json();
                                return { itemId, itemUpdated };
                            })
                        );

                        updateResults.forEach((result) => {
                            if (result.status === 'fulfilled') {
                                propagatedCount += 1;
                                const { itemId, itemUpdated } = result.value;
                                laptops = laptops.map(l => (l._id === itemId || l.id === itemId) ? itemUpdated : l);
                            }
                        });
                    }
                }

                renderTable();
                modalHint.innerText = propagatedCount > 0
                    ? `✅ updated ${propagatedCount + 1} matching product instance(s)`
                    : `✅ updated via PUT ${API_BASE}/${id}`;
                modalOverlay.classList.remove('show');
                showNotification(`${updated.serial || updated.model || 'Laptop'} updated successfully`, 'success');
            } catch (err) {
                modalHint.innerText = `❌ update error: ${err.message}`;
                showNotification(`Failed to update: ${err.message}`, 'error');
            } finally {
                setButtonLoading(saveBtn, false);
            }
        }

        async function deleteLaptop(id) {
            const pin = localStorage.getItem("pin");
            if (!pin) {
                showNotification('Session expired. Please log in again.', 'error');
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/${id}`, {
                    method: 'DELETE',
                    headers: { 'pin': pin }
                });
                if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
                const deleted = laptops.find(l => l._id === id || l.id === id);
                laptops = laptops.filter(l => (l._id !== id && l.id !== id));
                renderTable();
                modalHint.innerText = `🗑 deleted via DELETE ${API_BASE}/${id}`;
                showNotification(`${deleted?.serial || 'Laptop'} removed from inventory`, 'success');
            } catch (err) {
                modalHint.innerText = `❌ delete error: ${err.message}`;
                showNotification(`Failed to delete: ${err.message}`, 'error');
                throw err;
            }
        }

        // ---------- modal flows ----------
        function openEditModal(id) {
            const laptop = laptops.find(l => (l._id === id || l.id === id));
            if (!laptop) return;
            editingId = id;
            modalTitle.innerText = '✏️ edit laptop';
            openBulkBtn.style.display = 'none';
            buildEditModalForm(laptop);
            statusRuleHint.innerHTML = '✨ you can switch between <strong>Available</strong> or <strong>Sold</strong>';
            modalOverlay.classList.add('show');
        }

        function openCreateModal() {
            editingId = null;
            modalTitle.innerText = '➕ add laptop';
            openBulkBtn.style.display = 'inline-flex';
            buildCreateModalForm({ 
                serial: '', 
                brand: 'Dell', 
                model: '', 
                processor: 'i5',
                gen: '10th Gen', 
                ram: '8GB', 
                storage: '256GB', 
                purchaseDate: '', 
                status: 'Available' 
            });
            statusRuleHint.innerHTML = '✨ default status: <strong>Available</strong> (date sold not needed for new products)';
            modalOverlay.classList.add('show');
        }

        function buildModalValues(isEdit = false) {
            const values = {
                serial: document.getElementById('fSerial')?.value.trim(),
                brand: document.getElementById('fBrand')?.value,
                model: document.getElementById('fModel')?.value.trim(),
                processor: document.getElementById('fProcessor')?.value,
                gen: document.getElementById('fGen')?.value,
                ram: document.getElementById('fRam')?.value,
                storage: document.getElementById('fStorage')?.value,
                purchaseDate: document.getElementById('fPurDate')?.value,
                status: document.getElementById('fStatus')?.value === '__custom__'
                    ? (document.getElementById('fStatusCustom')?.value?.trim() || 'Available')
                    : document.getElementById('fStatus')?.value,
            };
            
            // Only include price if admin is editing
            if (isEdit && userRole === 'admin') {
                values.price = document.getElementById('fPrice')?.value.trim();
            }
            
            if (isEdit) {
                const dateSoldInput = document.getElementById('fDateSold');
                if (dateSoldInput) {
                    values.dateSold = dateSoldInput.value || null;
                }
                values.customerNumber = document.getElementById('fCustomerNumber')?.value?.trim() || '';
            }
            
            return values;
        }

        function buildCreateModalForm(values) {
            modalForm.innerHTML = `
                <div class="field"><label>Serial *</label><input id="fSerial" value="${values.serial || ''}" placeholder="SN-1234"></div>
                <div class="field"><label>Brand</label><select id="fBrand">${BRAND_OPTIONS.map(b => `<option ${values.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
                <div class="field"><label>Model</label><input id="fModel" value="${values.model || ''}"></div>
                <div class="field"><label>Processor</label>
                <select id="fProcessor">
                    <option value="">— not applicable —</option>
                    ${PROCESSOR_OPTIONS.map(p => `<option value="${p}" ${values.processor === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>Gen</label>
                <select id="fGen">
                    <option value="">— not applicable —</option>
                    ${GEN_OPTIONS.map(g => `<option value="${g}" ${values.gen === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>RAM</label>
                <select id="fRam">
                    <option value="">— not applicable —</option>
                    ${RAM_OPTIONS.map(r => `<option value="${r}" ${values.ram === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>Storage</label>
                <select id="fStorage">
                    <option value="">— not applicable —</option>
                    ${STORAGE_OPTIONS.map(s => `<option value="${s}" ${values.storage === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                </div>
                
                <div class="field"><label>Status</label>
                    <select id="fStatus" onchange="const c=document.getElementById('fStatusCustom');c.style.display=this.value==='__custom__'?'block':'none';if(this.value!=='__custom__')c.value='';">
                        <option value="Available" ${values.status === 'Available' || !values.status ? 'selected' : ''}>Available</option>
                        <option value="Sold"      ${values.status === 'Sold'      ? 'selected' : ''}>Sold</option>
                        <option value="N/A"       ${values.status === 'N/A'       ? 'selected' : ''}>N/A</option>
                        <option value="__custom__">Taken Away...</option>
                    </select>
                    <input type="text" id="fStatusCustom" class="form-input" placeholder="e.g. Taken to HQ" style="margin-top:0.5rem;display:none">
                </div>
                `;
        }

        function buildEditModalForm(values) {
            const priceField = userRole === 'admin' 
                ? `<div class="field"><label>Price (GHS)</label><input id="fPrice" type="number" value="${values.price || ''}" placeholder="e.g., 2500"></div>`
                : '';
            
            modalForm.innerHTML = `
                <div class="field"><label>Serial *</label><input id="fSerial" value="${values.serial || ''}" placeholder="SN-1234"></div>
                <div class="field"><label>Brand</label><select id="fBrand">${BRAND_OPTIONS.map(b => `<option ${values.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
                <div class="field"><label>Model</label><input id="fModel" value="${values.model || ''}"></div>
                <div class="field"><label>Processor</label>
                <select id="fProcessor">
                    <option value="">— not applicable —</option>
                    ${PROCESSOR_OPTIONS.map(p => `<option value="${p}" ${values.processor === p ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>Gen</label>
                <select id="fGen">
                    <option value="">— not applicable —</option>
                    ${GEN_OPTIONS.map(g => `<option value="${g}" ${values.gen === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>RAM</label>
                <select id="fRam">
                    <option value="">— not applicable —</option>
                    ${RAM_OPTIONS.map(r => `<option value="${r}" ${values.ram === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>Storage</label>
                <select id="fStorage">
                    <option value="">— not applicable —</option>
                    ${STORAGE_OPTIONS.map(s => `<option value="${s}" ${values.storage === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                </div>
                <div class="field"><label>Purchase date</label><input id="fPurDate" type="date" value="${values.purchaseDate ? values.purchaseDate.slice(0,10) : ''}"></div>
                <div class="field"><label>Status</label>
                    <select id="fStatus" onchange="const c=document.getElementById('fStatusCustom');c.style.display=this.value==='__custom__'?'block':'none';if(this.value!=='__custom__')c.value='';">
                        <option value="Available" ${values.status === 'Available' ? 'selected' : ''}>Available</option>
                        <option value="Sold"      ${values.status === 'Sold'      ? 'selected' : ''}>Sold</option>
                        <option value="N/A"       ${values.status === 'N/A'       ? 'selected' : ''}>N/A</option>
                        <option value="__custom__" ${!['Available','Sold','N/A'].includes(values.status) && values.status ? 'selected' : ''}>Taken Away...</option>
                    </select>
                    <input type="text" id="fStatusCustom" class="form-input" placeholder="e.g. Taken to HQ"
                        style="margin-top:0.5rem;display:${!['Available','Sold','N/A'].includes(values.status) && values.status ? 'block' : 'none'}"
                        value="${!['Available','Sold','N/A'].includes(values.status) && values.status ? values.status : ''}">
                </div>
                <div class="field">
                    <label>Customer Number <span style="font-weight:400;color:#94a3b8;font-size:0.78rem;text-transform:none">(optional)</span></label>
                    <input type="text" id="fCustomerNumber" class="form-input" placeholder="e.g. CUS-00123" value="${values.customerNumber || ''}">
                </div>
                ${priceField}
            `;
        }

        function buildBulkRows() {
            let rowsHtml = '';
            for (let i = 1; i <= BULK_LIMIT; i++) {
                rowsHtml += `
                    <div class="bulk-row" data-row="${i}">
                        <div class="bulk-row-head">Product ${i}</div>
                        <div class="bulk-row-grid">
                            <input class="bulk-serial" placeholder="Serial * (e.g. SN-${1000 + i})">
                            <select class="bulk-brand">${BRAND_OPTIONS.map(b => `<option value="${b}">${b}</option>`).join('')}</select>
                            <input class="bulk-model" placeholder="Model">
                            <select class="bulk-processor">${PROCESSOR_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
                            <select class="bulk-gen">${GEN_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('')}</select>
                            <select class="bulk-ram">${RAM_OPTIONS.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
                            <select class="bulk-storage">${STORAGE_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                            <select class="bulk-status">${STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                        </div>
                    </div>
                `;
            }
            bulkRows.innerHTML = rowsHtml;
        }

        function openBulkModal() {
            if (editingId !== null) return;
            buildBulkRows();
            bulkModalHint.innerText = `⚙️ bulk create uses POST ${API_BASE}/bulk`;
            modalOverlay.classList.remove('show');
            bulkModal.classList.add('show');
        }

        function collectBulkPayloads() {
            const rows = bulkRows.querySelectorAll('.bulk-row');
            const items = [];
            const invalidRows = [];

            rows.forEach((row, index) => {
                const serial = row.querySelector('.bulk-serial')?.value.trim() || '';
                const model = row.querySelector('.bulk-model')?.value.trim() || '';
                const hasAnyData = Boolean(serial || model);

                if (!hasAnyData) return;

                if (!serial) {
                    invalidRows.push(index + 1);
                    return;
                }

                items.push({
                    serial,
                    brand: row.querySelector('.bulk-brand')?.value || 'Dell',
                    model,
                    processor: row.querySelector('.bulk-processor')?.value || 'i5',
                    gen: row.querySelector('.bulk-gen')?.value || '10th Gen',
                    ram: row.querySelector('.bulk-ram')?.value || '8GB',
                    storage: row.querySelector('.bulk-storage')?.value || '256GB',
                    status: row.querySelector('.bulk-status')?.value || 'Available'
                });
            });

            return { items, invalidRows };
        }

        async function createBulkLaptops(payloads) {
            const pin = localStorage.getItem("pin");
            if (!pin) {
                showNotification('Session expired. Please log in again.', 'error');
                return;
            }
            setButtonLoading(bulkSaveBtn, true, 'saving products...');
            try {
                const res = await fetch(`${API_BASE}/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'pin': pin },
                    body: JSON.stringify({ products: payloads.map(product => ({ ...product, branch: currentBranch === 'Admin' ? 'Admin' : currentBranch })) })
                });
                
                const data = await res.json();
                
                if (res.status === 207 || res.ok) {
                    if (data.results && data.results.successful) {
                        await fetchLaptops();
                    }
                    
                    if (data.results.successful.length === payloads.length) {
                        bulkModal.classList.remove('show');
                        showNotification(`${data.results.successful.length} products added successfully!`, 'success');
                    } else {
                        const successCount = data.results.successful.length;
                        const failCount = data.results.failed.length;
                        bulkModalHint.innerText = `⚠️ saved ${successCount} products, ${failCount} failed`;
                        showNotification(`Saved ${successCount}, failed ${failCount}. Check console for details.`, 'warning');
                        console.warn('Bulk save failures:', data.results.failed);
                    }
                    
                    modalHint.innerText = `✅ bulk create: ${data.results.successful.length} products added`;
                } else {
                    throw new Error(data.message || 'Bulk creation failed');
                }
            } catch (err) {
                bulkModalHint.innerText = `❌ bulk create error: ${err.message}`;
                showNotification(`Bulk save failed: ${err.message}`, 'error');
            } finally {
                setButtonLoading(bulkSaveBtn, false);
            }
        }

        // ---------- Event Listeners ----------
        const modalSaveBtn = document.getElementById('modalSave');
        if (modalSaveBtn) modalSaveBtn.addEventListener('click', () => {
            const isEdit = editingId !== null;
            const payload = buildModalValues(isEdit);
            
            if (!payload.serial) { 
                showNotification('Serial number is required', 'warning');
                return; 
            }

            if (isEdit) {
                updateLaptop(editingId, payload);
            } else {
                createLaptop(payload);
            }
        });

        const modalCancelBtn = document.getElementById('modalCancel');
        if (modalCancelBtn) modalCancelBtn.addEventListener('click', () => {
            if (modalOverlay) modalOverlay.classList.remove('show');
        });
        if (modalBack) modalBack.addEventListener('click', () => modalOverlay.classList.remove('show'));
        
        window.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('show');
        });

        if (openBulkBtn) openBulkBtn.addEventListener('click', openBulkModal);
        
        const bulkCancelBtn = document.getElementById('bulkCancel');
        if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', () => {
            if (bulkModal) bulkModal.classList.remove('show');
        });
        if (bulkBack) bulkBack.addEventListener('click', () => {
            bulkModal.classList.remove('show');
            // reopen the main modal when back is pressed (if it was the origin)
            modalOverlay.classList.add('show');
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === bulkModal) bulkModal.classList.remove('show');
        });
        
        if (bulkSaveBtn) bulkSaveBtn.addEventListener('click', () => {
            const { items, invalidRows } = collectBulkPayloads();

            if (!items.length && !invalidRows.length) {
                showNotification('Enter at least one product row to save', 'warning');
                return;
            }

            if (invalidRows.length) {
                showNotification(`Serial number is required for row${invalidRows.length > 1 ? 's' : ''} ${invalidRows.join(', ')}`, 'warning');
                return;
            }

            createBulkLaptops(items);
        });

        // confirm delete modal
        const confirmModal = document.getElementById('confirmModal');

        function deleteLaptopFlow(id) {
            pendingDeleteId = id;
            confirmModal.classList.add('show');
        }

        const confirmCancelBtn = document.getElementById('confirmCancel');
        if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', () => {
            pendingDeleteId = null;
            if (confirmModal) confirmModal.classList.remove('show');
        });
        if (confirmBack) confirmBack.addEventListener('click', () => {
            pendingDeleteId = null;
            confirmModal.classList.remove('show');
        });

        window.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                pendingDeleteId = null;
                confirmModal.classList.remove('show');
            }
        });

        const confirmDeleteBtn = document.getElementById('confirmDelete');
        if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', async () => {
            if (!pendingDeleteId) return;
            const deleteBtn = confirmDeleteBtn;
            setButtonLoading(deleteBtn, true, 'deleting...');
            try {
                await deleteLaptop(pendingDeleteId);
            } finally {
                setButtonLoading(deleteBtn, false);
                pendingDeleteId = null;
                confirmModal.classList.remove('show');
            }
        });

        const refreshBtnEl = document.getElementById('refreshBtn');
        if (refreshBtnEl) refreshBtnEl.addEventListener('click', fetchLaptops);
        const addNewBtnEl = document.getElementById('addNewBtn');
        if (addNewBtnEl) addNewBtnEl.addEventListener('click', openCreateModal);

        // ---------- LOGOUT ----------
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                try {
                    localStorage.removeItem('pin');
                    localStorage.removeItem('user');
                    showNotification('Logged out. Reloading...', 'info');
                } catch (e) {
                    console.error('Error clearing storage on logout', e);
                }
                setTimeout(() => location.reload(), 300);
            });
        }

        if (searchInput) searchInput.addEventListener('input', renderTable);
        if (statusFilter) statusFilter.addEventListener('change', renderTable);
        if (dateSoldFilter) dateSoldFilter.addEventListener('change', renderTable);

        if(savedUser && savedPin){
            updateBranchUI();
            if (!currentBranch) {
                console.warn("Branch not set yet");
                return;
            }
            if (userRole === 'admin') {
                showAdminDashboard();
            } else {
                fetchLaptops();
            }
        }
    })();