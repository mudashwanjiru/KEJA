'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface DirectoryRequest {
  id: string
  listing_id: string
  requester_id: string
  message: string
  requested_date: string | null
  request_details: Record<string, string | number>
  status: 'pending' | 'responded' | 'accepted' | 'declined' | 'completed' | 'cancelled'
  provider_response: string
  created_at: string
  keja_directory_listings: {
    title: string
    department: string
    owner_id: string
    contact_name: string
    contact_phone: string
  }
}

export default function DirectoryRequestsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [requests, setRequests] = useState<DirectoryRequest[]>([])
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!auth.user) {
          if (active) setMessage('Sign in to view your provider requests.')
          return
        }
        const { data, error } = await supabase.from('keja_directory_requests')
          .select('id,listing_id,requester_id,message,requested_date,request_details,status,provider_response,created_at,keja_directory_listings!inner(title,department,owner_id,contact_name,contact_phone)')
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error
        if (active) {
          setUser(auth.user)
          setRequests((data ?? []) as unknown as DirectoryRequest[])
        }
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function updateRequest(request: DirectoryRequest, status: DirectoryRequest['status'], providerResponse?: string) {
    setBusy(request.id)
    setMessage('')
    const update = providerResponse === undefined
      ? { status }
      : { status, provider_response: providerResponse.trim() }
    const { error } = await supabase.from('keja_directory_requests').update(update).eq('id', request.id)
    if (error) setMessage(getErrorMessage(error))
    else {
      setRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, ...update }
        : item))
      setReplies((current) => ({ ...current, [request.id]: '' }))
    }
    setBusy(null)
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><Link href="/" className="font-bold text-emerald-900">MTAA</Link><nav className="flex gap-4 text-sm"><Link href="/directory" className="text-slate-600 hover:text-emerald-800">Directory</Link><Link href="/dashboard/listings" className="text-slate-600 hover:text-emerald-800">My listings</Link><Link href="/notifications" className="text-slate-600 hover:text-emerald-800">Notifications</Link><Link href="/dashboard/orders" className="text-slate-600 hover:text-emerald-800">Orders & stays</Link></nav></div></header>
    <section className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-3xl font-extrabold">Department requests</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Respond to inquiries for healthcare, education, transport, agriculture, events and business listings. Agree on service details, safety and payment directly with the provider.</p>
      {message && <p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
      {loading ? <p className="py-12 text-center text-slate-600">Loading requests…</p> : !user ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Sign in to continue.</p>
        : requests.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-600">No department requests yet. Browse the <Link href="/directory" className="font-semibold text-emerald-800 underline">MTAA directory</Link> to send or receive a request.</p>
          : <div className="mt-6 space-y-4">{requests.map((request) => {
            const isProvider = request.keja_directory_listings.owner_id === user.id
            return <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-emerald-800">{request.keja_directory_listings.department} · {isProvider ? 'Provider view' : 'Your request'}</p><h2 className="mt-1 text-xl font-bold">{request.keja_directory_listings.title}</h2><p className="mt-1 text-sm text-slate-500">Requested {new Date(request.created_at).toLocaleString()} {request.requested_date ? `· Preferred date ${request.requested_date}` : ''}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{request.status}</span></div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{request.message}</p>
              {Object.keys(request.request_details ?? {}).length > 0 && <dl className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">{Object.entries(request.request_details).map(([key, value]) => <div key={key}><dt className="font-semibold capitalize text-slate-600">{key.replaceAll('_', ' ')}</dt><dd className="mt-0.5 break-words">{String(value).replaceAll('_', ' ')}</dd></div>)}</dl>}
              {request.provider_response && <div className="mt-4 rounded-lg bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-900">Provider reply</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.provider_response}</p></div>}
              {isProvider && ['pending', 'responded'].includes(request.status) && <div className="mt-4 space-y-3">
                <label className="block text-sm font-semibold">Reply<textarea maxLength={2000} rows={3} value={replies[request.id] ?? ''} onChange={(event) => setReplies((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Share availability, next steps or a quote. Avoid requesting sensitive personal information." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <div className="flex flex-wrap gap-2"><button disabled={busy === request.id || (replies[request.id] ?? '').trim().length < 1} onClick={() => void updateRequest(request, 'responded', replies[request.id])} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Send reply</button>{request.status === 'responded' && <><button disabled={busy === request.id} onClick={() => void updateRequest(request, 'accepted')} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-900 disabled:opacity-50">Accept request</button><button disabled={busy === request.id} onClick={() => void updateRequest(request, 'declined')} className="rounded-lg border border-rose-700 px-4 py-2 text-sm font-bold text-rose-800 disabled:opacity-50">Decline</button></>}</div>
              </div>}
              {!isProvider && request.status === 'pending' && <button disabled={busy === request.id} onClick={() => void updateRequest(request, 'cancelled')} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel request</button>}
              {isProvider && <p className="mt-4 text-xs text-slate-500">For follow-up, contact the requester using the public details on the listing. Do not share private account information.</p>}
            </article>
          })}</div>}
    </section>
  </main>
}
