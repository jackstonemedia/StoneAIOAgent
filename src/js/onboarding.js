export const OnboardingFlow = {
    container: null,
    currentStep: 1,
    totalSteps: 5,

    init() {
        this.container = document.createElement('div');
        this.container.id = 'onboarding-overlay';
        this.container.innerHTML = `
      <div class="onboarding-progress">
        <div class="progress-dot active" id="dot-1"></div>
        <div class="progress-dot" id="dot-2"></div>
        <div class="progress-dot" id="dot-3"></div>
        <div class="progress-dot" id="dot-4"></div>
        <div class="progress-dot" id="dot-5"></div>
      </div>
      <div class="onboarding-container" id="onboarding-content"></div>
    `;
        document.body.appendChild(this.container);
    },

    start() {
        if (!this.container) this.init();

        // Hide auth modal if open
        const modal = document.getElementById('auth-modal');
        if (modal) modal.style.display = 'none';

        // Hide landing/app initially to focus on onboarding
        const landing = document.getElementById('login-overlay');
        if (landing) landing.style.display = 'none';

        this.container.classList.add('active');
        this.renderStep1();
    },

    renderStep1() {
        const content = document.getElementById('onboarding-content');
        content.innerHTML = `
      <div class="onboarding-step active">
        <h2>What are you trying to accomplish?</h2>
        <p>Let's personalize your Stone AIO experience.</p>
        <div class="onboarding-options">
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(2)">
            <div class="onboarding-option-icon">📈</div>
            <div class="onboarding-option-text">
              <h4>Scale My Outreach</h4>
              <p>Automate emails, calls, and lead generation</p>
            </div>
          </div>
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(2)">
            <div class="onboarding-option-icon">⚙️</div>
            <div class="onboarding-option-text">
              <h4>Automate Operations</h4>
              <p>Handle data entry, scraping, and workflows</p>
            </div>
          </div>
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(2)">
            <div class="onboarding-option-icon">💬</div>
            <div class="onboarding-option-text">
              <h4>Improve Customer Support</h4>
              <p>Deploy 24/7 AI chatbots and voice agents</p>
            </div>
          </div>
        </div>
      </div>
    `;
        this.updateProgress(1);
    },

    renderStep2() {
        const content = document.getElementById('onboarding-content');
        content.innerHTML = `
      <div class="onboarding-step active">
        <h2>What should your first agent do?</h2>
        <p>Choose an initial specialization for your digital employee.</p>
        <div class="onboarding-options grid-2">
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(3)">
            <div class="onboarding-option-icon">📧</div>
            <div class="onboarding-option-text">
              <h4>Email SDR</h4>
              <p>Writes and sends cold outreach</p>
            </div>
          </div>
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(3)">
            <div class="onboarding-option-icon">✍️</div>
            <div class="onboarding-option-text">
              <h4>Content Creator</h4>
              <p>Drafts blogs and social posts</p>
            </div>
          </div>
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(3)">
            <div class="onboarding-option-icon">📞</div>
            <div class="onboarding-option-text">
              <h4>Voice Caller</h4>
              <p>AI cold calling via phone</p>
            </div>
          </div>
          <div class="onboarding-option" onclick="window.OnboardingFlow.nextStep(3)">
            <div class="onboarding-option-icon">🌐</div>
            <div class="onboarding-option-text">
              <h4>Browser Agent</h4>
              <p>Navigates and scrapes websites</p>
            </div>
          </div>
        </div>
      </div>
    `;
        this.updateProgress(2);
    },

    renderStep3() {
        const content = document.getElementById('onboarding-content');
        content.innerHTML = `
      <div class="onboarding-step active">
        <h2>Connect your workspace</h2>
        <p>Integrate your existing tools to give agents context.</p>
        <div class="onboarding-options">
          <div class="onboarding-option" onclick="this.classList.toggle('selected')">
            <div class="onboarding-option-icon">📧</div>
            <div class="onboarding-option-text">
              <h4>Google Workspace / Gmail</h4>
            </div>
          </div>
          <div class="onboarding-option" onclick="this.classList.toggle('selected')">
            <div class="onboarding-option-icon">💬</div>
            <div class="onboarding-option-text">
              <h4>Slack</h4>
            </div>
          </div>
          <div class="onboarding-option" onclick="this.classList.toggle('selected')">
            <div class="onboarding-option-icon">📊</div>
            <div class="onboarding-option-text">
              <h4>HubSpot CRM</h4>
            </div>
          </div>
        </div>
        <button class="landing-cta landing-cta-lg" onclick="window.OnboardingFlow.nextStep(4)" style="margin-top: 1rem">Continue</button>
      </div>
    `;
        this.updateProgress(3);
    },

    renderStep4() {
        const content = document.getElementById('onboarding-content');
        content.innerHTML = `
      <div class="onboarding-step active">
        <h2>Provisioning Cloud Computer...</h2>
        <p>Setting up your isolated workspace for 24/7 agent execution.</p>
        <div class="onboarding-terminal" id="term-box">
          <div class="terminal-line" style="animation: typeLine 0.1s forwards;">> Checking allocation quotas... [OK]</div>
        </div>
      </div>
    `;
        this.updateProgress(4);

        const term = document.getElementById('term-box');
        const lines = [
            "> Allocating 4 vCPUs, 16GB RAM, 50GB NVMe...",
            "> Booting isolated container environment...",
            "> Establishing secure socket tunnels...",
            "> Installing base agent packages...",
            "> Cloud Computer is online and ready!"
        ];

        let i = 0;
        const interval = setInterval(() => {
            if (i >= lines.length) {
                clearInterval(interval);
                setTimeout(() => this.nextStep(5), 1000);
                return;
            }
            const div = document.createElement('div');
            div.className = 'terminal-line';
            div.textContent = lines[i];
            div.style.animation = 'typeLine 0.2s forwards';
            term.appendChild(div);
            i++;
        }, 600);
    },

    renderStep5() {
        const content = document.getElementById('onboarding-content');
        content.innerHTML = `
      <div class="onboarding-step active">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
        <h2>Your team is ready</h2>
        <p>Welcome to your AI command center. Let's get to work.</p>
        <button class="landing-cta landing-cta-lg" onclick="window.OnboardingFlow.finish()">Enter Cloud Computer →</button>
      </div>
    `;
        this.updateProgress(5);
    },

    nextStep(step) {
        const oldStep = document.querySelector('.onboarding-step.active');
        if (oldStep) {
            oldStep.classList.remove('active');
            oldStep.style.opacity = '0';
            oldStep.style.transform = 'translateY(-20px) scale(0.98)';

            setTimeout(() => {
                if (step === 2) this.renderStep2();
                if (step === 3) this.renderStep3();
                if (step === 4) this.renderStep4();
                if (step === 5) this.renderStep5();
            }, 300);
        }
    },

    updateProgress(step) {
        for (let i = 1; i <= 5; i++) {
            const dot = document.getElementById('dot-' + i);
            if (dot) {
                dot.className = 'progress-dot';
                if (i < step) dot.classList.add('completed');
                if (i === step) dot.classList.add('active');
            }
        }
    },

    finish() {
        this.container.classList.remove('active');
        setTimeout(() => {
            this.container.style.display = 'none';
            // Signal app to show dashboard/cloud view
            document.dispatchEvent(new CustomEvent('onboardingComplete'));
        }, 500);
    }
};

window.OnboardingFlow = OnboardingFlow;
