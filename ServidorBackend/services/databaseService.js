// Servicio de SQLite para guardar datos del sistema

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');

class DatabaseService {
  constructor() {
    const dbDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const dbPath = path.join(dbDir, 'fireid.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    
    console.log('🗄️  Base de datos SQLite inicializada:', dbPath);
  }

  /**
   * Inicializar tablas
   */
  initializeTables() {
    try {
      // Tabla de sensores
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sensor_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          temperature REAL,
          light REAL,
          smoke REAL,
          humidity REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          device_id TEXT
        )
      `);

      // Tabla de alertas
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_type TEXT,
          severity TEXT,
          message TEXT,
          fire_detected BOOLEAN,
          confidence REAL,
          image_path TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved BOOLEAN DEFAULT 0
        )
      `);

      // Tabla de capturas
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_id TEXT UNIQUE,
          image_path TEXT,
          audio_path TEXT,
          analysis_result TEXT,
          fire_detected BOOLEAN,
          confidence REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabla de configuración
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS configuration (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE,
          value TEXT,
          type TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabla de eventos del sistema
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT,
          level TEXT,
          message TEXT,
          data TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabla de contactos (Local cache/sync)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
          id TEXT PRIMARY KEY,
          name TEXT,
          type TEXT,
          value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced BOOLEAN DEFAULT 0
        )
      `);

      console.log('✅ Tablas de base de datos creadas/verificadas');
    } catch (error) {
      console.error('❌ Error al inicializar tablas:', error);
      throw error;
    }
  }

  /**
   * Guardar datos de sensores
   */
  saveSensorData(data) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sensor_data (temperature, light, smoke, humidity, device_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.temperature,
        data.light,
        data.smoke,
        data.humidity || null,
        data.deviceId || 'arduino-1',
        new Date().toISOString()
      );

      return result;
    } catch (error) {
      console.error('❌ Error al guardar datos de sensores:', error);
      throw error;
    }
  }

  /**
   * Obtener últimos datos de sensores
   */
  getLatestSensorData(limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sensor_data
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      return stmt.all(limit);
    } catch (error) {
      console.error('❌ Error al obtener datos de sensores:', error);
      return [];
    }
  }

  /**
   * Obtener datos de sensores desde una fecha específica
   */
  getSensorDataSince(date) {
    try {
      // date puede ser string ISO o Date object
      const dateStr = date instanceof Date ? date.toISOString() : date;
      
      const stmt = this.db.prepare(`
        SELECT * FROM sensor_data
        WHERE timestamp > ?
        ORDER BY timestamp ASC
      `);

      return stmt.all(dateStr);
    } catch (error) {
      console.error('❌ Error al obtener datos de sensores batch:', error);
      return [];
    }
  }

  /**
   * Guardar alerta
   */
  saveAlert(alertData) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO alerts (alert_type, severity, message, fire_detected, confidence, image_path, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        alertData.type || 'warning',
        alertData.severity || 'medium',
        alertData.message,
        alertData.fireDetected || false,
        alertData.confidence || 0,
        alertData.imagePath || null,
        new Date().toISOString()
      );

      return result;
    } catch (error) {
      console.error('❌ Error al guardar alerta:', error);
      throw error;
    }
  }

  /**
   * Obtener alertas
   */
  getAlerts(limit = 50, unresolvedOnly = false) {
    try {
      let query = `
        SELECT * FROM alerts
      `;
      
      if (unresolvedOnly) {
        query += ` WHERE resolved = 0`;
      }
      
      query += ` ORDER BY timestamp DESC LIMIT ?`;

      const stmt = this.db.prepare(query);
      return stmt.all(limit);
    } catch (error) {
      console.error('❌ Error al obtener alertas:', error);
      return [];
    }
  }

  /**
   * Obtener último estado de alerta basado en la última alerta
   */
  getLastAlertStatus() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM alerts
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      
      const lastAlert = stmt.get();
      
      if (!lastAlert) {
        return 'Normal';
      }
      
      // Si hay fuego detectado con alta confianza, es "Confirmado"
      if (lastAlert.fire_detected && lastAlert.confidence > 0.7) {
        return 'Confirmado';
      }
      
      // Si hay alerta no resuelta, es "Riesgo"
      if (!lastAlert.resolved) {
        return 'Riesgo';
      }
      
      return 'Normal';
    } catch (error) {
      console.error('❌ Error al obtener último estado de alerta:', error);
      return 'Normal';
    }
  }

  /**
   * Marcar alerta como resuelta
   */
  resolveAlert(alertId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE alerts SET resolved = 1 WHERE id = ?
      `);

