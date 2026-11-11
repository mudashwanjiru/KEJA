'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface Listing {
  id: string
  department: string
  title: string
  category: string
  description: string
  county: string
  town: string
  contact_name: string
  contact_phone: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function DirectoryModerationPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!authData.user) {
          if (active) setIsAdmin(false)
          return
        }
        const { data: role, error: roleError } = await supabase.from('platform_user_roles')
          .select('role').eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle()
        if (roleError) throw roleError
        if (!role) {
          if (active) setIsAdmin(false)
          return
        }
        const { data, error } = await supabase.from('keja_directory_listings')
          .select('id,department,title,category,description,county,town,contact_name,contact_phone,status,created_at')
          .order('created_at', { ascending: false }).limit(300)
        if (error) throw error
        if (active) {
          setIsAdmin(true)
          setListings((data ?? []) as Listing[])
        }
      } catch (error) {
        console.error('Could not load directory moderation queue:', error)
        if (active) {
          setNotice(`Could not load moderation queue: ${getErrorMessage(error)}`)
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [refresh])

  async function moderate(listingId: string, status: 'approved' | 'rejected') {
    setBusyId(listingId)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('keja_directory_listings').update({ status }).eq('id', listingId)
      if (error) throw error
      setNotice(`Listing ${status}.`)
      setRefresh((current) => current + 1)
    } catch (error) {
      console.error('Could not moderate directory listing:', error)
      setNotice(`Could not update listing: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setBusyId('')
    }
  }

  return <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
    <header className="border-b border-slate-200 bg-white"><nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-black text-emerald-950">MTAA Admin</Link><Link href="/directory" className="text-sm font-bold text-emerald-800 hover:underline">Directory</Link></nav></header>
    <section className="mx-auto max-w-6xl px-5 py-9 sm:py-12">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">Trust & safety</p><h1 className="mt-2 text-3xl font-black">Directory moderation</h1><p className="mt-2 text-slate-600">Review submissions before they are visible to the public.</p>
      {notice && <p role={isError ? 'alert' : 'status'} className={`mt-5 rounded-xl p-4 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{notice}</p>}
      {loading ? <p className="mt-6 rounded-xl bg-white p-8 text-center text-slate-600">Loading review queue…</p>
        : !isAdmin ? <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">Administrator access is required.</p>
          : listings.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No directory listings to review.</p>
            : <div className="mt-6 space-y-4">{listings.map((listing) => <article key={listing.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">{listing.department.replaceAll('_', ' ')} · {listing.category}</p><h2 className="mt-1 text-xl font-bold">{listing.title}</h2><p className="mt-1 text-sm text-slate-600">{listing.town}, {listing.county} · {listing.contact_name} · {listing.contact_phone}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${listing.status === 'approved' ? 'bg-emerald-100 text-emerald-900' : listing.status === 'rejected' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>{listing.status}</span></div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{listing.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">{listing.status !== 'approved' && <button type="button" disabled={busyId === listing.id} onClick={() => void moderate(listing.id, 'approved')} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve</button>}{listing.status !== 'rejected' && <button type="button" disabled={busyId === listing.id} onClick={() => void moderate(listing.id, 'rejected')} className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-800 disabled:opacity-50">Reject</button>}</div>
            </article>)}</div>}
    </section>
  </main>
}
