import type {
  ChatMessage,
  FileDiff,
  PageContext,
  PipelineStage,
  ReviewRequest,
  ReviewResponse,
  SelectedElement,
} from '../types';

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: '',
  understanding: 'ðŸ” Understanding requestâ€¦',
  locating: 'ðŸ“‚ Locating componentâ€¦',
  generating: 'âš™ï¸ Generating codeâ€¦',
  preparing_diff: 'ðŸ“‹ Preparing diffâ€¦',
  waiting_approval: 'âœ‹ Waiting for approval',
  applying: 'ðŸš€ Applying changesâ€¦',
  completed: 'âœ… Completed',
  error: 'âŒ Error',
};

export class ChatPanel {
  private root: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private element: SelectedElement;
  private pageContext: PageContext;
  private conversation: ChatMessage[] = [];
  private stage: PipelineStage = 'idle';
  private pendingResponse: ReviewResponse | null = null;
  private requestId: string | null = null;

  constructor(element: SelectedElement, pageContext: PageContext) {
    this.element = element;
    this.pageContext = pageContext;
    this.root = document.createElement('div');
    this.root.id = 'aivr-chat-panel';
    this.shadowRoot = this.root.attachShadow({ mode: 'open' });
    document.body.appendChild(this.root);
    this.position();
    this.render();
    // Focus input after render
    requestAnimationFrame(() => this.focusInput());
  }

  private position() {
    const rect = this.element.boundingRect;
    const panelW = 360;
    const panelH = 460;
    let left = rect.right + 14;
    let top = rect.top;
    if (left + panelW > window.innerWidth - 8) left = rect.left - panelW - 14;
    if (left < 8) left = Math.max(8, window.innerWidth / 2 - panelW / 2);
    if (top + panelH > window.innerHeight - 8) top = window.innerHeight - panelH - 8;
    if (top < 8) top = 8;
    Object.assign(this.root.style, {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex: '2147483647',
      width: `${panelW}px`,
    });
  }

  private focusInput() {
    const input = this.shadowRoot.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (input) {
      input.focus();
      // Re-focus after a tick to work around shadow DOM focus issues
      setTimeout(() => input.focus(), 50);
    }
  }

