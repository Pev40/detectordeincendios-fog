const { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const crypto = require('crypto');

const client = new DynamoDBClient({});

const EVENTS_TABLE = process.env.EVENTS_TABLE;
const CONTACTS_TABLE = process.env.CONTACTS_TABLE;
const CONFIG_TABLE = process.env.CONFIG_TABLE;

exports.handler = async (event) => {
  console.log("Request:", JSON.stringify(event));
  
  // Handle CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
  };

  if (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  // Normalizar path y method para evitar errores
  const method = event.requestContext?.http?.method || event.httpMethod;
  const rawPath = event.requestContext?.http?.path || event.path || "";
  const path = rawPath.endsWith('/') && rawPath.length > 1 ? rawPath.slice(0, -1) : rawPath;
  
  try {
    // === CONTACTS API ===
    if (path === '/contacts') {
        if (method === 'GET') {
            const data = await client.send(new ScanCommand({ TableName: CONTACTS_TABLE }));
            const items = (data.Items || []).map(item => unmarshall(item));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: items }) };
        }
        if (method === 'POST') {
            const body = JSON.parse(event.body);
            const item = {
                contact_id: crypto.randomUUID(),
                type: body.type,
                value: body.value,
                name: body.name,
                created_at: new Date().toISOString()
            };
            await client.send(new PutItemCommand({ TableName: CONTACTS_TABLE, Item: marshall(item) }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, contact: item }) };
        }
    }
    
    if (path.startsWith('/contacts/')) {
        const id = path.split('/').pop();
        if (method === 'DELETE') {
            await client.send(new DeleteItemCommand({ TableName: CONTACTS_TABLE, Key: marshall({ contact_id: id }) }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Deleted' }) };
        }
        if (method === 'PUT') {
            const body = JSON.parse(event.body);
            const item = {
                contact_id: id,
                type: body.type,
                value: body.value,
                name: body.name
            };
            await client.send(new PutItemCommand({ TableName: CONTACTS_TABLE, Item: marshall(item) }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Updated' }) };
        }
    }

    // === STATUS & DATA API ===
    if (path === '/status') {
        // Usar Query sobre el GSI DeviceIdIndex para obtener los más recientes de forma eficiente
        let items = [];
        try {
            const queryData = await client.send(new QueryCommand({
                TableName: EVENTS_TABLE,
                IndexName: "DeviceIdIndex",
                KeyConditionExpression: "device_id = :v_device",
                ExpressionAttributeValues: marshall({
                    ":v_device": "arduino-01"
                }),
                ScanIndexForward: false, // Descendente (más reciente primero)
                Limit: 50
            }));
            items = (queryData.Items || []).map(item => unmarshall(item));
        } catch (queryError) {
            console.error("Query failed, falling back to Scan:", queryError);
            const scanData = await client.send(new ScanCommand({ 
                TableName: EVENTS_TABLE,
                Limit: 100
            }));
            items = (scanData.Items || []).map(item => unmarshall(item));
            items.sort((a, b) => b.timestamp - a.timestamp);
        }
        
        const latest = items[0] || {};
        
        // Get Config
        let config = { temperature: 50, light: 1000, smoke: 500, humidity: 10 }; // Defaults
        try {
            const configData = await client.send(new ScanCommand({ TableName: CONFIG_TABLE, Limit: 1 }));
            const configItems = (configData.Items || []).map(item => unmarshall(item));
            if (configItems.length > 0) {
                config = configItems[0];
            }
        } catch (e) { console.warn("No config found", e); }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: {
                    sensorData: latest.sensor_data || { temperature: 0, light: 0, smoke: 0, humidity: 0 },
                    alertStatus: latest.risk_level === 'CONFIRMED' ? 'Confirmado' : (latest.risk_level === 'RISK' ? 'Riesgo' : 'Normal'),
                    thresholds: config,
                    recentEvents: items.slice(0, 15), // Enviar los últimos 15 eventos
                    lastUpdate: latest.formatted_time || new Date(latest.timestamp).toISOString()
                }
            })
        };
    }

    // === CONFIG API ===
    if (path === '/config' && method === 'POST') {
        const body = JSON.parse(event.body);
        const item = {
            config_id: 'main_config',
            ...body
        };
        await client.send(new PutItemCommand({ TableName: CONFIG_TABLE, Item: marshall(item) }));
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ message: "Not Found" }) };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
};
