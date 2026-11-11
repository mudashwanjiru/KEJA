'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage } from '@/lib/errors'
import { getHomeServiceCategoryLabel } from '@/lib/homeServices'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { supabase } from '@/lib/supabase'

interface Provider {
  id: string
  business_name: string
  category: string
  description: string
  contact_phone: string
  county: string
  town: string
  service_areas: string[]
  starting_price: number | null
  years_experience: number
}

interface ProviderReview {
  id: string
  rating: number
  body: string
  created_at: string
}

interface CompletedServiceRequest {
  id: string
  created_at: string
}

const TRANSPORT_TYPES = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'van', label: 'Van' },
  { value: 'canter', label: 'Canter' },
  { value: 'lorry', label: 'Lorry' },
  { value: 'other', label: 'Other / not sure' },
]

function ServiceProviderDetail() {
  const { id } = useParams<{ id: string }>()
  const [provider, setProvider] = useState<Provider | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [county, setCounty] = useState('')
  const [town, setTown] = useState('')
  const [details, setDetails] = useState('')
  const [pickupLocation, setPickupLocation] = useState('')
  const [destination, setDestination] = useState('')
  const [movingDate, setMovingDate] = useState('')
  const [transportType, setTransportType] = useState('')
  const [loadDetails, setLoadDetails] = useState('')
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [reviews, setReviews] = useState<ProviderReview[]>([])
  const [completedRequests, setCompletedRequests] = useState<CompletedServiceRequest[]>([])
  const [reviewedRequestIds, setReviewedRequestIds] = useState<Set<string>>(new Set())
  const [reviewRequestId, setReviewRequestId] = useState('')
  const [reviewRating, setReviewRating] = useState('5')
  const [reviewBody, setReviewBody] = useState('')
  const isMovingService = provider?.category === 'moving' || provider?.category === 'relocation'

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const [{ data, error }, { data: authData, error: authError }, { data: reviewRows, error: reviewError }] = await Promise.all([
          supabase.from('service_providers')
            .select('id,business_name,category,description,contact_phone,county,town,service_areas,starting_price,years_experience')
            .eq('id', id)
            .eq('verification_status', 'verified')
            .maybeSingle(),
          supabase.auth.getUser(),
          supabase.from('service_provider_reviews').select('id,rating,body,created_at')
            .eq('provider_id', id).eq('status', 'approved').order('created_at', { ascending: false }),
        ])
        if (error) throw error
        if (authError) throw authError
        if (reviewError) throw reviewError
        if (active) {
          setProvider(data as Provider | null)
          setUser(authData.user)
          setReviews((reviewRows ?? []) as ProviderReview[])
        }
        if (authData.user && data) {
          const [{ data: requestRows, error: requestError }, { data: ownReviewRows, error: ownReviewsError }] = await Promise.all([
            supabase.from('service_requests').select('id,created_at')
              .eq('provider_id', id).eq('requester_id', authData.user.id).eq('status', 'completed').order('created_at', { ascending: false }),
            supabase.from('service_provider_reviews').select('service_request_id')
              .eq('provider_id', id).eq('author_id', authData.user.id),
          ])
          if (requestError) throw requestError
          if (ownReviewsError) throw ownReviewsError
          if (active) {
            setCompletedRequests((requestRows ?? []) as CompletedServiceRequest[])
            const reviewed = new Set((ownReviewRows ?? []).map((review) => review.service_request_id as string))
            setReviewedRequestIds(reviewed)
            setReviewRequestId((requestRows ?? []).find((request) => !reviewed.has(request.id))?.id ?? '')
          }
        }
      } catch (error) {
        console.error('Could not load service provider:', error)
        if (active) {
          setNotice(`Could not load provider profile: ${getErrorMessage(error)}`)
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadProfile()
    return () => { active = false }
  }, [id])

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!provider || !user) return
    if (isMovingService) {
      const now = new Date()
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      if (movingDate < today) {
        setNotice('Choose today or a future date for the move.')
        setIsError(true)
        return
      }
    }
    setSending(true)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('service_requests').insert({
        provider_id: provider.id,
        requester_id: user.id,
        requester_name: name.trim(),
        contact_phone: phone.trim(),
        county,
        town: town.trim(),
        details: isMovingService && !details.trim()
          ? `Move from ${pickupLocation.trim()} to ${destination.trim()}.`
          : details.trim(),
        ...(isMovingService ? {
          pickup_location: pickupLocation.trim(),
          destination: destination.trim(),
          moving_date: movingDate,
          transport_type: transportType,
          load_details: loadDetails.trim(),
        } : {}),
      })
      if (error) throw error
      setNotice('Your service request was sent. The provider can contact you using the number you gave.')
      setName('')
      setPhone('')
      setCounty('')
      setTown('')
      setDetails('')
      setPickupLocation('')
      setDestination('')
      setMovingDate('')
      setTransportType('')
      setLoadDetails('')
    } catch (error) {
      console.error('Could not send service request:', error)
      setNotice(`Could not send your request: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setSending(false)
    }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!provider || !user || !reviewRequestId) return
    setSending(true)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('service_provider_reviews').insert({
        service_request_id: reviewRequestId,
        provider_id: provider.id,
        author_id: user.id,
        rating: Number(reviewRating),
        body: reviewBody.trim(),
      })
      if (error) throw error
      setReviewedRequestIds((current) => new Set(current).add(reviewRequestId))
      setReviewBody('')
      setNotice('Review submitted for moderation. It will appear publicly after approval.')
    } catch (error) {
      console.error('Could not submit provider review:', error)
      setNotice(`Could not submit review: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/services" className="text-xl font-bold text-blue-700">MTAA Services</Link>
          <Link href="/services/provider" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Provider workspace</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <Link href="/services" className="text-sm font-semibold text-blue-700 hover:underline">&larr; Browse providers</Link>
        {loading ? <p className="py-20 text-center text-slate-600">Loading provider profile…</p>
          : !provider ? <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center"><h1 className="text-2xl font-bold">Provider not found</h1><p className="mt-2 text-slate-600">{notice || 'This profile is not available or has not been verified yet.'}</p></div>
            : <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_0.85fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Verified provider</span>
                <p className="mt-5 text-sm font-bold uppercase tracking-wider text-emerald-700">{getHomeServiceCategoryLabel(provider.category)}</p>
                <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{provider.business_name}</h1>
                <p className="mt-3 text-slate-600">{provider.town}, {provider.county}</p>
                <p className="mt-6 whitespace-pre-wrap leading-7 text-slate-700">{provider.description}</p>
                <dl className="mt-7 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <div><dt className="text-sm text-slate-500">Experience</dt><dd className="mt-1 font-semibold">{provider.years_experience} years</dd></div>
                  {provider.starting_price !== null && <div><dt className="text-sm text-slate-500">Starting price</dt><dd className="mt-1 font-semibold">KSh {Number(provider.starting_price).toLocaleString('en-KE')}</dd></div>}
                  <div><dt className="text-sm text-slate-500">Phone</dt><dd className="mt-1"><a href={`tel:${provider.contact_phone}`} className="font-semibold text-blue-700 underline">{provider.contact_phone}</a></dd></div>
                  {provider.service_areas.length > 0 && <div><dt className="text-sm text-slate-500">Other service areas</dt><dd className="mt-1 font-semibold">{provider.service_areas.join(', ')}</dd></div>}
                </dl>
                <section className="mt-7 border-t border-slate-100 pt-5">
                  <h2 className="text-lg font-bold">Customer reviews</h2>
                  {reviews.length === 0 ? <p className="mt-2 text-sm text-slate-600">No approved reviews yet.</p> : <div className="mt-3 divide-y divide-slate-100">{reviews.map((review) => <article key={review.id} className="py-3"><p className="text-amber-600">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{review.body}</p><time className="mt-1 block text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString()}</time></article>)}</div>}
                  {user && completedRequests.some((request) => !reviewedRequestIds.has(request.id)) && <form onSubmit={submitReview} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <h3 className="font-semibold">Review a completed service</h3>
                    <label className="block text-sm font-medium">Completed request<select required value={reviewRequestId} onChange={(event) => setReviewRequestId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{completedRequests.filter((request) => !reviewedRequestIds.has(request.id)).map((request) => <option key={request.id} value={request.id}>Request from {new Date(request.created_at).toLocaleDateString()}</option>)}</select></label>
                    <label className="block text-sm font-medium">Rating<select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                    <textarea required minLength={5} maxLength={1500} rows={3} value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} placeholder="Share your experience..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                    <button disabled={sending} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Submit review</button>
                  </form>}
                </section>
              </section>
              <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold">{isMovingService ? 'Request moving or delivery' : 'Request a service'}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{isMovingService ? 'Share the route, date, vehicle and load so the provider can give you a useful quote.' : 'Describe what you need and where. The provider will contact you to discuss the work and price.'}</p>
                {notice && <p role={isError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{notice}</p>}
                {user ? <form onSubmit={submitRequest} className="mt-5 space-y-4">
                  <label className="block text-sm font-semibold">Your name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="block text-sm font-semibold">Phone number<input required type="tel" autoComplete="tel" minLength={7} maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">{isMovingService ? 'Pickup county' : 'County'}<select required value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="">Select county</option>{KENYA_COUNTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label className="block text-sm font-semibold">{isMovingService ? 'Pickup town / area' : 'Town / area'}<input required maxLength={120} value={town} onChange={(event) => setTown(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  </div>
                  {isMovingService && <>
                    <label className="block text-sm font-semibold">Pickup location<input required minLength={3} maxLength={240} value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} placeholder="Estate, building, street or landmark" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                    <label className="block text-sm font-semibold">Destination<input required minLength={3} maxLength={240} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Where should the items be delivered?" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-semibold">Moving date<input required type="date" value={movingDate} onChange={(event) => setMovingDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" /></label>
                      <label className="block text-sm font-semibold">Transport type<select required value={transportType} onChange={(event) => setTransportType(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="">Select vehicle</option>{TRANSPORT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    </div>
                    <label className="block text-sm font-semibold">Load details<textarea required minLength={10} maxLength={1500} rows={3} value={loadDetails} onChange={(event) => setLoadDetails(event.target.value)} placeholder="What needs moving? Include approximate quantity, size or special handling." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                    <label className="block text-sm font-semibold">Extra instructions <span className="font-normal text-slate-500">(optional)</span><textarea maxLength={2000} rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Stairs, packing help, preferred time, or other notes" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  </>}
                  {!isMovingService && <label className="block text-sm font-semibold">What do you need?<textarea required minLength={10} maxLength={2000} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the job and when you need it…" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>}
                  <button disabled={sending} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{sending ? 'Sending request…' : 'Send service request'}</button>
                </form> : <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-700">Sign in to request this service.</p><Link href="/dashboard" className="mt-3 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">Sign in or create an account</Link></div>}
                <p className="mt-4 text-xs leading-5 text-slate-500">MTAA does not set provider prices or guarantee work. Agree on scope and payment directly with the provider.</p>
              </aside>
            </div>}
      </div>
    </main>
  )
}

export default function ServiceProviderDetailPage() {
  return <Suspense fallback={<main className="min-h-screen p-10 text-center text-slate-600">Loading provider…</main>}><ServiceProviderDetail /></Suspense>
}
