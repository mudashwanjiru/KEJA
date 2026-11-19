import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createPesapalSubscriptionOrder } from '@/lib/pesapal'
import { SUBSCRIPTION_PRICE_KES } from '@/lib/subscription'

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
}

function isUncertainPaymentError(error: unknown): boolean {
  return error instanceof TypeError
    || (error instanceof Error && /abort|timeout|network/i.test(`${error.name} ${error.message}`))
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
  const email = typeof input === 'object'
    && input !== null
    && 'email' in input
    && typeof input.email === 'string'
    ? input.email.trim().toLowerCase()
    : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: 'Enter a valid email address for the secure checkout.' }, { status: 400 })
  }

  if (
    !process.env.PESAPAL_CONSUMER_KEY
    || !process.env.PESAPAL_CONSUMER_SECRET
    || !process.env.PESAPAL_IPN_TOKEN
    || !process.env.APP_BASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return Response.json({ error: 'Card and bank checkout is not configured on the server yet.' }, { status: 503 })
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
      .from('pesapal_subscription_payments')
      .select('request_id,checkout_url')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()
    if (pendingError) throw pendingError
    if (pendingPayment?.checkout_url) {
      return Response.json({
        paymentId: pendingPayment.request_id,
        checkoutUrl: pendingPayment.checkout_url,
        message: 'Continue your existing secure checkout.',
      })
    }
    if (pendingPayment) {
      return Response.json({
        paymentId: pendingPayment.request_id,
        error: 'A checkout is already being prepared. Check your payment status before retrying.',
      }, { status: 409 })
    }

    const recentPaymentsSince = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: rateLimitError } = await admin
      .from('pesapal_subscription_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', recentPaymentsSince)
    if (rateLimitError) throw rateLimitError
    if (count !== null && count >= 5) {
      return Response.json({ error: 'Payment attempt limit reached. Try again in an hour.' }, { status: 429 })
    }

    const requestId = crypto.randomUUID()
    const { error: insertError } = await admin.from('pesapal_subscription_payments').insert({
      request_id: requestId,
      user_id: userId,
      amount_kes: SUBSCRIPTION_PRICE_KES,
      currency: 'KES',
      merchant_reference: requestId,
    })
    if (insertError?.code === '23505') {
      return Response.json({ error: 'A payment request is already in progress. Check its status before trying again.' }, { status: 409 })
    }
    if (insertError) throw insertError

    try {
      const { orderTrackingId, redirectUrl } = await createPesapalSubscriptionOrder({
        requestId,
        email,
        displayName: typeof authData.user.user_metadata?.full_name === 'string'
          ? authData.user.user_metadata.full_name
          : 'MTAA Member',
      })
      const { error: updateError } = await admin.from('pesapal_subscription_payments')
        .update({ order_tracking_id: orderTrackingId, checkout_url: redirectUrl })
        .eq('request_id', requestId)
      if (updateError) {
        console.error('Pesapal created a checkout, but its tracking details could not be saved:', updateError)
        return Response.json({
          paymentId: requestId,
          checkoutUrl: redirectUrl,
          error: 'Checkout was created but could not be fully saved. Complete it only once, then return here to verify.',
        }, { status: 503 })
      }

      return Response.json({
        paymentId: requestId,
        checkoutUrl: redirectUrl,
        message: 'Continue to Pesapal to choose an available card or bank payment method.',
      })
    } catch (error) {
      if (!isUncertainPaymentError(error)) {
        const { error: updateError } = await admin.from('pesapal_subscription_payments')
          .update({ status: 'failed' })
          .eq('request_id', requestId)
        if (updateError) console.error('Could not mark failed Pesapal subscription payment:', updateError)
      }
      console.error('Could not initiate Pesapal subscription checkout:', error)
      return Response.json({
        paymentId: requestId,
        error: isUncertainPaymentError(error)
          ? 'We could not confirm whether Pesapal created checkout. Check payment status before retrying.'
          : 'Pesapal could not start checkout. Try again later.',
      }, { status: 502 })
    }
  } catch (error) {
    console.error('Could not create Pesapal subscription payment:', error)
    return Response.json({ error: 'Could not start secure checkout.' }, { status: 500 })
  }
}
