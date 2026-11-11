'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface Tenancy {
  id: string
  property_id: string
  tenant_name: string
  monthly_rent: number
  rent_due_day: number
  rental_properties: { title: string; location_label: string } | null
}

interface Request {
  id: string
  tenancy_id: string
  title: string
  description: string
  urgency: 'low' | 'normal' | 'urgent'
  status: string
  created_at: string
}

export default function TenantWorkspace() {
  const [userId, setUserId] = useState<string | null>(null)
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [tenancyId, setTenancyId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'urgent'>('normal')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  async function load(id: string) {
    const { data: tenancyRows, error: tenancyError } = await supabase.from('rental_tenancies')
      .select('id,property_id,tenant_name,monthly_rent,rent_due_day,rental_properties(title,location_label)')
      .eq('tenant_user_id', id).eq('status', 'active')
    if (tenancyError) throw tenancyError
    const list = (tenancyRows ?? []) as unknown as Tenancy[]
    setTenancies(list)
    if (!list.length) {
      setRequests([])
      return
    }
    const { data, error } = await supabase.from('tenant_maintenance_requests')
      .select('id,tenancy_id,title,description,urgency,status,created_at')
      .in('tenancy_id', list.map((item) => item.id)).order('created_at', { ascending: false })
    if (error) throw error
    setRequests((data ?? []) as Request[])
  }

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!data.user) return
        if (active) setUserId(data.user.id)
        await load(data.user.id)
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => { active = false }
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || !tenancyId) return
    setSaving(true)
    setMessage('')
    setHasError(false)
    try {
      const { error } = await supabase.from('tenant_maintenance_requests').insert({
        tenancy_id: tenancyId,
        tenant_id: userId,
        title: title.trim(),
        description: description.trim(),
        urgency,
      })
      if (error) throw error
      setTitle('')
      setDescription('')
      setMessage('Maintenance request sent to your property owner.')
      await load(userId)
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><Link href="/" className="font-bold text-blue-700">MTAA tenant portal</Link><Link href="/homes" className="text-sm text-slate-600 hover:text-blue-700">Browse homes</Link></div></header>
    <section className="mx-auto max-w-5xl space-y-6 px-5 py-8"><h1 className="text-3xl font-extrabold">Your tenancy & maintenance</h1><p className="text-sm text-slate-600">Your landlord must link your MTAA account to the tenancy before it appears here. Rent records on MTAA are informational only; no payments are processed.</p>{userId && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">Your MTAA account ID to share with your landlord: <code className="select-all font-semibold">{userId}</code></p>}
      {message && <p role={hasError ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      {loading ? <p className="py-10 text-center text-slate-600">Loading tenant workspace…</p> : !userId ? <div className="rounded-xl border border-slate-200 bg-white p-6"><p>Sign in to access your tenant workspace.</p><Link href="/dashboard" className="mt-3 inline-block text-blue-700 underline">Sign in</Link></div>
        : tenancies.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No linked active tenancy found. Ask your landlord to link your account using your user ID.</p>
          : <><div className="grid gap-3 md:grid-cols-2">{tenancies.map((tenancy) => <article key={tenancy.id} className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">{tenancy.rental_properties?.title}</h2><p className="mt-1 text-sm text-slate-600">{tenancy.rental_properties?.location_label}</p><p className="mt-3 text-sm">Recorded rent: KSh {Number(tenancy.monthly_rent).toLocaleString('en-KE')} / month · due day {tenancy.rent_due_day}</p></article>)}</div>
            <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Request maintenance</h2><label className="block text-sm font-medium">Property<select required value={tenancyId} onChange={(event) => setTenancyId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select tenancy</option>{tenancies.map((tenancy) => <option key={tenancy.id} value={tenancy.id}>{tenancy.rental_properties?.title}</option>)}</select></label><label className="block text-sm font-medium">Issue title<input required minLength={5} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Details<textarea required minLength={10} maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Urgency<select value={urgency} onChange={(event) => setUrgency(event.target.value as typeof urgency)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="low">Low</option><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Send request</button></form>
            <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Maintenance history</h2>{requests.length === 0 ? <p className="mt-2 text-sm text-slate-600">No requests yet.</p> : <div className="mt-3 space-y-3">{requests.map((request) => <article key={request.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{request.title}</p><span className="text-sm capitalize text-slate-500">{request.status.replaceAll('_', ' ')}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{request.description}</p><p className="mt-1 text-xs text-slate-500">Urgency: {request.urgency} · {new Date(request.created_at).toLocaleDateString()}</p></article>)}</div>}</section>
          </>}
    </section>
  </main>
}
