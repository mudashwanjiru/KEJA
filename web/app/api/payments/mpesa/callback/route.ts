import { timingSafeEqual } from 'node:crypto'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeKenyanPhone, queryStkPush } from '@/lib/mpesa'

interface CallbackItem {
  Name?: string
  Value?: string | number
}

interface MpesaCallback {
  Body?: {
    stkCallback?: {
      CheckoutRequestID?: string
      ResultCode?: string | number
      CallbackMetadata?: { Item?: CallbackItem[] }
    }
  }
}

function validCallbackToken(provided: string | null): boolean {
  const expected = process.env.MPESA_CALLBACK_TOKEN
  if (!provided || !expected) return false

  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer)
}

function metadataValue(items: CallbackItem[], name: string): string | number | null {
  return items.find((item) => item.Name === name)?.Value ?? null
}

export async function POST(request: Request) {
  if (!validCallbackToken(new URL(request.url).searchParams.get('token'))) {
    return Response.json({ ResultCode: 1, ResultDesc: 'Unauthorized callback' }, { status: 401 })
  }

  let callback: MpesaCallback
  try {
    callback = await request.json() as MpesaCallback
  } catch {
    return Response.json({ ResultCode: 1, ResultDesc: 'Invalid callback body' }, { status: 400 })
  }

  const stkCallback = callback.Body?.stkCallback
  const checkoutRequestId = stkCallback?.CheckoutRequestID
  if (!checkoutRequestId || stkCallback?.ResultCode === undefined) {
    return Response.json({ ResultCode: 1, ResultDesc: 'Missing transaction details' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const resultCode = String(stkCallback.ResultCode)
    const verification = await queryStkPush(checkoutRequestId)
    if (String(verification.ResultCode) !== resultCode) {
      return Response.json({ ResultCode: 1, ResultDesc: 'Transaction result is not verified yet' }, { status: 503 })
    }

    let amount = 0
    let phoneNumber = ''
    let receiptNumber = ''

    if (resultCode === '0') {
      const items = stkCallback.CallbackMetadata?.Item ?? []
      const amountValue = metadataValue(items, 'Amount')
      const phoneValue = metadataValue(items, 'PhoneNumber')
      const receiptValue = metadataValue(items, 'MpesaReceiptNumber')
      amount = typeof amountValue === 'number' ? amountValue : Number(amountValue)
      phoneNumber = phoneValue === null ? '' : normalizeKenyanPhone(String(phoneValue)) || ''
      receiptNumber = typeof receiptValue === 'string' ? receiptValue : ''
    }

    const { data: promotionPayment, error: promotionLookupError } = await admin
      .from('rental_promotion_payments')
      .select('id')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle()
    if (promotionLookupError) throw promotionLookupError

    const { data: orderPayment, error: orderPaymentLookupError } = await admin
      .from('keja_order_mpesa_payments')
      .select('id')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle()
    if (orderPaymentLookupError) throw orderPaymentLookupError

    const { error } = orderPayment
      ? await admin.rpc('apply_verified_keja_order_payment', {
        p_checkout_request_id: checkoutRequestId,
        p_result_code: resultCode,
        p_amount_kes: amount,
        p_phone_number: phoneNumber,
        p_receipt_number: receiptNumber,
      })
      : promotionPayment
      ? await admin.rpc('apply_verified_rental_promotion_payment', {
        p_checkout_request_id: checkoutRequestId,
        p_result_code: resultCode,
        p_amount_kes: amount,
        p_phone_number: phoneNumber,
        p_receipt_number: receiptNumber,
      })
      : await admin.rpc('apply_verified_mpesa_payment', {
        p_checkout_request_id: checkoutRequestId,
        p_result_code: resultCode,
        p_amount_kes: amount,
        p_phone_number: phoneNumber,
        p_receipt_number: receiptNumber,
      })

    if (error) throw error
    return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (error) {
    console.error('Could not process M-Pesa callback:', error)
    return Response.json({ ResultCode: 1, ResultDesc: 'Callback processing failed' }, { status: 500 })
  }
}