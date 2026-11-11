'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface ReviewJob {
  id: string
  title: string
  category: string
  employment_type: string
  description: string
  county: string
  town: string
  status: string
  created_at: string
}

interface ReviewPlace {
  id: string
  name: string
  category: string
  county: string
  town: string
  area: string
  description: string
  status: string
}

interface ReviewNotice {
  id: string
  title: string
  body: string
  county: string
  town: string
  event_date: string | null
  status: string
}

export default function CommunityAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [jobs, setJobs] = useState<ReviewJob[]>([])
  const [places, setPlaces] = useState<ReviewPlace[]>([])
  const [notices, setNotices] = useState<ReviewNotice[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!auth.user) {
          if (active) setAuthorized(false)
          return
        }
        const { data: role, error: roleError } = await supabase.from('platform_user_roles').select('role').eq('user_id', auth.user.id).eq('role', 'admin').maybeSingle()
        if (roleError) throw roleError
        if (!role) {
          if (active) setAuthorized(false)
          return
        }
        if (active) setAuthorized(true)
        const [{ data: jobRows, error: jobError }, { data: placeRows, error: placeError }, { data: noticeRows, error: noticeError }] = await Promise.all([
          supabase.from('property_jobs').select('id,title,category,employment_type,description,county,town,status,created_at').order('created_at', { ascending: false }),
          supabase.from('neighborhood_places').select('id,name,category,county,town,area,description,status').order('created_at', { ascending: false }),
          supabase.from('neighborhood_notices').select('id,title,body,county,town,event_date,status').order('created_at', { ascending: false }),
        ])
        if (jobError) throw jobError
        if (placeError) throw placeError
        if (noticeError) throw noticeError
        if (active) {
          setJobs((jobRows ?? []) as ReviewJob[])
          setPlaces((placeRows ?? []) as ReviewPlace[])
          setNotices((noticeRows ?? []) as ReviewNotice[])
        }
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => { active = false }
  }, [])

  async function setJobStatus(job: ReviewJob, status: 'open' | 'rejected') {
    setBusy(job.id)
    const { error } = await supabase.from('property_jobs').update({ status }).eq('id', job.id)
    if (error) setMessage(getErrorMessage(error))
    else {
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status } : item))
      setMessage(`Job marked ${status}.`)
    }
    setBusy(null)
  }

  async function setPlaceStatus(place: ReviewPlace, status: 'approved' | 'rejected') {
    setBusy(place.id)
    const { error } = await supabase.from('neighborhood_places').update({ status }).eq('id', place.id)
    if (error) setMessage(getErrorMessage(error))
    else {
      setPlaces((current) => current.map((item) => item.id === place.id ? { ...item, status } : item))
      setMessage(`Neighborhood suggestion marked ${status}.`)
    }
    setBusy(null)
  }

  async function setNoticeStatus(notice: ReviewNotice, status: 'approved' | 'rejected') {
    setBusy(notice.id)
    const { error } = await supabase.from('neighborhood_notices').update({ status }).eq('id', notice.id)
    if (error) setMessage(getErrorMessage(error))
    else {
      setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, status } : item))
      setMessage(`Notice marked ${status}.`)
    }
    setBusy(null)
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="font-bold text-blue-700">MTAA Admin</Link><Link href="/admin/services" className="text-sm text-slate-600 hover:text-blue-700">Service reviews</Link></div></header>
    <section className="mx-auto max-w-6xl px-5 py-8"><h1 className="text-3xl font-extrabold">Jobs & neighborhood moderation</h1>{message && <p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
      {loading ? <p className="py-12 text-center text-slate-600">Loading moderation queues…</p> : authorized !== true ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Sign in with an administrator account to review submissions.</p> : <>
        <section className="mt-7"><h2 className="text-2xl font-bold">Property jobs</h2><div className="mt-3 space-y-3">{jobs.filter((job) => job.status === 'pending').map((job) => <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase text-blue-700">{job.category} · {job.employment_type}</p><h3 className="mt-1 text-lg font-bold">{job.title}</h3><p className="mt-1 text-sm text-slate-600">{job.town}, {job.county}</p><p className="mt-3 whitespace-pre-wrap text-sm">{job.description}</p><div className="mt-3 flex gap-2"><button disabled={busy === job.id} onClick={() => void setJobStatus(job, 'open')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Approve & publish</button><button disabled={busy === job.id} onClick={() => void setJobStatus(job, 'rejected')} className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Reject</button></div></article>)}</div>{jobs.filter((job) => job.status === 'pending').length === 0 && <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No jobs awaiting review.</p>}</section>
        <section className="mt-8"><h2 className="text-2xl font-bold">Neighborhood suggestions</h2><div className="mt-3 space-y-3">{places.filter((place) => place.status === 'pending').map((place) => <article key={place.id} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase text-blue-700">{place.category}</p><h3 className="mt-1 text-lg font-bold">{place.name}</h3><p className="mt-1 text-sm text-slate-600">{place.area ? `${place.area}, ` : ''}{place.town}, {place.county}</p><p className="mt-3 text-sm">{place.description}</p><div className="mt-3 flex gap-2"><button disabled={busy === place.id} onClick={() => void setPlaceStatus(place, 'approved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button><button disabled={busy === place.id} onClick={() => void setPlaceStatus(place, 'rejected')} className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Reject</button></div></article>)}</div>{places.filter((place) => place.status === 'pending').length === 0 && <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No place suggestions awaiting review.</p>}</section>
        <section className="mt-8"><h2 className="text-2xl font-bold">Community notices</h2><div className="mt-3 space-y-3">{notices.filter((notice) => notice.status === 'pending').map((notice) => <article key={notice.id} className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-lg font-bold">{notice.title}</h3><p className="mt-1 text-sm text-slate-600">{notice.town}, {notice.county}{notice.event_date ? ` · ${new Date(`${notice.event_date}T00:00:00`).toLocaleDateString()}` : ''}</p><p className="mt-3 whitespace-pre-wrap text-sm">{notice.body}</p><div className="mt-3 flex gap-2"><button disabled={busy === notice.id} onClick={() => void setNoticeStatus(notice, 'approved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button><button disabled={busy === notice.id} onClick={() => void setNoticeStatus(notice, 'rejected')} className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Reject</button></div></article>)}</div>{notices.filter((notice) => notice.status === 'pending').length === 0 && <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No notices awaiting review.</p>}</section>
      </>}
    </section>
  </main>
}
