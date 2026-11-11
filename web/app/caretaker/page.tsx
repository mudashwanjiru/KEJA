'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

interface AssignedProperty {
  id: string
  title: string
  building_name: string | null
  unit_number: string | null
  location_label: string
  listing_status: string
  available_date: string | null
  water_available: boolean
  electricity_available: boolean
}

interface Viewing {
  id: string
  property_id: string
  requested_at: string
  status: string
  message: string
}

interface MaintenanceRequest {
  id: string
  property_id: string
  title: string
  details: string
  status: string
  created_at: string
}

interface PropertyInquiry {
  id: string
  property_id: string
  sender_id: string
  body: string
  created_at: string
}

export default function CaretakerDashboard() {
  const [userId, setUserId] = useState<string | null>(null)
  const [properties, setProperties] = useState<AssignedProperty[]>([])
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([])
  const [inquiries, setInquiries] = useState<PropertyInquiry[]>([])
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const [issueProperty, setIssueProperty] = useState('')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueDetails, setIssueDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    async function loadAssignments() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const id = sessionData.session?.user.id
        if (!id) {
          if (active) setMessage('Sign in to see properties assigned to you.')
          return
        }
        if (active) setUserId(id)
        const { data, error } = await supabase.from('rental_property_staff')
          .select('property_id,rental_properties(id,title,building_name,unit_number,location_label,listing_status,available_date,water_available,electricity_available)')
          .eq('staff_user_id', id)
          .eq('role', 'caretaker')
        if (error) throw error
        const rows = (data ?? []).flatMap((assignment) => {
          const property = assignment.rental_properties
          return property ? [property as unknown as AssignedProperty] : []
        })
        if (active) {
          setProperties(rows)
          setIssueProperty(rows[0]?.id ?? '')
        }
        const propertyIds = rows.map((property) => property.id)
        if (propertyIds.length === 0) return
        const [viewingResult, maintenanceResult, inquiryResult] = await Promise.all([
          supabase.from('rental_property_viewings')
            .select('id,property_id,requested_at,status,message')
            .in('property_id', propertyIds)
            .in('status', ['requested', 'confirmed'])
            .order('requested_at'),
          supabase.from('rental_property_maintenance')
            .select('id,property_id,title,details,status,created_at')
            .in('property_id', propertyIds)
            .order('created_at', { ascending: false }),
          supabase.from('rental_property_messages')
            .select('id,property_id,sender_id,body,created_at')
            .in('property_id', propertyIds)
            .order('created_at', { ascending: false }),
        ])
        if (viewingResult.error) throw viewingResult.error
        if (maintenanceResult.error) throw maintenanceResult.error
        if (inquiryResult.error) throw inquiryResult.error
        if (active) {
          setViewings((viewingResult.data ?? []) as Viewing[])
          setMaintenance((maintenanceResult.data ?? []) as MaintenanceRequest[])
          setInquiries((inquiryResult.data ?? []) as PropertyInquiry[])
        }
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadAssignments()
    return () => { active = false }
  }, [])

  const changeAvailability = async (propertyId: string, status: string) => {
    const property = properties.find((item) => item.id === propertyId)
    const { error } = await supabase.rpc('caretaker_update_availability', {
      property_id: propertyId,
      new_status: status,
      new_available_date: property?.available_date ?? null,
    })
    setMessage(error ? getErrorMessage(error) : 'Availability confirmed.')
    setHasError(Boolean(error))
    if (!error) setProperties((current) => current.map((item) => item.id === propertyId ? { ...item, listing_status: status } : item))
  }

  const respondToViewing = async (viewingId: string, status: 'confirmed' | 'declined') => {
    const { error } = await supabase.from('rental_property_viewings').update({ status }).eq('id', viewingId)
    setMessage(error ? getErrorMessage(error) : `Viewing ${status}.`)
    setHasError(Boolean(error))
    if (!error) setViewings((current) => current.filter((viewing) => viewing.id !== viewingId))
  }

  const submitMaintenance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId) return
    setSubmitting(true)
    setMessage('')
    const { error } = await supabase.from('rental_property_maintenance').insert({
      property_id: issueProperty,
      reporter_id: userId,
      title: issueTitle.trim(),
      details: issueDetails.trim(),
      status: 'open',
    })
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage('Maintenance issue reported.')
      setHasError(false)
      setIssueTitle('')
      setIssueDetails('')
      const { data, error: refreshError } = await supabase.from('rental_property_maintenance')
        .select('id,property_id,title,details,status,created_at')
        .in('property_id', properties.map((property) => property.id))
        .order('created_at', { ascending: false })
      if (refreshError) {
        setMessage(`Issue submitted, but the list could not refresh: ${getErrorMessage(refreshError)}`)
        setHasError(true)
      } else {
        setMaintenance((data ?? []) as MaintenanceRequest[])
      }
    }
    setSubmitting(false)
  }

  const replyToInquiry = async (event: React.FormEvent<HTMLFormElement>, inquiry: PropertyInquiry) => {
    event.preventDefault()
    const body = (replyDrafts[inquiry.id] ?? '').trim()
    if (!body) return
    const { error } = await supabase.rpc('reply_to_property_inquiry', {
      property_id: inquiry.property_id,
      recipient_id: inquiry.sender_id,
      message_body: body,
    })
    setMessage(error ? getErrorMessage(error) : 'Reply sent.')
    setHasError(Boolean(error))
    if (!error) setReplyDrafts((current) => ({ ...current, [inquiry.id]: '' }))
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-6xl px-6 py-16 text-slate-600">Loading assigned properties...</main>
  if (!userId) return <main className="mx-auto min-h-screen max-w-3xl px-6 py-16"><h1 className="text-2xl font-bold">Caretaker sign in</h1><p className="mt-2 text-slate-600">{message}</p><Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">Sign in</Link></main>

  const propertyName = (propertyId: string) => properties.find((property) => property.id === propertyId)?.title ?? 'Assigned property'
  const groupedBuildings = new Map<string, AssignedProperty[]>()
  for (const property of properties) {
    const building = property.building_name?.trim() || property.title
    groupedBuildings.set(building, [...(groupedBuildings.get(building) ?? []), property])
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/homes" className="text-lg font-bold text-blue-700">StallSpace KE</Link><Link href="/landlord" className="text-sm font-medium text-slate-700 hover:text-blue-700">Owner dashboard</Link></div></header>
      <section className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div><p className="text-sm font-semibold uppercase text-blue-700">Assigned properties only</p><h1 className="mt-1 text-3xl font-bold">Caretaker dashboard</h1><p className="mt-2 text-sm text-slate-600">Manage availability, respond to viewings and report maintenance. Owner financial records are not available in this workspace.</p></div>
        {message && <p role={hasError ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
        <section>
          <h2 className="text-xl font-bold">My buildings ({groupedBuildings.size})</h2>
          {properties.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">No properties are assigned to your account. Ask the owner to assign your user ID.</p> : (
            <div className="mt-4 space-y-5">
              {[...groupedBuildings].map(([building, units]) => (
                <section key={building} className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="text-lg font-bold">{building}</h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {units.map((property) => (
                      <article key={property.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <Link href={`/properties/${property.id}`} className="font-bold text-blue-800 hover:underline">{property.unit_number ? `Unit ${property.unit_number}` : property.title}</Link>
                        <p className="mt-1 text-sm text-slate-600">📍 {property.location_label}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600"><span>{property.water_available ? '✓ Water' : 'Water not confirmed'}</span><span>{property.electricity_available ? '✓ Electricity' : 'Electricity not confirmed'}</span></div>
                        <p className="mt-3 text-sm">Availability: <strong className="capitalize">{property.listing_status.replaceAll('_', ' ')}</strong></p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(['available', 'available_soon', 'occupied'] as const).map((status) => <button key={status} type="button" onClick={() => void changeAvailability(property.id, status)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${property.listing_status === status ? 'bg-blue-700 text-white' : 'border border-slate-300 text-slate-700'}`}>{status.replaceAll('_', ' ')}</button>)}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Viewing requests</h2>
            {viewings.length === 0 ? <p className="mt-3 text-sm text-slate-600">No requests to respond to.</p> : <div className="mt-4 space-y-3">{viewings.map((viewing) => <article key={viewing.id} className="rounded-lg bg-slate-50 p-4"><p className="font-semibold">{propertyName(viewing.property_id)}</p><p className="mt-1 text-sm text-slate-600">{new Date(viewing.requested_at).toLocaleString()}</p>{viewing.message && <p className="mt-2 text-sm">{viewing.message}</p>}<div className="mt-3 flex gap-2"><button onClick={() => void respondToViewing(viewing.id, 'confirmed')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Confirm</button><button onClick={() => void respondToViewing(viewing.id, 'declined')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">Decline</button></div></article>)}</div>}
          </div>
          <form onSubmit={(event) => void submitMaintenance(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Report maintenance</h2>
            <select required value={issueProperty} onChange={(event) => setIssueProperty(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Choose assigned property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select>
            <input required maxLength={120} value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} placeholder="Issue title" className="w-full rounded-md border border-slate-300 px-3 py-2" />
            <textarea required maxLength={2000} rows={3} value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder="Describe the issue" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button disabled={submitting || properties.length === 0} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit maintenance report'}</button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Tenant messages ({inquiries.length})</h2>
          {inquiries.length === 0 ? <p className="mt-3 text-sm text-slate-600">No messages for assigned properties.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{inquiries.map((inquiry) => <article key={inquiry.id} className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">{propertyName(inquiry.property_id)} · {new Date(inquiry.created_at).toLocaleString()}</p><p className="mt-2 text-sm">{inquiry.body}</p><p className="mt-1 break-all text-xs text-slate-500">Contact user ID: {inquiry.sender_id}</p><form onSubmit={(event) => void replyToInquiry(event, inquiry)} className="mt-3 flex gap-2"><input maxLength={4000} value={replyDrafts[inquiry.id] ?? ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [inquiry.id]: event.target.value }))} placeholder="Write a reply..." className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Reply</button></form></article>)}</div>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Maintenance follow-up</h2>
          {maintenance.length === 0 ? <p className="mt-3 text-sm text-slate-600">No maintenance reports yet.</p> : <div className="mt-4 divide-y divide-slate-100">{maintenance.map((item) => <article key={item.id} className="py-3"><p className="font-semibold">{item.title} · <span className="font-normal text-slate-600">{propertyName(item.property_id)}</span></p><p className="mt-1 text-sm text-slate-600">{item.details}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.status} · {new Date(item.created_at).toLocaleDateString()}</p></article>)}</div>}
        </section>
      </section>
    </main>
  )
}
