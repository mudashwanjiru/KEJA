import { timingSafeEqual } from 'node:crypto'
import { refreshPesapalSubscriptionPayment } from '@/lib/pesapalSubscription'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

function validCallbackToken(provided: string | null): boolean {
  const expected = process.env.PESAPAL_IPN_TOKEN
  if (!provided || !expected) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!validCallbackToken(url.searchParams.get('token'))) {
    return Response.json({ status: 401, message: 'Unauthorized notification.' }, { status: 401 })
  }

  const orderTrackingId = url.searchParams.get('OrderTrackingId')
  const merchantReference = url.searchParams.get('OrderMerchantReference')
  if (!orderTrackingId || !merchantReference) {
    return Response.json({ status: 400, message: 'Missing Pesapal transaction identifiers.' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: payment, error } = await admin.from('pesapal_subscription_payments')
      .select('request_id,user_id,order_tracking_id,amount_kes,currency,status')
      .eq('merchant_reference', merchantReference)
      .maybeSingle()
    if (error) throw error
    if (!payment) return Response.json({ status: 404, message: 'Payment reference not found.' }, { status: 404 })
    if (payment.order_tracking_id && payment.order_tracking_id !== orderTrackingId) {
      return Response.json({ status: 409, message: 'Payment tracking ID does not match.' }, { status: 409 })
    }

    if (!payment.order_tracking_id) {
      const { error: updateError } = await admin.from('pesapal_subscription_payments')
        .update({ order_tracking_id: orderTrackingId })
        .eq('request_id', payment.request_id)
        .is('order_tracking_id', null)
      if (updateError) throw updateError
    }

    await refreshPesapalSubscriptionPayment(admin, payment, orderTrackingId)
    return Response.json({
      orderNotificationType: url.searchParams.get('OrderNotificationType') ?? 'IPNCHANGE',
      orderTrackingId,
      orderMerchantReference: merchantReference,
      status: 200,
    })
  } catch (error) {
    console.error('Could not process Pesapal subscription notification:', error)
    return Response.json({ status: 500, message: 'Could not verify notification.' }, { status: 500 })
  }
}
