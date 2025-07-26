// API Helper
async function apiRequest(path, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('http://localhost:3000' + path, opts);
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
}

// Data holders
let products = [];
let stockMovements = [];
let sales = [];
let settings = {};
let currentSection = 'dashboard';
let categories = [
    "Solar Panels",
    "Inverters",
    "Batteries",
    "Mounting",
    "Accessories"
];
let salesForecast = []; // Holds forecast data
let reportPeriodType = 'all'; // 'day', 'week', 'month', 'year', 'all'
let reportPeriodValue = null; // e.g. '2025-07-21' for day, '2025-W30' for week, '2025-07' for month, '2025' for year

async function loadAllData() {
    products = await apiRequest('/products');
    stockMovements = await apiRequest('/movements');
    sales = await apiRequest('/sales');
    settings = await apiRequest('/settings');
    syncCategoriesFromProducts();
    // Fetch sales forecast
    try {
        salesForecast = await apiRequest('/sales/forecast');
        // console.log('Sales forecast:', salesForecast); // Debug: check forecast data
    } catch (e) {
        salesForecast = [];
        // console.error('Forecast fetch error:', e);
    }
}

// Helper to update category dropdown in product modal
function updateCategoryDropdown(selectedCategory = null) {
    const categorySelect = document.getElementById('product-category');
    if (!categorySelect) return;
    categorySelect.innerHTML = '';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        if (selectedCategory && selectedCategory === cat) option.selected = true;
        categorySelect.appendChild(option);
    });
    // Add option for new category
    const newCatOption = document.createElement('option');
    newCatOption.value = '__add_new__';
    newCatOption.textContent = 'Add new category...';
    categorySelect.appendChild(newCatOption);
}

// Helper to update category filter dropdown (right of search bar)
function updateCategoryFilterDropdown() {
    const filterSelect = document.getElementById('product-category-filter');
    if (!filterSelect) return;
    filterSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Categories';
    filterSelect.appendChild(allOption);
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        filterSelect.appendChild(option);
    });
}

// Helper to sync categories from products
function syncCategoriesFromProducts() {
    // Get all unique categories from products
    const productCategories = Array.from(new Set(products.map(p => p.category)));
    // Merge with existing categories, preserving order and uniqueness
    categories = Array.from(new Set([...categories, ...productCategories]));
    updateCategoryFilterDropdown();
}

// Listen for category change to add new category
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'product-category' && e.target.value === '__add_new__') {
        const newCat = prompt('Enter new category name:');
        if (newCat && !categories.includes(newCat)) {
            categories.push(newCat);
            updateCategoryDropdown(newCat);
            updateCategoryFilterDropdown();
        } else {
            updateCategoryDropdown();
            updateCategoryFilterDropdown();
        }
    }
});

// DOM Ready
document.addEventListener('DOMContentLoaded', async function() {
    await loadAllData();
    // Restore last section or default to dashboard
    const lastSection = localStorage.getItem('currentSection') || 'dashboard';
    showSection(lastSection);
    loadSettings();
    initCharts();
    updateCategoryDropdown();
    updateCategoryFilterDropdown();
    // Force dashboard/chart update after all data is loaded
    renderDashboard();
    updateCharts();
});

// Navigation
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Deactivate all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected section
    document.getElementById(sectionId).classList.add('active');

    // Activate clicked nav item
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // Activate nav item by id if page is refreshed
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('onclick')?.includes(sectionId)) {
                item.classList.add('active');
            }
        });
    }

    // Save current section
    currentSection = sectionId;
    localStorage.setItem('currentSection', sectionId);

    // Refresh data if needed
    if (sectionId === 'dashboard') {
        // Ensure charts are initialized before rendering dashboard
        if (!window.salesChart || !window.categoryChart) {
            initCharts();
        }
        renderDashboard();
    } else if (sectionId === 'products') {
        renderProducts();
    } else if (sectionId === 'inventory') {
        renderStockMovements();
    } else if (sectionId === 'sales') {
        renderSales();
    }
}

// Function to reload the current active section
function reloadCurrentSection() {
    if (currentSection) {
        showSection(currentSection);
    }
}

