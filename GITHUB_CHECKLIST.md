# GitHub Publishing Checklist

Before pushing this repository to GitHub, complete this checklist to ensure no sensitive data is exposed.

## ✅ Security & Credentials

- [ ] **No `.env` files committed** - Check with `git ls-files | grep .env`
- [ ] **No hardcoded credentials** in code
  - Search for "password", "secret", "key", "token" in codebase
  - Review all files in `server/` directory
- [ ] **`.env.example` created** with placeholder values only
- [ ] **`.gitignore` properly configured** to exclude sensitive files
- [ ] **Remove any personal Salesforce org URLs** from examples

## ✅ Cleanup Tasks

- [ ] **Remove uploaded audio files** from `uploads/` directory
  ```bash
  rm -rf uploads/audio/*
  ```
- [ ] **Remove attached assets** that aren't part of the app
  ```bash
  rm -rf attached_assets/
  ```
- [ ] **Remove .sfdx directory** if present
  ```bash
  rm -rf .sfdx/
  ```
- [ ] **Clear any local database files** (if using SQLite locally)

## ✅ Documentation

- [ ] **README.md updated** with:
  - Clear prerequisites
  - Setup instructions
  - Links to Salesforce setup guide
  - Deployment instructions
- [ ] **SALESFORCE_SETUP.md exists** with detailed Salesforce configuration steps
- [ ] **HEROKU_DEPLOYMENT.md exists** with deployment instructions
- [ ] **CONTRIBUTING.md exists** for other Solution Engineers
- [ ] **LICENSE file** (if applicable for internal use)

## ✅ Repository Setup

- [ ] **Create GitHub repository**
  - Private or public? (Consider if it should be internal-only)
  - Add appropriate description
  - Add topics/tags: salesforce, agentforce, pwa, voice-chat
- [ ] **Set repository settings**
  - Enable Issues (for bug reports)
  - Disable Wiki (unless you'll use it)
  - Add .gitignore template if needed

## ✅ Final Checks

- [ ] **All dependencies in package.json** have versions specified
- [ ] **No personal information** in git history
  ```bash
  git log --all --full-history --pretty=format:"%H %an %ae %s" | grep -i "personal\|private"
  ```
- [ ] **Test clone and setup** from scratch in a new directory
  ```bash
  cd /tmp
  git clone <your-repo-url>
  cd agentforce-speech-app
  npm install
  # Verify .env.example exists and README is clear
  ```

## 📝 Commands to Run Before Push

```bash
# 1. Clean up sensitive files
rm -rf uploads/audio/*
rm -rf attached_assets/
rm -rf .sfdx/
git rm -r --cached .sfdx/ 2>/dev/null || true

# 2. Verify no .env files are tracked
git ls-files | grep -E "\.env$|\.env\."

# 3. Check git status
git status

# 4. Add updated files
git add .
git commit -m "Prepare repository for GitHub - remove sensitive files and add documentation"

# 5. Push to GitHub
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 🎯 Post-Publish Tasks

- [ ] **Add repository description** on GitHub
- [ ] **Add topics/tags**: `salesforce`, `agentforce`, `voice-ai`, `pwa`, `typescript`, `react`
- [ ] **Create initial GitHub Release** with version tag
- [ ] **Share repository link** with your SE team
- [ ] **Add to internal documentation** or wiki
- [ ] **Update any internal demo catalogs** with this resource

## 📋 Recommended GitHub Repository Settings

### Description
```
Progressive Web App for voice-first conversations with Salesforce Agentforce agents. Built for Solution Engineers to showcase voice AI capabilities.
```

### Topics
- salesforce
- agentforce
- voice-ai
- pwa
- speech-to-text
- text-to-speech
- typescript
- react
- solution-engineering

### Visibility
**Recommended**: Internal or Private repository (contains Salesforce integration patterns)

### Branch Protection (Optional)
If multiple SEs will contribute:
- Require pull request reviews
- Require status checks to pass
- Restrict who can push to main

## ⚠️ Important Reminders

1. **Never commit credentials** - Always use environment variables
2. **Each SE needs their own Heroku app** - Don't share production instances
3. **Connected Apps should be org-specific** - Each SE should create their own
4. **Update documentation** as the app evolves
5. **Test on actual devices** before sharing with others

## 🆘 If You Accidentally Committed Secrets

If you accidentally committed credentials:

```bash
# 1. Remove the sensitive file
git rm --cached path/to/sensitive/file

# 2. Add to .gitignore
echo "path/to/sensitive/file" >> .gitignore

# 3. Commit the removal
git commit -m "Remove sensitive file from tracking"

# 4. If already pushed to GitHub - you MUST:
# - Rotate all exposed credentials immediately
# - Consider using git filter-branch or BFG Repo-Cleaner
# - Contact security team if enterprise secrets were exposed
```

**Better approach**: Don't push at all until this checklist is complete!

---

**Ready to publish?** Double-check everything above, then push with confidence! 🚀

