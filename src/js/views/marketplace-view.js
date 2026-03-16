import { getCurrentUser } from '../app.js';
import { createAgent, createStrategy } from '../db-helpers.js';

const TEMPLATES = [
  {
    id: 't1', name: 'Cold Email SDR', type: 'email', category: 'Sales', description: "Replies-optimized cold outreach agent that researches prospects and writes highly personalized emails aiming for a 10%+ reply rate.",
    baseSystemPrompt: "You are an elite SDR. Your goal is to write cold emails that get replies. Keep it under 50 words. Focus on a single clear CTA. Use the prospect's recent company news as a hook.",
    defaultPrimaryMetric: 'reply_rate', defaultExploitRatio: 0.8, rating: 4.8, installCount: 4200, author: 'Stone AIO', tags: ['Cold Email', 'Sales', 'B2B'], isFeatured: true
  },
  {
    id: 't2', name: 'LinkedIn Content Writer', type: 'content', category: 'Marketing', description: "Engagement-optimized LinkedIn posts that generate inbound leads. Uses proven copywriting frameworks (AIDA, PAS).",
    baseSystemPrompt: "You are a top-tier LinkedIn ghostwriter. Write engaging posts that stop the scroll. Use short sentences, strong hooks, and a clear takeaway.",
    defaultPrimaryMetric: 'engagement_rate', defaultExploitRatio: 0.9, rating: 4.7, installCount: 3800, author: 'Stone AIO', tags: ['LinkedIn', 'Social Media', 'Growth'], isFeatured: true
  },
  {
    id: 't3', name: 'Retell.ai Cold Caller', type: 'voice', category: 'Sales', description: "Meeting-booking SDR voice agent integrated with Retell.ai. Handles objections smoothly and pushes for the calendar link.",
    baseSystemPrompt: "You are an outbound sales rep calling a prospect. Your goal is to book a 15-minute intro call. Keep responses under 2 sentences. Overcome 'send me an email' with a quick value drop.",
    defaultPrimaryMetric: 'meetings_booked', defaultExploitRatio: 0.7, rating: 4.9, installCount: 1500, author: 'Stone AIO', tags: ['Voice', 'Outbound', 'Booking'], isFeatured: true
  },
  {
    id: 't4', name: 'Competitive Researcher', type: 'autonomous', category: 'Research', description: "Deep competitor analysis agent. Scrapes pricing pages, tracks feature updates, and generates weekly threat reports.",
    baseSystemPrompt: "You are a competitive intelligence analyst. Extract pricing, core features, and value propositions from the provided competitor URLs. Structure the output as a JSON competitor profile.",
    defaultPrimaryMetric: 'insights_found', defaultExploitRatio: 0.8, rating: 4.5, installCount: 2100, author: 'Stone AIO', tags: ['Research', 'Strategy', 'Scraping'], isFeatured: false
  },
  {
    id: 't5', name: 'Customer Support Agent', type: 'autonomous', category: 'Support', description: "Ticket triage and resolution agent. Automatically tags, routes, and drafts replies for common support queries.",
    baseSystemPrompt: "You are a tier 1 customer support agent. Read the user ticket, categorize it (Billing, Tech, Account), and draft a polite, helpful response using our knowledge base.",
    defaultPrimaryMetric: 'resolution_rate', defaultExploitRatio: 0.9, rating: 4.6, installCount: 5000, author: 'Stone AIO', tags: ['Support', 'Zendesk', 'Triage'], isFeatured: false
  },
  {
    id: 't6', name: 'Lead Enrichment Agent', type: 'browser', category: 'Sales', description: "Researches leads from LinkedIn. Finds verified work emails, recent posts, and company tech stacks.",
    baseSystemPrompt: "Given a LinkedIn profile URL, extract their current title, company, time in role, and deduce their likely tech stack based on their job description. Return JSON.",
    defaultPrimaryMetric: 'data_accuracy', defaultExploitRatio: 0.85, rating: 4.4, installCount: 1800, author: 'Stone AIO', tags: ['Enrichment', 'Prospecting', 'Data'], isFeatured: false
  },
  {
    id: 't7', name: 'Newsletter Writer', type: 'content', category: 'Marketing', description: "Weekly newsletter generation. Synthesizes 5 provided links into a cohesive, engaging weekly update for your audience.",
    baseSystemPrompt: "You are a newsletter editor. Read the 5 provided articles and write a cohesive newsletter. Include a catchy subject line, an intro, and a 2-sentence summary for each link.",
    defaultPrimaryMetric: 'open_rate', defaultExploitRatio: 0.9, rating: 4.3, installCount: 950, author: 'Stone AIO', tags: ['Email', 'Newsletter', 'Content'], isFeatured: false
  },
  {
    id: 't8', name: 'Sales Follow-Up Agent', type: 'email', category: 'Sales', description: "Follow-up sequence writer. Crafts a 3-step bump sequence for prospects who ghosted after a demo.",
    baseSystemPrompt: "Write a 3-step follow up sequence for a prospect who saw a demo but went quiet. Day 3: Value add. Day 7: Case study. Day 14: Breakup email.",
    defaultPrimaryMetric: 'revival_rate', defaultExploitRatio: 0.8, rating: 4.7, installCount: 2400, author: 'Stone AIO', tags: ['Follow-up', 'AE', 'Closing'], isFeatured: false
  },
  {
    id: 't9', name: 'Product Feedback Analyzer', type: 'autonomous', category: 'Product', description: "Synthesizes user feedback from Intercom/Discord into categorized feature requests and bug reports.",
    baseSystemPrompt: "Read the batch of user messages. Extract feature requests and bugs. Group similar requests together and assign a severity score (1-5) based on frequency and user frustration.",
    defaultPrimaryMetric: 'synthesis_accuracy', defaultExploitRatio: 0.85, rating: 4.8, installCount: 1200, author: 'Stone AIO', tags: ['Product', 'Feedback', 'Analysis'], isFeatured: false
  },
  {
    id: 't10', name: 'Meeting Prep Agent', type: 'autonomous', category: 'Sales', description: "Researches a company before a sales call. Summarizes their 10-K, recent press releases, and executive team.",
    baseSystemPrompt: "You are an executive assistant preparing an AE for a discovery call. Read the provided company data and provide a 1-page summary: Key initiatives, recent news, and tailored discovery questions.",
    defaultPrimaryMetric: 'prep_quality', defaultExploitRatio: 0.8, rating: 4.6, installCount: 1900, author: 'Stone AIO', tags: ['Prep', 'Discovery', 'Research'], isFeatured: false
  },
  {
    id: 't11', name: 'SEO Content Agent', type: 'content', category: 'Marketing', description: "Search-optimized article writer. Generates long-form 2000+ word blog posts that actually rank on Google.",
    baseSystemPrompt: "Write a comprehensive, SEO-optimized blog post for the keyword provided. Use proper H2/H3 tags. Include an intro, 5 main points, and a conclusion. Avoid AI fluff words like 'delve' or 'tapestry'.",
    defaultPrimaryMetric: 'search_ranking', defaultExploitRatio: 0.7, rating: 4.2, installCount: 2000, author: 'Stone AIO', tags: ['SEO', 'Blog', 'Traffic'], isFeatured: false
  },
  {
    id: 't12', name: 'Onboarding Email Sequence', type: 'email', category: 'Product', description: "Multi-step onboarding writer. Navigates new signups to the 'Aha!' moment as quickly as possible.",
    baseSystemPrompt: "Write a 5-day email onboarding sequence for a new SaaS user. Day 1: Welcome & Setup. Day 2: Core Feature. Day 3: Pro Tip. Day 4: Case Study. Day 5: Check-in/Support.",
    defaultPrimaryMetric: 'activation_rate', defaultExploitRatio: 0.9, rating: 4.5, installCount: 1600, author: 'Stone AIO', tags: ['Onboarding', 'PLG', 'Email'], isFeatured: false
  }
];