// Dashboard Functions
function renderDashboard() {
    // Update metrics
    document.getElementById('total-products').textContent = products.length;
    
    const lowStockItems = products.filter(p => p.stock <= (p.lowStockThreshold !== undefined ? p.lowStockThreshold : settings.lowStockThreshold)).length;
    document.getElementById('low-stock').textContent = lowStockItems;

        // Calculate sales from midnight to midnight (12AM to 12AM)
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        const todaySales = sales.filter(s => {
            const saleDate = new Date(s.date);
            return saleDate >= todayStart && saleDate < todayEnd;
        }).reduce((sum, sale) => sum + sale.total, 0);
            document.getElementById('today-sales').textContent = settings.currency + todaySales.toFixed(2);
            
    const inventoryValue = products.reduce((sum, product) => sum + (product.stock * product.cost), 0);
    document.getElementById('inventory-value').textContent = settings.currency + inventoryValue.toFixed(2);
    
    // Update low stock table
    const lowStockTable = document.getElementById('low-stock-table');
    lowStockTable.innerHTML = '';
    
    products.filter(p => p.stock <= (p.lowStockThreshold !== undefined ? p.lowStockThreshold : settings.lowStockThreshold)).forEach(product => {
        const lowTh = (product.lowStockThreshold !== undefined ? product.lowStockThreshold : settings.lowStockThreshold);
        const critTh = (product.criticalStockThreshold !== undefined ? product.criticalStockThreshold : settings.criticalStockThreshold);
        const status = product.stock <= critTh ? 
            '<span class="badge badge-danger">Critical</span>' : 
            '<span class="badge badge-warning">Low</span>';
        const row = lowStockTable.insertRow();
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${product.stock}</td>
            <td>${status}</td>
        `;
    });
    
    if (lowStockTable.rows.length === 0) {
        lowStockTable.innerHTML = '<tr><td colspan="4" class="text-center">No low stock items</td></tr>';
    }
    
    // Update charts
    // Ensure charts are initialized before updating
    if (window.salesChart && window.categoryChart) {
        updateCharts();
    } else {
        initCharts();
    }
}

function initCharts() {
    // Destroy previous charts if they exist
    if (window.salesChart) {
        window.salesChart.destroy();
    }
    if (window.categoryChart) {
        window.categoryChart.destroy();
    }
    // Sales chart
    const salesCtx = document.getElementById('sales-chart');
    window.salesChart = new Chart(salesCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Actual Sales',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.1)',
                tension: 0.1,
                pointRadius: 3,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: {
                        color: function(context) {
                            return context.tick && context.tick.major ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)';
                        }
                    },
                    ticks: {
                        font: {
                            weight: function(context) {
                                return context.tick && context.tick.major ? 'bold' : 'normal';
                            }
                        }
                    }
                }
            }
        }
    });
    
    // Category chart
    window.categoryChart = new Chart(
        document.getElementById('category-chart'),
        {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#3b82f6',
                        '#ef4444',
                        '#10b981',
                        '#f59e0b',
                        '#8b5cf6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        }
    );
    
    updateCharts();
}

function updateCharts() {
    // --- Date generation ---
    const actualDays = 7;
    const forecastDays = 7;
    const today = new Date();

    // Build actualDates: last 7 days including today (use UTC)
    const actualDates = [];
    for (let i = actualDays - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - i));
        actualDates.push(d.toISOString().split('T')[0]);
    }
    // Build forecastDates: next 7 days (starting tomorrow, use UTC)
    const forecastDates = [];
    for (let i = 1; i <= forecastDays; i++) {
        const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + i));
        forecastDates.push(d.toISOString().split('T')[0]);
    }

    // Format date for chart label (DD/MM)
    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // --- Data calculation ---
    // Actual sales for each actualDates
    const salesData = actualDates.map(date => {
        return sales.filter(s => {
            const d = typeof s.date === 'string' ? s.date.split('T')[0] : '';
            return d === date;
        }).reduce((sum, sale) => sum + sale.total, 0);
    });

    // Forecast sales for each forecastDates
    let forecastMap = {};
    if (salesForecast && Array.isArray(salesForecast) && salesForecast.length) {
        salesForecast.forEach((f, idx) => {
            // Ensure date is in 'YYYY-MM-DD' format
            const dateKey = (typeof f.date === 'string') ? f.date.split('T')[0] : f.date;
            forecastMap[dateKey] = f.forecast;
        });
    }
    const forecastData = forecastDates.map(date => {
        const dateKey = (typeof date === 'string') ? date.split('T')[0] : date;
        return forecastMap[dateKey] ?? null;
    });

    // Debug logs for troubleshooting forecast display
    // console.log('forecastDates:', forecastDates);
    // console.log('forecastData:', forecastData);
    // console.log('Forecast dataset:', [
    //     ...Array(actualDays - 1).fill(null),
    //     forecastData[0],
    //     ...forecastData.slice(1)
    // ]);

    // Find today's index (last actual date)
    const todayIndex = actualDays - 1;

    // Prepare datasets - no overlap
    const datasets = [
        {
            label: 'Actual Sales',
            data: [
                ...salesData, // 7 days
                ...Array(forecastDays).fill(null) // 7 nulls
            ],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.1)',
            tension: 0.1,
            pointRadius: 3,
            fill: false
        },
        ...(forecastData.length ? [{
            label: 'Forecast',
            data: [
                ...Array(actualDays).fill(null), // 7 nulls
                ...forecastData // 7 forecast values
            ],
            borderColor: '#f59e0b',
            borderDash: [5, 5],
            backgroundColor: 'rgba(245,158,11,0.1)',
            tension: 0.1,
            pointRadius: 3,
            fill: false
        }] : [])
    ];

    // Update chart data - 14 labels: 7 actual, 7 forecast
    window.salesChart.data.labels = [
        ...actualDates.map(d => formatDate(d)),
        ...forecastDates.map(d => formatDate(d))
    ];

    window.salesChart.data.datasets = datasets;
    window.salesChart.update();
    
    // Calculate products by category
    const categories = [...new Set(products.map(p => p.category))];
    const categoryCounts = categories.map(cat => {
        return products.filter(p => p.category === cat).length;
    });
    
    // Update category chart
    window.categoryChart.data.labels = categories;
    window.categoryChart.data.datasets[0].data = categoryCounts;
    window.categoryChart.update();
}

// Product Management
async function renderProducts() {
    products = await apiRequest('/products');
    // Sort products by creation time (descending)
    products.sort((a, b) => {
        // If products have a 'createdAt' property, use it; otherwise, use id as fallback
        if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        }
        return b.id - a.id;
    });

    const productsTable = document.getElementById('products-table');
    productsTable.innerHTML = '';
    
    products.forEach(product => {
        const status = product.stock <= (product.criticalStockThreshold !== undefined ? product.criticalStockThreshold : settings.criticalStockThreshold) ? 
            '<span class="badge badge-danger">Critical</span>' :
            product.stock <= (product.lowStockThreshold !== undefined ? product.lowStockThreshold : settings.lowStockThreshold) ?
            '<span class="badge badge-warning">Low</span>' :
            '<span class="badge badge-success">In Stock</span>';
        
        const row = productsTable.insertRow();
        row.innerHTML = `
            <td>${product.sku}</td>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${product.stock}</td>
            <td>${settings.currency}${product.price.toFixed(2)}</td>
            <td>
                <button class="btn btn-secondary" onclick="editProduct(${product.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger" onclick="deleteProduct(${product.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    });
    
    if (products.length === 0) {
        productsTable.innerHTML = '<tr><td colspan="6" class="text-center">No products found</td></tr>';
    }
}

function filterProducts() {
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const categoryFilter = window.selectedCategoryFilter || '';
    
    const filtered = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm) || 
                             product.sku.toLowerCase().includes(searchTerm);
        const matchesCategory = categoryFilter === '' || product.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });
    
    const productsTable = document.getElementById('products-table');
    productsTable.innerHTML = '';
    
    filtered.forEach(product => {
        const status = product.stock <= (product.criticalStockThreshold !== undefined ? product.criticalStockThreshold : settings.criticalStockThreshold) ? 
            '<span class="badge badge-danger">Critical</span>' :
            product.stock <= (product.lowStockThreshold !== undefined ? product.lowStockThreshold : settings.lowStockThreshold) ?
            '<span class="badge badge-warning">Low</span>' :
            '<span class="badge badge-success">In Stock</span>';
        
        const row = productsTable.insertRow();
        row.innerHTML = `
            <td>${product.sku}</td>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${product.stock}</td>
            <td>${settings.currency}${product.price.toFixed(2)}</td>
            <td>
                <button class="btn btn-secondary" onclick="editProduct(${product.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger" onclick="deleteProduct(${product.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    });
    
    if (filtered.length === 0) {
        productsTable.innerHTML = '<tr><td colspan="6" class="text-center">No products found</td></tr>';
    }
}

// Call this after any category change and on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadAllData();
    // Restore last section or default to dashboard
    const lastSection = localStorage.getItem('currentSection') || 'dashboard';
    showSection(lastSection);
    loadSettings();
    initCharts();
    updateCategoryDropdown();
    updateCategoryFilterDropdown();
});

function showAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'Add Product';
    document.getElementById('product-modal-save').textContent = 'Save Product';
    document.getElementById('product-modal-save').onclick = function() { saveProduct(); };

    // Clear form
    document.getElementById('product-sku').value = '';
    document.getElementById('product-name').value = '';
    updateCategoryDropdown(categories[0]);
    document.getElementById('product-stock').value = '0';
    document.getElementById('product-cost').value = '';
    document.getElementById('product-price').value = '';
    document.getElementById('product-description').value = '';
    // Set thresholds to global settings by default
    document.getElementById('product-low-threshold').value = settings.lowStockThreshold || 5;
    document.getElementById('product-critical-threshold').value = settings.criticalStockThreshold || 2;

    openModal('product-modal');
}

function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('product-modal-save').textContent = 'Update Product';
    document.getElementById('product-modal-save').onclick = function() { updateProduct(productId); };

    // Fill form
    document.getElementById('product-sku').value = product.sku;
    document.getElementById('product-name').value = product.name;
    updateCategoryDropdown(product.category);
    document.getElementById('product-stock').value = product.stock;
    document.getElementById('product-cost').value = product.cost;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-description').value = product.description;
    // Set thresholds to product's own or global settings
    document.getElementById('product-low-threshold').value = (product.lowStockThreshold !== undefined ? product.lowStockThreshold : (settings.lowStockThreshold || 5));
    document.getElementById('product-critical-threshold').value = (product.criticalStockThreshold !== undefined ? product.criticalStockThreshold : (settings.criticalStockThreshold || 2));

    openModal('product-modal');
}

// When saving a product, record createdAt with full datetime
async function saveProduct() {
    const sku = document.getElementById('product-sku').value;
    const name = document.getElementById('product-name').value;
    const category = document.getElementById('product-category').value;
    const stock = parseInt(document.getElementById('product-stock').value);
    const cost = parseFloat(document.getElementById('product-cost').value);
    const price = parseFloat(document.getElementById('product-price').value);
    const description = document.getElementById('product-description').value;
    const lowStockThreshold = parseInt(document.getElementById('product-low-threshold').value);
    const criticalStockThreshold = parseInt(document.getElementById('product-critical-threshold').value);
    
    if (!sku || !name || isNaN(stock) || isNaN(cost) || isNaN(price)) {
        alert('Please fill all required fields with valid values');
        return;
    }
    
    const newProduct = { sku, name, category, stock, cost, price, description, createdAt: new Date().toISOString(), lowStockThreshold, criticalStockThreshold };
    const product = await apiRequest('/products', 'POST', newProduct);

    // Record initial stock movement with full datetime
    await apiRequest('/movements', 'POST', {
        productId: product.id,
        type: 'add',
        quantity: product.stock,
        date: new Date().toISOString(),
        notes: 'Initial stock'
    });

    syncCategoriesFromProducts();
    await loadAllData();
    closeModal('product-modal');
    reloadCurrentSection();
}

// When updating a product, record stock adjustment with full datetime
async function updateProduct(productId) {
    const sku = document.getElementById('product-sku').value;
    const name = document.getElementById('product-name').value;
    const category = document.getElementById('product-category').value;
    const stock = parseInt(document.getElementById('product-stock').value);
    const cost = parseFloat(document.getElementById('product-cost').value);
    const price = parseFloat(document.getElementById('product-price').value);
    const description = document.getElementById('product-description').value;
    const lowStockThreshold = parseInt(document.getElementById('product-low-threshold').value);
    const criticalStockThreshold = parseInt(document.getElementById('product-critical-threshold').value);
    
    if (!sku || !name || isNaN(stock) || isNaN(cost) || isNaN(price)) {
        alert('Please fill all required fields with valid values');
        return;
    }
    
    const product = products.find(p => p.id === productId);
    const oldStock = product.stock;
    const updatedProduct = { sku, name, category, stock, cost, price, description, createdAt: product.createdAt || new Date().toISOString(), lowStockThreshold, criticalStockThreshold };
    await apiRequest(`/products/${productId}`, 'PUT', updatedProduct);

    // Record stock adjustment if changed
    if (stock !== oldStock) {
        await apiRequest('/movements', 'POST', {
            productId,
            type: 'adjust',
            quantity: stock - oldStock,
            date: new Date().toISOString(),
            notes: 'Manual adjustment'
        });
    }

    syncCategoriesFromProducts();
    await loadAllData();
    closeModal('product-modal');
    reloadCurrentSection();
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    await apiRequest(`/products/${productId}`, 'DELETE');
    await loadAllData();
    reloadCurrentSection();
}

// Inventory Management
async function renderStockMovements() {
    stockMovements = await apiRequest('/movements');
    // Sort movements by date (descending)
    stockMovements.sort((a, b) => new Date(b.date) - new Date(a.date));
    const movementsTable = document.getElementById('movements-table');
    movementsTable.innerHTML = '';

    // Get last 10 movements
    const recentMovements = [...stockMovements]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    recentMovements.forEach(movement => {
        const product = products.find(p => p.id === movement.productId);
        if (!product) return;

        // Format date and time
        const dt = new Date(movement.date);
        const dateStr = dt.toLocaleDateString();
        const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const typeBadge = movement.type === 'add' ?
            '<span class="badge badge-success">Add</span>' :
            movement.type === 'remove' ?
            '<span class="badge badge-danger">Remove</span>' :
            '<span class="badge badge-warning">Adjust</span>';

        const row = movementsTable.insertRow();
        row.innerHTML = `
            <td>${dateStr} ${timeStr}</td>
            <td>${product.name}</td>
            <td>${typeBadge}</td>
            <td>${movement.quantity}</td>
            <td>${movement.notes || ''}</td>
        `;
    });

    if (recentMovements.length === 0) {
        movementsTable.innerHTML = '<tr><td colspan="5" class="text-center">No stock movements found</td></tr>';
    }
}

function showStockModal(type) {
    const titleMap = {
        'add': 'Add Stock',
        'remove': 'Remove Stock',
        'adjust': 'Adjust Stock',
        'transfer': 'Transfer Stock'
    };

    document.getElementById('stock-modal-title').textContent = titleMap[type] || 'Stock Movement';
    document.getElementById('stock-modal-save').onclick = function() { saveStockMovement(type); };

    // Remove any previous combo bar before adding a new one
    const productSelectContainer = document.querySelector('#stock-modal .form-group label[for="stock-product"]').parentElement;
    // Remove any previous combo bar
    const oldCombo = productSelectContainer.querySelector('.stock-product-combo');
    if (oldCombo) oldCombo.remove();
    const oldInput = productSelectContainer.querySelector('#stock-product-combo-input');
    if (oldInput) oldInput.remove();
    const oldList = productSelectContainer.querySelector('#stock-product-combo-list');
    if (oldList) oldList.remove();

    // Remove any previous select dropdown (if present)
    const oldSelect = productSelectContainer.querySelector('#stock-product');
    if (oldSelect) oldSelect.remove();

    // Add combo bar
    const comboDiv = document.createElement('div');
    comboDiv.className = 'stock-product-combo';
    comboDiv.style.position = 'relative';
    comboDiv.innerHTML = `
        <input type="text" id="stock-product-combo-input" placeholder="Search or select product..." autocomplete="off" style="width:100%;padding:8px;">
        <ul id="stock-product-combo-list" class="stock-product-combo-list"></ul>
    `;
    productSelectContainer.appendChild(comboDiv);

    // Setup combo input and dropdown
    const comboInput = comboDiv.querySelector('#stock-product-combo-input');
    const comboList = comboDiv.querySelector('#stock-product-combo-list');
    comboInput.value = '';
    comboInput.dataset.selectedId = '';

    function renderComboList(search = '') {
        // Sort by most popular (by sales count)
        const productSalesCount = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                productSalesCount[item.productId] = (productSalesCount[item.productId] || 0) + item.quantity;
            });
        });
        const sortedProducts = [...products].sort((a, b) => {
            const countA = productSalesCount[a.id] || 0;
            const countB = productSalesCount[b.id] || 0;
            return countB - countA;
        });

        comboList.innerHTML = '';
        comboList.style.display = 'none';
        const filtered = sortedProducts.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length === 0) return;
        comboList.style.display = 'block';
        filtered.forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.name} (${settings.currency}${p.price.toFixed(2)}) - Stock: ${p.stock || 0}`;
            li.dataset.id = p.id;
            li.className = 'stock-product-combo-item';
            li.onclick = function() {
                comboInput.value = p.name;
                comboInput.dataset.selectedId = p.id;
                comboList.style.display = 'none';
            };
            comboList.appendChild(li);
        });
    }

    comboInput.onfocus = function() {
        renderComboList(comboInput.value);
    };
    comboInput.oninput = function() {
        comboInput.dataset.selectedId = '';
        renderComboList(comboInput.value);
    };
    comboInput.onclick = function(e) {
        renderComboList(comboInput.value);
        e.stopPropagation();
    };

    // Remove previous click listeners before adding a new one
    document.removeEventListener('click', window._stockComboClickListener);
    window._stockComboClickListener = function(e) {
        if (!e.target.closest('.stock-product-combo')) {
            comboList.style.display = 'none';
        }
    };
    document.addEventListener('click', window._stockComboClickListener);

    // Clear form
    document.getElementById('stock-quantity').value = '1';
    document.getElementById('stock-notes').value = '';

    openModal('stock-modal');
}

