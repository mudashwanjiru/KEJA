import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { TwilioApiError, twilioVerifyRequest } from '@/lib/twilio'

const KENYAN_MOBILE_E164 = /^\+254[17]\d{8}$/

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return Response.json({ error: 'Sign in to verify your phone number.' }, { status: 401 })
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!serviceSid || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return Response.json({ error: 'MTAA phone verification is not configured on the server.' }, { status: 503 })
  }

  let input: unknown
  try {
    input = await request.json() as unknown
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const body = typeof input === 'object' && input !== null
    ? input as { phone?: unknown; code?: unknown }
    : {}
  const phone = typeof body.phone === 'string' ? body.phone : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!KENYAN_MOBILE_E164.test(phone) || !/^\d{4,10}$/.test(code)) {
    return Response.json({ error: 'Enter the same Kenyan mobile number and the verification code.' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })

    const result = await twilioVerifyRequest(serviceSid, 'VerificationCheck', new URLSearchParams({
      To: phone,
      Code: code,
    }))
    if (result.status !== 'approved') {
      return Response.json({ error: 'The code was not accepted. Check it and try again.' }, { status: 400 })
    }

    const { error } = await admin.from('keja_notification_preferences').upsert({
      user_id: authData.user.id,
      phone_e164: phone,
      phone_verified_at: new Date().toISOString(),
      sms_enabled: false,
      whatsapp_enabled: false,
      consent_at: null,
      consent_version: null,
    }, { onConflict: 'user_id' })
    if (error) throw error
    return Response.json({ message: 'Phone number verified. Choose which MTAA alerts to receive.' })
  } catch (error) {
    if (error instanceof TwilioApiError) {
      console.error('Twilio phone verification check failed:', error.status, error.code)
      return Response.json({ error: 'Could not verify the code. Request a new code if it has expired.' }, { status: error.status === 429 ? 429 : 502 })
    }
    console.error('Could not complete MTAA phone verification:', error)
    return Response.json({ error: 'Could not verify the phone number right now.' }, { status: 500 })
  }
}
