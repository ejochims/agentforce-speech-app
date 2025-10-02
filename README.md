# Agentforce Speech App - Installation Guide for Solution Engineers

A production-ready Progressive Web App (PWA) that enables seamless voice conversations with Salesforce Agentforce AI agents. Built with modern web technologies and optimized for mobile devices, especially iPhone.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/ejochims/agentforce-speech-app)

## ✨ Features

- 🎙️ **Real-time voice recording** with visual feedback
- 🔊 **Premium text-to-speech** using ElevenLabs Allison - millennial voice
- 🎯 **High-quality speech recognition** with ElevenLabs Scribe v1 model
- 📱 **PWA capabilities** - installable on iPhone/Android
- 💬 **Voice-only mode** for hands-free interaction
- 📝 **Conversation history** with session persistence
- 🌈 **Visual status indicators** with animated ripple effects

---

> **No Command Line Required!** This guide uses Heroku's web interface. You can complete the entire setup from your browser.

## 📋 Overview

You'll need to:
1. Enable Einstein and Agentforce in your Salesforce org
2. Create an Agentforce Service Agent
3. Create a Connected App for Agentforce API access
4. Create an External Client App for Speech Foundations API access
5. Click "Deploy to Heroku" button and configure with your credentials

**Total Setup Time:** ~30-45 minutes

---

## Part 1: Salesforce Org Setup

### Step 1: Enable Einstein

1. Go to **Setup** in your Salesforce org
2. In the Quick Find box, search for **Einstein Setup**
3. Click **Einstein Setup**
4. Toggle **Turn on Einstein**
5. **Refresh the page** (important!)

### Step 2: Enable Agentforce

1. In Setup, search for **Agentforce Agents**
2. Click **Turn on Agentforce**
3. **Refresh the page** (important!)

### Step 3: Create an Agentforce Service Agent

> **Note:** This prototype is designed to work with **Agentforce Service Agent**. It has not been tested with Agentforce Employee Agent.

1. In Setup, go to **Agentforce Agents**
2. Click **New Agent**
3. Select **Service Agent**
4. Configure your agent:
   - Add a name and description
   - Configure topics and instructions
   - Connect any necessary data sources
