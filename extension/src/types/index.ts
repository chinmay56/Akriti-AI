// â”€â”€â”€ Element & DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SelectedElement {
  tag: string;
  id: string;
  className: string;
  selector: string;
  xpath: string;
  domPath: string[];          // ancestor tag/selector chain
  text: string;
  attributes: Record<string, string>;
  boundingRect: BoundingRect;
  mouseX: number;
  mouseY: number;
  parentInfo: { tag: string; selector: string; text: string } | null;
  children: { tag: string; selector: string; text: string }[];
  nearbyElements: { tag: string; selector: string; text: string; direction: string }[];
  screenshotCrop: string | null;  // base64 PNG of cropped element area
  fullPageScreenshot: string | null;
  capturedAt: string;
  url: string;
}

export interface DomSnapshot {
  url: string;
  title: string;
  visibleText: string;
  headings: string[];
  buttons: string[];
  inputs: string[];
  links: string[];
  timestamp: string;
}

export interface PageContext {
  url: string;
  title: string;
  route: string;
  viewport: { width: number; height: number };
  scrollPosition: { x: number; y: number };
  dom: DomSnapshot | null;
  timestamp: string;
}

// â”€â”€â”€ Chat & Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ReviewRequest {
  requestId: string;
  element: SelectedElement;
  pageContext: PageContext;
  conversation: ChatMessage[];
  userMessage: string;
  timeline: TimelineItem[];
  sentAt: string;
}

export type PipelineStage =
  | 'idle'
  | 'understanding'
  | 'locating'
  | 'generating'
  | 'preparing_diff'
  | 'waiting_approval'
  | 'applying'
  | 'completed'
  | 'error';

export interface FileDiff {
  filePath: string;
  diff: string;           // unified diff string
  language: string;
}

export interface ReviewResponse {
  requestId: string;
  stage: PipelineStage;
  summary?: string;
  filesModified?: string[];
  diffs?: FileDiff[];
  previewUrl?: string;
  error?: string;
}

// â”€â”€â”€ Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type TimelineAction =
  | 'page_opened'
  | 'element_selected'
  | 'chat_started'
  | 'request_sent'
  | 'backend_response'
  | 'approved'
  | 'rejected'
  | 'changes_applied';

export interface TimelineItem {
  id: string;
  action: TimelineAction;
  summary: string;
  url: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// â”€â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ExtensionSettings {
  backendUrl: string;
  backendAuthToken: string;
  reviewModeEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  backendUrl: 'http://127.0.0.1:8010/review',
  backendAuthToken: '',
  reviewModeEnabled: false,
};

// â”€â”€â”€ Extension State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ExtensionState {
  settings: ExtensionSettings;
  pageContext: PageContext | null;
  timeline: TimelineItem[];
}

// â”€â”€â”€ Runtime Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type RuntimeMessage =
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; state: ExtensionState }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'TOGGLE_REVIEW_MODE'; enabled: boolean }
  | { type: 'ELEMENT_SELECTED'; element: SelectedElement }
  | { type: 'PAGE_CONTEXT_UPDATE'; context: PageContext }
  | { type: 'SEND_REVIEW_REQUEST'; request: ReviewRequest }
  | { type: 'REVIEW_RESPONSE'; response: ReviewResponse }
  | { type: 'APPROVE_CHANGES'; requestId: string }
  | { type: 'REJECT_CHANGES'; requestId: string }
  | { type: 'TIMELINE_ADD'; item: TimelineItem }
  | { type: 'ADD_TIMELINE_ITEM'; item: TimelineItem };
