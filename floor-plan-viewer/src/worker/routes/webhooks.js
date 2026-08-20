import { Hono } from 'hono'

export const webhooksRoute = new Hono()

/**
 * Verify Razorpay webhook signature.
 * Returns null if valid, or an error string if invalid.
 * Fail-closed: any failure here returns 400 so Razorpay does NOT retry.
 */
async function verifyRazorpaySignature(bodyText, signatureHeader, secret) {
  if (!signatureHeader) return 'Missing x-razorpay-signature header'
  if (!secret) return 'RAZORPAY_WEBHOOK_SECRET not configured'

  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const msgData = encoder.encode(bodyText)

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (computedHex !== signatureHeader) return 'Signature mismatch'
  return null
}

webhooksRoute.post('/razorpay', async (c) => {
  const env = c.env

  // --- Step 1: Read raw body text for signature verification ---
  // Must read as text before parsing JSON so we sign the exact bytes Razorpay sent.
  const bodyText = await c.req.text()

  // --- Step 2: Fail-closed signature check → 400, NOT 500 ---
  // 400 tells Razorpay this payload will never succeed; stops retry storm.
  const signatureHeader = c.req.header('x-razorpay-signature')
  const sigError = await verifyRazorpaySignature(bodyText, signatureHeader, env.RAZORPAY_WEBHOOK_SECRET)
  if (sigError) {
    console.warn('[webhook] Signature rejected:', sigError)
    return c.json({ error: sigError }, 400)
  }

  // --- Step 3: Parse and validate payload ---
  let body
  try {
    body = JSON.parse(bodyText)
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }

  const eventType = body.event
  if (eventType !== 'payment.captured' && eventType !== 'order.paid') {
    return c.json({ status: 'ignored' }, 200)
  }

  const projectId = body.payload?.payment?.entity?.notes?.project_id
  if (!projectId) {
    // Validation failure — 400 so Razorpay does not keep retrying a bad payload
    return c.json({ error: 'No project_id in payment notes' }, 400)
  }

  // --- Step 4: DB config check ---
  const sbUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '')
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!sbUrl || !sbKey) {
    // Missing env var — misconfiguration, 500 so ops team gets paged and Razorpay retries
    console.error('[webhook] Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL')
    return c.json({ error: 'DB config missing' }, 500)
  }

  const headers = {
    'apikey': sbKey,
    'Authorization': `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }

  // --- Step 5: Atomic idempotent write ---
  // Guard `status=neq.won` is part of the WHERE clause on the PATCH itself.
  // If two simultaneous webhooks both get here, only one will match the row
  // (Postgres UPDATE is row-level locked). The second gets 0 rows back → already_processed.
  // This eliminates the "check then write" TOCTOU race entirely.
  try {
    const patchRes = await fetch(
      `${sbUrl}/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&status=neq.won`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'won', updated_at: new Date().toISOString() })
      }
    )

    if (!patchRes.ok) {
      const errText = await patchRes.text()
      throw new Error(`Supabase PATCH ${patchRes.status}: ${errText.slice(0, 200)}`)
    }

    const updated = await patchRes.json()

    if (!Array.isArray(updated) || updated.length === 0) {
      // Row didn't match — already 'won' from a previous delivery
      return c.json({ status: 'already_processed' }, 200)
    }

    console.info(`[webhook] Project ${projectId} marked as won`)
    return c.json({ status: 'success' }, 200)

  } catch (err) {
    // Only genuine DB/network errors reach here — Razorpay retries are appropriate
    console.error('[webhook] DB write failed, will retry:', err.message)
    return c.json({ error: 'DB write failed, retry later' }, 500)
  }
})