async function saveStockMovement(type) {
    // Use selectedId from combo input
    const comboInput = document.getElementById('stock-product-combo-input');
    const productId = parseInt(comboInput?.dataset.selectedId);
    const quantity = parseInt(document.getElementById('stock-quantity').value);
    const notes = document.getElementById('stock-notes').value;

    if (!productId || isNaN(quantity) || quantity <= 0) {
        alert('Please select a product and enter a valid quantity');
        return;
    }

    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex === -1) return;

    // Update stock based on movement type
    let newStock = products[productIndex].stock;
    if (type === 'add') {
        newStock += quantity;
    } else if (type === 'remove') {
        if (newStock < quantity) {
            alert('Not enough stock available');
            return;
        }
        newStock -= quantity;
    } else if (type === 'adjust') {
        newStock = quantity;
    }

    // Update product stock in backend
    await apiRequest(`/products/${productId}`, 'PUT', { ...products[productIndex], stock: newStock });

    // Record movement in backend
    await apiRequest('/movements', 'POST', {
        productId,
        type,
        quantity,
        date: new Date().toISOString(),
        notes
    });

    await loadAllData();
    closeModal('stock-modal');
    reloadCurrentSection();
}

// Sales Management
async function renderSales() {
    sales = await apiRequest('/sales');
    const salesTable = document.getElementById('sales-table');
    salesTable.innerHTML = '';

    // Fix: Match sales by date only (ignore time)
    // Get today's boundaries (midnight to midnight)
const today = new Date();
const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

const todaySalesTotal = sales.filter(s => {
    const saleDate = new Date(s.date); // Convert to Date object
    return saleDate >= todayStart && saleDate < todayEnd; // Exact 24-hour period
}).reduce((sum, sale) => sum + sale.total, 0);

    // Calculate sales totals
    const thisWeekSales = sales.filter(s => {
        const saleDate = new Date(s.date);
        const todayDate = new Date();
        const diffTime = todayDate - saleDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
    }).reduce((sum, sale) => sum + sale.total, 0);
    
    const thisMonthSales = sales.filter(s => {
        const saleDate = new Date(s.date);
        const todayDate = new Date();
        return saleDate.getMonth() === todayDate.getMonth() && 
               saleDate.getFullYear() === todayDate.getFullYear();
    }).reduce((sum, sale) => sum + sale.total, 0);
    
    const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
    
    // Update sales metrics
    document.getElementById('sales-today').textContent = settings.currency + todaySalesTotal.toFixed(2);
    document.getElementById('sales-week').textContent = settings.currency + thisWeekSales.toFixed(2);
    document.getElementById('sales-month').textContent = settings.currency + thisMonthSales.toFixed(2);
    document.getElementById('sales-total').textContent = settings.currency + totalSales.toFixed(2);
    
    // Display recent sales
    const recentSales = [...sales]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    recentSales.forEach(sale => {
        const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        
        // Format date and time
        const dt = new Date(sale.date);
        const dateStr = dt.toLocaleDateString();
        const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const row = salesTable.insertRow();
        row.innerHTML = `
            <td>${sale.orderNumber}</td>
            <td>${dateStr} ${timeStr}</td>
            <td>${sale.customer}</td>
            <td>${settings.currency}${sale.total.toFixed(2)}</td>
            <td>${itemCount}</td>
            <td>
                <button class="btn btn-secondary" onclick="viewSale(${sale.id})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-primary" onclick="printReceipt(${sale.id})">
                    <i class="fas fa-print"></i>
                </button>
            </td>
        `;
    });
    
    if (recentSales.length === 0) {
        salesTable.innerHTML = '<tr><td colspan="6" class="text-center">No sales found</td></tr>';
    }
}

