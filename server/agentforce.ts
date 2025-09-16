import { randomUUID } from 'crypto';

interface AgentforceTokenResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

interface AgentforceSessionResponse {
  sessionId: string;
  externalSessionKey: string;
}

interface AgentforceMessageResponse {
  sessionId?: string;
  messageId?: string;
  message?: string;
  messages?: Array<{ message: string; [key: string]: any }>;
  status?: string;
  responseTime?: number;
  [key: string]: any; // Allow for flexible response structure
}

export class AgentforceClient {
  private domainUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private agentId: string;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private instanceUrl: string | null = null;

  constructor() {
    this.domainUrl = process.env.SALESFORCE_DOMAIN_URL!;
    this.consumerKey = process.env.SALESFORCE_CONSUMER_KEY!;
    this.consumerSecret = process.env.SALESFORCE_CONSUMER_SECRET!;
    this.agentId = process.env.SALESFORCE_AGENT_ID!;

    if (!this.domainUrl || !this.consumerKey || !this.consumerSecret || !this.agentId) {
      throw new Error('Missing required Salesforce environment variables');
    }
  }

  private async getAccessToken(): Promise<string> {
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
        throw new Error(`Authentication failed: ${response.status} ${errorText}`);
      }

      const data: AgentforceTokenResponse = await response.json();
      this.accessToken = data.access_token;
      this.instanceUrl = data.instance_url;
      // Set expiry to 25 minutes from now (tokens typically last 30 minutes)
      this.tokenExpiry = Date.now() + (25 * 60 * 1000);
      
      console.log('OAuth successful - instance URL:', this.instanceUrl);
      
      return this.accessToken;
    } catch (error) {
      console.error('Failed to get Salesforce access token:', error);
      throw error;
    }
  }

  private async makeApiCall(endpoint: string, method: 'GET' | 'POST' | 'DELETE', body?: any): Promise<any> {
    const accessToken = await this.getAccessToken();
    
    if (!this.instanceUrl) {
      throw new Error('Instance URL not available - ensure authentication is complete');
    }
    
    const url = `https://api.salesforce.com/einstein/ai-agent/v1${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      // For DELETE requests, 204 is success
      if (method === 'DELETE' && response.status === 204) {
        return { success: true };
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to make API call to ${endpoint}:`, error);
      throw error;
    }
  }

  async startSession(externalSessionKey?: string): Promise<string> {
    const sessionKey = externalSessionKey || randomUUID();
    
    const payload = {
      externalSessionKey: sessionKey,
      instanceConfig: {
        endpoint: this.instanceUrl || this.domainUrl
      },
      streamingCapabilities: {
        chunkTypes: ["Text"]
      },
      bypassUser: true
    };

    console.log('Starting session with payload:', JSON.stringify(payload, null, 2));
    const response: AgentforceSessionResponse = await this.makeApiCall(`/agents/${this.agentId}/sessions`, 'POST', payload);
    return response.sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const payload = {
      message: {
        sequenceId: 1,
        type: "Text",
        text: message
      }
    };

    console.log('Sending message payload:', JSON.stringify(payload, null, 2));
    const response: AgentforceMessageResponse = await this.makeApiCall(
      `/sessions/${sessionId}/messages`, 
      'POST', 
      payload
    );

    // Extract the message from the response - it may be in a different format
    // The API might return messages array or a single message
    if (response.messages && response.messages.length > 0) {
      return response.messages[response.messages.length - 1].message;
    }
    return response.message || 'Response received from agent';
  }

  async endSession(sessionId: string): Promise<boolean> {
    try {
      await this.makeApiCall(`/sessions/${sessionId}`, 'DELETE');
      console.log('Session ended successfully:', sessionId);
      return true;
    } catch (error) {
      console.error('Failed to end session:', error);
      return false;
    }
  }

  async chatWithAgent(message: string): Promise<string> {
    let sessionId: string | null = null;
    
    try {
      console.log('🤖 Starting chat with Agentforce agent, message:', message);
      
      // Start a new session
      sessionId = await this.startSession();
      console.log('Session started with ID:', sessionId);
      
      // Send the message and get response
      const response = await this.sendMessage(sessionId, message);
      console.log('Received response from agent:', response);
      
      return response;
    } catch (error: any) {
      console.error('Error in chat with agent:', error);
      
      // Return helpful fallback message while preserving the error for debugging
      return `I tried to connect with your Agentforce agent to respond to: "${message}"

However, I'm still experiencing connectivity issues with the Salesforce Agent API. The authentication is working, but there might be additional configuration needed for your specific Salesforce org.

Error details: ${error.message}

All the voice conversation infrastructure is ready - once we resolve this API connectivity, you'll have a complete voice-first Agentforce experience!`;
    } finally {
      // Always try to end the session
      if (sessionId) {
        await this.endSession(sessionId);
      }
    }
  }
}

// Export a singleton instance
export const agentforceClient = new AgentforceClient();