      return stmt.run(alertId);
    } catch (error) {
      console.error('❌ Error al resolver alerta:', error);
      throw error;
    }
  }

  /**
   * Guardar captura
   */
  saveCapture(captureData) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO captures (request_id, image_path, audio_path, analysis_result, fire_detected, confidence, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        captureData.requestId,
        captureData.imagePath || null,
        captureData.audioPath || null,
        captureData.analysisResult ? JSON.stringify(captureData.analysisResult) : null,
        captureData.fireDetected ? 1 : 0,
        captureData.confidence || 0,
        new Date().toISOString()
      );

      return result;
    } catch (error) {
      console.error('❌ Error al guardar captura:', error);
      throw error;
    }
  }

  /**
   * Obtener capturas
   */
  getCaptures(limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, request_id, image_path, fire_detected, confidence, timestamp
        FROM captures
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      return stmt.all(limit);
    } catch (error) {
      console.error('❌ Error al obtener capturas:', error);
      return [];
    }
  }

  /**
   * Guardar evento del sistema
   */
  logEvent(eventType, level, message, data = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_events (event_type, level, message, data)
        VALUES (?, ?, ?, ?)
      `);

      return stmt.run(
        eventType,
        level,
        message,
        data ? JSON.stringify(data) : null
      );
    } catch (error) {
      console.error('❌ Error al registrar evento:', error);
    }
  }

  /**
   * Guardar/actualizar configuración
   */
  setConfig(key, value, type = 'string') {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO configuration (key, value, type)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, type = ?, updated_at = CURRENT_TIMESTAMP
      `);

      return stmt.run(key, value, type, value, type);
    } catch (error) {
      console.error('❌ Error al guardar configuración:', error);
      throw error;
    }
  }

  /**
   * Obtener configuración
   */
  getConfig(key) {
    try {
      const stmt = this.db.prepare(`
        SELECT value, type FROM configuration WHERE key = ?
      `);

      return stmt.get(key);
    } catch (error) {
      console.error('❌ Error al obtener configuración:', error);
      return null;
    }
  }

  /**
   * Guardar/actualizar contacto localmente
   */
  saveContact(contact) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO contacts (id, name, type, value, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          name = ?, type = ?, value = ?, synced = ?
      `);

      const id = contact.id || contact.contact_id || uuid.v4();
      const createdAt = contact.created_at || new Date().toISOString();
      const synced = contact.synced ? 1 : 0;

      return stmt.run(
        id, contact.name, contact.type, contact.value, createdAt, synced,
        contact.name, contact.type, contact.value, synced
      );
    } catch (error) {
      console.error('❌ Error al guardar contacto local:', error);
      throw error;
    }
  }

  /**
   * Obtener contactos no sincronizados
   */
  getUnsyncedContacts() {
    try {
      return this.db.prepare('SELECT * FROM contacts WHERE synced = 0').all();
    } catch (error) {
      console.error('❌ Error al obtener contactos no sincronizados:', error);
      return [];
    }
  }

  /**
   * Marcar contacto como sincronizado
   */
  markContactSynced(id) {
    try {
      return this.db.prepare('UPDATE contacts SET synced = 1 WHERE id = ?').run(id);
    } catch (error) {
      console.error('❌ Error al marcar contacto como sincronizado:', error);
    }
  }

  /**
   * Obtener estadísticas
   */
  getStatistics() {
    try {
      return {
        totalSensorData: this.db.prepare('SELECT COUNT(*) as count FROM sensor_data').get().count,
        totalAlerts: this.db.prepare('SELECT COUNT(*) as count FROM alerts').get().count,
        unresolvedAlerts: this.db.prepare('SELECT COUNT(*) as count FROM alerts WHERE resolved = 0').get().count,
        fireDetections: this.db.prepare('SELECT COUNT(*) as count FROM alerts WHERE fire_detected = 1').get().count,
        totalCaptures: this.db.prepare('SELECT COUNT(*) as count FROM captures').get().count
      };
    } catch (error) {
      console.error('❌ Error al obtener estadísticas:', error);
      return {};
    }
  }

  /**
   * Cerrar base de datos
   */
  close() {
    try {
      this.db.close();
      console.log('🗄️  Base de datos cerrada');
    } catch (error) {
      console.error('❌ Error al cerrar base de datos:', error);
    }
  }
}

module.exports = new DatabaseService();
