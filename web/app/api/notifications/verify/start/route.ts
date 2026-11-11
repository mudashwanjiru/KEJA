import { createClient } from '@supabase/supabase-js'
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
  const phone = typeof input === 'object' && input !== null
    ? (input as { phone?: unknown }).phone
    : null
  if (typeof phone !== 'string' || !KENYAN_MOBILE_E164.test(phone)) {
    return Response.json({ error: 'Enter a Kenyan mobile number in international format, such as +254712345678.' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) return Response.json({ error: 'Phone verification is not configured on the server.' }, { status: 503 })
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: allowed, error: limitError } = await userClient.rpc('consume_keja_phone_verification_request')
    if (limitError) throw limitError
    if (!allowed) return Response.json({ error: 'Verification limit reached. Try again in an hour.' }, { status: 429 })

    const form = new URLSearchParams({ To: phone, Channel: 'sms' })
    await twilioVerifyRequest(serviceSid, 'Verifications', form)
    return Response.json({ message: 'A verification code was sent if this number can receive SMS.' })
  } catch (error) {
    if (error instanceof TwilioApiError) {
      console.error('Twilio phone verification start failed:', error.status, error.code)
      return Response.json({ error: 'Could not send a verification code. Check the number and try again later.' }, { status: error.status === 429 ? 429 : 502 })
    }
    console.error('Could not start MTAA phone verification:', error)
    return Response.json({ error: 'Could not start phone verification right now.' }, { status: 500 })
  }
}
