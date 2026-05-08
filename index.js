(function() {
        // ---------- API endpoint ----------
        const API_BASE = 'https://cictech-inventory-2se4.vercel.app/products';
        const BRANCH_API = 'https://cictech-inventory-2se4.vercel.app/products/branch/';
        const BULK_LIMIT = 15;

        let currentUser = null;
        let currentBranch = null;
        let userRole = null;

        const BRAND_OPTIONS = ['Dell','HP','Lenovo','Apple','Asus','Acer','Samsung','MSI','Microsoft','LG','Toshiba','Huawei'];
        const RAM_OPTIONS = ['4GB','8GB','16GB','32GB','64GB'];
        const PROCESSOR_OPTIONS = ['i3','i5','i7','i9',"AMD"];
        const GEN_OPTIONS = ['4th Gen', '5th Gen', '6th Gen', '7th Gen', '8th Gen', '9th Gen', '10th Gen', '11th Gen', '12th Gen', 'Ryzen 3','Ryzen 5','Ryzen 7'];
        const STORAGE_OPTIONS = ['128GB','256GB','320GB','500GB','512GB','720GB','1TB','2TB'];
        const STATUS_OPTIONS = ['Available', 'Sold'];

        // internal state
        let laptops = [];
        let filteredLaptops = [];
        let editingId = null;
        let pendingDeleteId = null;

        function normalizeText(value) {
            return String(value || '').trim().toLowerCase();
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
        const ramFilter = document.getElementById('ramFilter');
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
        document.getElementById("loginBtn").addEventListener("click", login);

        // ---------- render table ----------
        function renderTable() {
            const searchTerm = searchInput.value.toLowerCase();
            const statusVal = statusFilter.value;
            const ramVal = ramFilter.value;

            if (laptops === null) {
                tbody.innerHTML = `<tr><td colspan="11" class="loading-container"><div class="spinner"></div> Connecting to database...</td></tr>`;
                return;
            }

            if (!laptops.length) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="11">📭 inventory is empty — add your first laptop</td></tr>`;
                return;
            }

            // ✅ filter FIRST, then check if results are empty
            filteredLaptops = laptops.filter(lap => {
                const matchesSearch = (lap.serial?.toLowerCase() || '').includes(searchTerm) ||
                                    (lap.brand?.toLowerCase() || '').includes(searchTerm) ||
                                    (lap.model?.toLowerCase() || '').includes(searchTerm);
                const matchesStatus = statusVal ? lap.status === statusVal : true;
                const matchesRam = ramVal ? lap.ram === ramVal : true;
                return matchesSearch && matchesStatus && matchesRam;
            });

            if (filteredLaptops.length === 0) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="11">🔍 no matching laptops — adjust filters</td></tr>`;
                return;
            }

           
            let html = '';
            filteredLaptops.forEach(lap => {
                const statusClass = (lap.status || 'Available').toLowerCase();
                html += `<tr>
                    <td>${lap.brand || ''}</td>
                    <td>${lap.model || ''}</td>
                    <td>${lap.processor || ''}</td>
                    <td>${lap.gen || ''}</td>
                    <td>${lap.ram || ''}</td>
                    <td>${lap.storage || ''}</td>
                    <td>${lap.serial || ''}</td>
                    <td>${lap.price ? 'GHS ' + lap.price : '-'}</td>
                    <td>${lap.purchaseDate ? lap.purchaseDate.slice(0,10) : ''}</td>
                    <td><span class="status ${statusClass}"><span class="status-dot"></span> ${lap.status || 'Available'}</span></td>
                    <td>
                        <div class="row-actions">
                            <button class="icon-btn edit-btn" data-id="${lap._id || lap.id}">✎</button>
                            <button class="icon-btn delete-btn" data-id="${lap._id || lap.id}">🗑</button>
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
                fetchLaptops();
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
        }

        // if user is already logged in, update UI and fetch data
        function updateBranchUI(){
            // Show user badge
            const badge = document.getElementById('userBadge');
            const badgeLabel = document.getElementById('userBadgeLabel');
            if (badge && badgeLabel && currentUser) {
                badge.style.display = 'inline-flex';
                badgeLabel.textContent = `${currentUser.role} · ${currentUser.branch}`;
            }

            document.querySelectorAll(".tab").forEach(tab=>{
                if(userRole !== "admin" && tab.dataset.branch !== currentBranch){
                    tab.style.opacity = "0.6";
                }
            });
        }

                // ---------- branch tabs ----------
  /*      document.querySelectorAll(".tab").forEach(btn => {
            btn.addEventListener("click", () => {
                if (userRole !== "admin" && btn.dataset.branch !== currentBranch) {
                    showNotification("You can only view your own branch", "warning");
                    return;
                }
                document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
                btn.classList.add("active");
                currentBranch = btn.dataset.branch;
                fetchLaptops();
            });
        });
*/
            document.querySelectorAll(".tab").forEach(btn=>{
            btn.addEventListener("click",()=>{
                document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
                btn.classList.add("active");

                currentBranch = btn.dataset.branch;

                fetchLaptops();
            });
        });

        // ---------- API calls ----------
        async function fetchLaptops() {
            const refreshBtn = document.getElementById('refreshBtn');
            setButtonLoading(refreshBtn, true, 'syncing...');
            try {
                tbody.innerHTML = `<tr><td colspan="11" class="loading-container"><div class="spinner"></div> Loading inventory...</td></tr>`;
                
                const res = await fetch(BRANCH_API + currentBranch,{
                    headers:{
                        "pin": localStorage.getItem("pin")
                    }
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
            const saveBtn = document.getElementById('modalSave');
            setButtonLoading(saveBtn, true, 'updating...');
            try {
                const previous = laptops.find(l => (l._id === id || l.id === id));
                const previousPrice = String(previous?.price ?? '').trim();
                const nextPrice = String(laptopData?.price ?? '').trim();

                const res = await fetch(`${API_BASE}/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'pin': pin },
                    body: JSON.stringify(laptopData)
                });
                if (!res.ok) throw new Error(`PUT failed: ${res.status}`);
                const updated = await res.json();
                laptops = laptops.map(l => (l._id === id || l.id === id) ? updated : l);

                let propagatedCount = 0;

                // If price changed, push the same price to all matching product instances in this branch.
                if (previous && previousPrice !== nextPrice) {
                    const matches = laptops.filter(l => {
                        const recordId = l._id || l.id;
                        return recordId !== id && isSameProductInstance(l, previous);
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
                status: document.getElementById('fStatus')?.value,
                price: document.getElementById('fPrice')?.value.trim(),
            };
            
            if (isEdit) {
                const dateSoldInput = document.getElementById('fDateSold');
                if (dateSoldInput) {
                    values.dateSold = dateSoldInput.value || null;
                }
            }
            
            return values;
        }

        function buildCreateModalForm(values) {
            modalForm.innerHTML = `
                <div class="field"><label>Serial *</label><input id="fSerial" value="${values.serial || ''}" placeholder="SN-1234"></div>
                <div class="field"><label>Brand</label><select id="fBrand">${BRAND_OPTIONS.map(b => `<option ${values.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
                <div class="field"><label>Model</label><input id="fModel" value="${values.model || ''}"></div>
                <div class="field"><label>Processor</label><select id="fProcessor">${PROCESSOR_OPTIONS.map(p => `<option ${values.processor === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                <div class="field"><label>Gen</label><select id="fGen">${GEN_OPTIONS.map(g => `<option ${values.gen === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
                <div class="field"><label>RAM</label><select id="fRam">${RAM_OPTIONS.map(r => `<option ${values.ram === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                <div class="field"><label>Storage</label><select id="fStorage">${STORAGE_OPTIONS.map(s => `<option ${values.storage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
                <div class="field"><label>Status</label><select id="fStatus">${STATUS_OPTIONS.map(s => `<option ${values.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            `;
        }

        function buildEditModalForm(values) {
            modalForm.innerHTML = `
                <div class="field"><label>Serial *</label><input id="fSerial" value="${values.serial || ''}" placeholder="SN-1234"></div>
                <div class="field"><label>Brand</label><select id="fBrand">${BRAND_OPTIONS.map(b => `<option ${values.brand === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
                <div class="field"><label>Model</label><input id="fModel" value="${values.model || ''}"></div>
                <div class="field"><label>Processor</label><select id="fProcessor">${PROCESSOR_OPTIONS.map(p => `<option ${values.processor === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                <div class="field"><label>Gen</label><select id="fGen">${GEN_OPTIONS.map(g => `<option ${values.gen === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
                <div class="field"><label>RAM</label><select id="fRam">${RAM_OPTIONS.map(r => `<option ${values.ram === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                <div class="field"><label>Storage</label><select id="fStorage">${STORAGE_OPTIONS.map(s => `<option ${values.storage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
                <div class="field"><label>Purchase date</label><input id="fPurDate" type="date" value="${values.purchaseDate ? values.purchaseDate.slice(0,10) : ''}"></div>
                <div class="field"><label>Status</label><select id="fStatus">${STATUS_OPTIONS.map(s => `<option ${values.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
                <div class="field"><label>Price (GHS)</label><input id="fPrice" type="number" value="${values.price || ''}" placeholder="e.g., 2500"></div>
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
                    body: JSON.stringify({ products: payloads })
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
        document.getElementById('modalSave').addEventListener('click', () => {
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

        document.getElementById('modalCancel').addEventListener('click', () => {
            modalOverlay.classList.remove('show');
        });
        if (modalBack) modalBack.addEventListener('click', () => modalOverlay.classList.remove('show'));
        
        window.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('show');
        });

        openBulkBtn.addEventListener('click', openBulkModal);
        
        document.getElementById('bulkCancel').addEventListener('click', () => {
            bulkModal.classList.remove('show');
        });
        if (bulkBack) bulkBack.addEventListener('click', () => {
            bulkModal.classList.remove('show');
            // reopen the main modal when back is pressed (if it was the origin)
            modalOverlay.classList.add('show');
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === bulkModal) bulkModal.classList.remove('show');
        });
        
        bulkSaveBtn.addEventListener('click', () => {
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

        document.getElementById('confirmCancel').addEventListener('click', () => {
            pendingDeleteId = null;
            confirmModal.classList.remove('show');
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

        document.getElementById('confirmDelete').addEventListener('click', async () => {
            if (!pendingDeleteId) return;
            const deleteBtn = document.getElementById('confirmDelete');
            setButtonLoading(deleteBtn, true, 'deleting...');
            try {
                await deleteLaptop(pendingDeleteId);
            } finally {
                setButtonLoading(deleteBtn, false);
                pendingDeleteId = null;
                confirmModal.classList.remove('show');
            }
        });

        document.getElementById('refreshBtn').addEventListener('click', fetchLaptops);
        document.getElementById('addNewBtn').addEventListener('click', openCreateModal);

        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('pin');
            localStorage.removeItem('user');
            window.location.reload();
        });

        // ---------- LOGOUT ----------
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                try {
                    localStorage.clear();
                    showNotification('Logged out. Reloading...', 'info');
                } catch (e) {
                    console.error('Error clearing storage on logout', e);
                }
                setTimeout(() => location.reload(), 300);
            });
        }

        searchInput.addEventListener('input', renderTable);
        statusFilter.addEventListener('change', renderTable);
        ramFilter.addEventListener('change', renderTable);

        if(savedUser && savedPin){
            updateBranchUI();
            if (!currentBranch) {
    console.warn("Branch not set yet");
    return;
}
            fetchLaptops(); // only after restoring session
        }
    })();