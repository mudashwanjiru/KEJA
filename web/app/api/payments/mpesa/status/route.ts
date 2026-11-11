import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  const paymentId = new URL(request.url).searchParams.get('id')

  if (!token) return Response.json({ error: 'Sign in to check payment status.' }, { status: 401 })
  if (!paymentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) {
    return Response.json({ error: 'Invalid payment ID.' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) {
      return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
    }

    const { data: payment, error } = await admin
      .from('mpesa_payments')
      .select('status')
      .eq('request_id', paymentId)
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (error) throw error
    if (!payment) return Response.json({ error: 'Payment request not found.' }, { status: 404 })

    return Response.json({ status: payment.status })
  } catch (error) {
    console.error('Could not check M-Pesa payment status:', error)
    return Response.json({ error: 'Could not check payment status.' }, { status: 500 })
  }
}