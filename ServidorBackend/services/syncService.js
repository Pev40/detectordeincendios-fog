// services/syncService.js

const databaseService = require("./databaseService");
const cloudDb = require("./cloudDb");
const uuid = require('uuid');

// default interval 5 minutes
const DEFAULT_INTERVAL = 5 * 60 * 1000;

/**
 * Save a capture locally and sync to cloud.
 */
async function saveCapture(capture) {
  try {
    await databaseService.saveCapture(capture);
    await cloudDb.syncEvent({
      eventType: "capture",
      sensorId: capture.requestId || "system",
      payload: capture
    });
  } catch (err) {
    console.error("[syncService] Error saving capture:", err);
  }
}

/**
 * Save an alert locally and sync to cloud.
 */
async function saveAlert(alert) {
  try {
    await databaseService.saveAlert(alert);
    await cloudDb.syncEvent({
      eventType: "alert",
      sensorId: alert.type || "system",
      payload: alert
    });
  } catch (err) {
    console.error("[syncService] Error saving alert:", err);
  }
}

/**
 * Start periodic sensor data synchronization.
 */
function startPeriodicSync(intervalMs = DEFAULT_INTERVAL) {
  console.log(`[syncService] Starting periodic sync every ${intervalMs / 1000}s`);
  
  // Run immediately (optional, maybe wait for interval first? 
  // User said "cada 5 minutos", better wait first or run now? 
  // Let's run now to clear backlog, then wait)
  runSyncCycle();
  
  setInterval(() => {
    runSyncCycle();
  }, intervalMs);
}

async function syncContacts() {
  try {
    const unsynced = databaseService.getUnsyncedContacts();
    if (unsynced.length === 0) return;

    console.log(`[syncService] Syncing ${unsynced.length} contacts to cloud...`);
    for (const contact of unsynced) {
      await cloudDb.addContact({
        contact_id: contact.id,
        name: contact.name,
        type: contact.type,
        value: contact.value,
        created_at: contact.created_at
      });
      databaseService.markContactSynced(contact.id);
    }
    console.log("[syncService] Contacts sync completed.");
  } catch (err) {
    console.error("[syncService] Error syncing contacts:", err);
  }
}

async function runSyncCycle() {
  try {
    // 1. Sync Contacts first (usually small and important)
    await syncContacts();

    // 2. Sync Sensor Data
    let lastSyncConfig = databaseService.getConfig('last_cloud_sync');
    let lastSyncTime;

    if (lastSyncConfig && lastSyncConfig.value) {
      lastSyncTime = lastSyncConfig.value; // It's a string from SQLite
    } else {
      // If never synced, start from 1 hour ago to act as "recent history"
      lastSyncTime = new Date(Date.now() - 3600000).toISOString();
    }

    console.log(`[syncService] Checking for sensor data since ${lastSyncTime}`);
    
    // Get new records
    const records = databaseService.getSensorDataSince(lastSyncTime);
    
    if (records.length === 0) {
      console.log("[syncService] No new records to sync.");
      return;
    }

    // Map to cloud events
    const events = records.map(r => ({
      event_id: `telemetry-${r.id || uuid.v4()}`, // Generar event_id para cumplir con el esquema V2
      device_id: r.device_id || "arduino-01",
      timestamp: new Date(r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z').getTime(),
      eventType: "sensor_telemetry",
      risk_level: "NORMAL", // Los reportes periódicos suelen ser normales si no dispararon alerta
      sensor_data: {
        temperature: r.temperature,
        light: r.light,
        smoke: r.smoke,
        humidity: r.humidity,
        dbTimestamp: r.timestamp
      }
    }));

    // Sync batch
    await cloudDb.syncBatch(events);

    // Update cursor to the timestamp of the LAST synced record
    const lastRecord = records[records.length - 1];
    databaseService.setConfig('last_cloud_sync', lastRecord.timestamp, 'string');
    
    console.log(`[syncService] Successfully synced ${records.length} sensor records.`);

  } catch (err) {
    console.error("[syncService] Error in periodic sync cycle:", err);
  }
}

module.exports = { saveCapture, saveAlert, startPeriodicSync };
