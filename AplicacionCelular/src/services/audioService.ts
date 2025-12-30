// Servicio para grabación de audio
// DESHABILITADO - Solo captura de foto por problemas de compatibilidad

class AudioService {
  // Servicio deshabilitado - solo se usa captura de foto
  async requestPermission(): Promise<boolean> {
    return true;
  }

  async startRecording(): Promise<string | null> {
    console.log('⚠️ Audio deshabilitado - Solo se captura foto');
    return null;
  }

  async stopRecording(): Promise<string | null> {
    return null;
  }

  async convertAudioToBase64(audioPath: string): Promise<string | null> {
    return null;
  }

  async deleteAudio(audioPath: string): Promise<void> {
    // No-op
  }

  getIsRecording(): boolean {
    return false;
  }
}

export default new AudioService();

