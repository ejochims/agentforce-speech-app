interface SpeechTokenResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
  scope: string;
  token_format: string;
}

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
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;

  private configured = false;

  constructor() {
    let domainUrl = process.env.SALESFORCE_SPEECH_DOMAIN_URL || '';
    this.consumerKey = process.env.SALESFORCE_SPEECH_CONSUMER_KEY || '';
    this.consumerSecret = process.env.SALESFORCE_SPEECH_CONSUMER_SECRET || '';

    this.configured = !!(domainUrl && this.consumerKey && this.consumerSecret);

    if (!this.configured) {
      console.warn('⚠️  Salesforce Speech environment variables not set — STT/TTS will be unavailable');
      this.domainUrl = '';
      return;
    }

    // Ensure the domain URL has a protocol
    if (!domainUrl.startsWith('http://') && !domainUrl.startsWith('https://')) {
      domainUrl = `https://${domainUrl}`;
    }

    // Remove trailing slash if present
    this.domainUrl = domainUrl.replace(/\/$/, '');
  }

  private ensureConfigured() {
    if (!this.configured) {
      throw new Error('Missing required Salesforce Speech Foundations environment variables');
    }
  }

  private async getAccessToken(): Promise<string> {
    this.ensureConfigured();
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const url = `${this.domainUrl}/services/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.consumerKey,
      client_secret: this.consumerSecret,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Speech Foundations authentication failed: ${response.status} ${errorText}`);
      }

      const data: SpeechTokenResponse = await response.json();
      this.accessToken = data.access_token;
      
      // Set token expiry to 25 minutes from now (tokens are valid for 30 minutes)
      this.tokenExpiry = Date.now() + 25 * 60 * 1000;

      console.log('✅ Speech Foundations token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get Speech Foundations token:', error);
      throw error;
    }
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string, language: string = 'english'): Promise<string> {
    const token = await this.getAccessToken();
    
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('input', audioBlob, 'audio.webm');
    formData.append('engine', 'internal');
    formData.append('language', language);

    console.log('🎤 Calling Einstein Transcribe API...');

    const response = await fetch(
      'https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/transcriptions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-sfdc-app-context': 'EinsteinGPT',
          'x-client-feature-id': 'external-edc',
        },
        body: formData,
      }
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

    const response = await fetch(
      'https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/speech-synthesis',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-sfdc-app-context': 'EinsteinGPT',
          'x-client-feature-id': 'external-edc',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Einstein Speech API error:', response.status, errorText);
      throw new Error(`Einstein Speech API error: ${response.status} ${errorText}`);
    }

    const result: SpeechSynthesisResponse = await response.json();
    
    // Convert base64 audioStream to Buffer
    const audioBuffer = Buffer.from(result.audioStream, 'base64');
    
    console.log('✅ Speech synthesis successful with ElevenLabs voice');
    return audioBuffer;
  }
}

// Export a singleton instance
export const speechFoundationsClient = new SpeechFoundationsClient();
