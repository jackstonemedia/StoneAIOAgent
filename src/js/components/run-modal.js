import { runAgent, getUsage } from '../api.js';
import { listStrategies } from '../db-helpers.js';
import { getCurrentUser } from '../app.js';
import { renderRunScorer, init as initRunScorer } from './run-scorer.js';

let modalContainer = null;
let currentAgent = null;
let currentStrategies = [];

// Fallback texts
const defaultPlaceholders = {
  'email': 'Describe the prospect and what you want the email to achieve...',
  'content': 'Describe the piece of content to create and its goal...',
  'autonomous': 'Describe the goal you want this agent to achieve...',
  'voice': 'N/A (Uses separate voice form)',
  'browser': 'What should the browser agent do? e.g. Navigate to X and find Y...',
  'workflow': 'What workflow should be triggered?'
};

export function initRunModal() {
  if (modalContainer) return;

  modalContainer = document.createElement('div');
  modalContainer.id = 'global-run-modal-backdrop';
  modalContainer.className = 'modal-backdrop';
  modalContainer.style.display = 'none';
  modalContainer.innerHTML = `
    <div class="modal-content run-modal" style="width: 560px; max-width: 95vw; background: var(--bg-card); border: 1px solid var(--accent-purple); border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(147, 51, 234, 0.25);">
      <div class="modal-header" style="border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 0;">
        <div>
          <h3 id="rm-title" style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <span class="status-dot idel" id="rm-status"></span>
            <span id="rm-agent-name">Agent Name</span>
            <span class="badge" id="rm-agent-badge" style="font-size: 0.7rem; padding: 2px 6px;">Type</span>
          </h3>
          <div id="rm-strategy-text" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">Current Strategy: ...</div>
        </div>
        <button class="btn-close" onclick="window.runModal.close()">&times;</button>
      </div>

      <div class="detail-tabs" style="border-radius: 0; margin-bottom: 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 0 1.5rem;">
        <div class="detail-tab active" onclick="window.runModal.switchTab('quick')">Quick Run</div>
        <div class="detail-tab" onclick="window.runModal.switchTab('batch')">Batch Run</div>
        <div class="detail-tab" onclick="window.runModal.switchTab('scheduled')">Scheduled <span style="font-size: 0.6rem; background: rgba(232, 98, 44, 0.2); padding: 2px 4px; border-radius: 4px; margin-left: 4px; color: var(--accent-purple);">PRO</span></div>
      </div>

      <div class="modal-body" style="padding: 1.5rem; max-height: 70vh; overflow-y: auto;">
        
        <!-- QUICK RUN TAB -->
        <div id="rm-tab-quick" class="rm-tab-content active">
          
          <div id="rm-voice-notice" style="display: none; background: rgba(232, 98, 44, 0.1); border: 1px solid rgba(232, 98, 44, 0.3); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; color: #c4b5fd;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: -4px; margin-right: 4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            This is a Voice Agent. Quick runs simulate the script generation locally before dialing. Real calls require the Agent Details panel.
          </div>

          <div class="form-group">
            <label>Task Description *</label>
            <textarea id="rm-task" class="form-control focus-ring" rows="4" style="font-size: 1rem; resize: vertical;"></textarea>
          </div>
          
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; cursor: pointer;" onclick="document.getElementById('rm-context-wrap').style.display = document.getElementById('rm-context-wrap').style.display === 'none' ? 'block' : 'none'">
              <label style="cursor: pointer;">Provide Context (Optional)</label>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div id="rm-context-wrap" style="display: none; margin-top: 0.5rem;">
              <textarea id="rm-context" class="form-control" rows="2" placeholder="Additional context (company info, tone guidelines, examples to follow)..."></textarea>
            </div>
          </div>
          
          <div class="form-group">
            <label>Strategy Override</label>
            <select id="rm-strategy" class="form-control">
              <option value="auto">Auto-select (Recommended)</option>
            </select>
          </div>
          
          <div id="rm-run-controls" style="margin-top: 1.5rem;">
            <button class="btn btn-primary" id="rm-btn-run" onclick="window.runModal.executeRun()" style="width: 100%; padding: 1rem; font-size: 1.1rem; box-shadow: 0 4px 14px 0 rgba(147, 51, 234, 0.39);">
              Run Agent
            </button>
          </div>

          <!-- Output Section -->
          <div id="rm-output-section" style="display: none; margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h4 style="margin: 0; color: var(--accent-purple);">Run Output</h4>
              <button class="btn btn-sm btn-ghost" onclick="window.runModal.copyOutput()" title="Copy to clipboard">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
            
            <div id="rm-output-display" style="background: rgba(0,0,0,0.4); border: 1px solid #334155; padding: 1rem; border-radius: 8px; font-family: var(--font-mono); font-size: 0.85rem; color: #e2e8f0; white-space: pre-wrap; max-height: 300px; overflow-y: auto; line-height: 1.6;"></div>
            
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; margin-bottom: 1.5rem;">
              <span id="rm-stats-time">Duration: --</span>
              <span id="rm-stats-words">Words: 0 | Read time: 0m</span>
            </div>

            <div id="rm-scorer-container"></div>
            
            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
              <button class="btn btn-secondary" onclick="window.runModal.resetQuickRun()" style="flex: 1;">Run Again</button>
              <button class="btn btn-ghost" onclick="window.runModal.close()" style="flex: 1;">Close</button>
            </div>
          </div>
        </div>

        <!-- BATCH RUN TAB -->
        <div id="rm-tab-batch" class="rm-tab-content" style="display: none;">
          <div id="rm-batch-setup">
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">Run this agent across multiple leads or tasks automatically. Upload a CSV with a <strong>task_description</strong> column (and optionally a <strong>context</strong> column).</p>
            
            <div class="form-group" style="text-align: center; padding: 2rem; border: 2px dashed rgba(255,255,255,0.1); border-radius: 12px; margin-bottom: 1.5rem;">
              <input type="file" id="rm-csv-upload" accept=".csv" style="display: none;" onchange="window.runModal.handleCSVUpload(event)">
              <button class="btn btn-secondary" onclick="document.getElementById('rm-csv-upload').click()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.5rem; margin-bottom:-3px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Upload CSV File
              </button>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Max 50 rows per batch</div>
            </div>

            <div id="rm-batch-preview" style="display: none;">
              <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:0.5rem;">
                <h4 style="margin:0;"><span id="rm-batch-count">0</span> tasks loaded</h4>
                <div style="width: 150px;">
                  <label style="font-size: 0.75rem;">Delay: <span id="rm-delay-val">5s</span></label>
                  <input type="range" id="rm-batch-delay" min="2" max="30" value="5" oninput="document.getElementById('rm-delay-val').textContent = this.value + 's'">
                </div>
              </div>
              
              <div style="overflow-x:auto; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:1.5rem; max-height: 200px; overflow-y:auto;">
                <table class="run-table" style="font-size:0.8rem;">
                  <thead><tr><th>#</th><th>Task Description</th><th>Context</th></tr></thead>
                  <tbody id="rm-batch-preview-body"></tbody>
                </table>
              </div>

              <button class="btn btn-primary" id="rm-btn-start-batch" onclick="window.runModal.startBatchRun()" style="width: 100%;">Start Batch Run</button>
            </div>
          </div>
          
          <div id="rm-batch-active" style="display: none; text-align: center; padding: 2rem 0;">
            <div class="loading-spinner" style="margin-bottom: 1rem;"></div>
            <h4 id="rm-batch-status-text">Running task 1 of X...</h4>
            <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin: 1rem 0;">
               <div id="rm-batch-progress" style="height:100%; width:0%; background:var(--accent-purple); border-radius:3px; transition:width 0.3s;"></div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="window.runModal.stopBatchRun()">Stop Batch</button>
          </div>

          <div id="rm-batch-results" style="display: none; margin-top: 1.5rem;">
            <h4>Batch Results</h4>
            <div id="rm-batch-results-list" style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 0.5rem;"></div>
          </div>
        </div>

        <!-- SCHEDULED TAB -->
        <div id="rm-tab-scheduled" class="rm-tab-content" style="display: none; text-align: center; padding: 3rem 1rem;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: rgba(232, 98, 44, 0.1); color: var(--accent-purple); margin-bottom: 1rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <h3>Scheduled Runs</h3>
          <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Trigger agents on a recurring schedule (cron) or via webhooks. Coming soon for Pro users.</p>
          <div style="display: flex; gap: 0.5rem; justify-content: center;">
            <input type="email" class="input" placeholder="Notify me when launched" style="width: 200px;">
            <button class="btn btn-secondary" onclick="alert('Thanks for your interest!')">Subscribe</button>
          </div>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(modalContainer);

  window.runModal = {
    open,
    close,
    switchTab,
    executeQuickRun: executeRun, // alias
    executeRun,
    resetQuickRun,
    copyOutput,
    handleCSVUpload,
    startBatchRun,
    stopBatchRun
  };

  initRunScorer();
}

async function open(agentObj) {
  if (!modalContainer) initRunModal();
  currentAgent = agentObj;

  // Set headers
  document.getElementById('rm-agent-name').textContent = currentAgent.name;
  document.getElementById('rm-agent-badge').textContent = currentAgent.type;

  const bdg = document.getElementById('rm-agent-badge');
  bdg.className = 'badge';
  if (currentAgent.type === 'email') bdg.classList.add('badge-purple');
  else if (currentAgent.type === 'voice') bdg.classList.add('badge-coral');
  else bdg.classList.add('badge-blue');

  const statusDot = document.getElementById('rm-status');
  statusDot.className = 'status-dot';
  if (currentAgent.status === 'running') statusDot.classList.add('active');
  else if (currentAgent.status === 'waiting_approval') statusDot.classList.add('thinking');
  else statusDot.classList.add('idle');

  document.getElementById('rm-task').placeholder = defaultPlaceholders[currentAgent.type] || defaultPlaceholders['autonomous'];

  const voiceNotice = document.getElementById('rm-voice-notice');
  if (currentAgent.type === 'voice') voiceNotice.style.display = 'block';
  else voiceNotice.style.display = 'none';

  resetQuickRun();
  switchTab('quick');

  modalContainer.style.display = 'flex';

  // Load strategies for dropdown
  const user = getCurrentUser();
  if (user && currentAgent.agentId) {
    try {
      currentStrategies = await listStrategies(user.uid, currentAgent.agentId);
      const sel = document.getElementById('rm-strategy');
      sel.innerHTML = '<option value="auto">Auto-select (Recommended)</option>';
      currentStrategies.forEach(s => {
        const activeStar = s.status === 'active' ? '★ ' : '';
        sel.innerHTML += `<option value="${s.id}">${activeStar}${s.name} (${Number(s.averageScore || 0).toFixed(1)})</option>`;
      });
      // Try to find active
      const active = currentStrategies.find(s => s.status === 'active');
      document.getElementById('rm-strategy-text').textContent = active ? `Active Strategy: ${active.name}` : `Active Strategy: None`;
    } catch (e) {
      console.warn("Could not load strategies", e);
    }
  }
}

function close() {
  if (modalContainer) modalContainer.style.display = 'none';
  if (batchActive) stopBatchRun();
}

function switchTab(tab) {
  document.querySelectorAll('.rm-tab-content').forEach(el => el.style.display = 'none');
  document.getElementById(`rm-tab-${tab}`).style.display = 'block';

  document.querySelectorAll('#global-run-modal-backdrop .detail-tab').forEach(el => {
    el.classList.remove('active');
    if (el.textContent.toLowerCase().includes(tab)) el.classList.add('active');
  });
}

function resetQuickRun() {
  document.getElementById('rm-task').value = '';
  document.getElementById('rm-context').value = '';
  document.getElementById('rm-output-section').style.display = 'none';
  document.getElementById('rm-run-controls').style.display = 'block';
  document.getElementById('rm-scorer-container').innerHTML = '';
}

let typeoutTimeout;

async function executeRun() {
  const taskDesc = document.getElementById('rm-task').value.trim();
  const context = document.getElementById('rm-context').value.trim();
  // const strat = document.getElementById('rm-strategy').value; // In a full impl, we'd pass strat override

  if (!taskDesc) {
    alert("Please enter a task description.");
    return;
  }

  const btn = document.getElementById('rm-btn-run');
  btn.disabled = true;
  btn.innerHTML = `<span class="loading-spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px;display:inline-block;vertical-align:middle;"></span> Running...`;

  try {
    const startTime = Date.now();
    const result = await runAgent(currentAgent.agentId, taskDesc, context);
    const duration = Date.now() - startTime;

    // Show output section
    document.getElementById('rm-run-controls').style.display = 'none';
    const outputSection = document.getElementById('rm-output-section');
    outputSection.style.display = 'block';

    // Animate text
    const display = document.getElementById('rm-output-display');
    display.textContent = '';
    const words = (result.output || 'No output').split(' ');

    let i = 0;
    clearTimeout(typeoutTimeout);
    function typeWord() {
      if (i < words.length) {
        display.textContent += words[i] + ' ';
        i++;
        display.scrollTop = display.scrollHeight; // Auto-scroll
        typeoutTimeout = setTimeout(typeWord, 30);
      } else {
        // Complete
        const wordCount = words.length;
        const readMins = Math.max(1, Math.ceil(wordCount / 200));
        document.getElementById('rm-stats-time').textContent = `Duration: ${(duration / 1000).toFixed(1)}s`;
        document.getElementById('rm-stats-words').textContent = `Words: ${wordCount} | Read time: ~${readMins}m`;

        // Inject run scorer
        if (result.runId) {
          document.getElementById('rm-scorer-container').innerHTML = renderRunScorer(result.runId, currentAgent.agentId);
        }
      }
    }
    typeWord();

  } catch (error) {
    console.error("Run failed:", error);
    alert("Failed to execute run.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Run Agent';
  }
}

function copyOutput() {
  const text = document.getElementById('rm-output-display').textContent;
  navigator.clipboard.writeText(text);
  if (window.toast) window.toast('Copied to clipboard', 'success');
}

// ==========================================
// BATCH RUN LOGIC
// ==========================================
let batchRows = [];
let batchActive = false;

function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    parseCSV(text);
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) {
    alert("CSV must have a header row and at least one data row.");
    return;
  }

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
  const taskIdx = headers.indexOf('task_description');
  const contextIdx = headers.indexOf('context');

  if (taskIdx === -1) {
    alert("CSV must contain a 'task_description' column.");
    return;
  }

  batchRows = [];
  for (let i = 1; i < Math.min(lines.length, 51); i++) {
    // Basic CSV splitting (doesn't handle commas inside quotes perfectly, but good enough for MVP)
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols[taskIdx]) {
      batchRows.push({
        task: cols[taskIdx],
        context: contextIdx !== -1 ? cols[contextIdx] : ''
      });
    }
  }

  // Render preview
  document.getElementById('rm-batch-count').textContent = batchRows.length;
  const tbody = document.getElementById('rm-batch-preview-body');
  tbody.innerHTML = batchRows.slice(0, 5).map((row, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${row.task}</td>
      <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary);">${row.context || '-'}</td>
    </tr>
  `).join('');
  if (batchRows.length > 5) {
    tbody.innerHTML += `<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">...and ${batchRows.length - 5} more</td></tr>`;
  }

  document.getElementById('rm-batch-setup').style.display = 'block';
  document.getElementById('rm-batch-preview').style.display = 'block';
  document.getElementById('rm-batch-active').style.display = 'none';
  document.getElementById('rm-batch-results').style.display = 'none';
}