function showNewSaleModal() {
    // Clear previous items
    document.getElementById('sale-items').innerHTML = '';
    document.getElementById('customer-name').value = '';
    document.getElementById('sale-total').textContent = settings.currency + '0.00';
    
    // Add first item
    addSaleItem();
    
    openModal('sale-modal');
}

// Helper: Get most popular products (by sales count)
function getPopularProducts() {
    const productSalesCount = {};
    sales.forEach(sale => {
        sale.items.forEach(item => {
            productSalesCount[item.productId] = (productSalesCount[item.productId] || 0) + item.quantity;
        });
    });
    // Sort products by sales count descending
    return [...products].sort((a, b) => {
        const countA = productSalesCount[a.id] || 0;
        const countB = productSalesCount[b.id] || 0;
        return countB - countA;
    });
}

// --- Sale Item Product Dropdown with Search ---
function renderSaleProductDropdown(select, searchTerm = '') {
    // Get popular products sorted
    const sortedProducts = getPopularProducts();
    select.innerHTML = '<option value="">Select Product</option>';
    sortedProducts
        .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
        .forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.name} (${settings.currency}${p.price.toFixed(2)})`;
            option.dataset.price = p.price;
            select.appendChild(option);
        });
}

// --- Add Sale Item with searchable dropdown ---
function addSaleItem() {
    const saleItems = document.getElementById('sale-items');
    const itemId = Date.now();

    const itemDiv = document.createElement('div');
    itemDiv.className = 'sale-item flex mb-2';
    itemDiv.dataset.id = itemId;

    itemDiv.innerHTML = `
        <div class="sale-product-combo" style="flex:1; position:relative;">
            <input type="text" class="sale-product-combo-input" placeholder="Search or select product..." autocomplete="off" style="width:100%;padding:8px;">
            <ul class="sale-product-combo-list"></ul>
        </div>
        <div class="mr-2" style="position:relative;">
            <input type="number" class="sale-quantity" value="1" min="1" style="width: 80px;" onchange="updateSaleItemTotal(this)">
            <small class="stock-info" style="position:absolute; bottom:-16px; left:0; font-size:11px; color:#666; width:100%;"></small>
        </div>
        <span class="sale-price mr-2" style="width: 100px; display: inline-flex; align-items: center;">${settings.currency}0.00</span>
        <button class="btn btn-danger" onclick="removeSaleItem(this)"><i class="fas fa-times"></i></button>
    `;

    saleItems.appendChild(itemDiv);

    // Setup combo input and dropdown
    const comboInput = itemDiv.querySelector('.sale-product-combo-input');
    const comboList = itemDiv.querySelector('.sale-product-combo-list');
    const stockInfo = itemDiv.querySelector('.stock-info');
    comboInput.value = '';
    comboInput.dataset.selectedId = '';

    function renderComboList(search = '') {
        const sortedProducts = getPopularProducts();
        comboList.innerHTML = '';
        comboList.style.display = 'none';
        const filtered = sortedProducts.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length === 0) return;
        comboList.style.display = 'block';
        filtered.forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.name} (${settings.currency}${p.price.toFixed(2)}) - Stock: ${p.stock || 0}`;
            li.dataset.id = p.id;
            li.dataset.price = p.price;
            li.dataset.stock = p.stock || 0;
            li.className = 'sale-product-combo-item';
            li.onclick = function() {
                comboInput.value = p.name;
                comboInput.dataset.selectedId = p.id;
                comboInput.dataset.price = p.price;
                comboInput.dataset.stock = p.stock || 0;
                comboList.style.display = 'none';
                updateSaleItemPrice(comboInput);
                
                // Update stock information
                stockInfo.textContent = `In stock: ${p.stock || 0}`;
                const quantityInput = itemDiv.querySelector('.sale-quantity');
                quantityInput.max = p.stock || 1;
                if (quantityInput.value > (p.stock || 1)) {
                    quantityInput.value = p.stock || 1;
                }
            };
            comboList.appendChild(li);
        });
    }

    comboInput.onfocus = function() {
        renderComboList(comboInput.value);
    };
    comboInput.oninput = function() {
        comboInput.dataset.selectedId = '';
        comboInput.dataset.price = '';
        renderComboList(comboInput.value);
        updateSaleItemPrice(comboInput);
    };
    comboInput.onclick = function(e) {
        renderComboList(comboInput.value);
        e.stopPropagation();
    };
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.sale-product-combo')) {
            comboList.style.display = 'none';
        }
    });

    updateSaleTotal();
}

