<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Stone AIO

Stone AIO is an advanced agentic intelligence platform featuring dynamic agent management, real-time metrics, voice integrations via Retell.ai, and seamless multi-modal execution capabilities.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   cd functions && npm install
   ```

2. **Configure Environment:**
   Ensure you have configured `.env` in the `functions/` directory:
   ```
   RETELL_API_KEY=your_key
   RETELL_FROM_NUMBER=your_number
   RETELL_AGENT_ID=your_id
   ```

3. **Running Locally:**
   Start the frontend app:
   ```bash
   npm run dev
   ```

4. **Running Emulator:**
   Start the Firebase Emulator to test Cloud Functions:
   ```bash
   firebase emulators:start
   ```

## Deployment

To deploy the entire application to Firebase:

1. Make the deployment script executable:
   ```bash
   chmod +x deploy.sh
   ```

2. Run the deployment script:
   ```bash
   ./deploy.sh
   ```
   
Alternatively, run the npm scripts directly:
```bash
npm run deploy
```

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
