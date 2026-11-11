import { timingSafeEqual } from 'node:crypto'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { TwilioApiError, twilioRequest } from '@/lib/twilio'

export const maxDuration = 60

interface Delivery {
  id: string
  user_id: string
  channel: 'sms' | 'whatsapp'
  body: string
  attempt_count: number
}

interface NotificationPreferences {
  phone_e164: string | null
  phone_verified_at: string | null
  sms_enabled: boolean
  whatsapp_enabled: boolean
}

function validCronSecret(provided: string | null) {
  const expected = process.env.KEJA_NOTIFICATION_CRON_SECRET
  if (!provided || !expected) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
}

function getErrorCode(error: unknown) {
  if (error instanceof TwilioApiError) return error.code ?? `twilio_http_${error.status}`
  return 'temporary_delivery_error'
}

function isRetryable(error: unknown) {
  if (error instanceof TwilioApiError) return error.status === 429 || error.status >= 500
  return !(error instanceof Error && /invalid|not configured/i.test(error.message))
}

export async function POST(request: Request) {
  if (!validCronSecret(request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const smsFrom = process.env.TWILIO_SMS_FROM
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM
  const whatsappContentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID
  if (!accountSid || !authToken || !smsFrom || !whatsappFrom || !whatsappContentSid
    || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'MTAA notification delivery is not fully configured.' }, { status: 503 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: deliveries, error: claimError } = await admin.rpc('claim_keja_notification_deliveries', { p_limit: 10 })
    if (claimError) throw claimError
    const batch = (deliveries ?? []) as Delivery[]
    let sent = 0
    let failed = 0
    let retried = 0

    for (const delivery of batch) {
      try {
        const { data: preferences, error: preferenceError } = await admin
          .from('keja_notification_preferences')
          .select('phone_e164,phone_verified_at,sms_enabled,whatsapp_enabled')
          .eq('user_id', delivery.user_id)
          .maybeSingle()
        if (preferenceError) throw preferenceError
        const settings = preferences as NotificationPreferences | null
        const channelEnabled = delivery.channel === 'sms' ? settings?.sms_enabled : settings?.whatsapp_enabled
        if (!settings?.phone_verified_at || !settings.phone_e164 || !channelEnabled) {
          const { error } = await admin.from('keja_notification_deliveries')
            .update({ status: 'failed', last_error_code: 'consent_or_verified_phone_missing', claimed_at: null })
            .eq('id', delivery.id)
          if (error) throw error
          failed += 1
          continue
        }

        const message = delivery.body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, 900)
        const form = new URLSearchParams({
          To: delivery.channel === 'whatsapp' ? `whatsapp:${settings.phone_e164}` : settings.phone_e164,
        })
        if (delivery.channel === 'whatsapp') {
          form.set('From', `whatsapp:${whatsappFrom.replace(/^whatsapp:/, '')}`)
          form.set('ContentSid', whatsappContentSid)
          form.set('ContentVariables', JSON.stringify({ '1': message || 'You have a new MTAA notification.' }))
        } else {
          form.set('From', smsFrom)
          form.set('Body', `MTAA: ${message || 'You have a new notification.'}`)
        }

        const result = await twilioRequest(`/Messages.json`, form)
        if (!result.sid) throw new Error('Twilio did not return a message identifier.')
        const { error: updateError } = await admin.from('keja_notification_deliveries')
          .update({
            status: 'sent',
            provider_message_id: result.sid,
            last_error_code: null,
            sent_at: new Date().toISOString(),
            claimed_at: null,
          })
          .eq('id', delivery.id)
        if (updateError) throw updateError
        sent += 1
      } catch (error) {
        const retryable = isRetryable(error) && delivery.attempt_count < 5
        const retryMinutes = Math.min(60, 2 ** Math.max(1, delivery.attempt_count))
        const { error: updateError } = await admin.from('keja_notification_deliveries')
          .update({
            status: retryable ? 'pending' : 'failed',
            next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
            last_error_code: getErrorCode(error),
            claimed_at: null,
          })
          .eq('id', delivery.id)
        if (updateError) {
          console.error('Could not update MTAA notification delivery status:', delivery.id, updateError)
        }
        if (error instanceof TwilioApiError) {
          console.error('Twilio MTAA notification delivery failed:', delivery.channel, error.status, error.code)
        } else {
          console.error('MTAA notification delivery failed:', delivery.channel, error)
        }
        if (retryable) retried += 1
        else failed += 1
      }
    }

    return Response.json({ claimed: batch.length, sent, retried, failed })
  } catch (error) {
    console.error('Could not dispatch MTAA notifications:', error)
    return Response.json({ error: 'Could not process MTAA notifications.' }, { status: 500 })
  }
}