// --- Update Sale Item Price for combo bar ---
function updateSaleItemPrice(input) {
    const price = input.dataset.price || 0;
    const stock = input.dataset.stock || 0;
    const itemDiv = input.closest('.sale-item');
    itemDiv.querySelector('.sale-price').textContent = settings.currency + parseFloat(price).toFixed(2);
    
    // Update stock info
    const stockInfo = itemDiv.querySelector('.stock-info');
    stockInfo.textContent = `In stock: ${stock}`;
    
    // Update quantity max
    const quantityInput = itemDiv.querySelector('.sale-quantity');
    quantityInput.max = stock;
    
    updateSaleItemTotal(input);
}

// --- Update Sale Item Total for combo bar ---
function updateSaleItemTotal(input) {
    const itemDiv = input.closest('.sale-item');
    const comboInput = itemDiv.querySelector('.sale-product-combo-input');
    const price = comboInput.dataset.price || 0;
    const stock = parseInt(comboInput.dataset.stock) || 0;
    let quantity = parseInt(itemDiv.querySelector('.sale-quantity').value) || 0;
    
    // Ensure quantity doesn't exceed stock
    if (quantity > stock) {
        quantity = stock;
        itemDiv.querySelector('.sale-quantity').value = stock;
    }
    
    const total = parseFloat(price) * quantity;
    itemDiv.querySelector('.sale-price').textContent = settings.currency + total.toFixed(2);
    updateSaleTotal();
}

// --- Update Sale Total ---
function updateSaleTotal() {
    let total = 0;
    document.querySelectorAll('.sale-item').forEach(item => {
        const priceText = item.querySelector('.sale-price').textContent;
        const price = parseFloat(priceText.replace(settings.currency, ''));
        total += price;
    });
    document.getElementById('sale-total').textContent = settings.currency + total.toFixed(2);
}

// --- Remove Sale Item ---
function removeSaleItem(button) {
    button.closest('.sale-item').remove();
    updateSaleTotal();
}

