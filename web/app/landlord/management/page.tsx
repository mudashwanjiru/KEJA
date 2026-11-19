'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage, getSchemaMismatchMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface Property {
  id: string
  title: string
}

interface Tenancy {
  id: string
  property_id: string
  tenant_name: string
  tenant_phone: string
  start_date: string
  end_date: string | null
  monthly_rent: number
  rent_due_day: number
  status: 'active' | 'ended'
  tenant_user_id: string | null
}

interface MaintenanceRequest {
  id: string
  tenancy_id: string
  title: string
  description: string
  urgency: 'low' | 'normal' | 'urgent'
  status: 'submitted' | 'acknowledged' | 'in_progress' | 'completed' | 'declined'
  created_at: string
}

interface RentRecord {
  id: string
  tenancy_id: string
  period_start: string
  amount: number
  due_date: string
  paid_at: string | null
  status: 'due' | 'paid' | 'late' | 'waived'
  notes: string
}

export default function PropertyManagementPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [records, setRecords] = useState<RentRecord[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([])
  const [selectedProperty, setSelectedProperty] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [tenantPhone, setTenantPhone] = useState('')
  const [startDate, setStartDate] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [dueDay, setDueDay] = useState('1')
  const [tenantUserId, setTenantUserId] = useState('')
  const [recordForm, setRecordForm] = useState<{ tenancyId: string; period: string; due: string; amount: string }>({ tenancyId: '', period: '', due: '', amount: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const pendingReminders = records.filter((record) =>
    ['due', 'late'].includes(record.status) && record.due_date <= new Date().toISOString().slice(0, 10)
  )

  async function load(user: string) {
    const [{ data: propertyRows, error: propertyError }, { data: tenancyRows, error: tenancyError }] = await Promise.all([
      supabase.from('rental_properties').select('id,title').eq('owner_id', user).eq('listing_type', 'rent').order('title'),
      supabase.from('rental_tenancies').select('id,property_id,tenant_name,tenant_phone,start_date,end_date,monthly_rent,rent_due_day,status,tenant_user_id').eq('owner_id', user).order('start_date', { ascending: false }),
    ])
    if (propertyError) throw propertyError
    if (tenancyError) throw tenancyError
    const tenancyList = (tenancyRows ?? []) as Tenancy[]
    setProperties((propertyRows ?? []) as Property[])
    setTenancies(tenancyList)
    if (tenancyList.length === 0) {
      setRecords([])
      setMaintenanceRequests([])
      return
    }
    const [{ data: paymentRows, error: paymentError }, { data: maintenanceRows, error: maintenanceError }] = await Promise.all([
      supabase.from('rental_payment_records')
        .select('id,tenancy_id,period_start,amount,due_date,paid_at,status,notes')
        .in('tenancy_id', tenancyList.map((tenancy) => tenancy.id))
        .order('due_date', { ascending: false }),
      supabase.from('tenant_maintenance_requests')
        .select('id,tenancy_id,title,description,urgency,status,created_at')
        .in('tenancy_id', tenancyList.map((tenancy) => tenancy.id))
        .order('created_at', { ascending: false }),
    ])
    if (paymentError) throw paymentError
    if (maintenanceError) throw maintenanceError
    setRecords((paymentRows ?? []) as RentRecord[])
    setMaintenanceRequests((maintenanceRows ?? []) as MaintenanceRequest[])
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
          setMessage(getSchemaMismatchMessage(error) ?? getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => { active = false }
  }, [])

  async function createTenancy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || !selectedProperty) return
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.from('rental_tenancies').insert({
        property_id: selectedProperty,
        owner_id: userId,
        tenant_name: tenantName.trim(),
        tenant_phone: tenantPhone.trim(),
        start_date: startDate,
        monthly_rent: Number(monthlyRent),
        rent_due_day: Number(dueDay),
        tenant_user_id: tenantUserId.trim() || null,
      })
      if (error) throw error
      setTenantName('')
      setTenantPhone('')
      setStartDate('')
      setMonthlyRent('')
      setTenantUserId('')
      setMessage('Tenancy record created.')
      await load(userId)
    } catch (error) {
      setMessage(getSchemaMismatchMessage(error) ?? getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function createRentRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || !recordForm.tenancyId) return
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.from('rental_payment_records').insert({
        tenancy_id: recordForm.tenancyId,
        owner_id: userId,
        period_start: `${recordForm.period}-01`,
        due_date: recordForm.due,
        amount: Number(recordForm.amount),
      })
      if (error) throw error
      setRecordForm({ tenancyId: '', period: '', due: '', amount: '' })
      setMessage('Rent due record added. MTAA does not collect rent payments.')
      await load(userId)
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function updateRentRecord(record: RentRecord, status: RentRecord['status']) {
    if (!userId) return
    const { error } = await supabase.from('rental_payment_records').update({
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    }).eq('id', record.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Rent record marked ${status}.`)
      setHasError(false)
      await load(userId)
    }
  }

  async function endTenancy(tenancy: Tenancy) {
    if (!userId) return
    const { error } = await supabase.from('rental_tenancies').update({ status: 'ended', end_date: new Date().toISOString().slice(0, 10) }).eq('id', tenancy.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage('Tenancy marked ended.')
      setHasError(false)
      await load(userId)
    }
  }

  async function updateMaintenanceRequest(request: MaintenanceRequest, status: MaintenanceRequest['status']) {
    const { error } = await supabase.from('tenant_maintenance_requests').update({ status }).eq('id', request.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMaintenanceRequests((current) => current.map((item) => item.id === request.id ? { ...item, status } : item))
      setMessage(`Maintenance request marked ${status.replaceAll('_', ' ')}.`)
      setHasError(false)
    }
  }

  if (loading) return <main className="mx-auto max-w-5xl px-5 py-16 text-slate-600">Loading property management…</main>
  if (!userId) return <main className="mx-auto max-w-3xl px-5 py-16"><h1 className="text-2xl font-bold">Sign in to manage tenancies</h1><Link href="/dashboard" className="mt-4 inline-block text-blue-700 underline">Sign in or register</Link></main>

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/landlord" className="font-bold text-blue-700">MTAA owner workspace</Link><Link href="/landlord" className="text-sm text-slate-600 hover:text-blue-700">Back to properties</Link></div></header>
    <section className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <div><h1 className="text-3xl font-extrabold">Tenancy & rent records</h1><p className="mt-2 text-sm text-slate-600">Keep private tenancy details and record rent due or paid. MTAA does not collect rent or send money.</p></div>
      {message && <p role={hasError ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      {pendingReminders.length > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{pendingReminders.length} rent record{pendingReminders.length === 1 ? '' : 's'} due or overdue. Review the rent records below and contact tenants directly.</p>}
      <div className="grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={(event) => void createTenancy(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold">Add tenancy</h2>
          <label className="block text-sm font-medium">Property<select required value={selectedProperty} onChange={(event) => setSelectedProperty(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select an owned property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select></label>
          <label className="block text-sm font-medium">Tenant name<input required minLength={2} maxLength={120} value={tenantName} onChange={(event) => setTenantName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium">Tenant phone<input required type="tel" minLength={7} maxLength={32} value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium">Tenant MTAA account user ID (optional)<input value={tenantUserId} onChange={(event) => setTenantUserId(event.target.value)} placeholder="Link an existing signed-in account" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /><span className="mt-1 block text-xs text-slate-500">The tenant can submit maintenance requests from their account after you link them. Only link an account with the tenant’s consent.</span></label>
          <label className="block text-sm font-medium">Start date<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Monthly rent (KES)<input required type="number" min="1" value={monthlyRent} onChange={(event) => setMonthlyRent(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Due day<input required type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div>
          <button disabled={saving || properties.length === 0} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Save tenancy</button>
        </form>
        <section className="space-y-4">
          <form onSubmit={(event) => void createRentRecord(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold">Add a rent due record</h2>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Tenancy<select required value={recordForm.tenancyId} onChange={(event) => setRecordForm((current) => ({ ...current, tenancyId: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select tenancy</option>{tenancies.filter((tenancy) => tenancy.status === 'active').map((tenancy) => <option key={tenancy.id} value={tenancy.id}>{tenancy.tenant_name} · {properties.find((property) => property.id === tenancy.property_id)?.title}</option>)}</select></label><label className="text-sm font-medium">Rent period<input type="month" required value={recordForm.period} onChange={(event) => setRecordForm((current) => ({ ...current, period: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Due date<input type="date" required value={recordForm.due} onChange={(event) => setRecordForm((current) => ({ ...current, due: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Amount (KES)<input type="number" min="1" required value={recordForm.amount} onChange={(event) => setRecordForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div>
            <button disabled={saving || tenancies.length === 0} className="rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-700 disabled:opacity-50">Add due record</button>
          </form>
          <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Rent records</h2>
            {records.length === 0 ? <p className="mt-3 text-sm text-slate-600">No rent records yet.</p> : <div className="mt-3 space-y-3">{records.map((record) => {
              const tenancy = tenancies.find((item) => item.id === record.tenancy_id)
              const overdue = record.status === 'due' && record.due_date < new Date().toISOString().slice(0, 10)
              return <article key={record.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{tenancy?.tenant_name ?? 'Tenant'} · {record.period_start.slice(0, 7)}</p><span className={`text-sm font-semibold ${overdue ? 'text-rose-700' : 'text-slate-600'}`}>{overdue ? 'Overdue' : record.status}</span></div><p className="mt-1 text-sm text-slate-600">KSh {Number(record.amount).toLocaleString('en-KE')} · due {record.due_date}{record.paid_at ? ` · recorded paid ${new Date(record.paid_at).toLocaleDateString()}` : ''}</p>
                {record.status !== 'paid' && <button type="button" onClick={() => void updateRentRecord(record, 'paid')} className="mt-2 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Record as paid (offline)</button>}
              </article>
            })}</div>}
          </div>
        </section>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Tenancies</h2>
        {tenancies.length === 0 ? <p className="mt-2 text-sm text-slate-600">Add a tenancy to begin.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2">{tenancies.map((tenancy) => <article key={tenancy.id} className="rounded-lg border border-slate-200 p-4"><p className="font-semibold">{tenancy.tenant_name} · {tenancy.status}</p><p className="mt-1 text-sm text-slate-600">{properties.find((property) => property.id === tenancy.property_id)?.title} · {tenancy.tenant_phone}</p><p className="mt-1 text-sm text-slate-600">KSh {Number(tenancy.monthly_rent).toLocaleString('en-KE')}/month · due day {tenancy.rent_due_day}</p>{tenancy.status === 'active' && <button type="button" onClick={() => void endTenancy(tenancy)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold">End tenancy</button>}</article>)}</div>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Tenant maintenance requests</h2>
        {maintenanceRequests.length === 0 ? <p className="mt-2 text-sm text-slate-600">No tenant maintenance requests yet.</p> : <div className="mt-3 space-y-3">{maintenanceRequests.map((request) => <article key={request.id} className="rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{request.title} · <span className="capitalize">{request.urgency}</span></p><span className="text-sm capitalize text-slate-500">{request.status.replaceAll('_', ' ')}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{request.description}</p><p className="mt-1 text-xs text-slate-500">{tenancies.find((item) => item.id === request.tenancy_id)?.tenant_name} · {new Date(request.created_at).toLocaleDateString()}</p>{!['completed', 'declined'].includes(request.status) && <div className="mt-3 flex flex-wrap gap-2">{(['acknowledged', 'in_progress', 'completed'] as const).map((status) => <button key={status} type="button" onClick={() => void updateMaintenanceRequest(request, status)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold capitalize">{status.replaceAll('_', ' ')}</button>)}</div>}</article>)}</div>}
      </section>
    </section>
  </main>
}
