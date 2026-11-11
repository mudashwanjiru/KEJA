import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { initiateStkPush, normalizeKenyanPhone } from '@/lib/mpesa'
import { SUBSCRIPTION_PRICE_KES } from '@/lib/subscription'

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
}

export async function POST(request: Request) {
  const token = getBearerToken(request)
  if (!token) return Response.json({ error: 'Sign in to subscribe.' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json() as unknown
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const phoneNumber = typeof input === 'object'
    && input !== null
    && 'phoneNumber' in input
    && typeof input.phoneNumber === 'string'
    ? normalizeKenyanPhone(input.phoneNumber)
    : null
  if (!phoneNumber) {
    return Response.json({ error: 'Enter a valid Kenyan M-Pesa phone number.' }, { status: 400 })
  }

  if (
    !process.env.MPESA_CONSUMER_KEY
    || !process.env.MPESA_CONSUMER_SECRET
    || !process.env.MPESA_SHORTCODE
    || !process.env.MPESA_PASSKEY
    || !process.env.MPESA_CALLBACK_TOKEN
    || !process.env.APP_BASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return Response.json({ error: 'Subscription payments are not configured on the server yet.' }, { status: 503 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) {
      return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
    }

    const userId = authData.user.id
    const { data: currentSubscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .select('active_until')
      .eq('user_id', userId)
      .maybeSingle()

    if (subscriptionError) throw subscriptionError
    if (currentSubscription && new Date(currentSubscription.active_until).getTime() > Date.now()) {
      return Response.json({ error: 'Your subscription is already active.' }, { status: 409 })
    }

    const { data: pendingPayment, error: pendingError } = await admin
      .from('mpesa_payments')
      .select('request_id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingError) throw pendingError
    if (pendingPayment) {
      return Response.json({
        error: 'A payment request is already pending. Wait for its result before retrying.',
        paymentId: pendingPayment.request_id,
      }, { status: 409 })
    }

    const recentPaymentsSince = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentPaymentCount, error: rateLimitError } = await admin
      .from('mpesa_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', recentPaymentsSince)

    if (rateLimitError) throw rateLimitError
    if (recentPaymentCount !== null && recentPaymentCount >= 5) {
      return Response.json({ error: 'Payment attempt limit reached. Try again in an hour.' }, { status: 429 })
    }

    const requestId = crypto.randomUUID()
    const { error: insertError } = await admin.from('mpesa_payments').insert({
      request_id: requestId,
      user_id: userId,
      phone_number: phoneNumber,
      amount_kes: SUBSCRIPTION_PRICE_KES,
    })

    if (insertError?.code === '23505') {
      return Response.json({ error: 'A payment request is already in progress. Check its status before trying again.' }, { status: 409 })
    }
    if (insertError) throw insertError

    let stkAccepted = false
    try {
      const stk = await initiateStkPush(phoneNumber, SUBSCRIPTION_PRICE_KES)
      stkAccepted = true
      const { error: updateError } = await admin
        .from('mpesa_payments')
        .update({
          merchant_request_id: stk.MerchantRequestID,
          checkout_request_id: stk.CheckoutRequestID,
        })
        .eq('request_id', requestId)

      if (updateError) {
        console.error('M-Pesa accepted a prompt but its checkout ID could not be saved:', updateError)
        return Response.json({
          paymentId: requestId,
          error: 'M-Pesa may have sent a prompt. Check your phone and do not start another payment yet.',
        }, { status: 503 })
      }

      return Response.json({
        paymentId: requestId,
        message: stk.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
      })
    } catch (error) {
      const isUncertain = error instanceof TypeError
        || (error instanceof Error && /abort|timeout|network/i.test(`${error.name} ${error.message}`))
      if (!isUncertain && !stkAccepted) {
        await admin.from('mpesa_payments').update({ status: 'failed' }).eq('request_id', requestId)
      }
      console.error('M-Pesa initiation failed:', error)
      return Response.json(
        { paymentId: requestId, error: isUncertain
          ? 'We could not confirm whether M-Pesa received the request. Check your phone before trying again.'
          : 'M-Pesa could not start the payment. Try again later.' },
        { status: 502 },
      )
    }
  } catch (error) {
    console.error('Could not create M-Pesa payment:', error)
    return Response.json({ error: 'Could not start the subscription payment.' }, { status: 500 })
  }
}