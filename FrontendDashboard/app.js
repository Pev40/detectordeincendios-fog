// FrontendDashboard/app.js

// Use API URL from config.js or default to relative path (for local dev)
const API_BASE = window.API_URL || ''; 

let currentContacts = [];
let contactModal;
let pollingInterval;
let sensorChart;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    contactModal = new bootstrap.Modal(document.getElementById('contactModal'));
    initChart();
    
    // Load initial data
    fetchStatus();
    loadContacts();
    
    // Setup form listeners
    document.getElementById('thresholdsForm').addEventListener('submit', updateThresholds);

    // Start Polling (Serverless alternative to WebSockets)
    startPolling();
});

function startPolling() {
    document.getElementById('connectionStatus').textContent = 'Polling Activo';
    document.getElementById('connectionStatus').className = 'badge bg-info';
    
    pollingInterval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
}

// UI Updates
function updateSensorUI(data, lastUpdate) {
    if (!data) return;
    document.getElementById('tempValue').textContent = (data.temperature || '--') + '°C';
    document.getElementById('lightValue').textContent = data.light || '--';
    document.getElementById('smokeValue').textContent = data.smoke || '--';
    document.getElementById('humidityValue').textContent = data.humidity ? data.humidity + '%' : '--';
    
    if (lastUpdate) {
        const date = new Date(lastUpdate);
        document.getElementById('lastUpdate').textContent = date.toLocaleString();
    } else {
        document.getElementById('lastUpdate').textContent = '--';
    }
}

function updateStatusUI(status) {
    const text = document.getElementById('alertStatusText');
    const indicator = document.getElementById('alertStatusIndicator');
    
    text.textContent = 'Estado: ' + (status || 'Desconocido');
    
    indicator.className = 'status-indicator';
    if (status === 'Normal') indicator.classList.add('status-normal');
    else if (status === 'Riesgo') indicator.classList.add('status-risk');
    else if (status === 'Confirmado') indicator.classList.add('status-confirmed');
    else indicator.classList.add('bg-secondary');
}

function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    sensorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperatura (°C)',
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    data: [],
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Humo (ppm)',
                    borderColor: '#6c757d',
                    backgroundColor: 'rgba(108, 117, 125, 0.1)',
                    data: [],
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { display: true, title: { display: true, text: 'Tiempo' } },
                y: { display: true, beginAtZero: true }
            }
        }
    });
}

function updateChart(events) {
    if (!events || events.length === 0) return;
    
    // Filtrar solo telemetría y ordenar por tiempo ascendente para el gráfico
    const telemetry = events
        .filter(e => e.eventType === 'sensor_telemetry')
        .sort((a, b) => a.timestamp - b.timestamp);
    
    const labels = telemetry.map(e => new Date(e.timestamp).toLocaleTimeString());
    const tempData = telemetry.map(e => e.sensor_data?.temperature || 0);
    const smokeData = telemetry.map(e => e.sensor_data?.smoke || 0);
    
    sensorChart.data.labels = labels;
    sensorChart.data.datasets[0].data = tempData;
    sensorChart.data.datasets[1].data = smokeData;
    sensorChart.update();
}

// API Calls
async function fetchStatus() {
    try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();
        if (data.success) {
            updateSensorUI(data.data.sensorData, data.data.lastUpdate);
            updateStatusUI(data.data.alertStatus);
            renderLogs(data.data.recentEvents);
            updateChart(data.data.recentEvents);
            
            // Fill thresholds form only if empty (to avoid overwriting user input while typing)
            const t = data.data.thresholds;
            if (t && !document.activeElement.classList.contains('form-control')) {
                document.getElementById('confTemp').value = t.temperature;
                document.getElementById('confLight').value = t.light;
                document.getElementById('confSmoke').value = t.smoke;
                document.getElementById('confHumidity').value = t.humidity;
            }
        }
    } catch (e) { 
        console.error("Polling error:", e); 
        document.getElementById('connectionStatus').textContent = 'Error Conexión';
        document.getElementById('connectionStatus').className = 'badge bg-warning';
    }
}

