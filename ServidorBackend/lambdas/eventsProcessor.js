// lambdas/eventsProcessor.js
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { DynamoDBClient, UpdateItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");

const snsClient = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

const TABLE_NAME = process.env.TABLE_NAME;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CONTACTS_TABLE_NAME = process.env.CONTACTS_TABLE_NAME;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Helper para unmarshall simple sin dependencias externas
function simpleUnmarshall(item) {
  const result = {};
  for (const key in item) {
    const val = item[key];
    if (val.S !== undefined) result[key] = val.S;
    else if (val.N !== undefined) result[key] = parseFloat(val.N);
    else if (val.BOOL !== undefined) result[key] = val.BOOL;
    else if (val.M !== undefined) result[key] = simpleUnmarshall(val.M);
    else if (val.L !== undefined) result[key] = val.L.map(i => i.M ? simpleUnmarshall(i.M) : (i.S || i.N || i.BOOL));
    else if (val.NULL !== undefined) result[key] = null;
  }
  return result;
}

exports.handler = async (event) => {
  console.log("Processing batch of events:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    if (record.eventName === "INSERT" || record.eventName === "MODIFY") {
      try {
        // 1. Unmarshall DynamoDB image to standard JSON
        const richEvent = simpleUnmarshall(record.dynamodb.NewImage);
        const oldEvent = record.dynamodb.OldImage ? simpleUnmarshall(record.dynamodb.OldImage) : {};
        
        console.log(`Processing event_id: ${richEvent.event_id}, Risk: ${richEvent.risk_level}, EventName: ${record.eventName}`);

        // 2. Logic based on Risk Level
        // Trigger if it IS confirmed NOW, and (it was NOT confirmed BEFORE or it's a NEW record)
        if ((richEvent.risk_level === "CONFIRMED" || richEvent.risk_level === "RISK") && oldEvent.risk_level !== richEvent.risk_level) {
             
             // Registrar timestamp de procesamiento en la nube
             const tsCloud = Date.now();
             console.log(`Recording ts_cloud_processed: ${tsCloud} for ${richEvent.event_id}`);
             
             try {
                 await ddbClient.send(new UpdateItemCommand({
                     TableName: TABLE_NAME,
                     Key: { "event_id": { S: richEvent.event_id } },
                     UpdateExpression: "SET ts_cloud_processed = :ts",
                     ExpressionAttributeValues: { ":ts": { N: tsCloud.toString() } }
                 }));
             } catch (updateErr) {
                 console.error("Error updating ts_cloud_processed:", updateErr);
             }

             if (richEvent.risk_level === "CONFIRMED") {
                await handleConfirmedFire(richEvent);
             }
        } else {
             console.log(`Normal event or already processed: ${richEvent.event_id}`);
        }

      } catch (err) {
        console.error("Error processing record:", err);
      }
    }
  }
};

async function handleConfirmedFire(event) {
  const eventId = event.event_id;
  const confidence = event.ai_result?.confidence || "N/A";
  const deviceId = event.device_id || "unknown";
  
  // Construct Evidence Link
  let evidenceLink = "No evidence";
  if (event.evidence && event.evidence.key) {
     evidenceLink = `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${event.evidence.key}`;
     // In a real scenario, Generate Presigned URL here if bucket is private
  }

  const message = `🚨 🔥 FUEGO CONFIRMADO
  
  ID: ${eventId}
  Device: ${deviceId}
  Confianza: ${confidence}
  Hora: ${new Date(event.timestamp).toLocaleString()}
  
  Evidencia: ${evidenceLink}
  
  Acción Requerida Inmediata.
  `;

  // 1. Send SNS Notification (Email/SMS)
  try {
      if (SNS_TOPIC_ARN) {
        await snsClient.send(new PublishCommand({
            TopicArn: SNS_TOPIC_ARN,
            Message: message,
            Subject: "🚨 ALERTA DE FUEGO DETECTADO"
        }));
        console.log(`[SNS] Notification sent for ${eventId}`);
      } else {
          console.log("[SNS] No Topic ARN configured.");
      }
  } catch (error) {
      console.error("[SNS] Failed to send notification:", error);
  }

  // 2. Send Telegram Notification
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendTelegram(message, TELEGRAM_CHAT_ID);
  }

  // 4. Dynamic Contacts Notification
  if (CONTACTS_TABLE_NAME) {
      try {
          const contacts = await getContacts();
          console.log(`[Contacts] Found ${contacts.length} dynamic contacts`);
          
          for (const contact of contacts) {
              if (contact.type === 'email') {
                  // Email is handled by SNS subscription usually, but if we had an email service:
                  // await sendEmail(contact.value, message);
                  console.log(`[Contacts] Email contact found: ${contact.value} (Managed via SNS subscription if added)`);
              } else if (contact.type === 'whatsapp') {
                  // Assuming the same API can handle different numbers if the API supports it
                  // Or if we use Twilio, we pass the number.
                  // For now, we log it as the generic webhook might be fixed to one number.
                  console.log(`[Contacts] WhatsApp contact: ${contact.value} - Sending...`);
                  // If the API supports 'to' field:
                  await sendWhatsApp(message, contact.value);
              } else if (contact.type === 'telegram') {
                  console.log(`[Contacts] Telegram contact: ${contact.value} - Sending...`);
                  await sendTelegram(message, contact.value);
              } else if (contact.type === 'sms') {
                  console.log(`[Contacts] SMS contact: ${contact.value} - Sending via SNS...`);
                  try {
                      await snsClient.send(new PublishCommand({
                          Message: message,
                          PhoneNumber: contact.value
                      }));
                  } catch (smsErr) {
                      console.error(`[Contacts] Error sending SMS to ${contact.value}:`, smsErr);
                  }
              }
          }
      } catch (err) {
          console.error("[Contacts] Error processing dynamic contacts:", err);
      }
  }
}

async function getContacts() {
    try {
        const data = await ddbClient.send(new ScanCommand({ TableName: CONTACTS_TABLE_NAME }));
        return data.Items ? data.Items.map(item => unmarshall(item)) : [];
    } catch (e) {
        console.error("Error scanning contacts table:", e);
        return [];
    }
}

async function sendTelegram(text, chatId) {
    if (!chatId || chatId === "fuegocloud_bot") {
        console.error(`[Telegram] Invalid Chat ID: ${chatId}. Please use a numeric ID.`);
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text
            })
        });
        const data = await response.json();
        if (!data.ok) {
            console.error(`[Telegram] Error sending to ${chatId}:`, data);
        } else {
            console.log(`[Telegram] Message sent to ${chatId}`);
        }
    } catch (error) {
        console.error(`[Telegram] Failed to send to ${chatId}:`, error);
    }
}

async function sendWhatsApp(text, phoneNumber) {
    // Placeholder for WhatsApp API (e.g. Twilio, Meta API)
    console.log(`[WhatsApp] Simulation: Sending to ${phoneNumber}: ${text.substring(0, 50)}...`);
    // Implementation would go here
}