  private render() {
    const el = this.element;
    const isProcessing = ['understanding','locating','generating','preparing_diff','applying'].includes(this.stage);
    const isApproval = this.stage === 'waiting_approval' && this.pendingResponse?.diffs?.length;
    const showInput = !isProcessing && this.stage !== 'waiting_approval';

    this.shadowRoot.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :host { display: block; }
        .panel {
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15);
          display: flex;
          flex-direction: column;
          max-height: 460px;
          overflow: hidden;
          color: #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
        }
        /* Header */
        .header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
          flex-shrink: 0;
        }
        .tag-badge {
          background: rgba(99,102,241,0.2);
          border: 1px solid rgba(99,102,241,0.4);
          color: #a5b4fc;
          padding: 2px 8px;
          border-radius: 5px;
          font-size: 11px;
          font-family: monospace;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .close-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .close-btn:hover { background: #334155; color: #e2e8f0; }
        /* Messages */
        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 60px;
        }
        .empty-hint {
          color: #475569;
          font-size: 12px;
          text-align: center;
          padding: 20px 0 8px;
          line-height: 1.6;
        }
        .empty-hint strong { color: #64748b; display: block; margin-bottom: 4px; font-size: 13px; }
        .msg {
          padding: 8px 11px;
          border-radius: 10px;
          line-height: 1.5;
          max-width: 93%;
          word-break: break-word;
          font-size: 13px;
        }
        .msg.user {
          background: #6366f1;
          color: #fff;
          align-self: flex-end;
          border-bottom-right-radius: 3px;
        }
        .msg.assistant {
          background: #1e293b;
          border: 1px solid #334155;
          align-self: flex-start;
          border-bottom-left-radius: 3px;
        }
        /* Stage bar */
        .stage-bar {
          padding: 7px 12px;
          background: #1e293b;
          border-top: 1px solid #334155;
          font-size: 12px;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .spinner {
          width: 13px; height: 13px;
          border: 2px solid #334155;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        /* Diff */
        .diff-section {
          padding: 10px 12px;
          overflow-y: auto;
          max-height: 200px;
          border-top: 1px solid #334155;
          flex-shrink: 0;
        }
        .diff-summary { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
        .diff-file-name { font-family: monospace; font-size: 11px; color: #818cf8; margin-bottom: 4px; }
        .diff-code {
          background: #0d1117;
          border: 1px solid #1e293b;
          border-radius: 6px;
          font-family: monospace;
          font-size: 11px;
          overflow-x: auto;
          padding: 6px 8px;
          white-space: pre;
          line-height: 1.5;
          color: #94a3b8;
          margin-bottom: 8px;
        }
        .add { color: #4ade80; }
        .remove { color: #f87171; }
        .meta { color: #60a5fa; }
        /* Approval */
        .approval-row {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid #334155;
          flex-shrink: 0;
        }
        .approve-btn {
          flex: 1; background: #10b981; border: none; border-radius: 8px;
          color: #fff; cursor: pointer; font-size: 13px; font-weight: 600; padding: 8px;
        }
        .approve-btn:hover { background: #059669; }
        .reject-btn {
          background: #1e293b; border: 1px solid #ef4444; border-radius: 8px;
          color: #ef4444; cursor: pointer; font-size: 13px; padding: 8px 14px;
        }
        .reject-btn:hover { background: rgba(239,68,68,0.1); }
        /* Input row */
        .input-row {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid #334155;
          background: #0f172a;
          flex-shrink: 0;
        }
        .chat-input {
          flex: 1;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          color: #e2e8f0;
          font-family: inherit;
          font-size: 13px;
          padding: 8px 10px;
          resize: none;
          outline: none;
          line-height: 1.4;
          min-height: 38px;
          max-height: 90px;
        }
        .chat-input::placeholder { color: #475569; }
        .chat-input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
        .send-btn {
          background: #6366f1;
          border: none;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 16px;
          flex-shrink: 0;
          align-self: flex-end;
        }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .send-btn:hover:not(:disabled) { background: #4f46e5; }
      </style>
      <div class="panel">
        <div class="header">
          <div class="tag-badge">&lt;${el.tag}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ')[0] : ''}&gt;</div>
          <button class="close-btn" id="close">âœ•</button>
        </div>

        <div class="messages" id="messages">
          ${this.conversation.length === 0 ? `
            <div class="empty-hint">
              <strong>Element selected</strong>
              ${el.text ? `"${this.escHtml(el.text.slice(0, 60))}"<br>` : ''}
              Type what you want to change
            </div>
          ` : this.conversation.map(m => `
            <div class="msg ${m.role}">${this.escHtml(m.content)}</div>
          `).join('')}
        </div>

        ${isProcessing ? `
          <div class="stage-bar">
            <div class="spinner"></div>
            <span>${STAGE_LABELS[this.stage]}</span>
          </div>
        ` : ''}

        ${isApproval ? `
          <div class="diff-section">
            <div class="diff-summary">${this.escHtml(this.pendingResponse?.summary ?? '')} â€” ${this.pendingResponse?.filesModified?.length ?? 0} file(s)</div>
            ${(this.pendingResponse?.diffs ?? []).map(d => this.renderFileDiff(d)).join('')}
          </div>
          <div class="approval-row">
            <button class="approve-btn" id="approve">âœ“ Approve & Apply</button>
            <button class="reject-btn" id="reject">âœ— Reject</button>
          </div>
        ` : ''}

        ${showInput ? `
          <div class="input-row">
            <textarea
              class="chat-input"
              id="chat-input"
              placeholder='e.g. "Make this button blue" or "Add hover animation"'
              rows="1"
            ></textarea>
            <button class="send-btn" id="send">Send</button>
          </div>
        ` : ''}
      </div>
    `;

    this.wireEvents();
    this.scrollMessages();
  }

  private wireEvents() {
    this.shadowRoot.getElementById('close')?.addEventListener('click', () => this.destroy());
    this.shadowRoot.getElementById('approve')?.addEventListener('click', () => this.approve());
    this.shadowRoot.getElementById('reject')?.addEventListener('click', () => this.reject());

    const input = this.shadowRoot.getElementById('chat-input') as HTMLTextAreaElement | null;
    const sendBtn = this.shadowRoot.getElementById('send') as HTMLButtonElement | null;

    if (!input || !sendBtn) return;

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });

    // Prevent page events from stealing focus
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('keydown', e => {
      e.stopPropagation(); // don't let page intercept keys
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) this.send(text);
      }
    });

    sendBtn.addEventListener('click', e => {
      e.stopPropagation();
      const text = input.value.trim();
      if (text) this.send(text);
    });
    sendBtn.addEventListener('mousedown', e => e.stopPropagation());
  }

  private scrollMessages() {
    requestAnimationFrame(() => {
      const msgs = this.shadowRoot.getElementById('messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    });
  }

  private renderFileDiff(d: FileDiff): string {
    const lines = d.diff.split('\n').map(l => {
      const esc = this.escHtml(l);
      if (l.startsWith('+')) return `<span class="add">${esc}</span>`;
      if (l.startsWith('-')) return `<span class="remove">${esc}</span>`;
      if (l.startsWith('@@')) return `<span class="meta">${esc}</span>`;
      return esc;
    }).join('\n');
    return `
      <div class="diff-file-name">${this.escHtml(d.filePath)}</div>
      <div class="diff-code">${lines}</div>
    `;
  }

  private escHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private addMessage(role: 'user' | 'assistant', content: string) {
    this.conversation.push({ id: crypto.randomUUID(), role, content, timestamp: new Date().toISOString() });
  }

  private send(text: string) {
    this.addMessage('user', text);
    this.stage = 'understanding';
    this.pendingResponse = null;
    this.requestId = crypto.randomUUID();
    this.render();

    const request: ReviewRequest = {
      requestId: this.requestId,
      element: this.element,
      pageContext: this.pageContext,
      conversation: [...this.conversation],
      userMessage: text,
      timeline: [],
      sentAt: new Date().toISOString(),
    };
    chrome.runtime.sendMessage({ type: 'SEND_REVIEW_REQUEST', request });
  }

  private approve() {
    if (!this.requestId) return;
    chrome.runtime.sendMessage({ type: 'APPROVE_CHANGES', requestId: this.requestId });
    this.stage = 'applying';
    this.render();
    setTimeout(() => {
      this.stage = 'completed';
      this.addMessage('assistant', 'âœ… Changes applied! Refreshingâ€¦');
      this.render();
      setTimeout(() => location.reload(), 1500);
    }, 1500);
  }

  private reject() {
    if (!this.requestId) return;
    chrome.runtime.sendMessage({ type: 'REJECT_CHANGES', requestId: this.requestId });
    this.stage = 'idle';
    this.pendingResponse = null;
    this.addMessage('assistant', 'Rejected. Describe a different change below.');
    this.render();
    requestAnimationFrame(() => this.focusInput());
  }

  handleResponse(response: ReviewResponse) {
    if (response.requestId !== this.requestId) return;
    this.stage = response.stage;
    if (response.stage === 'waiting_approval') {
      this.pendingResponse = response;
      if (response.summary) this.addMessage('assistant', response.summary);
    } else if (response.stage === 'error') {
      this.addMessage('assistant', `Error: ${response.error ?? 'Unknown error'}`);
      this.stage = 'idle';
    } else if (response.stage === 'completed') {
      const files = response.filesModified?.length
        ? `\n\nModified files:\n${response.filesModified.map(file => `- ${file}`).join('\n')}`
        : '';
      this.addMessage('assistant', `${response.summary ?? 'Done!'}${files}\n\nRefreshing page so you can see the change live...`);
      setTimeout(() => location.reload(), 1200);
    }
    this.render();
    if (this.stage === 'idle') requestAnimationFrame(() => this.focusInput());
  }

  destroy() {
    this.root.remove();
  }
}