let currentFilter = 'All';
let currentSort = 'Top Rated';
let searchQuery = '';
let selectedTemplate = null;

export async function render() {
  return `
    <div class="marketplace-container" style="padding-bottom: 4rem;">
      
      <!-- HERO -->
      <div class="hero-section" style="background: linear-gradient(135deg, rgba(88,28,135,0.4) 0%, rgba(15,23,42,1) 100%); padding: 4rem 2rem; border-radius: 16px; margin-bottom: 2rem; text-align: center; border: 1px solid rgba(124, 58, 237, 0.3); position: relative; overflow: hidden;">
        <div style="position: absolute; top: -50px; left: -50px; width: 200px; height: 200px; background: rgba(124, 58, 237, 0.2); filter: blur(60px); border-radius: 50%;"></div>
        <div style="position: absolute; bottom: -50px; right: -50px; width: 200px; height: 200px; background: rgba(56, 189, 248, 0.1); filter: blur(60px); border-radius: 50%;"></div>
        
        <h1 style="font-size: 2.5rem; margin-bottom: 1rem; position: relative; z-index: 1;">Agent Marketplace</h1>
        <p style="font-size: 1.1rem; color: var(--text-secondary); max-width: 600px; margin: 0 auto 2rem auto; position: relative; z-index: 1;">Discover and install top-performing AI agents built by the community. Stop starting from scratch.</p>
        
        <div style="max-width: 500px; margin: 0 auto; position: relative; z-index: 1;">
          <input type="text" id="mp-search" class="input" placeholder="Search agents by name, tag, or description..." style="width: 100%; padding: 1rem 1.5rem; border-radius: 30px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); font-size: 1rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position: absolute; right: 20px; top: 16px; color: var(--text-secondary);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
      </div>

      <!-- FILTER BAR -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
        <div class="type-pills" style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 4px;">
          <button class="btn btn-secondary mp-filter active" data-filter="All" style="border-radius: 20px;">All</button>
          <button class="btn btn-secondary mp-filter" data-filter="email" style="border-radius: 20px;">Email</button>
          <button class="btn btn-secondary mp-filter" data-filter="content" style="border-radius: 20px;">Content</button>
          <button class="btn btn-secondary mp-filter" data-filter="voice" style="border-radius: 20px;">Voice</button>
          <button class="btn btn-secondary mp-filter" data-filter="autonomous" style="border-radius: 20px;">Autonomous</button>
          <button class="btn btn-secondary mp-filter" data-filter="browser" style="border-radius: 20px;">Browser</button>
        </div>
        
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Sort by:</span>
          <select id="mp-sort" class="input" style="width: auto; padding: 0.3rem 2rem 0.3rem 1rem; border-radius: 8px;">
            <option value="Top Rated">Top Rated</option>
            <option value="Most Installed">Most Installed</option>
            <option value="Newest">Newest</option>
          </select>
        </div>
      </div>

      <!-- FEATURED SECTION -->
      <div id="mp-featured-section" style="margin-bottom: 3rem;">
        <h2 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          Featured Agents
        </h2>
        <div id="mp-featured-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
          <!-- Featured cards injected here -->
        </div>
      </div>

      <!-- ALL TEMPLATES (Grid) -->
      <div>
        <h2 style="margin-bottom: 1.5rem;">All Templates</h2>
        <div id="mp-all-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">
          <!-- Standard cards injected here -->
        </div>
      </div>
      
      <!-- PUBLISH CTA -->
      <div style="margin-top: 4rem; padding: 3rem 2rem; background: var(--card-bg); border: 1px dashed var(--border-color); border-radius: 16px; text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: rgba(124, 58, 237, 0.1); color: var(--accent-purple); margin-bottom: 1rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        </div>
        <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">Publish Your Agent</h3>
        <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 1.5rem auto;">Coming soon — share your best agents with the community and track their usage across the platform.</p>
        <div style="display: flex; max-width: 400px; margin: 0 auto; gap: 0.5rem;">
          <input type="email" class="input" placeholder="Enter your email for the waitlist" style="flex: 1;" />
          <button class="btn btn-secondary">Notify Me</button>
        </div>
      </div>

    </div>

    <!-- MODALS -->
    
    <!-- View Details Modal -->
    <div id="mp-detail-modal" class="modal-backdrop" style="display: none;">
      <div class="modal-content" style="width: 600px; max-width: 90vw;">
        <div class="modal-header">
          <h3 id="mp-detail-title">Template Details</h3>
          <button class="btn-close" id="mp-detail-close">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;" id="mp-detail-tags"></div>
          
          <p id="mp-detail-desc" style="font-size: 1.05rem; line-height: 1.6; margin-bottom: 1.5rem;"></p>
          
          <div style="display: flex; gap: 2rem; margin-bottom: 1.5rem; background: var(--bg-color); padding: 1rem; border-radius: 8px;">
            <div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Rating</div>
              <div style="font-weight: 600; display:flex; align-items:center; gap:0.25rem;">
                <span id="mp-detail-rating"></span> 
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #fbbf24;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
            </div>
            <div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Installs</div>
              <div style="font-weight: 600;" id="mp-detail-installs"></div>
            </div>
            <div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Metric</div>
              <div style="font-weight: 600;" id="mp-detail-metric"></div>
            </div>
          </div>
          
          <h4 style="margin-bottom: 0.5rem;">Base System Prompt</h4>
          <div style="background: var(--bg-dark); padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; color: #a5b4fc; white-space: pre-wrap; margin-bottom: 1.5rem;" id="mp-detail-prompt"></div>
          
          <button id="mp-detail-install-btn" class="btn btn-primary" style="width: 100%; font-size: 1.1rem; padding: 1rem;">Install This Agent</button>
        </div>
      </div>
    </div>

    <!-- Install Flow Modal -->
    <div id="mp-install-modal" class="modal-backdrop" style="display: none;">
      <div class="modal-content" style="width: 500px;">
        <div class="modal-header">
          <h3 id="mp-install-title">Install Agent</h3>
          <button class="btn-close" id="mp-install-close">&times;</button>
        </div>
        <div class="modal-body" id="mp-install-step-1">
          <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Name your new agent. You can customize the prompt in the next step.</p>
          <div class="form-group">
            <label>Agent Name</label>
            <input type="text" id="mp-install-name" class="input" style="font-size: 1.1rem; padding: 0.8rem;" />
          </div>
          <button id="mp-install-next" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Next: Review Prompt</button>
        </div>
        
        <div class="modal-body" id="mp-install-step-2" style="display: none;">
          <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Review or tweak the base prompt before finalizing.</p>
          <div class="form-group">
            <label>Initial System Prompt</label>
            <textarea id="mp-install-prompt" class="input" rows="8" style="font-family: monospace;"></textarea>
          </div>
          <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
            <button id="mp-install-back" class="btn btn-secondary" style="flex: 1;">Back</button>
            <button id="mp-install-finish" class="btn btn-primary" style="flex: 2;">Confirm Installation</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  renderGrids();
  setupListeners();
}

function renderStars(rating) {
  return `
    <span style="color: #fbbf24; display: inline-flex; align-items: center; gap: 2px;">
      ${rating.toFixed(1)}
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
    </span>`;
}

function filterAndSortTemplates() {
  let filtered = TEMPLATES.filter(t => {
    const matchFilter = currentFilter === 'All' || t.type === currentFilter.toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchSearch = q === '' || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q));
    return matchFilter && matchSearch;
  });

  if (currentSort === 'Top Rated') {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (currentSort === 'Most Installed') {
    filtered.sort((a, b) => b.installCount - a.installCount);
  } else {
    // Newest is not in data, just fallback to default order inside sort
    // We'll leave it as is, or sort by id desc roughly
  }
  return filtered;
}

function createCardHTML(t, isFeatured = false) {
  const descSnippet = isFeatured ? t.description : (t.description.substring(0, 80) + '...');
  const tagsHtml = t.tags.slice(0, 3).map(tag => `<span class="badge" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-secondary);">${tag}</span>`).join('');

  const goldBadge = isFeatured ? `<div class="badge" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3);">Featured</div>` : '';

  return `
    <div class="card mp-card" style="display:flex; flex-direction:column; justify-content:space-between; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: 1px solid ${isFeatured ? 'rgba(124, 58, 237, 0.5)' : 'var(--border-color)'}; border-radius: 12px; height: 100%;" data-id="${t.id}">
      <div style="padding: 1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 1rem;">
          <span class="badge badge-purple">${t.type}</span>
          ${goldBadge}
        </div>
        <h3 style="margin-bottom: 0.5rem; font-size: 1.25rem;">${t.name}</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1rem;">${descSnippet}</p>
        <div style="display:flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          ${tagsHtml}
        </div>
      </div>
      
      <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); background: rgba(0,0,0,0.2); border-radius: 0 0 12px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
          <div style="font-size: 0.85rem;">${renderStars(t.rating)}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${t.installCount.toLocaleString()} installs</div>
        </div>
        <div style="display:flex; gap: 0.5rem;">
          <button class="btn btn-primary mp-install-direct" data-id="${t.id}" style="flex:2;">Install</button>
          <button class="btn btn-secondary mp-preview" data-id="${t.id}" style="flex:1;">View</button>
        </div>
      </div>
    </div>
  `;
}

