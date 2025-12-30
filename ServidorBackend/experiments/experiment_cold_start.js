const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Configuration
const REGION = process.env.AWS_REGION || "us-east-1";
const FUNCTION_NAME = process.env.AWS_LAMBDA_EMAIL_FUNCTION || "eventsProcessor"; 
const TABLE_NAME = process.env.DYNAMO_TABLE_V2 || "fire-events-v2-6d74e46";
const INTERVAL_MINUTES = 30;
const TOTAL_COLD_INVOCATIONS = 10;
const TOTAL_WARM_INVOCATIONS = 50;

const csvPath = path.join(__dirname, 'results_coldstart_v3.csv');
const csvInSituPath = path.join(__dirname, 'results_insitu_v1.csv');

if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, "timestamp,type,event_id,client_invoke_ms,lambda_duration_ms,lambda_init_ms,status_code,parse_ok\n");
}
if (!fs.existsSync(csvInSituPath)) {
    fs.writeFileSync(csvInSituPath, "timestamp,type,event_id,total_pipeline_ms,status\n");
}

const ddbClient = new DynamoDBClient({ region: REGION });

async function invokeInSitu(type) {
    const eventId = `insitu-${type.toLowerCase()}-${Date.now()}`;
    const startTime = Date.now();

    console.log(`[In-Situ ${type}] Starting pipeline for ${eventId}...`);

    try {
        // 1. PutItem to trigger the stream
        await ddbClient.send(new PutItemCommand({
            TableName: TABLE_NAME,
            Item: {
                event_id: { S: eventId },
                risk_level: { S: "RISK" }, 
                timestamp: { N: startTime.toString() }
            }
        }));

        // 2. Polling for ts_cloud_processed
        const MAX_POLL_ATTEMPTS = 30;
        const POLL_INTERVAL_MS = 2000;
        
        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            
            const { Item } = await ddbClient.send(new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { event_id: { S: eventId } }
            }));

            if (Item && Item.ts_cloud_processed) {
                const tsCloud = parseInt(Item.ts_cloud_processed.N);
                const totalPipelineMs = tsCloud - startTime;
                
                const row = `${new Date().toISOString()},${type},${eventId},${totalPipelineMs},SUCCESS\n`;
                fs.appendFileSync(csvInSituPath, row);
                
                console.log(`[In-Situ ${type}] Pipeline completed in ${totalPipelineMs}ms (Attempt ${attempt})`);
                return;
            }
            
            if (attempt % 5 === 0) console.log(`[In-Situ ${type}] Still waiting for Cloud processing... (Attempt ${attempt})`);
        }

        console.warn(`[In-Situ ${type}] Timeout waiting for ${eventId}`);
        fs.appendFileSync(csvInSituPath, `${new Date().toISOString()},${type},${eventId},0,TIMEOUT\n`);

    } catch (error) {
        console.error(`[In-Situ ${type}] Error:`, error);
        fs.appendFileSync(csvInSituPath, `${new Date().toISOString()},${type},${eventId},0,ERROR\n`);
    }
}

async function invokeLambda(type) {
    const lambdaClient = new LambdaClient({ region: REGION });
    const eventId = `test-${type.toLowerCase()}-${Date.now()}`;
    
    // Realistic DynamoDB Stream Payload
    const payload = JSON.stringify({
        Records: [
            {
                eventID: "1",
                eventName: "INSERT",
                eventSource: "aws:dynamodb",
                awsRegion: REGION,
                dynamodb: {
                    NewImage: {
                        event_id: { S: eventId },
                        risk_level: { S: "RISK" },
                        timestamp: { N: Date.now().toString() }
                    },
                    StreamViewType: "NEW_AND_OLD_IMAGES"
                }
            }
        ]
    });

    const start = Date.now();
    try {
        const command = new InvokeCommand({
            FunctionName: FUNCTION_NAME,
            Payload: Buffer.from(payload),
            LogType: "Tail"
        });

        const response = await lambdaClient.send(command);
        const clientDuration = Date.now() - start;
        
        const logs = response.LogResult ? Buffer.from(response.LogResult, 'base64').toString('utf-8') : "";
        
        // Robust Regex for REPORT line
        const reportMatch = logs.match(/REPORT RequestId: [^\n]+/);
        const initMatch = logs.match(/Init Duration: ([\d.]+) ms/);
        const durationMatch = logs.match(/Duration: ([\d.]+) ms/);
        
        const lambdaInitMs = initMatch ? parseFloat(initMatch[1]) : 0;
        const lambdaDurationMs = durationMatch ? parseFloat(durationMatch[1]) : 0;
        const parseOk = reportMatch ? "true" : "false";

        const row = `${new Date().toISOString()},${type},${eventId},${clientDuration},${lambdaDurationMs},${lambdaInitMs},${response.StatusCode},${parseOk}\n`;
        fs.appendFileSync(csvPath, row);
        
        const observed = lambdaInitMs > 0 ? "COLD" : "WARM";
        console.log(`[${type}] Observed: ${observed} | Client: ${clientDuration}ms | Lambda: ${lambdaDurationMs}ms | Init: ${lambdaInitMs}ms`);

    } catch (error) {
        console.error(`Error invoking Lambda:`, error);
    }
}

async function waitWithCountdown(minutes) {
    const totalSeconds = minutes * 60;
    for (let i = totalSeconds; i > 0; i--) {
        const mins = Math.floor(i / 60);
        const secs = i % 60;
        // \r returns the cursor to the start of the line
        process.stdout.write(`\r[Reloj] Próximo ciclo en: ${mins}m ${secs}s...    `);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("\n[Reloj] ¡Tiempo cumplido! Iniciando ciclo.");
}

async function runColdStartExperiment() {
    console.log("Starting Cold Start Experiment...");
    
    // 1. Cold Invocations (Micro-benchmark + In-Situ)
    console.log(`Scheduling ${TOTAL_COLD_INVOCATIONS} cold cycles every ${INTERVAL_MINUTES} minutes...`);
    for (let i = 0; i < TOTAL_COLD_INVOCATIONS; i++) {
        console.log(`\n--- Cycle ${i + 1}/${TOTAL_COLD_INVOCATIONS} ---`);
        
        // Micro-benchmark
        await invokeLambda('COLD');
        
        // In-Situ (Real pipeline)
        await invokeInSitu('COLD_CYCLE');

        if (i < TOTAL_COLD_INVOCATIONS - 1) {
            await waitWithCountdown(INTERVAL_MINUTES);
        }
    }

    // 2. Warm Invocations (Burst)
    console.log("\nStarting Warm Burst (Micro-benchmark)...");
    for (let i = 0; i < TOTAL_WARM_INVOCATIONS; i++) {
        await invokeLambda('WARM');
    }

    console.log("\nStarting Warm Burst (In-Situ)...");
    for (let i = 0; i < 10; i++) { // Fewer in-situ warm tests as they take longer to poll
        await invokeInSitu('WARM_BURST');
    }

    console.log("Experiment Finished.");
}

runColdStartExperiment();
