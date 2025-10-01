# Salesforce Setup Guide

This guide walks you through setting up the required Salesforce configurations to run the Agentforce Voice Chat application.

## Prerequisites

- A Salesforce org with:
  - **Agentforce** enabled
  - **Speech Foundations API** access
  - System Administrator or appropriate API permissions

## Step 1: Create Agentforce Agent

1. Navigate to **Setup** → **Agents** in your Salesforce org
2. Click **New Agent**
3. Configure your agent with:
   - Name and description
   - Topics and instructions
   - Connected data sources
4. **Activate** and **Deploy** your agent
5. **Copy the Agent ID** from the agent details page
   - Save this as `SALESFORCE_AGENT_ID` in your environment variables

## Step 2: Create Connected App for Agentforce API

You need a Connected App with OAuth 2.0 client credentials flow enabled.

### 2.1 Create the Connected App

1. Go to **Setup** → **App Manager**
2. Click **New Connected App**
3. Fill in the basic information:
   - **Connected App Name**: `Agentforce Voice Chat`
   - **API Name**: Will auto-populate
   - **Contact Email**: Your email

### 2.2 Enable OAuth Settings

1. Check **Enable OAuth Settings**
2. **Callback URL**: Enter a placeholder like `https://localhost:3000/callback` (not used for server-to-server)
3. **Enable Client Credentials Flow**: ✅ Check this box
4. **Selected OAuth Scopes**: Add the following:
   - `Access the identity URL service (id, profile, email, address, phone)`
   - `Manage user data via APIs (api)`
   - `Perform requests at any time (refresh_token, offline_access)`
   - `Access Einstein Platform APIs (einstein_gpt_api)`

5. Click **Save**
6. Click **Continue** on the warning message

### 2.3 Get Consumer Key and Secret

1. From the Connected App detail page, click **Manage Consumer Details**
2. Verify your identity (may require 2FA code)
3. **Copy the Consumer Key** → Save as `SALESFORCE_CONSUMER_KEY`
4. **Copy the Consumer Secret** → Save as `SALESFORCE_CONSUMER_SECRET`

## Step 3: Create Connected App for Speech Foundations API

You can either:
- **Option A**: Reuse the same Connected App from Step 2 (recommended for simplicity)
- **Option B**: Create a separate Connected App following the same steps

If reusing the same app:
```bash
SALESFORCE_SPEECH_CONSUMER_KEY=same_as_SALESFORCE_CONSUMER_KEY
SALESFORCE_SPEECH_CONSUMER_SECRET=same_as_SALESFORCE_CONSUMER_SECRET
```

If creating separate app, follow Step 2 again but ensure these additional scopes:
- `Access Einstein Platform APIs (einstein_gpt_api)`

## Step 4: Configure API Permissions

### 4.1 Enable Einstein Features

1. Go to **Setup** → **Einstein Setup**
2. Ensure **Einstein Platform** is enabled
3. Verify **Speech Foundations** is available in your org

### 4.2 Permission Sets (if needed)

If you encounter permission errors:
1. Go to **Setup** → **Permission Sets**
2. Create or edit a permission set
3. Add the following system permissions:
   - `API Enabled`
   - `Access Einstein Platform APIs`
4. Assign this permission set to the integration user or service account

## Step 5: Verify Your Configuration

### Required Environment Variables

You should now have all the required values:

| Variable | Where to Find It |
|----------|------------------|
| `SALESFORCE_DOMAIN_URL` | Your org URL (e.g., `https://your-domain.my.salesforce.com`) |
| `SALESFORCE_CONSUMER_KEY` | Connected App → Consumer Key |
| `SALESFORCE_CONSUMER_SECRET` | Connected App → Consumer Secret |
| `SALESFORCE_AGENT_ID` | Agents → Your Agent → Agent ID |
| `SALESFORCE_SPEECH_DOMAIN_URL` | Same as domain URL (usually) |
| `SALESFORCE_SPEECH_CONSUMER_KEY` | Connected App → Consumer Key (can be same) |
| `SALESFORCE_SPEECH_CONSUMER_SECRET` | Connected App → Consumer Secret (can be same) |

### Test Connection

After deploying the app with these credentials, you can test:
1. Open the app in your browser
2. Try a voice interaction
3. Check Heroku logs: `heroku logs --tail`
4. Look for successful authentication messages:
   - `✅ OAuth successful - instance URL: ...`
   - `✅ Speech Foundations token obtained successfully`

## Troubleshooting

### Authentication Errors (401)

**Problem**: `Authentication failed: 401`

**Solutions**:
- Verify Consumer Key and Secret are correct
- Ensure **Client Credentials Flow** is enabled in Connected App
- Check that OAuth scopes include `einstein_gpt_api` and `api`
- Wait 2-10 minutes after creating/modifying Connected App (propagation delay)

### API Access Errors (403)

**Problem**: `API call failed: 403 Forbidden`

**Solutions**:
- Verify your org has Agentforce enabled
- Check that Speech Foundations API is available in your org
- Ensure the Connected App has the `einstein_gpt_api` scope
- Verify the service account has appropriate permissions

### Agent Not Found (404)

**Problem**: `Agent not found` or session errors

**Solutions**:
- Verify the Agent ID is correct
- Ensure the agent is **Activated** and **Deployed**
- Check that the agent has topics and instructions configured

### Speech API Errors

**Problem**: Speech-to-text or text-to-speech fails

**Solutions**:
- Confirm Speech Foundations is enabled in your org
- Check that the domain URL is correct and accessible
- Verify the Connected App credentials for Speech API
- Review supported audio formats (WebM, MP4, OGG recommended)

## Additional Resources

- [Salesforce Agentforce Documentation](https://help.salesforce.com/s/articleView?id=sf.agents_overview.htm)
- [Einstein Platform APIs](https://developer.salesforce.com/docs/einstein/genai/overview)
- [Connected App Documentation](https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm)
- [OAuth 2.0 Client Credentials Flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_client_credentials_flow.htm)

## Security Best Practices

1. **Never commit credentials** to version control
2. Use **separate Connected Apps** for dev/staging/production
3. **Rotate secrets** regularly
4. **Monitor API usage** in Salesforce Event Monitoring
5. Use **IP restrictions** on Connected Apps when possible
6. **Review permissions** periodically to ensure least-privilege access

