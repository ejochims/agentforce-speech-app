/**
 * Shared Salesforce OAuth2 client-credentials helper used by both the
 * Agentforce and Speech Foundations clients. Handles token caching with a
 * 25-minute TTL (tokens are valid for 30) and serialises concurrent
 * refreshes so only one OAuth request is in flight at a time.
 */

const OAUTH_TIMEOUT_MS = 15_000;
const TOKEN_TTL_MS = 25 * 60 * 1000;

/**
 * fetch() with a timeout that covers connection + response headers. The timer
 * is cleared once headers arrive, so streaming bodies (SSE) are not cut off.
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit = {},
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface OAuthToken {
  accessToken: string;
  instanceUrl?: string;
}

interface TokenManagerOptions {
  domainUrl: string;
  clientId: string;
  clientSecret: string;
  /** Used to prefix log/error messages, e.g. "Agentforce" */
  label: string;
}

export class SalesforceTokenManager {
  private token: OAuthToken | null = null;
  private tokenExpiry: number | null = null;
  private refreshPromise: Promise<OAuthToken> | null = null;

  constructor(private opts: TokenManagerOptions) {}

  async getToken(): Promise<OAuthToken> {
    // Fast path — valid token already cached
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }
    // If a refresh is already in flight, wait for it instead of issuing a second one
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.fetchNewToken().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async fetchNewToken(): Promise<OAuthToken> {
    const url = `${this.opts.domainUrl}/services/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
    });

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        },
        OAUTH_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `${this.opts.label} authentication failed: ${response.status} ${errorText}`
        );
      }

      const data: { access_token: string; instance_url?: string } = await response.json();
      this.token = {
        accessToken: data.access_token,
        instanceUrl: data.instance_url,
      };
      this.tokenExpiry = Date.now() + TOKEN_TTL_MS;

      console.log(`✅ ${this.opts.label} OAuth token obtained successfully`);
      return this.token;
    } catch (error) {
      console.error(`❌ Failed to get ${this.opts.label} access token:`, error);
      throw error;
    }
  }
}
