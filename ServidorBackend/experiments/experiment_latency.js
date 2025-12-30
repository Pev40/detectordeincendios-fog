const axios = require('axios');
const io = require('socket.io-client');
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const SERVER_URL = 'http://localhost:3000';
const TOTAL_REQUESTS = 50;
const TABLE_NAME = process.env.DYNAMO_TABLE_V2 || "fire-events-v2-6d74e46";
const REGION = process.env.AWS_REGION || "us-east-1";

const ddbClient = new DynamoDBClient({ region: REGION });

// Results storage
let completed = 0;
const csvPath = path.join(__dirname, 'results_latency_v2.csv');

// Setup Socket.IO
const socket = io(SERVER_URL);

socket.on('connect', () => {
    console.log('Connected to server via Socket.IO');
    runAllScenarios();
});

socket.on('analysisResult', async (data) => {
    if (data && data.event_id) {
        console.log(`Received analysis result for ${data.event_id}`);
        // Wait a bit for Cloud processing (Lambda) to finish and update DynamoDB
        setTimeout(() => collectMetrics(data.event_id, data.scenario || "unknown"), 10000);
    }
});

async function runAllScenarios() {
    console.log("--- STARTING LATENCY EXPERIMENTS ---");
    
    // Initialize CSV
    const header = "event_id,scenario,ts_sensor,ts_fog_send,ts_fog_res,ts_cloud,lat_fog,lat_cloud,lat_e2e\n";
    fs.writeFileSync(csvPath, header);

    // Scenario 1: Steady (2s interval)
    console.log("\nScenario 1: Steady Load (2s interval)");
    await startExperiment(2000, "steady");
    
    console.log("\nWaiting 30 seconds for cooldown and metrics collection...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Scenario 2: Burst (50ms interval)
    console.log("\nScenario 2: Burst Load (50ms interval)");
    await startExperiment(50, "burst");
    
    console.log("\n--- ALL EXPERIMENTS FINISHED ---");
    console.log("Waiting for final metrics collection...");
}

async function startExperiment(intervalMs, scenarioName) {
    console.log(`Starting ${scenarioName} experiment: ${TOTAL_REQUESTS} requests...`);
    
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        await sendSensorData(i, scenarioName);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
}

async function sendSensorData(index, scenarioName) {
    let imageBase64 = null;
    try {
        const imagePath = path.join(__dirname, 'image.png');
        if (fs.existsSync(imagePath)) {
            imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
        }
    } catch (err) {
        // Ignore
    }

    const payload = {
        temperature: 55 + (Math.random() * 5), 
        light: 1600,
        smoke: 1200,
        humidity: 10,
        imageBase64: imageBase64,
        scenario: scenarioName
    };

    try {
        await axios.post(`${SERVER_URL}/sensor-data`, payload);
        console.log(`[${scenarioName}] [${index + 1}/${TOTAL_REQUESTS}] Sent sensor data`);
    } catch (error) {
        console.error(`Error sending data: ${error.message}`);
    }
}

async function collectMetrics(eventId, scenarioName) {
    const MAX_RETRIES = 8;
    const RETRY_DELAY_MS = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { Item } = await ddbClient.send(new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { event_id: { S: eventId } }
            }));

            if (!Item) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                return;
            }

            const record = unmarshall(Item);
            
            const ts_sensor = record.latencies?.backend_receive_sensor;
            const ts_fog_send = record.latencies?.backend_send_jetson;
            const ts_fog_res = record.latencies?.backend_response_jetson;
            const ts_cloud = record.ts_cloud_processed;

            if (ts_sensor && ts_fog_send && ts_fog_res && ts_cloud) {
                const lat_fog = ts_fog_res - ts_fog_send;
                const lat_cloud = ts_cloud - ts_fog_res;
                const lat_e2e = ts_cloud - ts_sensor;

                const row = `${eventId},${scenarioName},${ts_sensor},${ts_fog_send},${ts_fog_res},${ts_cloud},${lat_fog},${lat_cloud},${lat_e2e}\n`;
                
                fs.appendFileSync(csvPath, row);
                console.log(`[${scenarioName}] Recorded metrics for ${eventId}: E2E=${lat_e2e}ms`);
                completed++;
                return; 
            } else {
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }

        } catch (error) {
            if (attempt < MAX_RETRIES) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
}

