import type { ReviewRequest, ReviewResponse } from '../types';

export async function sendReviewRequest(
  backendUrl: string,
  authToken: string,
  request: ReviewRequest
): Promise<ReviewResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(backendUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!res.ok) throw new Error(`Backend ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ReviewResponse>;
}

export async function applyChanges(
  backendUrl: string,
  authToken: string,
  requestId: string
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  await fetch(`${backendUrl}/apply`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requestId }),
  });
}
