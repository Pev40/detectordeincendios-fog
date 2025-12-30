// services/cloudDb.js

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { PutCommand, ScanCommand, DeleteCommand, UpdateCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const uuid = require('uuid');

// Read configuration from environment variables
const REGION = process.env.AWS_REGION || "us-east-1";
// Use v2 table by default for new architecture
const TABLE_NAME = process.env.DYNAMO_TABLE_V2 || "fire-events-v2";
const CONTACTS_TABLE_NAME = process.env.CONTACTS_TABLE_NAME || "fire-contacts";

const client = new DynamoDBClient({ region: REGION });
const ddbDoc = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true, // Limpia automáticamente valores undefined
    convertClassInstanceToMap: true, // Convierte instancias de clases (como Date) a mapas
    convertEmptyValues: false
  }
});

/**
 * Sync a generic event to DynamoDB (Rich Event Schema).
 * 
 * New Schema:
 * - PK: event_id (String)
 * - Attributes: device_id, timestamp, risk_level, evidence, latencies, etc.
 */
async function syncEvent(event) {
  if (!event || !event.event_id) {
    if (event.eventType) {
        // Fallback for old calls (compatibilidad temporal)
        console.warn("[cloudDb] Using legacy sync for event without event_id");
        // We could redirect to old logic or wrap it. 
        // For 'Observability' task, we focus on the new Rich Event.
        // Let's wrap it in a pseudo event_id if missing?
        // Or just let it fail/log.
    }
    console.warn("[cloudDb] syncEvent called without event_id");
    return;
  }

  // Construct the item based on the "Rich Event" definition
  // Ensure we have the keys for the GSIs
  const item = {
    event_id: event.event_id,
    device_id: event.device_id || "unknown_device",
    timestamp: event.timestamp || Date.now(), // Number
    risk_level: event.risk_level || "NORMAL",
    
    // Optional rich data
    formatted_time: new Date(event.timestamp || Date.now()).toISOString(),
    ai_result: event.ai_result || {},
    sensor_data: event.sensor_data || {},
    latencies: event.latencies || {},
    evidence: event.evidence || null, // { bucket, key }
    
    // Legacy fields if needed for other queries?
    eventType: event.eventType || "fire_analysis_event",
  };

  try {
    await ddbDoc.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`[cloudDb] ✅ Synced event ${event.event_id} to DynamoDB table ${TABLE_NAME}`);
  } catch (err) {
    // Log del error pero no bloquear el flujo
    if (err.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      console.warn(`[cloudDb] ⚠️ Tabla DynamoDB no existe (${TABLE_NAME}). Desactiva con ENABLE_CLOUD_SYNC=false`);
    } else if (err.name === 'ValidationException') {
      console.warn(`[cloudDb] ⚠️ Validación de AWS: ${err.message}`);
    } else {
      console.error("[cloudDb] ❌ Error syncing to DynamoDB:", err.message || err);
    }
    // No relanzar el error - permitir que el sistema continúe funcionando
  }
}

/**
 * Sync multiple events sequentially.
 */
async function syncBatch(events) {
  if (!events || events.length === 0) return;
  console.log(`[cloudDb] Syncing batch of ${events.length} events...`);
  
  for (const event of events) {
    await syncEvent(event);
  }
}

/**
 * Add a new contact for notifications
 * @param {Object} contact { type: 'email'|'whatsapp'|'telegram', value: '...', name: '...' }
 */
async function addContact(contact) {
  const item = {
    contact_id: uuid.v4(),
    type: contact.type,
    value: contact.value,
    name: contact.name || 'Unknown',
    created_at: new Date().toISOString()
  };

  try {
    await ddbDoc.send(new PutCommand({
      TableName: CONTACTS_TABLE_NAME,
      Item: item
    }));
    console.log(`[cloudDb] Contact added: ${item.value} (${item.type})`);
    return item;
  } catch (error) {
    console.error("[cloudDb] Error adding contact:", error);
    throw error;
  }
}

/**
 * Get all contacts
 */
async function getContacts() {
  try {
    const result = await ddbDoc.send(new ScanCommand({
      TableName: CONTACTS_TABLE_NAME
    }));
    return result.Items || [];
  } catch (error) {
    console.error("[cloudDb] Error fetching contacts:", error);
    return [];
  }
}

/**
 * Delete a contact
 */
async function deleteContact(contactId) {
  try {
    await ddbDoc.send(new DeleteCommand({
      TableName: CONTACTS_TABLE_NAME,
      Key: { contact_id: contactId }
    }));
    console.log(`[cloudDb] Contact deleted: ${contactId}`);
    return true;
  } catch (error) {
    console.error("[cloudDb] Error deleting contact:", error);
    throw error;
  }
}

/**
 * Update a contact
 */
async function updateContact(contactId, updates) {
  try {
    // Construct UpdateExpression dynamically
    let updateExp = "set";
    const expAttrValues = {};
    const expAttrNames = {};
    
    Object.keys(updates).forEach((key, index) => {
      if (key === 'contact_id') return; // Don't update PK
      const attrName = `#attr${index}`;
      const attrVal = `:val${index}`;
      updateExp += ` ${attrName} = ${attrVal},`;
      expAttrNames[attrName] = key;
      expAttrValues[attrVal] = updates[key];
    });
    
    // Remove trailing comma
    updateExp = updateExp.slice(0, -1);

    await ddbDoc.send(new UpdateCommand({
      TableName: CONTACTS_TABLE_NAME,
      Key: { contact_id: contactId },
      UpdateExpression: updateExp,
      ExpressionAttributeNames: expAttrNames,
      ExpressionAttributeValues: expAttrValues
    }));
    console.log(`[cloudDb] Contact updated: ${contactId}`);
    return true;
  } catch (error) {
    console.error("[cloudDb] Error updating contact:", error);
    throw error;
  }
}

module.exports = { 
  syncEvent, 
  syncBatch,
  addContact,
  getContacts,
  deleteContact,
  updateContact
};
