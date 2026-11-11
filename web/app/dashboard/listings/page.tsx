'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { supabase } from '@/lib/supabase'

type DirectoryListing = {
  id: string
  department: string
  title: string
  category: string
  description: string
  county: string
  town: string
  contact_name: string
  contact_phone: string
  price: number | null
  price_unit: string
  stock_quantity: number | null
  website_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

const DEPARTMENTS = [
  ['marketplace', 'Marketplace'],
  ['food', 'Food & restaurants'],
  ['health', 'Healthcare'],
  ['education', 'Education'],
  ['transport', 'Transport'],
  ['accommodation', 'Hotels & stays'],
  ['agriculture', 'Agriculture'],
  ['events', 'Events'],
  ['businesses', 'Business directory'],
] as const

export default function MyListingsPage() {
  const [listings, setListings] = useState<DirectoryListing[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState<DirectoryListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true
    async function loadListings() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!auth.user) {
          if (active) setMessage('Sign in to manage your directory listings.')
          return
        }
        const { data, error } = await supabase.from('keja_directory_listings')
          .select('id,department,title,category,description,county,town,contact_name,contact_phone,price,price_unit,stock_quantity,website_url,status,created_at')
          .eq('owner_id', auth.user.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (active) setListings((data ?? []) as DirectoryListing[])
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadListings()
    return () => { active = false }
  }, [])

  function updateForm(field: keyof DirectoryListing, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current)
  }

  async function saveListing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setMessage('')
    setIsError(false)
    const { data: updated, error } = await supabase.from('keja_directory_listings').update({
      department: form.department,
      title: form.title.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      county: form.county,
      town: form.town.trim(),
      contact_name: form.contact_name.trim(),
      contact_phone: form.contact_phone.trim(),
      price: form.price === null ? null : Number(form.price),
      price_unit: form.price_unit.trim(),
      stock_quantity: form.stock_quantity === null ? null : Number(form.stock_quantity),
      website_url: form.website_url?.trim() || null,
    }).eq('id', form.id).select('status').single()
    if (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } else {
      setListings((current) => current.map((item) => item.id === form.id
        ? { ...form, status: updated.status }
        : item))
      setForm(null)
      setSelectedId('')
      setMessage('Listing updated. Changes to an approved listing are sent for review before publication.')
    }
    setSaving(false)
  }

  async function deleteListing(listing: DirectoryListing) {
    if (!window.confirm(`Permanently remove "${listing.title}"? This cannot be undone.`)) return
    setMessage('')
    setIsError(false)
    const { error } = await supabase.from('keja_directory_listings').delete().eq('id', listing.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } else {
      setListings((current) => current.filter((item) => item.id !== listing.id))
      if (selectedId === listing.id) {
        setSelectedId('')
        setForm(null)
      }
      setMessage('Listing removed.')
    }
  }

  const selectedListing = listings.find((listing) => listing.id === selectedId)

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4"><Link href="/" className="text-xl font-black text-emerald-950">MTAA</Link><div className="flex gap-4 text-sm"><Link href="/directory" className="font-semibold text-emerald-800 hover:underline">Directory</Link><Link href="/dashboard/requests" className="font-semibold text-emerald-800 hover:underline">Requests</Link></div></nav></header>
    <section className="mx-auto max-w-5xl px-5 py-8">
      <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Provider workspace</p>
      <h1 className="mt-2 text-3xl font-extrabold">My directory listings</h1>
      <p className="mt-2 text-slate-600">Review listing status, correct details, and remove listings you no longer offer. Updates to approved listings go back to review.</p>
      {message && <p role={isError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{message}</p>}
      {loading ? <p className="mt-6 rounded-xl bg-white p-8 text-center text-slate-600">Loading your listings…</p>
        : listings.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><p>You have not submitted any directory listings.</p><Link href="/directory" className="mt-3 inline-block font-bold text-emerald-800 underline">Browse or add a listing</Link></div>
          : <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-3">{listings.map((listing) => <article key={listing.id} className={`rounded-xl border bg-white p-4 ${listing.id === selectedId ? 'border-emerald-700 ring-1 ring-emerald-700' : 'border-slate-200'}`}>
              <button type="button" onClick={() => { setSelectedId(listing.id); setForm({ ...listing }); setMessage(''); setIsError(false) }} className="w-full text-left">
                <span className="text-xs font-bold uppercase text-emerald-800">{DEPARTMENTS.find(([value]) => value === listing.department)?.[1] ?? listing.department} · {listing.status}</span>
                <h2 className="mt-1 font-bold">{listing.title}</h2><p className="mt-1 text-sm text-slate-600">{listing.town}, {listing.county}</p>
              </button>
              <button type="button" onClick={() => void deleteListing(listing)} className="mt-3 text-xs font-semibold text-rose-700 underline">Remove listing</button>
            </article>)}</div>
            {form ? <form onSubmit={saveListing} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
              <h2 className="text-xl font-bold sm:col-span-2">Edit listing</h2>
              <label className="text-sm font-semibold">Department<select required value={form.department} onChange={(event) => updateForm('department', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{DEPARTMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-sm font-semibold">Title<input required minLength={3} maxLength={120} value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold">Category<input required minLength={2} maxLength={80} value={form.category} onChange={(event) => updateForm('category', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold">County<select required value={form.county} onChange={(event) => updateForm('county', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{KENYA_COUNTIES.map((county) => <option key={county}>{county}</option>)}</select></label>
              <label className="text-sm font-semibold">Town / area<input required maxLength={120} value={form.town} onChange={(event) => updateForm('town', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold">Contact name<input required minLength={2} maxLength={120} value={form.contact_name} onChange={(event) => updateForm('contact_name', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold">Contact phone<input required type="tel" minLength={7} maxLength={32} value={form.contact_phone} onChange={(event) => updateForm('contact_phone', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold">Price (KSh)<input type="number" min="0" step="0.01" value={form.price ?? ''} onChange={(event) => setForm((current) => current ? { ...current, price: event.target.value === '' ? null : Number(event.target.value) } : current)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold">Price unit<input maxLength={40} value={form.price_unit} onChange={(event) => updateForm('price_unit', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              {form.department === 'marketplace' && <label className="text-sm font-semibold">Stock quantity<input type="number" min="0" step="1" value={form.stock_quantity ?? ''} onChange={(event) => setForm((current) => current ? { ...current, stock_quantity: event.target.value === '' ? null : Number(event.target.value) } : current)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>}
              <label className="text-sm font-semibold sm:col-span-2">HTTPS website<input type="url" pattern="https://.*" value={form.website_url ?? ''} onChange={(event) => updateForm('website_url', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold sm:col-span-2">Description<textarea required minLength={20} maxLength={3000} rows={5} value={form.description} onChange={(event) => updateForm('description', event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <button disabled={saving} className="rounded-lg bg-emerald-800 px-4 py-2.5 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => { setForm(null); setSelectedId('') }} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold">Cancel</button>
            </form> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{selectedListing ? 'Choose edit to update this listing.' : 'Select a listing to review or edit it.'}</div>}
          </div>}
    </section>
  </main>
}
