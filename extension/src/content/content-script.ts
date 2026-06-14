import type {
  BoundingRect,
  DomSnapshot,
  PageContext,
  ReviewResponse,
  RuntimeMessage,
  SelectedElement,
} from '../types';
import { ChatPanel } from './chat-panel';

// ─── State ────────────────────────────────────────────────────────────────────

let reviewMode = false;
let hoveredEl: Element | null = null;
let selectedEl: Element | null = null;
let labelEl: HTMLDivElement | null = null;
let chatPanel: ChatPanel | null = null;

// ─── Sensitive field guard ─────────────────────────────────────────────────────

const SENSITIVE_TYPES = new Set(['password', 'hidden', 'credit-card']);

function isSensitive(el: Element): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  return SENSITIVE_TYPES.has(el.type) || el.autocomplete?.includes('cc');
}

// ─── DOM Utilities ────────────────────────────────────────────────────────────

function getSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    let seg = cur.tagName.toLowerCase();
    if (cur.id) { seg = `#${CSS.escape(cur.id)}`; parts.unshift(seg); break; }
    const siblings = Array.from(cur.parentElement?.children ?? []).filter(c => c.tagName === cur!.tagName);
    if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    parts.unshift(seg);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function getXPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    const tag = cur.tagName.toLowerCase();
    const siblings = Array.from(cur.parentNode?.childNodes ?? []).filter(
      n => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === cur!.tagName
    );
    const idx = siblings.length > 1 ? `[${siblings.indexOf(cur) + 1}]` : '';
    parts.unshift(`${tag}${idx}`);
    cur = cur.parentElement;
  }
  return '/' + parts.join('/');
}

function getDomPath(el: Element): string[] {
  const path: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    path.unshift(cur.id ? `${cur.tagName.toLowerCase()}#${cur.id}` : cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return path;
}

function getBoundingRect(el: Element): BoundingRect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
}

function getAttributes(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (!['style'].includes(a.name)) attrs[a.name] = a.value;
  }
  return attrs;
}

function getNearby(el: Element): { tag: string; selector: string; text: string; direction: string }[] {
  const parent = el.parentElement;
  if (!parent) return [];
  const siblings = Array.from(parent.children).filter(c => c !== el);
  const idx = Array.from(parent.children).indexOf(el);
  return siblings.slice(0, 4).map((s, i) => ({
    tag: s.tagName.toLowerCase(),
    selector: getSelector(s),
    text: (s.textContent ?? '').trim().slice(0, 50),
    direction: Array.from(parent.children).indexOf(s) < idx ? 'before' : 'after',
  }));
}

// ─── Screenshot crop (via background) ────────────────────────────────────────

async function captureScreenshot(): Promise<string | null> {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' } as any, (res: any) => {
      resolve(res?.dataUrl ?? null);
    });
  });
}