function renderLogs(events) {
    const list = document.getElementById('logsList');
    if (!events || events.length === 0) {
        list.innerHTML = '<li class="list-group-item text-center text-muted">No hay eventos recientes</li>';
        return;
    }

    list.innerHTML = events.map(event => {
        const date = new Date(event.timestamp).toLocaleString();
        const isTelemetry = event.eventType === 'sensor_telemetry';
        const riskClass = event.risk_level === 'CONFIRMED' ? 'text-danger' : (event.risk_level === 'RISK' ? 'text-warning' : 'text-success');
        const icon = isTelemetry ? 'fa-chart-line text-info' : 'fa-exclamation-triangle ' + riskClass;
        const typeLabel = isTelemetry ? 'Reporte Periódico' : 'ALERTA';
        
        const evidenceHtml = event.evidence && event.evidence.key 
            ? `<br><a href="https://${event.evidence.bucket}.s3.amazonaws.com/${event.evidence.key}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">Ver Evidencia <i class="fas fa-external-link-alt"></i></a>`
            : '';
        
        return `
            <li class="list-group-item ${!isTelemetry ? 'list-group-item-warning' : ''}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <i class="fas ${icon} me-2"></i>
                        <strong class="${riskClass}">${typeLabel}: ${event.risk_level}</strong>
                        <small class="text-muted ms-2">${date}</small>
                        <div class="mt-1 small">
                            T: ${event.sensor_data?.temperature}°C | L: ${event.sensor_data?.light} | H: ${event.sensor_data?.smoke} | Hum: ${event.sensor_data?.humidity}%
                        </div>
                        ${evidenceHtml}
                    </div>
                    <span class="badge bg-light text-dark border">${event.device_id}</span>
                </div>
            </li>
        `;
    }).join('');
}

async function updateThresholds(e) {
    e.preventDefault();
    const data = {
        temperature: document.getElementById('confTemp').value,
        light: document.getElementById('confLight').value,
        smoke: document.getElementById('confSmoke').value,
        humidity: document.getElementById('confHumidity').value
    };
    
    try {
        const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) alert('Umbrales actualizados correctamente');
    } catch (e) { alert('Error al actualizar umbrales'); }
}

// Contacts Management
async function loadContacts() {
    try {
        const res = await fetch(`${API_BASE}/contacts`);
        const data = await res.json();
        if (data.success) {
            currentContacts = data.data;
            renderContacts();
        }
    } catch (e) { console.error(e); }
}

function renderContacts() {
    const tbody = document.getElementById('contactsTableBody');
    tbody.innerHTML = '';
    
    currentContacts.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.name}</td>
            <td><span class="badge bg-${getBadgeColor(c.type)}">${c.type}</span></td>
            <td>${c.value}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editContact('${c.contact_id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteContact('${c.contact_id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getBadgeColor(type) {
    if (type === 'whatsapp') return 'success';
    if (type === 'telegram') return 'info';
    if (type === 'email') return 'primary';
    if (type === 'sms') return 'warning';
    return 'secondary';
}

function showAddContactModal() {
    document.getElementById('contactForm').reset();
    document.getElementById('contactId').value = '';
    document.getElementById('contactModalTitle').textContent = 'Agregar Contacto';
    contactModal.show();
}

function editContact(id) {
    const contact = currentContacts.find(c => c.contact_id === id);
    if (!contact) return;
    
    document.getElementById('contactId').value = contact.contact_id;
    document.getElementById('contactName').value = contact.name;
    document.getElementById('contactType').value = contact.type;
    document.getElementById('contactValue').value = contact.value;
    
    document.getElementById('contactModalTitle').textContent = 'Editar Contacto';
    contactModal.show();
}

async function saveContact() {
    const id = document.getElementById('contactId').value;
    const data = {
        name: document.getElementById('contactName').value,
        type: document.getElementById('contactType').value,
        value: document.getElementById('contactValue').value
    };
    
    try {
        let res;
        if (id) {
            // Update
            res = await fetch(`${API_BASE}/contacts/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
        } else {
            // Create
            res = await fetch(`${API_BASE}/contacts`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
        }
        
        const result = await res.json();
        if (result.success) {
            contactModal.hide();
            loadContacts();
        } else {
            alert('Error: ' + result.error);
        }
    } catch (e) { alert('Error de red'); }
}

async function deleteContact(id) {
    if (!confirm('¿Estás seguro de eliminar este contacto?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/contacts/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) loadContacts();
        else alert('Error al eliminar');
    } catch (e) { alert('Error de red'); }
}