5. Click **Save**
6. **Activate** your agent
7. **Deploy** your agent to make it available
8. Open the agent to view its details
9. **Copy the Agent ID** from the URL
   - The URL looks like: \`https://your-domain.lightning.force.com/lightning/setup/AgentBuilder/page?address=/0Xx...\`
   - The Agent ID is the alphanumeric string after the last \`/\` (starts with \`0Xx\`)
   - **Save this as:** \`SALESFORCE_AGENT_ID\`

### Step 4: Get Your My Domain URL

1. In Setup, search for **My Domain**
2. Copy your full domain URL (e.g., \`https://your-domain.my.salesforce.com\`)
3. **Save this as BOTH:**
   - \`SALESFORCE_DOMAIN_URL\`
   - \`SALESFORCE_SPEECH_DOMAIN_URL\` (yes, use the same URL for both!)

---

## Part 2: Create Connected App for Agentforce API

This Connected App will provide access to the Agentforce API for agent conversations.

### Step 1: Create the Connected App

1. In Setup, go to **App Manager**
2. Click **New Connected App**
3. Fill in basic information:
   - **Connected App Name:** \`Agentforce Voice Chat\` (or your preferred name)
   - **API Name:** (will auto-populate)
   - **Contact Email:** Your email address

### Step 2: Enable OAuth Settings

1. Check the box: **Enable OAuth Settings**
2. **Callback URL:** Enter \`https://login.salesforce.com\`
3. **Selected OAuth Scopes** - Add these scopes:
   - Access chatbot services (chatbot_api)
   - Access the Salesforce API Platform (sfap_api)
   - Manage user data via APIs (api)
   - Perform requests at any time (refresh_token, offline_access)

4. **Deselect these checkboxes:**
   - ❌ Require Proof Key for Code Exchange (PKCE) Extension for Support Authorization Flows
   - ❌ Require Secret for Web Server Flow
   - ❌ Require Secret for Refresh Token Flow

5. **Select these checkboxes:**
   - ✅ Enable Client Credentials Flow
   - ✅ Issue JSON Web Token (JWT)-based access tokens for named users

6. Click **Save**
7. Click **Continue** on any warning messages

### Step 3: Configure OAuth Policies

1. From the Connected App detail page, click **Manage**
2. Click **Edit Policies**
3. In the **OAuth Policies** section:
   - **Permitted Users:** Select the appropriate option (typically "Admin approved users are pre-authorized" or "All users may self-authorize")
4. In the **Client Credentials Flow** section:
   - **Run As:** Select a user with at least API Only access (typically a system integration user)
5. In the **JWT-Based Access Token Settings** section:
   - Keep **Issue JSON Web Token (JWT)-based access tokens** checked
   - Leave **Token Timeout** at 30 minutes
6. Click **Save**

### Step 4: Get Consumer Key and Secret

1. From the Connected App page, click **Manage Consumer Details**
2. Verify your identity (you may need to enter a verification code sent to your email)
3. **Copy the Consumer Key**
   - **Save this as:** \`SALESFORCE_CONSUMER_KEY\`
4. **Copy the Consumer Secret**
   - **Save this as:** \`SALESFORCE_CONSUMER_SECRET\`

### Step 5: Add Connected App to Your Agent

Before the API can access your agent, you must connect the app to it:

1. Go to **Setup** → **Agentforce Agents**
2. Click on your agent name
3. Click **Open in Builder**
4. Click the **Connections** tab
5. If you see an option to turn on the updated connections experience, click **Turn It On**
6. Select the **Messaging** connection
7. Scroll down to the **External Apps** section
8. Click **Add External App**
9. Select **API** connection type
10. Choose your Connected App from the dropdown
11. Click **Save**

> **Important:** Without this step, your API calls will fail with authentication errors!

---

## Part 3: Create External Client App for Speech Foundations API

This External Client App provides access to Salesforce's Speech Foundations API for speech-to-text and text-to-speech.

### Step 1: Create the External Client App

1. In Setup, search for **External Client App Manager**
2. Click **New**
3. Fill in the details:
   - **Name:** \`Speech Foundations API\` (or your preferred name)
   - **Email:** Your email address
   - **Distribution State:** Keep as **Local**

### Step 2: Enable OAuth Settings

1. In the **API** section, check **Enable OAuth** for the ECA
2. **Callback URL:** Enter \`https://login.salesforce.com\`
3. **Selected OAuth Scopes** - Add these:
   - Access the Salesforce API Platform (sfap_api)
   - Manage user data via APIs (api)
   - Perform requests at any time (refresh_token, offline_access)

4. **Select these checkboxes:**
   - ✅ Enable Client Credentials Flow
   - ✅ Issue JSON Web Token (JWT)-based access tokens for named users

5. **Deselect this checkbox:**
   - ❌ Require Proof Key for Code Exchange (PKCE) Extension for Support Authorization Flows

6. Click **Save**

### Step 3: Configure OAuth Policies

1. Click **Edit** on your External Client App
2. Expand the **OAuth Policies** section
3. Under **Client Credentials Flow**:
   - Check the box to enable it
   - **Run As:** Select a user with at least API Only access
4. Under **JWT-Based Access Token Settings**:
   - Check **Issue JSON Web Token (JWT)-based access tokens**
   - Leave timeout at 30 minutes
5. Click **Save**

### Step 4: Get Consumer Key and Secret

1. In the External Client App Manager, select your app
2. Click the **Settings** tab
3. Expand **OAuth Settings**
4. Click **Consumer Key and Secret** (you may need to verify your identity)
5. **Copy the Consumer Key**
   - **Save this as:** \`SALESFORCE_SPEECH_CONSUMER_KEY\`
6. **Copy the Consumer Secret**
   - **Save this as:** \`SALESFORCE_SPEECH_CONSUMER_SECRET\`

---

## Part 4: Deploy to Heroku (Web Interface)

Now that you have all your Salesforce credentials, you're ready to deploy! We'll use Heroku's web interface - no command line required.

### Step 1: Click the Deploy to Heroku Button

1. Click the purple **"Deploy to Heroku"** button at the top of this README
2. You'll be redirected to Heroku's deployment page
3. Log in to your Heroku account (or create one)

> **Don't have a Heroku account?** SEs can sign up for accounts at https://basecamp.salesforce.com/content/techforce-heroku-for-sfdc-employees


### Step 2: Configure Your App

On the Heroku deployment page, you'll see a form to fill out:

1. **App name:** Choose a unique name for your app (e.g., \`my-agentforce-demo-2024\`)
   - This will be part of your URL: \`https://your-app-name.herokuapp.com\`
   - Leave blank to let Heroku generate a random name

2. **Choose a region:** Select the region closest to you or your users
   - United States
   - Europe

### Step 3: Enter Environment Variables

Now fill in all the credentials you gathered from Parts 1-3. Paste your values into each field:

| Config Variable | Your Value |
|----------------|------------|
| \`SALESFORCE_DOMAIN_URL\` | \`https://your-domain.my.salesforce.com\` |
| \`SALESFORCE_CONSUMER_KEY\` | Your Connected App Consumer Key |
| \`SALESFORCE_CONSUMER_SECRET\` | Your Connected App Consumer Secret |
| \`SALESFORCE_AGENT_ID\` | Your Agent ID (starts with \`0Xx\`) |
| \`SALESFORCE_SPEECH_DOMAIN_URL\` | Same as \`SALESFORCE_DOMAIN_URL\` |
| \`SALESFORCE_SPEECH_CONSUMER_KEY\` | Your External Client App Key |
| \`SALESFORCE_SPEECH_CONSUMER_SECRET\` | Your External Client App Secret |
| \`NODE_ENV\` | \`production\` |

**Double-check:** Make sure there are no extra spaces before or after your values!

### Step 4: Deploy the App

1. Click the **"Deploy app"** button at the bottom
2. Wait for the build to complete (this takes 2-3 minutes)
3. You'll see:
   - "Installing dependencies..."
   - "Building..."
   - "Launching..."
   - "Your app was successfully deployed"

> **Good news!** The PostgreSQL database and initial database setup should happen automatically during deployment. However, if you see any database errors, follow the manual steps below.

### Step 5: Verify Database (Usually Automatic)

After deployment completes, verify the database was created:

1. Click **"Manage App"** button
2. You'll be taken to your app's dashboard
3. Click on the **"Resources"** tab
4. You should see **"Heroku Postgres"** listed under "Add-ons"

**If you DON'T see PostgreSQL:**
1. In the "Add-ons" section, type \`postgres\` in the search box
2. Select **"Heroku Postgres"**
3. Choose the **"Essential-0"** plan ($5/month)
4. Click **"Submit Order Form"**
5. Wait for the database to provision (about 1-2 minutes)

### Step 6: Initialize Database (Only if Needed)

The database tables should be created automatically. Only do this step if you see database errors in your logs:

1. On your app's dashboard, click the **"More"** dropdown (top right)
2. Select **"Run console"**
3. In the command box, type: \`npm run db:push\`
4. Click **"Run"**
5. Wait for the command to complete (you'll see database migration messages)
6. Click **"Close"** when done

> **CLI Alternative:** \`heroku run "npm run db:push" -a your-app-name\`

### Step 7: Open Your App!

1. Back on your app's dashboard, click **"Open app"** (top right corner)
2. Your Agentforce Speech App will open in a new tab! 🎉

Your app is now live at: \`https://your-app-name.herokuapp.com\`

---

## ✅ Environment Variables Checklist

Before deploying, confirm you have all these values:

| Variable | Source | Example |
|----------|--------|---------|
| \`SALESFORCE_DOMAIN_URL\` | Setup → My Domain | \`https://mydomain.my.salesforce.com` |
| \`SALESFORCE_CONSUMER_KEY\` | Connected App → Consumer Key | \`3MVG9VTfp...\` |
| \`SALESFORCE_CONSUMER_SECRET\` | Connected App → Consumer Secret | \`2A7BAEB06F...\` |
| \`SALESFORCE_AGENT_ID\` | Agent URL | \`0XxHu000000jyjAKAQ\` |
| \`SALESFORCE_SPEECH_DOMAIN_URL\` | Same as Domain URL | \`https://mydomain.my.salesforce.com\` |
| \`SALESFORCE_SPEECH_CONSUMER_KEY\` | External Client App → Consumer Key | \`3MVG9VTfp...\` |
| \`SALESFORCE_SPEECH_CONSUMER_SECRET\` | External Client App → Consumer Secret | \`FE3012648B...\` |
| \`NODE_ENV\` | Set manually | \`production\` |
| \`DATABASE_URL\` | Auto-set by Heroku | (automatic) |

---

## 🧪 Testing Your Installation

### 1. Check the Logs

\`\`\`bash
heroku logs --tail
\`\`\`

Look for these success messages:
- \`✅ OAuth successful - instance URL: ...\`
- \`✅ Speech Foundations token obtained successfully\`
- \`serving on port ...\`

### 2. Test Voice Interaction

1. Open your app in a browser
2. Grant microphone permissions when prompted
3. Press and hold the microphone button
4. Speak a test question
5. Release the button
6. You should see:
   - Blue animation while processing
   - Your transcribed text appears
   - Yellow pulse while agent thinks
   - Green ripple while agent speaks
   - Audio response plays

### 3. Install as PWA (Optional)

Test the mobile experience:
- **iPhone:** Safari → Share → "Add to Home Screen"
- **Android:** Chrome → Menu → "Add to Home Screen"

---

## 🔧 Managing Your Heroku App

All of these tasks can be done from the Heroku web dashboard. Go to https://dashboard.heroku.com and select your app.

### View Configuration (Environment Variables)

**Web UI:**
1. Go to your app's dashboard
2. Click **"Settings"** tab
3. Scroll down to **"Config Vars"**
4. Click **"Reveal Config Vars"** to see all your environment variables

**CLI Alternative:**
\`\`\`bash
heroku config -a your-app-name
\`\`\`

### View Logs

**Web UI:**
1. Go to your app's dashboard
2. Click **"More"** dropdown (top right)
3. Select **"View logs"**
4. Logs will stream in real-time

**CLI Alternative:**
\`\`\`bash
heroku logs --tail -a your-app-name
\`\`\`

### Update an Environment Variable

**Web UI:**
1. Go to **Settings** tab
2. Scroll to **"Config Vars"**
3. Click **"Reveal Config Vars"**
4. Find the variable you want to change
5. Click the pencil icon or add a new one
6. Enter the new value
7. The app will automatically restart

**CLI Alternative:**
\`\`\`bash
heroku config:set SALESFORCE_AGENT_ID=new_agent_id -a your-app-name
\`\`\`

### Check App Status

**Web UI:**
1. Go to **"Resources"** tab
2. View dyno status under "Dynos" section
3. See if dynos are running or sleeping

**CLI Alternative:**
\`\`\`bash
heroku ps -a your-app-name
\`\`\`

### Restart the App

**Web UI:**
1. Click **"More"** dropdown (top right)
2. Select **"Restart all dynos"**
3. Confirm the restart

**CLI Alternative:**
\`\`\`bash
heroku restart -a your-app-name
\`\`\`

### Run Database Migrations Again

**Web UI:**
1. Click **"More"** dropdown
2. Select **"Run console"**
3. Type: \`npm run db:push\`
4. Click **"Run"**

**CLI Alternative:**
\`\`\`bash
heroku run "npm run db:push" -a your-app-name
\`\`\`

---

## ❗ Troubleshooting

> **First Step for Any Issue:** Check your logs! Go to your Heroku dashboard → More → View logs to see what's happening.

### "Authentication failed" Error

**Problem:** API calls return 401 Unauthorized

**How to check:**
1. In Heroku dashboard, go to **More** → **View logs**
2. Look for error messages containing "401" or "Authentication failed"

**Solutions:**
1. Verify your Consumer Key and Secret are correct (Settings → Config Vars)
2. Wait 2-10 minutes after creating/modifying Connected Apps (propagation delay)
3. Ensure **Client Credentials Flow** is enabled in your Connected App
4. Check that OAuth scopes include required permissions

### "Agent not found" Error

**Problem:** Cannot create conversation session

**Solutions:**
1. Verify your Agent ID is correct
2. Ensure the agent is **Activated** and **Deployed**
3. **Most common issue:** Make sure you added the Connected App to your agent (Part 2, Step 5)

### Voice Recording Doesn't Work

**Problem:** Microphone button doesn't record

**Solutions:**
1. Grant microphone permissions in your browser
2. Ensure you're using HTTPS (Heroku provides this automatically)
3. On iOS, tap the button (don't just hold) to trigger permissions

### No Audio Playback

**Problem:** Text-to-speech doesn't play

**Solutions:**
1. Check browser audio permissions
2. Ensure volume is turned up
3. On iOS, unmute your device
4. Try refreshing the page

### Speech-to-Text or Text-to-Speech Fails

**Problem:** STT/TTS API calls fail

**Solutions:**
1. Verify Speech Foundations is enabled in your org
2. Check External Client App credentials are correct
3. Ensure the domain URL is correct
4. Verify the External Client App has required OAuth scopes

---

## 💡 Demo Tips

### Before Your Demo

1. ✅ Test the app end-to-end at least 1 hour before
2. ✅ Wake up your Heroku dyno (visit the URL) 15 minutes before
3. ✅ Prepare example questions that showcase your agent
4. ✅ Test on the actual device you'll demo on (especially mobile)
5. ✅ Have a stable internet connection

### During Your Demo

**Voice-Only Mode (Most Impressive):**
- Toggle off "Show Conversation"
- Demonstrate the beautiful visual feedback
- Highlight the natural voice interaction

**Hybrid Mode (Good for Presentations):**
- Keep conversation history visible
- Shows persistence and full chat log
- Easier to reference what was said

### Common Demo Scenarios

- **Customer Service:** "I need help with my recent order"
- **Account Information:** "What's my account balance?"
- **Product Questions:** "Tell me about your product features"
- **General Inquiry:** "What services do you offer?"

Customize these based on your agent's configuration!

---

## 📞 Getting Help

If you encounter issues:

1. **Check the logs:** 
   - Web UI: Heroku dashboard → More → View logs
   - CLI: \`heroku logs --tail -a your-app-name\`
2. **Verify all environment variables:** 
   - Web UI: Heroku dashboard → Settings → Reveal Config Vars
   - CLI: \`heroku config -a your-app-name\`
3. **Review this guide** - did you complete all steps?
4. **Slack:** Post in your team's Salesforce/Agentforce channel
5. **GitHub:** Open an issue at the repository

---

## 🎉 Success!

You now have a fully functional Agentforce Speech App deployed and ready for demos!

**Your app URL:** 
- Find it on your Heroku dashboard (top of the page)
- Click **"Open app"** to launch it
- URL format: \`https://your-app-name.herokuapp.com\`

Share the URL with stakeholders, install it as a PWA on your phone, and start showcasing the power of Agentforce with voice interactions!

### Quick Access

Bookmark these for easy access:
- **Your app:** \`https://your-app-name.herokuapp.com\`
- **Heroku dashboard:** https://dashboard.heroku.com/apps/your-app-name
- **GitHub repo:** https://github.com/ejochims/agentforce-speech-app

---

## 🔄 Need to Deploy Another Instance?

Just click the "Deploy to Heroku" button again! You can:
- Use the same Salesforce credentials for multiple deployments
- Create different apps for different agents (just change the \`SALESFORCE_AGENT_ID\`)
- Deploy separate instances for different demos or customers

Each deployment is independent and has its own database and conversations.

---

**Built with ❤️ for seamless AI voice interactions**