function renderGrids() {
  const filtered = filterAndSortTemplates();
  const featured = filtered.filter(t => t.isFeatured);
  const others = filtered;

  const featuredGrid = document.getElementById('mp-featured-grid');
  const allGrid = document.getElementById('mp-all-grid');
  const featuredSection = document.getElementById('mp-featured-section');

  if (searchQuery || currentFilter !== 'All') {
    featuredSection.style.display = 'none';
  } else {
    featuredSection.style.display = 'block';
    featuredGrid.innerHTML = featured.map(t => createCardHTML(t, true)).join('');
  }

  const ToDisplay = (searchQuery || currentFilter !== 'All') ? filtered : others.filter(t => !t.isFeatured);
  if (ToDisplay.length === 0) {
    allGrid.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-secondary); padding: 2rem 0; text-align: center;">No templates found matching your criteria.</div>';
  } else {
    allGrid.innerHTML = ToDisplay.map(t => createCardHTML(t, false)).join('');
  }

  attachCardListeners();
}

function attachCardListeners() {
  document.querySelectorAll('.mp-preview, .mp-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.mp-install-direct')) return;
      e.stopPropagation();
      const id = el.dataset.id || el.closest('.mp-card').dataset.id;
      showTemplateDetails(id);
    });
  });

  document.querySelectorAll('.mp-install-direct').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      startInstallFlow(id);
    });
  });
}

