'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

interface DashboardStats {
  property_count: number
  available_count: number
  rented_count: number
  sold_count: number
  pending_verification_count: number
  pending_report_count: number
  user_count: number
  agent_count: number
  landlord_count: number
  caretaker_count: number
  views_today: number
  leads_today: number
}

interface PropertyListing {
  id: string
  title: string
  location_label: string
  listing_type: string
  verification_status: string
  created_at: string
}

interface PropertyReport {
  id: string
  property_id: string
  reason: string
  details: string
  status: string
  created_at: string
}

interface StallReport {
  id: string
  stall_id: string
  reason: string
  details: string
  status: string
  created_at: string
  stalls: {
    stall_number: string
    location_label: string
    town: string | null
    county: string | null
  } | null
}

interface PropertyReview {
  id: string
  property_id: string
  rating: number
  body: string
  created_at: string
  rental_properties: { title: string } | null
}

interface VerificationRequest {
  id: string
  user_id: string
  account_type: 'landlord' | 'agent'
  legal_name: string
  business_name: string | null
  contact_phone: string
  reference_url: string | null
  created_at: string
}

interface AccountSuspension {
  id: string
  user_id: string
  reason: string
  suspended_at: string
  ends_at: string | null
}

const EMPTY_STATS: DashboardStats = {
  property_count: 0,
  available_count: 0,
  rented_count: 0,
  sold_count: 0,
  pending_verification_count: 0,
  pending_report_count: 0,
  user_count: 0,
  agent_count: 0,
  landlord_count: 0,
  caretaker_count: 0,
  views_today: 0,
  leads_today: 0,
}

