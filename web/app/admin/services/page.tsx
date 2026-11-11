'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { getHomeServiceCategoryLabel } from '@/lib/homeServices'
import { supabase } from '@/lib/supabase'

interface Provider {
  id: string
  user_id: string
  business_name: string
  category: string
  description: string
  contact_phone: string
  county: string
  town: string
  service_areas: string[]
  verification_status: 'pending' | 'verified' | 'rejected' | 'suspended'
  created_at: string
}

interface ProviderReview {
  id: string
  provider_id: string
  author_id: string
  rating: number
  body: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function AdminServicesPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [reviews, setReviews] = useState<ProviderReview[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!authData.user) {
          if (active) setAuthorized(false)
          return
        }
        const { data: role, error: roleError } = await supabase.from('platform_user_roles')
          .select('role')
          .eq('user_id', authData.user.id)
          .eq('role', 'admin')
          .maybeSingle()
        if (roleError) throw roleError
        if (!role) {
          if (active) setAuthorized(false)
          return
        }
        if (active) setAuthorized(true)
        const [{ data, error }, { data: reviewRows, error: reviewError }] = await Promise.all([
          supabase.from('service_providers')
            .select('id,user_id,business_name,category,description,contact_phone,county,town,service_areas,verification_status,created_at')
            .order('created_at', { ascending: false }),
          supabase.from('service_provider_reviews')
            .select('id,provider_id,author_id,rating,body,status,created_at')
            .order('created_at', { ascending: false }),
        ])
        if (error) throw error
        if (reviewError) throw reviewError
        if (active) {
          setProviders((data ?? []) as Provider[])
          setReviews((reviewRows ?? []) as ProviderReview[])
        }
      } catch (error) {
        console.error('Could not load service provider review queue:', error)
        if (active) setMessage(`Could not load review queue: ${getErrorMessage(error)}`)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function setStatus(providerId: string, status: Provider['verification_status']) {
    setUpdating(providerId)
    setMessage('')
    try {
      const { error } = await supabase.from('service_providers')
        .update({ verification_status: status })
        .eq('id', providerId)
        .select('id')
        .single()
      if (error) throw error
      setProviders((current) => current.map((provider) => provider.id === providerId
        ? { ...provider, verification_status: status }
        : provider))
      setMessage(`Provider marked ${status}.`)
    } catch (error) {
      console.error('Could not update provider verification:', error)
      setMessage(`Could not update provider: ${getErrorMessage(error)}`)
    } finally {
      setUpdating(null)
    }
  }

  async function moderateReview(review: ProviderReview, status: 'approved' | 'rejected') {
    setUpdating(review.id)
    setMessage('')
    try {
      const { error } = await supabase.from('service_provider_reviews')
        .update({ status }).eq('id', review.id).select('id').single()
      if (error) throw error
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, status } : item))
      setMessage(`Provider review ${status}.`)
    } catch (error) {
      console.error('Could not moderate provider review:', error)
      setMessage(`Could not update review: ${getErrorMessage(error)}`)
    } finally {
      setUpdating(null)
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-xl font-bold text-blue-700">MTAA Admin</Link>
          <Link href="/admin/reviews" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Review center</Link>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-9">
        <h1 className="text-3xl font-extrabold">Home services review center</h1>
        <p className="mt-2 text-slate-600">Review provider details and moderate reviews before they are publicly visible.</p>
        {message && <p role="status" className="mt-5 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">{message}</p>}
        {loading ? <p className="py-12 text-center text-slate-600">Loading provider profiles…</p>
          : authorized !== true ? <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Sign in with an administrator account to review provider profiles.</div>
            : providers.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-slate-600">No provider profiles have been submitted.</p>
              : <div className="mt-6 space-y-4">{providers.map((provider) => <article key={provider.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-wide text-emerald-700">{getHomeServiceCategoryLabel(provider.category)}</p><h2 className="mt-1 text-xl font-bold">{provider.business_name}</h2><p className="mt-1 text-sm text-slate-600">{provider.town}, {provider.county} · {provider.contact_phone}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{provider.verification_status}</span></div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{provider.description}</p>
                {provider.service_areas.length > 0 && <p className="mt-3 text-xs text-slate-500">Service areas: {provider.service_areas.join(', ')}</p>}
                <p className="mt-3 text-xs text-slate-500">Account: {provider.user_id} · Submitted {new Date(provider.created_at).toLocaleDateString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={updating === provider.id} onClick={() => void setStatus(provider.id, 'verified')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify</button>
                  <button type="button" disabled={updating === provider.id} onClick={() => void setStatus(provider.id, 'rejected')} className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Reject</button>
                  {provider.verification_status === 'verified' && <button type="button" disabled={updating === provider.id} onClick={() => void setStatus(provider.id, 'suspended')} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Suspend</button>}
                </div>
              </article>)}</div>}
        {authorized && <section className="mt-10"><h2 className="text-2xl font-bold">Provider review moderation</h2>{reviews.length === 0 ? <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No customer reviews submitted.</p> : <div className="mt-4 space-y-3">{reviews.map((review) => <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{providers.find((provider) => provider.id === review.provider_id)?.business_name ?? review.provider_id}</p><span className="text-sm capitalize text-slate-600">{review.status} · {'★'.repeat(review.rating)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{review.body}</p><p className="mt-2 text-xs text-slate-500">Author {review.author_id} · {new Date(review.created_at).toLocaleDateString()}</p>{review.status === 'pending' && <div className="mt-3 flex gap-2"><button type="button" disabled={updating === review.id} onClick={() => void moderateReview(review, 'approved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={updating === review.id} onClick={() => void moderateReview(review, 'rejected')} className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Reject</button></div>}</article>)}</div>}</section>}
      </section>
    </main>
  )
}