// --- Complete Sale (use selectedId for product) ---
async function completeSale() {
    const customer = document.getElementById('customer-name').value;
    if (!customer) {
        alert('Please enter customer name');
        return;
    }

    const saleItems = [];
    let hasError = false;

    document.querySelectorAll('.sale-item').forEach(item => {
        const comboInput = item.querySelector('.sale-product-combo-input');
        const productId = parseInt(comboInput.dataset.selectedId);
        const quantity = parseInt(item.querySelector('.sale-quantity').value);
        const price = parseFloat(comboInput.dataset.price || 0);

        if (!productId || isNaN(quantity) || quantity <= 0 || isNaN(price)) {
            hasError = true;
            return;
        }

        // Check stock availability
        const product = products.find(p => p.id === productId);
        if (!product || product.stock < quantity) {
            alert(`Not enough stock for ${product?.name || 'selected product'}`);
            hasError = true;
            return;
        }

        saleItems.push({
            productId,
            quantity,
            price
        });
    });

    if (hasError || saleItems.length === 0) {
        alert('Please check all sale items for errors');
        return;
    }

    // Calculate total
    const total = saleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create sale record in backend
    const newSale = await apiRequest('/sales', 'POST', {
        orderNumber: 'ORD-' + (1000 + (sales.length + 1)),
        date: new Date().toISOString(),
        customer,
        items: saleItems,
        total
    });

    // Update stock and record movements for each item
    for (const item of saleItems) {
        const product = products.find(p => p.id === item.productId);
        await apiRequest(`/products/${item.productId}`, 'PUT', { ...product, stock: product.stock - item.quantity });
        await apiRequest('/movements', 'POST', {
            productId: item.productId,
            type: 'remove',
            quantity: item.quantity,
            date: new Date().toISOString(),
            notes: `Sold to ${customer} (Order: ${newSale.orderNumber})`
        });
    }

    await loadAllData();
    closeModal('sale-modal');
    reloadCurrentSection();
}

function viewSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    
    let content = `
        <h4>Order #: ${sale.orderNumber}</h4>
        <p>Date: ${sale.date}</p>
        <p>Customer: ${sale.customer}</p>
        
        <table class="mt-4" style="width: 100%;">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        content += `
            <tr>
                <td>${product?.name || 'Unknown Product'}</td>
                <td>${item.quantity}</td>
                <td>${settings.currency}${item.price.toFixed(2)}</td>
                <td>${settings.currency}${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `;
    });
    
    content += `
            </tbody>
            <tfoot>
                <tr>
                    <th colspan="3">Total</th>
                    <th>${settings.currency}${sale.total.toFixed(2)}</th>
                </tr>
            </tfoot>
        </table>
    `;
    
    document.getElementById('report-modal-title').textContent = `Sale Details - ${sale.orderNumber}`;
    document.getElementById('report-modal-content').innerHTML = content;
    
    openModal('report-modal');
}

function printReceipt(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    
    let receipt = `
        <div style="font-family: Arial, sans-serif; max-width: 300px; margin: 0 auto;">
            <h2 style="text-align: center;">${settings.companyName}</h2>
            <p style="text-align: center;">Order #: ${sale.orderNumber}</p>
            <p style="text-align: center;">Date: ${sale.date}</p>
            <p style="text-align: center;">Customer: ${sale.customer}</p>
            
            <hr style="margin: 10px 0;">
            
            <table style="width: 100%;">
    `;
    
    sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        receipt += `
            <tr>
                <td>${product?.name || 'Unknown Product'}</td>
                <td>${item.quantity} x ${settings.currency}${item.price.toFixed(2)}</td>
                <td style="text-align: right;">${settings.currency}${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `;
    });
    
    receipt += `
                <tr style="border-top: 1px solid #000;">
                    <td colspan="2" style="text-align: right; font-weight: bold;">Total:</td>
                    <td style="text-align: right; font-weight: bold;">${settings.currency}${sale.total.toFixed(2)}</td>
                </tr>
            </table>
            
            <hr style="margin: 10px 0;">
            <p style="text-align: center;">Thank you for your business!</p>
        </div>
    `;
    
    const printWindow = window.open('', '', 'width=600,height=600');
    printWindow.document.write(`
        <html>
            <head>
                <title>Receipt - ${sale.orderNumber}</title>
            </head>
            <body onload="window.print(); window.close();">
                ${receipt}
            </body>
        </html>
    `);
    printWindow.document.close();
}

// Reports
// --- Report Period Selector ---
let reportPeriod = 'week'; // default

function setReportPeriod(period) {
    reportPeriod = period;
    // Highlight selected button
    ['day','week','month','year'].forEach(p => {
        document.getElementById('period-' + p).classList.remove('active');
    });
    document.getElementById('period-' + period).classList.add('active');
    // If a report is open, refresh it
    if (document.getElementById('report-modal').style.display === 'flex') {
        const title = document.getElementById('report-modal-title').textContent;
        if (title.includes('Sales Report')) generateReport('sales');
        if (title.includes('Product Performance')) generateReport('performance');
    }
}

function openPeriodSelector() {
    document.getElementById('period-selector-modal').style.display = 'flex';
    document.getElementById('period-type').value = reportPeriodType;
    renderPeriodOptions();
}

function closePeriodSelector() {
    document.getElementById('period-selector-modal').style.display = 'none';
}

function renderPeriodOptions() {
    const type = document.getElementById('period-type').value;
    let html = '';
    const now = new Date();
    if (type === 'day') {
        // Last 30 days
        html += '<label for="period-value">Select Day</label>';
        html += '<select id="period-value">';
        for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const val = d.toISOString().split('T')[0];
            html += `<option value="${val}">${val}</option>`;
        }
        html += '</select>';
    } else if (type === 'week') {
        // Last 12 weeks
        html += '<label for="period-value">Select Week</label>';
        html += '<select id="period-value">';
        for (let i = 0; i < 12; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - i * 7);
            const year = d.getFullYear();
            const week = getWeekNumber(d);
            html += `<option value="${year}-W${week}">${year}-W${week}</option>`;
        }
        html += '</select>';
    } else if (type === 'month') {
        // Last 12 months
        html += '<label for="period-value">Select Month</label>';
        html += '<select id="period-value">';
        for (let i = 0; i < 12; i++) {
            const d = new Date(now);
            d.setMonth(now.getMonth() - i);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            html += `<option value="${val}">${val}</option>`;
        }
        html += '</select>';
    } else if (type === 'year') {
        // Last 5 years
        html += '<label for="period-value">Select Year</label>';
        html += '<select id="period-value">';
        for (let i = 0; i < 5; i++) {
            const year = now.getFullYear() - i;
            html += `<option value="${year}">${year}</option>`;
        }
        html += '</select>';
    }
    document.getElementById('period-options-group').innerHTML = html;
    // Set default value
    if (document.getElementById('period-value')) {
        document.getElementById('period-value').value = reportPeriodValue || document.getElementById('period-value').options[0].value;
    }
}

function applyPeriodSelection() {
    reportPeriodType = document.getElementById('period-type').value;
    reportPeriodValue = document.getElementById('period-value').value;
    closePeriodSelector();
    updatePeriodLabel();
    // If a report is open, refresh it
    if (document.getElementById('report-modal').style.display === 'flex') {
        const title = document.getElementById('report-modal-title').textContent;
        if (title.includes('Sales Report')) generateReport('sales');
        if (title.includes('Product Performance')) generateReport('performance');
    }
}

function updatePeriodLabel() {
    let label = '';
    if (reportPeriodType === 'day') label = `Day: ${reportPeriodValue}`;
    else if (reportPeriodType === 'week') label = `Week: ${reportPeriodValue}`;
    else if (reportPeriodType === 'month') label = `Month: ${reportPeriodValue}`;
    else if (reportPeriodType === 'year') label = `Year: ${reportPeriodValue}`;
    document.getElementById('period-selected-label').textContent = label;
}

// Helper: Get week number (ISO week)
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

// --- Helper: Filter sales by selected period ---
function filterSalesByPeriod(sales) {
    if (!reportPeriodType || !reportPeriodValue) return sales;
    
    return sales.filter(sale => {
        const saleDate = new Date(sale.date);
        
        if (reportPeriodType === 'day') {
            return saleDate.toISOString().split('T')[0] === reportPeriodValue;
        } 
        else if (reportPeriodType === 'week') {
            const saleYear = saleDate.getFullYear();
            const saleWeek = getWeekNumber(saleDate);
            return `${saleYear}-W${String(saleWeek).padStart(2, '0')}` === reportPeriodValue;
        }
        else if (reportPeriodType === 'month') {
            const saleYear = saleDate.getFullYear();
            const saleMonth = String(saleDate.getMonth() + 1).padStart(2, '0');
            return `${saleYear}-${saleMonth}` === reportPeriodValue;
        }
        else if (reportPeriodType === 'year') {
            return saleDate.getFullYear().toString() === reportPeriodValue;
        }
        return true;
    });
}

// --- Reports ---
function generateReport(type) {
    let filteredSales = sales;
    let periodLabel = 'All Time';

    // Apply period filter only for sales and performance reports
    if (type === 'sales' || type === 'performance') {
        if (reportPeriodType && reportPeriodType !== 'all' && reportPeriodValue) {
            filteredSales = filterSalesByPeriod(sales);
            periodLabel = `${reportPeriodType.charAt(0).toUpperCase() + reportPeriodType.slice(1)}: ${reportPeriodValue}`;
        }
    }

    let reportContent = '';

    if (type === 'inventory') {
        // Keep existing inventory report code exactly as is
        reportContent = `
            <h3>Inventory Report</h3>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <table class="mt-4" style="width: 100%;">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Stock</th>
                        <th>Cost</th>
                        <th>Price</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
        `;
        products.forEach(product => {
            const value = product.stock * product.cost;
            reportContent += `
                <tr>
                    <td>${product.sku}</td>
                    <td>${product.name}</td>
                    <td>${product.category}</td>
                    <td>${product.stock}</td>
                    <td>${settings.currency}${product.cost.toFixed(2)}</td>
                    <td>${settings.currency}${product.price.toFixed(2)}</td>
                    <td>${settings.currency}${value.toFixed(2)}</td>
                </tr>
            `;
        });
        const totalValue = products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
        reportContent += `
                </tbody>
                <tfoot>
                    <tr>
                        <th colspan="6">Total Inventory Value</th>
                        <th>${settings.currency}${totalValue.toFixed(2)}</th>
                    </tr>
                </tfoot>
            </table>
        `;
    } else if (type === 'sales') {
        // Sort sales by date (newest first) and time (newest first within same day)
        filteredSales.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateB - dateA; // Sort descending (newest first)
        });

        reportContent = `
            <h3>Sales Report</h3>
            <p>Period: ${periodLabel}</p>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <table class="mt-4" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredSales.forEach(sale => {
            const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
            // Format date as YYYY-MM-DD HH:MM
            const saleDate = new Date(sale.date);
            const formattedDate = saleDate.toISOString().split('T')[0];
            const hours = String(saleDate.getHours()).padStart(2, '0');
            const minutes = String(saleDate.getMinutes()).padStart(2, '0');
            const formattedTime = `${formattedDate} ${hours}:${minutes}`;
            reportContent += `
                <tr>
                    <td>${formattedTime}</td>
                    <td>${sale.orderNumber}</td>
                    <td>${sale.customer}</td>
                    <td>${itemCount}</td>
                    <td>${settings.currency}${sale.total.toFixed(2)}</td>
                </tr>
            `;
        });
        
        const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
        reportContent += `
                </tbody>
                <tfoot>
                    <tr>
                        <th colspan="4">Total Sales</th>
                        <th>${settings.currency}${totalSales.toFixed(2)}</th>
                    </tr>
                </tfoot>
            </table>
        `;
    } else if (type === 'performance') {
        reportContent = `
            <h3>Product Performance Report</h3>
            <p>Period: ${periodLabel}</p>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <table class="mt-4" style="width: 100%;">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Units Sold</th>
                        <th>Revenue</th>
                    </tr>
                </thead>
                <tbody>
        `;
        // Group filtered sales by product
        const productSales = {};
        filteredSales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = {
                        quantity: 0,
                        revenue: 0
                    };
                }
                productSales[item.productId].quantity += item.quantity;
                productSales[item.productId].revenue += item.quantity * item.price;
            });
        });
        Object.entries(productSales).forEach(([productId, salesData]) => {
            const product = products.find(p => p.id === parseInt(productId));
            if (product) {
                reportContent += `
                    <tr>
                        <td>${product.name}</td>
                        <td>${product.category}</td>
                        <td>${salesData.quantity}</td>
                        <td>${settings.currency}${salesData.revenue.toFixed(2)}</td>
                    </tr>
                `;
            }
        });
        const totalRevenue = Object.values(productSales).reduce((sum, data) => sum + data.revenue, 0);
        reportContent += `
                </tbody>
                <tfoot>
                    <tr>
                        <th colspan="3">Total Revenue</th>
                        <th>${settings.currency}${totalRevenue.toFixed(2)}</th>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    document.getElementById('report-modal-title').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
    document.getElementById('report-modal-content').innerHTML = reportContent;
    openModal('report-modal');
}

function printReport() {
    const reportContent = document.getElementById('report-modal-content').innerHTML;
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
        <html>
            <head>
                <title>${document.getElementById('report-modal-title').textContent}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body onload="window.print(); window.close();">
                ${reportContent}
            </body>
        </html>
    `);
    printWindow.document.close();
}