async function startBatchRun() {
  if (batchRows.length === 0) return;
  batchActive = true;

  document.getElementById('rm-batch-setup').style.display = 'none';
  document.getElementById('rm-batch-active').style.display = 'block';
  const resultsDiv = document.getElementById('rm-batch-results');
  resultsDiv.style.display = 'block';
  const resultsList = document.getElementById('rm-batch-results-list');
  resultsList.innerHTML = '';

  const delaySecs = parseInt(document.getElementById('rm-batch-delay').value);
  const total = batchRows.length;

  for (let i = 0; i < total; i++) {
    if (!batchActive) break; // Halts

    document.getElementById('rm-batch-status-text').textContent = `Running task ${i + 1} of ${total}...`;
    document.getElementById('rm-batch-progress').style.width = `${((i) / total) * 100}%`;

    const row = batchRows[i];

    // create UI placeholder
    const resItem = document.createElement('div');
    resItem.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;';
    resItem.innerHTML = `
      <div style="flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 1rem;">
        <span style="color:var(--text-secondary); margin-right: 0.5rem;">#${i + 1}</span> ${row.task}
      </div>
      <div><span class="loading-spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></span></div>
    `;
    resultsList.prepend(resItem);

    try {
      const result = await runAgent(currentAgent.agentId, row.task, row.context);

      const snippet = result.output.substring(0, 40).replace(/\n/g, ' ') + '...';
      resItem.innerHTML = `
        <div style="flex:2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 1rem;">
          <span style="color:var(--text-secondary); margin-right: 0.5rem;">#${i + 1}</span> ${snippet}
        </div>
        <div><span class="badge badge-teal">Success</span></div>
      `;
    } catch (e) {
      resItem.innerHTML = `
        <div style="flex:2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 1rem;">
          <span style="color:var(--text-secondary); margin-right: 0.5rem;">#${i + 1}</span> Failed
        </div>
        <div><span class="badge badge-coral">Error</span></div>
      `;
    }

    // Delay before next unless it's the last one
    if (i < total - 1 && batchActive) {
      document.getElementById('rm-batch-status-text').textContent = `Waiting ${delaySecs}s...`;
      document.getElementById('rm-batch-progress').style.width = `${((i + 1) / total) * 100}%`;
      await new Promise(r => setTimeout(r, delaySecs * 1000));
    }
  }

  if (batchActive) {
    document.getElementById('rm-batch-progress').style.width = `100%`;
    document.getElementById('rm-batch-status-text').textContent = `Batch Complete! (${total}/${total})`;
  }

  batchActive = false;
}

function stopBatchRun() {
  batchActive = false;
  document.getElementById('rm-batch-status-text').textContent = `Batch Halted.`;
}
