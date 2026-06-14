import type { PageContext, ReviewRequest, SelectedElement, TimelineItem } from '../types';

export function buildReviewRequest(
  element: SelectedElement,
  pageContext: PageContext,
  userMessage: string,
  conversation: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string }[],
  timeline: TimelineItem[]
): ReviewRequest {
  return {
    requestId: crypto.randomUUID(),
    element,
    pageContext,
    conversation,
    userMessage,
    timeline: timeline.slice(-10),
    sentAt: new Date().toISOString(),
  };
}