// --- Backup & Restore (File-based) ---
function saveBackup() {
    const backup = {
        products,
        stockMovements,
        sales,
        settings
    };
    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `inventory-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('Backup file has been saved.');
}

function triggerRestoreData() {
    document.getElementById('restore-file-input').click();
}

async function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('Restoring will overwrite all current data. Continue?')) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.products || !data.stockMovements || !data.sales || !data.settings) {
                alert('Invalid backup file.');
                return;
            }
            
            // Clear existing data using the reset endpoint
            const resetKey = prompt('Enter reset key to clear existing data:');
            if (!resetKey) return;
            
            const resetResponse = await fetch('http://localhost:3000/data/reset-all', { 
                method: 'DELETE',
                headers: {
                    'x-reset-key': resetKey
                }
            });
            
            if (!resetResponse.ok) {
                throw new Error('Failed to clear existing data');
            }
            
            // Now add each item individually using existing endpoints
            for (const product of data.products) {
                await apiRequest('/products', 'POST', product);
            }
            
            for (const movement of data.stockMovements) {
                await apiRequest('/movements', 'POST', movement);
            }
            
            for (const sale of data.sales) {
                await apiRequest('/sales', 'POST', sale);
            }
            
            // Restore the original settings from backup (overwriting the default settings created by reset)
            await apiRequest('/settings', 'PUT', data.settings);
            
            await loadAllData();
            alert('Data restored successfully!');
            reloadCurrentSection();
        } catch (err) {
            alert('Failed to restore data: ' + err.message);
        }
    };
    reader.readAsText(file);
}

async function resetData() {
    if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) return;
    
    const resetKey = prompt('Enter reset key:');
    if (!resetKey) return;
    
    try {
        const response = await fetch('http://localhost:3000/data/reset-all', { 
            method: 'DELETE',
            headers: {
                'x-reset-key': resetKey
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reset data');
        }
        // Add factory data after reset
        await createDefaultProducts();
        await createDefaultSale(products);
        await loadAllData();
        alert('All data has been reset to default.');
        reloadCurrentSection && reloadCurrentSection();
    } catch (err) {
        alert('Failed to reset data: ' + err.message);
    }
}

// Settings
function loadSettings() {
    document.getElementById('company-name').value = settings.companyName;
    document.getElementById('company-currency').value = settings.currency;
    document.getElementById('low-stock-threshold').value = settings.lowStockThreshold;
    document.getElementById('critical-stock-threshold').value = settings.criticalStockThreshold;
}

async function saveSettings() {
    settings.companyName = document.getElementById('company-name').value;
    settings.currency = document.getElementById('company-currency').value;
    settings.lowStockThreshold = parseInt(document.getElementById('low-stock-threshold').value) || 5;
    settings.criticalStockThreshold = parseInt(document.getElementById('critical-stock-threshold').value) || 2;

    await apiRequest('/settings', 'PUT', settings);

    alert('Settings saved successfully!');
    reloadCurrentSection();
}

// Modal Helpers
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // Remove combo click listener for inventory modal to avoid duplicate listeners
    if (modalId === 'stock-modal' && window._stockComboClickListener) {
        document.removeEventListener('click', window._stockComboClickListener);
        window._stockComboClickListener = null;
    }
}

// --- Category Filter Dropdown with Search ---
function renderCategoryFilterDropdown(selected = '') {
    const list = document.getElementById('category-filter-list');
    if (!list) return;
    list.innerHTML = '';
    // "All Categories" option
    const allLi = document.createElement('li');
    allLi.textContent = 'All Categories';
    allLi.className = selected === '' ? 'selected' : '';
    allLi.onclick = () => selectCategoryFilter('');
    list.appendChild(allLi);

    // Filtered categories
    const searchVal = (document.getElementById('category-filter-search')?.value || '').toLowerCase();
    categories
        .filter(cat => cat.toLowerCase().includes(searchVal))
        .forEach(cat => {
            const li = document.createElement('li');
            li.textContent = cat;
            li.className = selected === cat ? 'selected' : '';
            li.onclick = () => selectCategoryFilter(cat);
            list.appendChild(li);
        });
}

function selectCategoryFilter(category) {
    document.getElementById('category-filter-selected').textContent = category || 'All Categories';
    window.selectedCategoryFilter = category;
    filterProducts();
    closeCategoryDropdown();
}

function openCategoryDropdown() {
    document.getElementById('category-filter-menu').classList.add('open');
    document.getElementById('category-filter-search').value = '';
    renderCategoryFilterDropdown(window.selectedCategoryFilter || '');
    document.getElementById('category-filter-search').focus();
}

function closeCategoryDropdown() {
    document.getElementById('category-filter-menu').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    document.getElementById('category-filter-btn').onclick = function(e) {
        e.stopPropagation();
        openCategoryDropdown();
    };
    document.getElementById('category-filter-search').oninput = function() {
        renderCategoryFilterDropdown(window.selectedCategoryFilter || '');
    };
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.category-filter-dropdown')) {
            closeCategoryDropdown();
        }
    });
    renderCategoryFilterDropdown('');
});

// Ensure report cards open the modal
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    document.querySelector('.metric-card[onclick*="generateReport(\'inventory\')"]').onclick = function() {
        generateReport('inventory');
    };
    document.querySelector('.metric-card[onclick*="generateReport(\'sales\')"]').onclick = function() {
        generateReport('sales');
    };
    document.querySelector('.metric-card[onclick*="generateReport(\'performance\')"]').onclick = function() {
        generateReport('performance');
    };
    // ...existing code...
});

// --- Factory Data Creation ---
async function createDefaultProducts() {
    const defaultProducts = [
        {
            sku: 'SOL-100W',
            name: '100W Solar Panel',
            category: 'Solar Panels',
            stock: 20,
            cost: 50.00,
            price: 80.00,
            description: 'High efficiency 100W solar panel',
            createdAt: new Date().toISOString()
        },
        {
            sku: 'INV-1KW',
            name: '1kW Inverter',
            category: 'Inverters',
            stock: 10,
            cost: 120.00,
            price: 200.00,
            description: 'Pure sine wave inverter 1kW',
            createdAt: new Date().toISOString()
        },
        {
            sku: 'BAT-200AH',
            name: '200Ah Battery',
            category: 'Batteries',
            stock: 15,
            cost: 90.00,
            price: 150.00,
            description: 'Deep cycle 200Ah battery',
            createdAt: new Date().toISOString()
        }
    ];
    for (const product of defaultProducts) {
        const created = await apiRequest('/products', 'POST', product);
        // Record initial stock movement
        await apiRequest('/movements', 'POST', {
            productId: created.id,
            type: 'add',
            quantity: product.stock,
            date: new Date().toISOString(),
            notes: 'Factory default stock'
        });
    }
}

async function createDefaultSale(productsList) {
    // Use the first product for a sample sale
    if (!productsList || productsList.length === 0) productsList = await apiRequest('/products');
    if (productsList.length === 0) return;
    const product = productsList[0];
    const sale = {
        orderNumber: 'ORD-1001',
        date: new Date().toISOString(),
        customer: 'Sample Customer',
        items: [
            {
                productId: product.id,
                quantity: 1,
                price: product.price
            }
        ],
        total: product.price
    };
    await apiRequest('/sales', 'POST', sale);
    // Update stock and record movement
    await apiRequest(`/products/${product.id}`, 'PUT', { ...product, stock: product.stock - 1 });
    await apiRequest('/movements', 'POST', {
        productId: product.id,
        type: 'remove',
        quantity: 1,
        date: new Date().toISOString(),
        notes: 'Sample sale after reset'
    });
}