const express = require('express');
const fs = require('fs');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const PORT = 3000;
const RESET_KEY = "reset";

app.use(cors());
app.use(express.json());

function readData(file, fallback = []) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function verifyResetKey(req, res, next) {
    const providedKey = req.headers['x-reset-key'] || req.query.key;
    if (providedKey === RESET_KEY) {
        return next();
    }
    res.status(401).json({ error: "Invalid reset key" });
}

// Products
app.get('/products', (req, res) => {
    res.json(readData('products.json'));
});
app.post('/products', (req, res) => {
    let products = readData('products.json');
    const newId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
    const product = { id: newId, ...req.body };
    products.push(product);
    writeData('products.json', products);
    res.json(product);
});
app.put('/products/:id', (req, res) => {
    let products = readData('products.json');
    const idx = products.findIndex(p => p.id == req.params.id);
    if (idx === -1) return res.status(404).send('Not found');
    products[idx] = { ...products[idx], ...req.body };
    writeData('products.json', products);
    res.json(products[idx]);
});
app.delete('/products/:id', (req, res) => {
    let products = readData('products.json');
    products = products.filter(p => p.id != req.params.id);
    writeData('products.json', products);
    res.json({ success: true });
});

// Stock Movements
app.get('/movements', (req, res) => {
    res.json(readData('movements.json'));
});
app.post('/movements', (req, res) => {
    let movements = readData('movements.json');
    const newId = movements.length ? Math.max(...movements.map(m => m.id)) + 1 : 1;
    const movement = { id: newId, ...req.body };
    movements.push(movement);
    writeData('movements.json', movements);
    res.json(movement);
});

// Sales
app.get('/sales', (req, res) => {
    res.json(readData('sales.json'));
});
app.post('/sales', (req, res) => {
    let sales = readData('sales.json');
    const newId = sales.length ? Math.max(...sales.map(s => s.id)) + 1 : 1;
    const sale = { id: newId, ...req.body };
    sales.push(sale);
    writeData('sales.json', sales);
    res.json(sale);
});

// Settings
app.get('/settings', (req, res) => {
    if (!fs.existsSync('settings.json')) {
        writeData('settings.json', {
            companyName: "Solar Solutions",
            currency: "$",
            lowStockThreshold: 5,
            criticalStockThreshold: 2
        });
    }
    res.json(readData('settings.json'));
});
app.put('/settings', (req, res) => {
    writeData('settings.json', req.body);
    res.json(req.body);
});

// Bulk data restoration endpoints
app.post('/data/restore/products', (req, res) => {
    if (Array.isArray(req.body)) {
        writeData('products.json', req.body);
        res.json({ success: true, count: req.body.length });
    } else {
        res.status(400).json({ error: 'Expected array of products' });
    }
});

app.post('/data/restore/movements', (req, res) => {
    if (Array.isArray(req.body)) {
        writeData('movements.json', req.body);
        res.json({ success: true, count: req.body.length });
    } else {
        res.status(400).json({ error: 'Expected array of movements' });
    }
});

app.post('/data/restore/sales', (req, res) => {
    if (Array.isArray(req.body)) {
        writeData('sales.json', req.body);
        res.json({ success: true, count: req.body.length });
    } else {
        res.status(400).json({ error: 'Expected array of sales' });
    }
});

app.post('/data/restore/settings', (req, res) => {
    writeData('settings.json', req.body);
    res.json({ success: true });
});

// Add these new endpoints (place them with your other routes)
app.delete('/data/reset-all', verifyResetKey, (req, res) => {
    try {
        // Clear all data files
        ['products.json', 'movements.json', 'sales.json', 'settings.json'].forEach(file => {
            fs.writeFileSync(file, '[]'); // Empty array for all files
        });
        
        // Initialize default settings
        const defaultSettings = {
            companyName: "Solar Solutions",
            currency: "$",
            lowStockThreshold: 5,
            criticalStockThreshold: 2
        };
        fs.writeFileSync('settings.json', JSON.stringify(defaultSettings, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear data without creating defaults (for restore operations)
app.delete('/data/clear', verifyResetKey, (req, res) => {
    try {
        // Clear only data files, not settings
        ['products.json', 'movements.json', 'sales.json'].forEach(file => {
            fs.writeFileSync(file, '[]'); // Empty array for data files
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/data/initialize', verifyResetKey, (req, res) => {
    try {
        // Initialize default settings if they don't exist
        if (!fs.existsSync('settings.json')) {
            writeData('settings.json', {
                companyName: "Solar Solutions",
                currency: "$",
                lowStockThreshold: 5,
                criticalStockThreshold: 2
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sales Forecast API
app.get('/sales/forecast', async (req, res) => {
    const sales = readData('sales.json');
    const history = sales.map(s => ({
        ds: (typeof s.date === 'string' ? s.date.split('T')[0] : s.date),
        y: s.total
    }));

    const pythonPath = 'python';
    const py = spawn(pythonPath, ['sales_forecast.py'], { cwd: __dirname });
    let output = '';
    let error = '';

    py.stdin.write(JSON.stringify(history));
    py.stdin.end();

    py.stdout.on('data', data => { output += data.toString(); });
    py.stderr.on('data', data => { error += data.toString(); });

    py.on('close', code => {
        // Only return error if output is not valid JSON
        try {
            // Try to parse output (forecast) even if there are warnings in stderr
            const result = JSON.parse(output);
            res.json(result);
        } catch (e) {
            // If output is not valid JSON, return error and include stderr for debugging
            res.status(500).json({ error: output || error || 'Invalid forecast output' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
