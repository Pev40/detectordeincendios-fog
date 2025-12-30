// services/storageService.js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');

// Configuración
const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET_NAME = process.env.S3_BUCKET_NAME || "fire-evidence-bucket"; // Se sobreescribirá con Pulumi output idealmente

const s3Client = new S3Client({ region: REGION });

/**
 * Upload evidence (image/video) to S3.
 * Structure: s3://<bucket>/<device_id>/<YYYY>/<MM>/<DD>/<event_id>.jpg
 * 
 * @param {Buffer|string} fileData - Buffer or Base64 string of the file
 * @param {string} deviceId - ID of the device
 * @param {string} eventId - Unique ID of the event
 * @param {string} extension - File extension (default: jpg)
 */
async function uploadEvidence(fileData, deviceId, eventId, extension = 'jpg') {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const key = `${deviceId}/${year}/${month}/${day}/${eventId}.${extension}`;
    
    // Si es string (supuestamente base64 sin header), convertir a buffer
    let body = fileData;
    if (typeof fileData === 'string') {
        body = Buffer.from(fileData, 'base64');
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`
      // ACL: 'public-read' // Eliminado para evitar errores si el bucket tiene bloqueado el acceso público por ACL
    });

    await s3Client.send(command);

    console.log(`[storageService] Uploaded evidence to s3://${BUCKET_NAME}/${key}`);

    return {
      bucket: BUCKET_NAME,
      key: key,
      location: `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
    };

  } catch (error) {
    console.error(`[storageService] Error uploading to S3: ${error.message}`);
    // No fallar el proceso principal, pero retornar null
    return null;
  }
}

module.exports = { uploadEvidence };