function cropToElement(dataUrl: string, rect: BoundingRect, devicePixelRatio: number): string {
  const canvas = document.createElement('canvas');
  const scale = devicePixelRatio || 1;
  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  const img = new Image();
  img.src = dataUrl;
  ctx.drawImage(img, rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

// ─── Page Context ─────────────────────────────────────────────────────────────

function buildDomSnapshot(): DomSnapshot {
  const safe = (sel: string) => Array.from(document.querySelectorAll(sel))
    .filter(e => !isSensitive(e))
    .map(e => (e.textContent ?? '').trim())
    .filter(Boolean)
    .slice(0, 30);

  return {
    url: location.href,
    title: document.title,
    visibleText: document.body.innerText.slice(0, 2000),
    headings: safe('h1,h2,h3,h4'),
    buttons: safe('button,[role="button"]'),
    inputs: Array.from(document.querySelectorAll('input,textarea,select'))
      .filter(e => !isSensitive(e))
      .map(e => (e as HTMLElement).getAttribute('placeholder') || (e as HTMLElement).getAttribute('aria-label') || (e as HTMLInputElement).name || e.tagName.toLowerCase())
      .slice(0, 20),
    links: safe('a[href]'),
    timestamp: new Date().toISOString(),
  };
}

function buildPageContext(): PageContext {
  return {
    url: location.href,
    title: document.title,
    route: location.pathname + location.search,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollPosition: { x: window.scrollX, y: window.scrollY },
    dom: buildDomSnapshot(),
    timestamp: new Date().toISOString(),
  };
}

// ─── Element capture ──────────────────────────────────────────────────────────

async function captureElement(el: Element, mouseX: number, mouseY: number): Promise<SelectedElement> {
  const rect = getBoundingRect(el);
  const fullScreenshot = await captureScreenshot();
  const dpr = window.devicePixelRatio || 1;
  const crop = fullScreenshot ? cropToElement(fullScreenshot, rect, dpr) : null;

  const parentEl = el.parentElement;
  const childEls = Array.from(el.children).slice(0, 5);

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id,
    className: el.className,
    selector: getSelector(el),
    xpath: getXPath(el),
    domPath: getDomPath(el),
    text: (el.textContent ?? '').trim().slice(0, 200),
    attributes: getAttributes(el),
    boundingRect: rect,
    mouseX,
    mouseY,
    parentInfo: parentEl ? {
      tag: parentEl.tagName.toLowerCase(),
      selector: getSelector(parentEl),
      text: (parentEl.textContent ?? '').trim().slice(0, 100),
    } : null,
    children: childEls.map(c => ({
      tag: c.tagName.toLowerCase(),
      selector: getSelector(c),
      text: (c.textContent ?? '').trim().slice(0, 80),
    })),
    nearbyElements: getNearby(el),
    screenshotCrop: crop,
    fullPageScreenshot: fullScreenshot,
    capturedAt: new Date().toISOString(),
    url: location.href,
  };
}

// ─── Label tooltip ────────────────────────────────────────────────────────────

function showLabel(el: Element) {
  if (!labelEl) {
    labelEl = document.createElement('div');
    labelEl.className = 'aivr-label';
    document.body.appendChild(labelEl);
  }
  const rect = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  labelEl.textContent = `<${tag}${id}>`;
  labelEl.style.top = `${Math.max(0, rect.top - 22)}px`;
  labelEl.style.left = `${rect.left}px`;
  labelEl.style.display = 'block';
}

function hideLabel() {
  if (labelEl) labelEl.style.display = 'none';
}

// ─── Event handlers ───────────────────────────────────────────────────────────

const IGNORE_TAGS = new Set(['html', 'body', 'head', 'script', 'style', 'meta', 'link']);

function onMouseOver(e: MouseEvent) {
  if (!reviewMode) return;
  const el = e.target as Element;
  if (!el || IGNORE_TAGS.has(el.tagName.toLowerCase())) return;
  if (el === hoveredEl) return;
  if (hoveredEl && hoveredEl !== selectedEl) hoveredEl.classList.remove('aivr-highlight');
  hoveredEl = el;
  if (el !== selectedEl) el.classList.add('aivr-highlight');
  showLabel(el);
  e.stopPropagation();
}

function onMouseOut(e: MouseEvent) {
  if (!reviewMode) return;
  const el = e.target as Element;
  if (el && el !== selectedEl) el.classList.remove('aivr-highlight');
  hideLabel();
}

async function onClick(e: MouseEvent) {
  if (!reviewMode) return;
  const el = e.target as Element;
  if (!el || IGNORE_TAGS.has(el.tagName.toLowerCase())) return;
  if (isSensitive(el)) return;

  e.preventDefault();
  e.stopPropagation();

  // Deselect previous
  if (selectedEl) {
    selectedEl.classList.remove('aivr-selected', 'aivr-highlight');
  }
  selectedEl = el;
  el.classList.remove('aivr-highlight');
  el.classList.add('aivr-selected');

  const captured = await captureElement(el, e.clientX, e.clientY);

  // Notify background
  chrome.runtime.sendMessage({ type: 'ELEMENT_SELECTED', element: captured } satisfies RuntimeMessage);

  // Open chat panel
  chatPanel?.destroy();
  chatPanel = new ChatPanel(captured, buildPageContext());
  window.dispatchEvent(new CustomEvent('aivr:element-selected', { detail: captured }));
}

// ─── Review mode toggle ───────────────────────────────────────────────────────

function enableReviewMode() {
  reviewMode = true;
  document.documentElement.style.cursor = 'crosshair';
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
}

function disableReviewMode() {
  reviewMode = false;
  document.documentElement.style.cursor = '';
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
  document.querySelectorAll('.aivr-highlight,.aivr-selected').forEach(el => {
    el.classList.remove('aivr-highlight', 'aivr-selected');
  });
  hideLabel();
  chatPanel?.destroy();
  chatPanel = null;
  selectedEl = null;
  hoveredEl = null;
}

// ─── Continuous page context updates ─────────────────────────────────────────

let contextTimer: ReturnType<typeof setInterval> | null = null;

function startContextUpdates() {
  if (contextTimer) return;
  contextTimer = setInterval(() => {
    const ctx = buildPageContext();
    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT_UPDATE', context: ctx } satisfies RuntimeMessage);
  }, 3000);
}

startContextUpdates();

// ─── Background message listener ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
  if (msg.type === 'TOGGLE_REVIEW_MODE') {
    msg.enabled ? enableReviewMode() : disableReviewMode();
  } else if (msg.type === 'REVIEW_RESPONSE') {
    chatPanel?.handleResponse(msg.response as ReviewResponse);
  }
});
