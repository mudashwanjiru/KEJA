import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface SuspensionRequest {
  userId?: unknown
  action?: unknown
  reason?: unknown
  durationHours?: unknown
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return Response.json({ error: 'Administrator sign-in required.' }, { status: 401 })

  let input: SuspensionRequest
  try {
    input = await request.json() as SuspensionRequest
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (typeof input.userId !== 'string' || !UUID_PATTERN.test(input.userId)) {
    return Response.json({ error: 'Enter a valid user ID.' }, { status: 400 })
  }
  if (input.action !== 'suspend' && input.action !== 'lift') {
    return Response.json({ error: 'Choose suspend or lift.' }, { status: 400 })
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 1000) {
    return Response.json({ error: 'Provide a suspension reason of 5 to 1,000 characters.' }, { status: 400 })
  }
  const durationHours = input.durationHours === undefined ? 876000 : Number(input.durationHours)
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 876000) {
    return Response.json({ error: 'Suspension duration must be between 1 hour and 100 years.' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
    if (authData.user.id === input.userId) return Response.json({ error: 'Administrators cannot suspend their own account.' }, { status: 400 })

    const { data: role, error: roleError } = await admin.from('platform_user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .eq('role', 'admin')
      .maybeSingle()
    if (roleError) throw roleError
    if (!role) return Response.json({ error: 'Administrator access required.' }, { status: 403 })

    if (input.action === 'suspend') {
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(input.userId)
      if (targetError) return Response.json({ error: 'The requested user was not found.' }, { status: 404 })

      const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
      const { error: banError } = await admin.auth.admin.updateUserById(input.userId, {
        ban_duration: `${durationHours}h`,
      })
      if (banError) throw banError

      const { error: insertError } = await admin.from('platform_account_suspensions').insert({
        user_id: input.userId,
        admin_id: authData.user.id,
        reason: input.reason.trim(),
        ends_at: durationHours === 876000 ? null : endsAt,
      })
      if (insertError) {
        const { error: rollbackError } = await admin.auth.admin.updateUserById(input.userId, { ban_duration: 'none' })
        if (rollbackError) console.error('Could not roll back an unrecorded user suspension:', rollbackError)
        if (insertError.code === '23505') return Response.json({ error: 'This account is already suspended.' }, { status: 409 })
        throw insertError
      }
      return Response.json({ message: `Account ${target.user.email ?? input.userId} suspended.` })
    }

    const { data: suspension, error: findError } = await admin.from('platform_account_suspensions')
      .select('id')
      .eq('user_id', input.userId)
      .is('lifted_at', null)
      .maybeSingle()
    if (findError) throw findError
    if (!suspension) return Response.json({ error: 'No active platform suspension was found for this account.' }, { status: 404 })

    const { error: updateError } = await admin.from('platform_account_suspensions')
      .update({ lifted_at: new Date().toISOString() })
      .eq('id', suspension.id)
      .is('lifted_at', null)
    if (updateError) throw updateError

    const { error: unbanError } = await admin.auth.admin.updateUserById(input.userId, { ban_duration: 'none' })
    if (unbanError) {
      const { error: rollbackError } = await admin.from('platform_account_suspensions')
        .update({ lifted_at: null })
        .eq('id', suspension.id)
      if (rollbackError) console.error('Could not restore a suspension record after unban failure:', rollbackError)
      throw unbanError
    }
    return Response.json({ message: 'Account suspension lifted.' })
  } catch (error) {
    console.error('Could not update platform account suspension:', error)
    return Response.json({ error: 'Could not update the account suspension.' }, { status: 500 })
  }
}
