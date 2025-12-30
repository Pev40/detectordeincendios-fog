// Servicio de SQLite para la app móvil usando react-native-quick-sqlite

import { open } from 'react-native-quick-sqlite';

class DatabaseService {
  private db: any = null;
  private dbName = 'fireid.db';
  private initialized = false;

  constructor() {
    // Constructor vacío, la inicialización se hace en initialize()
  }

  /**
   * Inicializar la base de datos
   */
  async initialize(): Promise<void> {
    try {
      if (this.initialized && this.db) {
        console.log('🗄️  Base de datos ya inicializada');
        return;
      }

      // Abrir base de datos
      this.db = open({
        name: this.dbName,
        location: 'default',
      });

      console.log('🗄️  Base de datos SQLite inicializada');
      this.initializeTables();
      this.initialized = true;
    } catch (error) {
      console.error('❌ Error al inicializar base de datos:', error);
      throw error;
    }
  }

  /**
   * Crear tablas
   */
  private initializeTables(): void {
    try {
      // Tabla de alertas locales
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id INTEGER,
          alert_type TEXT,
          severity TEXT,
          message TEXT,
          fire_detected INTEGER,
          confidence REAL,
          image_path TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved INTEGER DEFAULT 0
        )
      `);

      // Tabla de capturas locales
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_captures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_id TEXT UNIQUE,
          image_path TEXT,
          fire_detected INTEGER,
          confidence REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabla de datos sincronizados
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS sync_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT,
          entity_id INTEGER,
          synced INTEGER DEFAULT 0,
          last_sync DATETIME
        )
      `);

      // Tabla de configuración local
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS app_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE,
          value TEXT,
          type TEXT
        )
      `);

      console.log('✅ Tablas de base de datos creadas/verificadas');
    } catch (error) {
      console.error('❌ Error al crear tablas:', error);
      throw error;
    }
  }

  /**
   * Ejecutar sentencia SQL
   */
  private executeSql(sql: string, params: any[] = []): any {
    if (!this.db) {
      throw new Error('Base de datos no inicializada');
    }

    try {
      const result = this.db.execute(sql, params);
      return result;
    } catch (error) {
      console.error('SQL Error:', error, 'SQL:', sql);
      throw error;
    }
  }

  /**
   * Guardar alerta local
   */
  async saveLocalAlert(alertData: any): Promise<void> {
    try {
      // Verificar que la DB esté inicializada
      if (!this.db) {
        console.warn('⚠️  Base de datos no inicializada, inicializando...');
        await this.initialize();
      }

      this.executeSql(
        `INSERT INTO local_alerts (alert_type, severity, message, fire_detected, confidence, image_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          alertData.type || 'warning',
          alertData.severity || 'medium',
          alertData.message,
          alertData.fireDetected ? 1 : 0,
          alertData.confidence || 0,
          alertData.imagePath || null
        ]
      );
      console.log('✅ Alerta guardada en SQLite correctamente');
    } catch (error) {
      console.error('❌ Error al guardar alerta local:', error);
      // No lanzar error para no romper el flujo principal
    }
  }

  /**
   * Obtener alertas locales no sincronizadas
   */
  async getUnsyncedAlerts(): Promise<any[]> {
    try {
      const result = this.executeSql(
        `SELECT * FROM local_alerts 
         WHERE id NOT IN (SELECT entity_id FROM sync_status WHERE entity_type = 'alert')
         ORDER BY timestamp DESC`
      );
      return result.rows?._array || [];
    } catch (error) {
      console.error('❌ Error al obtener alertas no sincronizadas:', error);
      return [];
    }
  }

  /**
   * Obtener todas las alertas locales
   */
  async getAllLocalAlerts(): Promise<any[]> {
    try {
      const result = this.executeSql(
        `SELECT * FROM local_alerts ORDER BY timestamp DESC`
      );
      return result.rows?._array || [];
    } catch (error) {
      console.error('❌ Error al obtener alertas:', error);
      return [];
    }
  }

  /**
   * Guardar captura local
   */
  async saveLocalCapture(captureData: any): Promise<void> {
    try {
      // Verificar que la DB esté inicializada
      if (!this.db) {
        console.warn('⚠️  Base de datos no inicializada, inicializando...');
        await this.initialize();
      }

      this.executeSql(
        `INSERT OR REPLACE INTO local_captures (request_id, image_path, fire_detected, confidence)
         VALUES (?, ?, ?, ?)`,
        [
          captureData.requestId,
          captureData.imagePath || null,
          captureData.fireDetected ? 1 : 0,
          captureData.confidence || 0
        ]
      );
      console.log('✅ Captura guardada en SQLite correctamente');
    } catch (error) {
      console.error('❌ Error al guardar captura local:', error);
      // No lanzar error para no romper el flujo principal
    }
  }

  /**
   * Obtener capturas locales
   */
  async getLocalCaptures(limit: number = 50): Promise<any[]> {
    try {
      const result = this.executeSql(
        `SELECT * FROM local_captures ORDER BY timestamp DESC LIMIT ?`,
        [limit]
      );
      return result.rows?._array || [];
    } catch (error) {
      console.error('❌ Error al obtener capturas:', error);
      return [];
    }
  }

  /**
   * Guardar configuración
   */
  async saveConfig(key: string, value: string, type: string = 'string'): Promise<void> {
    try {
      this.executeSql(
        `INSERT OR REPLACE INTO app_config (key, value, type)
         VALUES (?, ?, ?)`,
        [key, value, type]
      );
    } catch (error) {
      console.error('❌ Error al guardar configuración:', error);
      throw error;
    }
  }

  /**
   * Obtener configuración
   */
  async getConfig(key: string): Promise<string | null> {
    try {
      const result = this.executeSql(
        `SELECT value FROM app_config WHERE key = ?`,
        [key]
      );

      if (result.rows?._array && result.rows._array.length > 0) {
        return result.rows._array[0].value;
      }
      return null;
    } catch (error) {
      console.error('❌ Error al obtener configuración:', error);
      return null;
    }
  }

  /**
   * Marcar como sincronizado
   */
  async markAsSynced(entityType: string, entityId: number): Promise<void> {
    try {
      this.executeSql(
        `INSERT OR REPLACE INTO sync_status (entity_type, entity_id, synced, last_sync)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP)`,
        [entityType, entityId]
      );
    } catch (error) {
      console.error('❌ Error al marcar como sincronizado:', error);
    }
  }

  /**
   * Limpiar base de datos
   */
  async clearAll(): Promise<void> {
    try {
      this.executeSql('DELETE FROM local_alerts');
      this.executeSql('DELETE FROM local_captures');
      this.executeSql('DELETE FROM sync_status');
      console.log('✅ Base de datos limpiada');
    } catch (error) {
      console.error('❌ Error al limpiar base de datos:', error);
    }
  }

  /**
   * Cerrar base de datos
   */
  async close(): Promise<void> {
    try {
      if (this.db) {
        // react-native-quick-sqlite no tiene método close explícito
        // Se cierra automáticamente cuando la app se cierra
        this.db = null;
        this.initialized = false;
        console.log('🗄️  Base de datos cerrada');
      }
    } catch (error) {
      console.error('❌ Error al cerrar base de datos:', error);
      throw error;
    }
  }
}

export default new DatabaseService();