export default function ResidentialAdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [stats, setStats] = useState(EMPTY_STATS)
  const [properties, setProperties] = useState<PropertyListing[]>([])
  const [reports, setReports] = useState<PropertyReport[]>([])
  const [stallReports, setStallReports] = useState<StallReport[]>([])
  const [reviews, setReviews] = useState<PropertyReview[]>([])
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([])
  const [suspensions, setSuspensions] = useState<AccountSuspension[]>([])
  const [suspensionUserId, setSuspensionUserId] = useState('')
  const [suspensionReason, setSuspensionReason] = useState('')
  const [suspensionHours, setSuspensionHours] = useState('168')
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const [workingId, setWorkingId] = useState('')

  const loadAdminDashboard = async () => {
    const [{ data: statsData, error: statsError }, { data: propertyData, error: propertyError }, { data: reportData, error: reportError }, { data: stallReportData, error: stallReportError }, { data: reviewData, error: reviewError }, { data: verificationData, error: verificationError }, { data: suspensionData, error: suspensionError }] = await Promise.all([
      supabase.rpc('admin_residential_dashboard_stats'),
      supabase.from('rental_properties')
        .select('id,title,location_label,listing_type,verification_status,created_at')
        .eq('verification_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50),
      supabase.from('rental_property_reports')
        .select('id,property_id,reason,details,status,created_at')
        .in('status', ['pending', 'reviewing'])
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('commercial_stall_reports')
        .select('id,stall_id,reason,details,status,created_at,stalls(stall_number,location_label,town,county)')
        .in('status', ['pending', 'reviewing'])
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('rental_property_reviews')
        .select('id,property_id,rating,body,created_at,rental_properties(title)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('platform_user_verifications')
        .select('id,user_id,account_type,legal_name,business_name,contact_phone,reference_url,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('platform_account_suspensions')
        .select('id,user_id,reason,suspended_at,ends_at')
        .is('lifted_at', null)
        .order('suspended_at', { ascending: false })
        .limit(100),
    ])
    if (statsError) throw statsError
    if (propertyError) throw propertyError
    if (reportError) throw reportError
    if (stallReportError) throw stallReportError
    if (reviewError) throw reviewError
    if (verificationError) throw verificationError
    if (suspensionError) throw suspensionError
    const result = Array.isArray(statsData) ? statsData[0] : statsData
    setStats({ ...EMPTY_STATS, ...(result as Partial<DashboardStats> | null) })
    setProperties((propertyData ?? []) as PropertyListing[])
    setReports((reportData ?? []) as PropertyReport[])
    setStallReports((stallReportData ?? []) as unknown as StallReport[])
    setReviews((reviewData ?? []) as unknown as PropertyReview[])
    setVerificationRequests((verificationData ?? []) as VerificationRequest[])
    setSuspensions((suspensionData ?? []) as AccountSuspension[])
  }

  useEffect(() => {
    let active = true
    async function checkAdmin() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) {
          if (active) setMessage('Sign in with an authorized administrator account.')
          return
        }
        const { data, error } = await supabase.from('platform_user_roles')
          .select('role').eq('user_id', sessionData.session.user.id).eq('role', 'admin').maybeSingle()
        if (error) throw error
        if (!data) {
          if (active) setMessage('This account does not have residential administrator access.')
          return
        }
        if (active) setAuthorized(true)
        await loadAdminDashboard()
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void checkAdmin()
    return () => { active = false }
  }, [])

  const verifyProperty = async (propertyId: string, status: 'verified' | 'rejected') => {
    setWorkingId(propertyId)
    setMessage('')
    const { error } = await supabase.from('rental_properties')
      .update({ verification_status: status })
      .eq('id', propertyId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Property ${status}.`)
      setHasError(false)
      await loadAdminDashboard()
    }
    setWorkingId('')
  }

  const updateReport = async (reportId: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    setWorkingId(reportId)
    setMessage('')
    const { error } = await supabase.from('rental_property_reports').update({ status }).eq('id', reportId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Report marked ${status}.`)
      setHasError(false)
      await loadAdminDashboard()
    }
    setWorkingId('')
  }

  const updateStallReport = async (reportId: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    setWorkingId(reportId)
    setMessage('')
    const { error } = await supabase.from('commercial_stall_reports').update({ status }).eq('id', reportId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Stall report marked ${status}.`)
      setHasError(false)
      await loadAdminDashboard()
    }
    setWorkingId('')
  }

  const moderateReview = async (reviewId: string, status: 'approved' | 'rejected') => {
    setWorkingId(reviewId)
    setMessage('')
    const { error } = await supabase.from('rental_property_reviews').update({ status }).eq('id', reviewId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Review ${status}.`)
      setHasError(false)
      await loadAdminDashboard()
    }
    setWorkingId('')
  }

  const reviewAccount = async (requestId: string, decision: 'approved' | 'rejected') => {
    setWorkingId(requestId)
    setMessage('')
    const { error } = await supabase.rpc('admin_review_platform_verification', {
      request_id: requestId,
      decision,
      note: null,
    })
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Account verification ${decision}.`)
      setHasError(false)
      await loadAdminDashboard()
    }
    setWorkingId('')
  }

  const changeSuspension = async (userId: string, action: 'suspend' | 'lift', reason: string, durationHours?: number) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setMessage(getErrorMessage(sessionError))
      setHasError(true)
      return
    }
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setMessage('Administrator session expired. Sign in again.')
      setHasError(true)
      return
    }
    setWorkingId(userId)
    setMessage('')
    const response = await fetch('/api/admin/suspensions', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ userId, action, reason, durationHours }),
    })
    const result = await response.json() as { message?: string; error?: string }
    if (!response.ok) {
      setMessage(result.error ?? 'Could not change account suspension.')
      setHasError(true)
    } else {
      setMessage(result.message ?? 'Account suspension updated.')
      setHasError(false)
      setSuspensionUserId('')
      setSuspensionReason('')
      await loadAdminDashboard()
    }
    setWorkingId('')
  }

  const metrics = [
    ['Users', stats.user_count], ['Properties', stats.property_count], ['Agents', stats.agent_count],
    ['Landlords', stats.landlord_count], ['Caretakers', stats.caretaker_count],
    ['Available', stats.available_count], ['Rented', stats.rented_count], ['Sold', stats.sold_count],
    ['Pending verification', stats.pending_verification_count], ['Open property reports', stats.pending_report_count],
    ['Views today', stats.views_today], ['Viewing leads today', stats.leads_today],
  ]

  if (loading) return <main className="mx-auto min-h-screen max-w-7xl px-6 py-16 text-slate-600">Loading administrator dashboard...</main>
  if (!authorized) return <main className="mx-auto min-h-screen max-w-3xl px-6 py-16"><h1 className="text-2xl font-bold">Administrator access required</h1><p className="mt-2 text-slate-600">{message}</p><Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">Sign in</Link></main>

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4"><h1 className="text-lg font-bold">MTAA platform admin</h1><nav className="flex gap-4 text-sm"><Link href="/admin/coverage" className="font-semibold text-blue-700 hover:underline">County coverage</Link><Link href="/admin/locations" className="font-semibold text-blue-700 hover:underline">Ward data</Link><Link href="/homes" className="text-slate-600 hover:text-blue-700">Marketplace</Link></nav></div></header>
      <section className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        <div><p className="text-sm font-semibold uppercase text-blue-700">Operations overview</p><h2 className="mt-1 text-3xl font-bold">Platform dashboard</h2><p className="mt-2 text-sm text-slate-600">Residential operations and moderation queue for residential properties and commercial stalls.</p></div>
        {message && <p role={hasError ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, count]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{Number(count).toLocaleString()}</p></article>)}
        </div>
        <div className="grid gap-8 xl:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Property verification ({properties.length})</h2>
            {properties.length === 0 ? <p className="mt-3 text-sm text-slate-600">No pending properties.</p> : <div className="mt-4 divide-y divide-slate-100">{properties.map((property) => <article key={property.id} className="py-4"><Link href={`/properties/${property.id}`} className="font-semibold text-blue-800 hover:underline">{property.title}</Link><p className="mt-1 text-sm text-slate-600">{property.location_label} · {property.listing_type}</p><time className="mt-1 block text-xs text-slate-500">{new Date(property.created_at).toLocaleDateString()}</time><div className="mt-3 flex gap-2"><button disabled={workingId === property.id} onClick={() => void verifyProperty(property.id, 'verified')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Verify</button><button disabled={workingId === property.id} onClick={() => void verifyProperty(property.id, 'rejected')} className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button></div></article>)}</div>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Residential property reports ({reports.length})</h2>
            {reports.length === 0 ? <p className="mt-3 text-sm text-slate-600">No open reports.</p> : <div className="mt-4 divide-y divide-slate-100">{reports.map((report) => <article key={report.id} className="py-4"><Link href={`/properties/${report.property_id}`} className="text-xs font-semibold text-blue-700 hover:underline">View reported property</Link><p className="mt-1 font-semibold capitalize">{report.reason.replaceAll('_', ' ')}</p>{report.details && <p className="mt-1 text-sm text-slate-700">{report.details}</p>}<p className="mt-1 text-xs capitalize text-slate-500">{report.status} · {new Date(report.created_at).toLocaleDateString()}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={workingId === report.id} onClick={() => void updateReport(report.id, 'reviewing')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Review</button><button disabled={workingId === report.id} onClick={() => void updateReport(report.id, 'resolved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Resolve</button><button disabled={workingId === report.id} onClick={() => void updateReport(report.id, 'dismissed')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Dismiss</button></div></article>)}</div>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Commercial stall reports ({stallReports.length})</h2>
            {stallReports.length === 0 ? <p className="mt-3 text-sm text-slate-600">No open stall reports.</p> : <div className="mt-4 divide-y divide-slate-100">{stallReports.map((report) => <article key={report.id} className="py-4">
              <Link href={`/stalls/${report.stall_id}`} className="text-xs font-semibold text-blue-700 hover:underline">View {report.stalls?.stall_number ?? 'reported stall'}</Link>
              {report.stalls && <p className="mt-1 text-sm text-slate-600">{[report.stalls.location_label, report.stalls.town, report.stalls.county].filter(Boolean).join(', ')}</p>}
              <p className="mt-1 font-semibold capitalize">{report.reason.replaceAll('_', ' ')}</p>
              {report.details && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{report.details}</p>}
              <p className="mt-1 text-xs capitalize text-slate-500">{report.status} · {new Date(report.created_at).toLocaleDateString()}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={workingId === report.id} onClick={() => void updateStallReport(report.id, 'reviewing')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Review</button>
                <button disabled={workingId === report.id} onClick={() => void updateStallReport(report.id, 'resolved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Resolve</button>
                <button disabled={workingId === report.id} onClick={() => void updateStallReport(report.id, 'dismissed')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Dismiss</button>
              </div>
            </article>)}</div>}
          </section>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Property reviews ({reviews.length} pending)</h2>
          {reviews.length === 0 ? <p className="mt-3 text-sm text-slate-600">No reviews awaiting moderation.</p> : <div className="mt-4 divide-y divide-slate-100">{reviews.map((review) => <article key={review.id} className="py-4"><Link href={`/properties/${review.property_id}`} className="font-semibold text-blue-800 hover:underline">{review.rental_properties?.title ?? 'Property review'}</Link><p className="mt-1 text-amber-600">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{review.body}</p><time className="mt-1 block text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString()}</time><div className="mt-3 flex gap-2"><button disabled={workingId === review.id} onClick={() => void moderateReview(review.id, 'approved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button disabled={workingId === review.id} onClick={() => void moderateReview(review.id, 'rejected')} className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button></div></article>)}</div>}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Account verification ({verificationRequests.length} pending)</h2>
          {verificationRequests.length === 0 ? <p className="mt-3 text-sm text-slate-600">No account verification requests.</p> : <div className="mt-4 divide-y divide-slate-100">{verificationRequests.map((request) => <article key={request.id} className="py-4"><p className="font-semibold">{request.legal_name} · <span className="capitalize">{request.account_type}</span></p><p className="mt-1 text-sm text-slate-600">{request.business_name || 'No business name'} · {request.contact_phone}</p><p className="mt-1 break-all text-xs text-slate-500">Account: {request.user_id}</p>{request.reference_url && <a href={request.reference_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-700 underline">Review submitted reference</a>}<p className="mt-1 text-xs text-slate-500">Submitted {new Date(request.created_at).toLocaleDateString()}</p><div className="mt-3 flex gap-2"><button disabled={workingId === request.id} onClick={() => void reviewAccount(request.id, 'approved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve account</button><button disabled={workingId === request.id} onClick={() => void reviewAccount(request.id, 'rejected')} className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button></div></article>)}</div>}
        </section>
        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={(event) => { event.preventDefault(); void changeSuspension(suspensionUserId.trim(), 'suspend', suspensionReason, Number(suspensionHours)) }} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Suspend an account</h2>
            <p className="text-sm text-slate-600">Suspension blocks sign-in and token refresh through Supabase Auth. Existing access tokens may remain usable until they expire.</p>
            <label className="block text-sm font-medium">User UUID<input required value={suspensionUserId} onChange={(event) => setSuspensionUserId(event.target.value)} placeholder="Supabase Auth user ID" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Reason<textarea required minLength={5} maxLength={1000} value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Duration in hours<input required type="number" min="1" max="876000" value={suspensionHours} onChange={(event) => setSuspensionHours(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /><span className="mt-1 block text-xs text-slate-500">Use 876000 for a long-term (100-year) suspension.</span></label>
            <button disabled={Boolean(workingId)} className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Suspend account</button>
          </form>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Active suspensions ({suspensions.length})</h2>
            {suspensions.length === 0 ? <p className="mt-3 text-sm text-slate-600">No active account suspensions.</p> : <div className="mt-4 divide-y divide-slate-100">{suspensions.map((suspension) => <article key={suspension.id} className="py-4"><p className="break-all text-xs text-slate-500">{suspension.user_id}</p><p className="mt-1 text-sm">{suspension.reason}</p><p className="mt-1 text-xs text-slate-500">Suspended {new Date(suspension.suspended_at).toLocaleDateString()}{suspension.ends_at ? ` · ends ${new Date(suspension.ends_at).toLocaleDateString()}` : ' · long-term suspension'}</p><button disabled={workingId === suspension.user_id} onClick={() => void changeSuspension(suspension.user_id, 'lift', 'Suspension lifted by administrator.')} className="mt-2 rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50">Lift suspension</button></article>)}</div>}
          </section>
        </section>
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">To bootstrap the first residential administrator, insert the trusted Supabase Auth user ID into <code>public.platform_user_roles</code> as role <code>admin</code> using the Supabase SQL Editor. Never grant this role from the public client.</p>
      </section>
    </main>
  )
}
