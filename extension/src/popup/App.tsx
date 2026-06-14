'use client';
import { useEffect, useState } from 'react';
import type { ExtensionSettings, ExtensionState, TimelineItem } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const ACTION_LABELS: Record<string, string> = {
  page_opened: 'ðŸŒ',
  element_selected: 'ðŸ–±ï¸',
  chat_started: 'ðŸ’¬',
  request_sent: 'ðŸ“¤',
  backend_response: 'ðŸ“¥',
  approved: 'âœ…',
  rejected: 'âŒ',
  changes_applied: 'ðŸš€',
};

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state: ExtensionState | undefined) => {
      if (!state) return;
      setSettings(state.settings);
      setTimeline(state.timeline.slice().reverse());
    });
    const listener = (msg: any) => {
      if (msg.type === 'STATE_UPDATE') {
        setSettings(msg.state.settings);
        setTimeline(msg.state.timeline.slice().reverse());
      }
      if (msg.type === 'TIMELINE_ADD') {
        setTimeline((prev: TimelineItem[]) => [msg.item, ...prev].slice(0, 50));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  function toggleReviewMode() {
    const next = !settings.reviewModeEnabled;
    chrome.runtime.sendMessage({ type: 'TOGGLE_REVIEW_MODE', enabled: next });
    setSettings((s: ExtensionSettings) => ({ ...s, reviewModeEnabled: next }));
  }

  function saveSettings() {
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const on = settings.reviewModeEnabled;

  return (
    <div className="app">
      {/* Big status toggle */}
      <div className={`status-block ${on ? 'on' : 'off'}`}>
        <div className="status-icon">{on ? 'ðŸŸ¢' : 'âš«'}</div>
        <div className="status-text">
          <div className="status-label">AI Review Mode</div>
          <div className="status-value">{on ? 'ACTIVE â€” click any element' : 'OFF'}</div>
        </div>
        <button className={`toggle-btn ${on ? 'on' : 'off'}`} onClick={toggleReviewMode}>
          {on ? 'Turn Off' : 'Turn On'}
        </button>
      </div>

      {/* Instructions when ON */}
      {on && (
        <div className="tip">
          Hover to highlight Â· Click to select Â· Type to modify
        </div>
      )}

      {/* Settings toggle */}
      <div className="settings-toggle" onClick={() => setShowSettings(s => !s)}>
        âš™ Backend Settings {showSettings ? 'â–²' : 'â–¼'}
      </div>

      {showSettings && (
        <div className="section">
          <label className="field-label">Backend URL</label>
          <input
            className="field-input"
            value={settings.backendUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSettings((s: ExtensionSettings) => ({ ...s, backendUrl: e.target.value }))
            }
            placeholder="http://127.0.0.1:8010/review"
          />
          <label className="field-label">Auth Token</label>
          <input
            className="field-input"
            type="password"
            value={settings.backendAuthToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSettings((s: ExtensionSettings) => ({ ...s, backendAuthToken: e.target.value }))
            }
            placeholder="Bearer token (optional)"
          />
          <button className="save-btn" onClick={saveSettings}>
            {saved ? 'âœ“ Saved' : 'Save'}
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="section">
        <div className="section-title">Activity</div>
        <div className="timeline">
          {timeline.length === 0 && (
            <div className="empty">
              {on ? 'Click an element on the page to start.' : 'Turn on Review Mode to begin.'}
            </div>
          )}
          {timeline.map((item: TimelineItem) => (
            <div key={item.id} className="timeline-item">
              <span className="tl-icon">{ACTION_LABELS[item.action] ?? 'â€¢'}</span>
              <div className="tl-body">
                <div className="tl-summary">{item.summary}</div>
                <div className="tl-time">{new Date(item.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
