import 'server-only'

import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPesapalTransactionStatus } from '@/lib/pesapal'

interface PaymentRecord {
  request_id: string
  order_tracking_id: string | null
  amount_kes: number
  currency: string
  status: 'pending' | 'paid' | 'failed'
}

export async function refreshPesapalSubscriptionPayment(
  admin: ReturnType<typeof createSupabaseAdmin>,
  payment: PaymentRecord,
  orderTrackingId = payment.order_tracking_id,
): Promise<PaymentRecord['status']> {
  if (payment.status !== 'pending' || !orderTrackingId) return payment.status

  const transaction = await getPesapalTransactionStatus(orderTrackingId)
  const description = transaction.payment_status_description?.trim() ?? ''
  if (!description) throw new Error('Pesapal returned no transaction status.')

  const { error } = await admin.rpc('apply_verified_pesapal_subscription_payment', {
    p_request_id: payment.request_id,
    p_payment_status: description,
    p_amount: transaction.amount === undefined ? null : Number(transaction.amount),
    p_currency: transaction.currency ?? null,
    p_payment_method: transaction.payment_method ?? null,
    p_confirmation_code: transaction.confirmation_code ?? null,
  })
  if (error) throw error

  const { data: updated, error: lookupError } = await admin
    .from('pesapal_subscription_payments')
    .select('status')
    .eq('request_id', payment.request_id)
    .single()
  if (lookupError) throw lookupError
  return updated.status as PaymentRecord['status']
}
