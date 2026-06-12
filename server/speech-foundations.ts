import { SalesforceTokenManager, fetchWithTimeout } from './salesforce-oauth';

// STT/TTS calls upload or synthesize audio and can legitimately take a while,
// but must not hang forever if Salesforce is unresponsive.
const API_TIMEOUT_MS = 60_000;

interface TranscriptionResponse {
  transcription: string[];
}

interface SpeechSynthesisResponse {
  contentType: string;
  requestCharacters: number;
  audioStream: string;
}

export class SpeechFoundationsClient {
  private domainUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private tokenManager: SalesforceTokenManager;

  private configured = false;

  constructor() {
    let domainUrl = process.env.SALESFORCE_SPEECH_DOMAIN_URL || '';
    this.consumerKey = process.env.SALESFORCE_SPEECH_CONSUMER_KEY || '';
    this.consumerSecret = process.env.SALESFORCE_SPEECH_CONSUMER_SECRET || '';

    this.configured = !!(domainUrl && this.consumerKey && this.consumerSecret);

    if (!this.configured) {
      console.warn('⚠️  Salesforce Speech environment variables not set — STT/TTS will be unavailable');
      this.domainUrl = '';
    } else {
      // Ensure the domain URL has a protocol
      if (!domainUrl.startsWith('http://') && !domainUrl.startsWith('https://')) {
        domainUrl = `https://${domainUrl}`;
      }

      // Remove trailing slash if present
      this.domainUrl = domainUrl.replace(/\/$/, '');
    }

    this.tokenManager = new SalesforceTokenManager({
      domainUrl: this.domainUrl,
      clientId: this.consumerKey,
      clientSecret: this.consumerSecret,
      label: 'Speech Foundations',
    });
  }

  private ensureConfigured() {
    if (!this.configured) {
      throw new Error('Missing required Salesforce Speech Foundations environment variables');
    }
  }

  private async getAccessToken(): Promise<string> {
    this.ensureConfigured();
    const token = await this.tokenManager.getToken();
    return token.accessToken;
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string, language: string = 'english'): Promise<string> {
    const token = await this.getAccessToken();
    
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('input', audioBlob, 'audio.webm');
    formData.append('engine', 'internal');
    formData.append('language', language);

    console.log('🎤 Calling Einstein Transcribe API...');

    const response = await fetchWithTimeout(
      'https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/transcriptions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-sfdc-app-context': 'EinsteinGPT',
          'x-client-feature-id': 'external-edc',
        },
        body: formData,
      },
      API_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Einstein Transcribe API error:', response.status, errorText);
      throw new Error(`Einstein Transcribe API error: ${response.status} ${errorText}`);
    }

    const result: TranscriptionResponse = await response.json();
    const transcription = result.transcription?.[0] || '';
    
    console.log('✅ Transcription successful:', transcription);
    return transcription;
  }

  async synthesizeSpeech(text: string, voiceId: string = 'xctasy8XvGp2cVO9HL9k'): Promise<Buffer> {
    const token = await this.getAccessToken();
    
    const formData = new FormData();
    formData.append('input', text);
    
    // Use ElevenLabs engine with V2 API format
    const requestConfig = JSON.stringify({
      engine: 'elevenlabs',
      voice_id: voiceId,
      language: 'en'
    });
    formData.append('request', requestConfig);

    console.log('🔊 Calling Einstein Speech API (ElevenLabs)...', { text: text.substring(0, 50) + '...', voiceId });

    const response = await fetchWithTimeout(
      'https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/speech-synthesis',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-sfdc-app-context': 'EinsteinGPT',
          'x-client-feature-id': 'external-edc',
        },
        body: formData,
      },
      API_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Einstein Speech API error:', response.status, errorText);
      throw new Error(`Einstein Speech API error: ${response.status} ${errorText}`);
    }

    const result: SpeechSynthesisResponse = await response.json();

    if (!result.audioStream) {
      throw new Error('Speech synthesis response missing audioStream field');
    }

    // Convert base64 audioStream to Buffer
    const audioBuffer = Buffer.from(result.audioStream, 'base64');
    
    console.log('✅ Speech synthesis successful with ElevenLabs voice');
    return audioBuffer;
  }
}

// Export a singleton instance
export const speechFoundationsClient = new SpeechFoundationsClient();
