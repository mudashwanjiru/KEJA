import { createSupabaseAdmin } from '@/lib/supabaseAdmin'
import { initiateStkPush, normalizeKenyanPhone } from '@/lib/mpesa'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROMOTION_PLANS = {
  week: { amount: 200, durationDays: 7 },
  month: { amount: 500, durationDays: 30 },
} as const

interface PromotionRequest {
  propertyId?: unknown
  phoneNumber?: unknown
  plan?: unknown
}

function isUncertainPaymentError(error: unknown): boolean {
  return error instanceof TypeError
    || (error instanceof Error && /abort|timeout|network/i.test(`${error.name} ${error.message}`))
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return Response.json({ error: 'Sign in to feature a property.' }, { status: 401 })

  let input: PromotionRequest
  try {
    input = await request.json() as PromotionRequest
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (typeof input.propertyId !== 'string' || !UUID_PATTERN.test(input.propertyId)) {
    return Response.json({ error: 'Choose a valid property.' }, { status: 400 })
  }
  if (input.plan !== 'week' && input.plan !== 'month') {
    return Response.json({ error: 'Choose a valid promotion plan.' }, { status: 400 })
  }
  const phoneNumber = typeof input.phoneNumber === 'string' ? normalizeKenyanPhone(input.phoneNumber) : null
  if (!phoneNumber) return Response.json({ error: 'Enter a valid Kenyan M-Pesa phone number.' }, { status: 400 })

  if (
    !process.env.MPESA_CONSUMER_KEY
    || !process.env.MPESA_CONSUMER_SECRET
    || !process.env.MPESA_SHORTCODE
    || !process.env.MPESA_PASSKEY
    || !process.env.MPESA_CALLBACK_TOKEN
    || !process.env.APP_BASE_URL
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return Response.json({ error: 'M-Pesa promotion payments are not configured on the server.' }, { status: 503 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })

    const { data: property, error: propertyError } = await admin.from('rental_properties')
      .select('id,owner_id,verification_status,listing_status')
      .eq('id', input.propertyId)
      .maybeSingle()
    if (propertyError) throw propertyError
    if (!property || property.verification_status !== 'verified' || !['available', 'available_soon'].includes(property.listing_status)) {
      return Response.json({ error: 'Only verified and available properties can be featured.' }, { status: 409 })
    }

    let authorized = property.owner_id === authData.user.id
    if (!authorized) {
      const [{ data: assignment, error: assignmentError }, { data: agencyProperty, error: agencyPropertyError }] = await Promise.all([
        admin.from('rental_property_staff').select('property_id').eq('property_id', property.id)
          .eq('staff_user_id', authData.user.id).eq('role', 'agent').maybeSingle(),
        admin.from('rental_properties').select('agency_id').eq('id', property.id).maybeSingle(),
      ])
      if (assignmentError) throw assignmentError
      if (agencyPropertyError) throw agencyPropertyError
      authorized = Boolean(assignment)
      if (!authorized && agencyProperty?.agency_id) {
        const { data: membership, error: membershipError } = await admin.from('rental_agency_members')
          .select('agency_id')
          .eq('agency_id', agencyProperty.agency_id)
          .eq('user_id', authData.user.id)
          .eq('role', 'agent')
          .maybeSingle()
        if (membershipError) throw membershipError
        authorized = Boolean(membership)
      }
    }
    if (!authorized) return Response.json({ error: 'Property owner or assigned agent access is required.' }, { status: 403 })

    const { data: pendingPayment, error: pendingError } = await admin.from('rental_promotion_payments')
      .select('request_id')
      .eq('user_id', authData.user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (pendingError) throw pendingError
    if (pendingPayment) return Response.json({ error: 'A promotion payment is already pending.', paymentId: pendingPayment.request_id }, { status: 409 })

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin.from('rental_promotion_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authData.user.id)
      .gte('created_at', since)
    if (countError) throw countError
    if (count !== null && count >= 5) return Response.json({ error: 'Promotion payment attempt limit reached. Try again in an hour.' }, { status: 429 })

    const plan = PROMOTION_PLANS[input.plan]
    const requestId = crypto.randomUUID()
    const { error: insertError } = await admin.from('rental_promotion_payments').insert({
      request_id: requestId,
      user_id: authData.user.id,
      property_id: property.id,
      phone_number: phoneNumber,
      amount_kes: plan.amount,
      duration_days: plan.durationDays,
    })
    if (insertError?.code === '23505') return Response.json({ error: 'A promotion payment is already pending.' }, { status: 409 })
    if (insertError) throw insertError

    let stkAccepted = false
    try {
      const stk = await initiateStkPush(phoneNumber, plan.amount, 'MTAA feature', 'Property feature')
      stkAccepted = true
      const { error: updateError } = await admin.from('rental_promotion_payments')
        .update({
          merchant_request_id: stk.MerchantRequestID,
          checkout_request_id: stk.CheckoutRequestID,
        })
        .eq('request_id', requestId)
      if (updateError) {
        console.error('M-Pesa accepted a promotion payment but checkout ID could not be saved:', updateError)
        return Response.json({ paymentId: requestId, error: 'M-Pesa may have sent a prompt. Check your phone before trying again.' }, { status: 503 })
      }
      return Response.json({
        paymentId: requestId,
        message: stk.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
      })
    } catch (error) {
      if (!isUncertainPaymentError(error) && !stkAccepted) {
        const { error: updateError } = await admin.from('rental_promotion_payments')
          .update({ status: 'failed' })
          .eq('request_id', requestId)
        if (updateError) console.error('Could not mark failed promotion payment:', updateError)
      }
      console.error('Could not initiate residential promotion payment:', error)
      return Response.json({
        paymentId: requestId,
        error: isUncertainPaymentError(error)
          ? 'We could not confirm whether M-Pesa received the request. Check your phone before trying again.'
          : 'M-Pesa could not start the promotion payment.',
      }, { status: 502 })
    }
  } catch (error) {
    console.error('Could not create residential promotion payment:', error)
    return Response.json({ error: 'Could not start the property promotion payment.' }, { status: 500 })
  }
}
