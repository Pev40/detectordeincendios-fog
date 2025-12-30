// services/aiService.js (External)
const axios = require('axios');

/**
 * Trigger analysis on external AI service.
 * @param {string} aiServiceUrl - URL of the AI service (e.g., http://10.10.2.127:5000/analyze)
 * @param {string} rtspUrl - RTSP stream URL
 * @param {string} imageBase64 - Optional image data if no RTSP
 * @param {object} sensorData - Optional sensor context
 * @param {string} eventId - Unique ID for the event context
 * @param {object} timestamps - Observability timestamps { backend_receive }
 */
async function analyze(aiServiceUrl, rtspUrl, imageBase64 = null, sensorData = {}, eventId = null, timestamps = {}) {
  try {
    const payload = {
      event_id: eventId,
      rtsp_url: rtspUrl,
      imageBase64: imageBase64,
      sensors: sensorData,
      include_image: true, // Solicitar retorno de imagen para S3 (Opción A)
      timestamps: timestamps // Pasar timestamps recolectados hasta ahora
    };

    console.log(`[aiService] Sending request to ${aiServiceUrl} [EventID: ${eventId}]`);
    if (rtspUrl) console.log(`[aiService] RTSP: ${rtspUrl}`);

    const start = Date.now();
    const response = await axios.post(aiServiceUrl, payload, { timeout: 15000 }); // Aumento timeout por transferencia de imagen
    
    // Inject backend timestamp for latency tracking
    if (response.data) {
        response.data.ts_backend_response_jetson = Date.now();
        // Asegurar que al menos tenga los campos esperados
        if (response.data.confidence === undefined) response.data.confidence = 0;
        if (response.data.fireDetected === undefined) response.data.fireDetected = false;
        if (!response.data.class) response.data.class = 'unknown';
        if (!response.data.boxes) response.data.boxes = [];
    }
    
    console.log(`[aiService] Response received for ${eventId}:`, {
      fireDetected: response.data?.fireDetected,
      confidence: response.data?.confidence,
      class: response.data?.class
    });
    
    return response.data;
  } catch (error) {
    console.error(`[aiService] Error calling external AI: ${error.message}`);
    // Return a safe fallback or throw depending on desired behavior
    return { error: error.message };
  }
}

module.exports = { analyze };