function setupListeners() {
  // Search
  document.getElementById('mp-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderGrids();
  });

  // Filter pills
  document.querySelectorAll('.mp-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.mp-filter').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderGrids();
    });
  });

  // Sort
  document.getElementById('mp-sort').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderGrids();
  });

  // Detail Modal
  document.getElementById('mp-detail-close').addEventListener('click', () => {
    document.getElementById('mp-detail-modal').style.display = 'none';
  });

  document.getElementById('mp-detail-install-btn').addEventListener('click', () => {
    document.getElementById('mp-detail-modal').style.display = 'none';
    if (selectedTemplate) startInstallFlow(selectedTemplate.id);
  });

  // Install Modal
  const installModal = document.getElementById('mp-install-modal');
  document.getElementById('mp-install-close').addEventListener('click', () => {
    installModal.style.display = 'none';
  });

  document.getElementById('mp-install-next').addEventListener('click', () => {
    document.getElementById('mp-install-step-1').style.display = 'none';
    document.getElementById('mp-install-step-2').style.display = 'block';
  });

  document.getElementById('mp-install-back').addEventListener('click', () => {
    document.getElementById('mp-install-step-2').style.display = 'none';
    document.getElementById('mp-install-step-1').style.display = 'block';
  });

  document.getElementById('mp-install-finish').addEventListener('click', finalizeInstall);
}

