import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { initiateStkPush, normalizeKenyanPhone } from '@/lib/mpesa'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface OrderPaymentRequest {
  orderId?: unknown
  phoneNumber?: unknown
}

function isUncertainPaymentError(error: unknown): boolean {
  return error instanceof TypeError
    || (error instanceof Error && /abort|timeout|network/i.test(`${error.name} ${error.message}`))
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return Response.json({ error: 'Sign in to pay for your order.' }, { status: 401 })

  let input: unknown
  try {
    input = await request.json() as unknown
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const body = typeof input === 'object' && input !== null ? input as OrderPaymentRequest : {}
  if (typeof body.orderId !== 'string' || !UUID_PATTERN.test(body.orderId)) {
    return Response.json({ error: 'Choose a valid order.' }, { status: 400 })
  }
  const phoneNumber = typeof body.phoneNumber === 'string' ? normalizeKenyanPhone(body.phoneNumber) : null
  if (!phoneNumber) return Response.json({ error: 'Enter a valid Kenyan M-Pesa phone number.' }, { status: 400 })

  if (
    !process.env.MPESA_CONSUMER_KEY
    || !process.env.MPESA_CONSUMER_SECRET
    || !process.env.MPESA_SHORTCODE
    || !process.env.MPESA_PASSKEY
    || !process.env.MPESA_CALLBACK_TOKEN
    || !process.env.APP_BASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) return Response.json({ error: 'MTAA order payments are not configured on the server.' }, { status: 503 })

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })

    const { data: order, error: orderError } = await admin.from('keja_orders')
      .select('id,buyer_id,total_amount,payment_status,status')
      .eq('id', body.orderId)
      .eq('buyer_id', authData.user.id)
      .maybeSingle()
    if (orderError) throw orderError
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })
    if (order.payment_status === 'paid') return Response.json({ error: 'This order is already paid.' }, { status: 409 })

    const amount = Math.round(Number(order.total_amount))
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
      return Response.json({ error: 'This order total cannot be processed by M-Pesa.' }, { status: 400 })
    }

    const { data: pendingPayment, error: pendingError } = await admin.from('keja_order_mpesa_payments')
      .select('request_id')
      .eq('order_id', order.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (pendingError) throw pendingError
    if (pendingPayment) return Response.json({
      paymentId: pendingPayment.request_id,
      message: 'A payment request is already pending. Check your phone or wait for its result.',
    })

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin.from('keja_order_mpesa_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authData.user.id)
      .gte('created_at', since)
    if (countError) throw countError
    if (count !== null && count >= 5) return Response.json({ error: 'Payment attempt limit reached. Try again in an hour.' }, { status: 429 })

    const requestId = crypto.randomUUID()
    const { error: insertError } = await admin.from('keja_order_mpesa_payments').insert({
      request_id: requestId,
      order_id: order.id,
      user_id: authData.user.id,
      phone_number: phoneNumber,
      amount_kes: amount,
    })
    if (insertError?.code === '23505') return Response.json({ error: 'A payment request is already pending for this order.' }, { status: 409 })
    if (insertError) throw insertError

    const { error: reserveError } = await admin.rpc('reserve_keja_order_inventory', { p_order_id: order.id })
    if (reserveError) {
      const { error: paymentUpdateError } = await admin.from('keja_order_mpesa_payments')
        .update({ status: 'failed' })
        .eq('request_id', requestId)
      if (paymentUpdateError) console.error('Could not mark unavailable MTAA order payment:', paymentUpdateError)
      return Response.json({ error: reserveError.message || 'An item in this order is no longer available.' }, { status: 409 })
    }

    let stkAccepted = false
    try {
      const stk = await initiateStkPush(phoneNumber, amount, 'MTAA order', 'MTAA marketplace order')
      stkAccepted = true
      const [{ error: paymentUpdateError }, { error: orderUpdateError }] = await Promise.all([
        admin.from('keja_order_mpesa_payments').update({
          merchant_request_id: stk.MerchantRequestID,
          checkout_request_id: stk.CheckoutRequestID,
        }).eq('request_id', requestId),
        admin.from('keja_orders').update({ payment_status: 'pending' }).eq('id', order.id),
      ])
      if (paymentUpdateError || orderUpdateError) {
        console.error('M-Pesa accepted a MTAA order payment but the request could not be fully saved:', paymentUpdateError || orderUpdateError)
        return Response.json({ paymentId: requestId, error: 'M-Pesa may have sent a prompt. Check your phone before trying again.' }, { status: 503 })
      }
      return Response.json({
        paymentId: requestId,
        message: stk.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
      })
    } catch (error) {
      if (!isUncertainPaymentError(error) && !stkAccepted) {
        const [{ error: updateError }, { error: releaseError }] = await Promise.all([
          admin.from('keja_order_mpesa_payments').update({ status: 'failed' }).eq('request_id', requestId),
          admin.rpc('release_keja_order_inventory', { p_order_id: order.id }),
        ])
        if (updateError) console.error('Could not mark failed MTAA order payment:', updateError)
        if (releaseError) console.error('Could not release stock after failed MTAA payment:', releaseError)
      }
      console.error('Could not initiate MTAA order payment:', error)
      return Response.json({
        paymentId: requestId,
        error: isUncertainPaymentError(error)
          ? 'We could not confirm whether M-Pesa received the request. Check your phone before trying again.'
          : 'M-Pesa could not start this order payment.',
      }, { status: 502 })
    }
  } catch (error) {
    console.error('Could not create MTAA order payment:', error)
    return Response.json({ error: 'Could not start payment for this order.' }, { status: 500 })
  }
}