function showTemplateDetails(id) {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  selectedTemplate = t;

  document.getElementById('mp-detail-title').textContent = t.name;
  document.getElementById('mp-detail-desc').textContent = t.description;
  document.getElementById('mp-detail-rating').textContent = t.rating.toFixed(1);
  document.getElementById('mp-detail-installs').textContent = t.installCount.toLocaleString();
  document.getElementById('mp-detail-metric').textContent = t.defaultPrimaryMetric;
  document.getElementById('mp-detail-prompt').textContent = t.baseSystemPrompt;

  const tagsHtml = t.tags.map(tag => `<span class="badge" style="background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.3); color: #c4b5fd;">${tag}</span>`).join('');
  document.getElementById('mp-detail-tags').innerHTML = tagsHtml;

  document.getElementById('mp-detail-modal').style.display = 'flex';
}

function startInstallFlow(id) {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  selectedTemplate = t;

  document.getElementById('mp-install-name').value = t.name;
  document.getElementById('mp-install-prompt').value = t.baseSystemPrompt;

  document.getElementById('mp-install-step-2').style.display = 'none';
  document.getElementById('mp-install-step-1').style.display = 'block';
  document.getElementById('mp-install-modal').style.display = 'flex';
}

async function finalizeInstall() {
  const user = getCurrentUser();
  if (!user) {
    if (window.toast) toast('Please login to install agents', 'error');
    return;
  }

  const finishBtn = document.getElementById('mp-install-finish');
  finishBtn.disabled = true;
  finishBtn.textContent = 'Installing...';

  const agentName = document.getElementById('mp-install-name').value || selectedTemplate.name;
  const systemPrompt = document.getElementById('mp-install-prompt').value || selectedTemplate.baseSystemPrompt;

  try {
    // 1. Create Agent
    const agentData = {
      name: agentName,
      type: selectedTemplate.type,
      config: { baseInstructions: '' },
      status: 'idle',
      totalRuns: 0,
      averageScore: 0,
      runsToday: 0
    };
    const agent = await createAgent(user.uid, agentData);

    // 2. Create Initial Strategy
    const strategyData = {
      systemPrompt: systemPrompt,
      primaryMetric: selectedTemplate.defaultPrimaryMetric,
      exploitRatio: selectedTemplate.defaultExploitRatio,
      averageScore: 0,
      totalRuns: 0,
      templateId: selectedTemplate.id
    };
    await createStrategy(user.uid, agent.agentId, strategyData);

    document.getElementById('mp-install-modal').style.display = 'none';
    if (window.toast) toast(`${agentName} perfectly installed!`, 'success');

    // Suggest navigating to agents
    setTimeout(() => {
      window.location.hash = '#agents';
    }, 1500);

  } catch (error) {
    console.error('Install failed:', error);
    if (window.toast) toast('Installation failed. Try again.', 'error');
  } finally {
    finishBtn.disabled = false;
    finishBtn.textContent = 'Confirm Installation';
  }
}

const style = document.createElement('style');
style.textContent = `
  .mp-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.3); border-color: rgba(124, 58, 237, 0.4); }
  .mp-filter.active { background: var(--accent-purple); border-color: var(--accent-purple); color: white; }
`;
document.head.appendChild(style);

export function destroy() {
}
