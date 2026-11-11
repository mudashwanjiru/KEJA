'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSubscriptionErrorMessage } from '@/lib/subscription'
import { getErrorMessage } from '@/lib/errors'
import {
  getStallMediaValidationError,
  MAX_STALL_MEDIA_FILES,
  uploadStallMedia,
} from '@/lib/stallMedia'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import KejaMap from '@/lib/KejaMap'

export default function PostStallPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [subscriptionActive, setSubscriptionActive] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [stallNumber, setStallNumber] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [sizeSqft, setSizeSqft] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('General')
  const [description, setDescription] = useState('')
  const [county, setCounty] = useState('')
  const [town, setTown] = useState('')
  const [ward, setWard] = useState('')
  const [mapPoint, setMapPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [wardOptions, setWardOptions] = useState<string[]>([])
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [pendingMediaStallId, setPendingMediaStallId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let active = true
    async function loadWardOptions() {
      if (!county) {
        setWardOptions([])
        return
      }
      const { data, error } = await supabase.from('keja_ward_reference')
        .select('ward').eq('county', county).order('ward').limit(1000)
      if (error) {
        if (active) setMessage(`Could not load ward reference data: ${getErrorMessage(error)}`)
        return
      }
      if (active) setWardOptions([...new Set((data ?? []).map((row) => row.ward))])
    }
    void loadWardOptions()
    return () => { active = false }
  }, [county])

  useEffect(() => {
    let isMounted = true

    const loadPostingAccess = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!session) return

        if (isMounted) setUserId(session.user.id)
        const { data, error } = await supabase
          .from('subscriptions')
          .select('active_until')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (error) throw error

        const activeUntil = data?.active_until
        if (isMounted) {
          setSubscriptionActive(Boolean(activeUntil && new Date(activeUntil).getTime() > Date.now()))
        }
      } catch (error) {
        if (isMounted) setAccessError(getSubscriptionErrorMessage(error))
      } finally {
        if (isMounted) setCheckingAccess(false)
      }
    }

    void loadPostingAccess()
    return () => { isMounted = false }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !subscriptionActive) {
      setHasError(true)
      setMessage('An active subscription and signed-in account are required to post.')
      return
    }
    const mediaValidationError = getStallMediaValidationError(mediaFiles)
    if (mediaValidationError) {
      setHasError(true)
      setMessage(mediaValidationError)
      return
    }
    setSubmitting(true)
    setMessage('')
    setHasError(false)
    let createdStallId: string | null = null

    try {
      const { error: landlordError } = await supabase
        .from('landlords')
        .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
      if (landlordError) throw landlordError

      const { data: stall, error } = await supabase.from('stalls').insert({
        property_id: null,
        stall_number: stallNumber.trim(),
        monthly_rent: Number(monthlyRent),
        size_sqft: sizeSqft ? Number(sizeSqft) : null,
        location_label: [location.trim(), ward.trim()].filter(Boolean).join(', '),
        county,
        town: town.trim(),
        ward: ward.trim() || null,
        latitude: mapPoint?.latitude ?? null,
        longitude: mapPoint?.longitude ?? null,
        category,
        description: description.trim(),
        status: 'vacant',
        owner_id: userId,
        review_status: 'pending',
      }).select('id').single()

      if (error) {
        if (/row-level security|violates.*policy/i.test(error.message)) {
          setMessage('An active subscription is required to post. Check your subscription status and try again.')
        } else if (/could not find.*owner_id.*schema cache/i.test(error.message)) {
          setMessage('The stalls table is missing owner_id. Run the landlord access migration in Supabase first.')
        } else {
          setMessage(`Could not post stall: ${error.message}`)
        }
        setHasError(true)
        return
      }

      createdStallId = stall.id
      setPendingMediaStallId(stall.id)
      await uploadStallMedia(userId, stall.id, mediaFiles)
      setPendingMediaStallId(null)
      setMessage('Submitted for review. Your listing will appear after it is approved.')
      setStallNumber('')
      setMonthlyRent('')
      setSizeSqft('')
      setLocation('')
      setCategory('General')
      setDescription('')
      setCounty('')
      setTown('')
      setMapPoint(null)
      setMediaFiles([])
    } catch (error) {
      setHasError(true)
      setMessage(createdStallId
        ? `Your stall was submitted, but its photos/videos could not be uploaded: ${getErrorMessage(error)}`
        : `Could not post stall: ${getErrorMessage(error)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const retryMediaUpload = async () => {
    if (!userId || !pendingMediaStallId) return
    setSubmitting(true)
    setMessage('')
    setHasError(false)
    try {
      await uploadStallMedia(userId, pendingMediaStallId, mediaFiles)
      setPendingMediaStallId(null)
      setMediaFiles([])
      setMessage('Photos and videos uploaded successfully.')
    } catch (error) {
      setHasError(true)
      setMessage(`Could not upload photos/videos: ${getErrorMessage(error)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <Link href="/" className="text-sm font-medium text-slate-700 hover:text-blue-700">Browse stalls</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase text-blue-700">Landlord listings</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Post a commercial stall</h1>
          <p className="mt-3 text-slate-600">Sign in and maintain an active KES 1,000 monthly subscription to submit listings for review.</p>
        </div>

        {checkingAccess ? (
          <p className="mt-8 text-slate-600">Checking posting access...</p>
        ) : !userId ? (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="text-slate-700">Sign in or register to continue.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
              Sign in or register
            </Link>
          </div>
        ) : !subscriptionActive ? (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="text-slate-700">Subscribe to submit stalls for review.</p>
            {accessError && <p role="alert" className="mt-3 text-sm text-red-700">{accessError}</p>}
            <Link href="/dashboard/billing" className="mt-4 inline-block rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
              View subscription
            </Link>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-5 border-t border-slate-200 pt-6">
          {message && (
            <p
              role={hasError ? 'alert' : 'status'}
              className={`rounded-md px-4 py-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
            >
              {message}
            </p>
          )}

          <div>
            <label htmlFor="stall-number" className="mb-1 block text-sm font-semibold">Stall / unit number</label>
            <input
              id="stall-number"
              type="text"
              maxLength={80}
              placeholder="e.g. Stall B-04"
              value={stallNumber}
              onChange={(event) => setStallNumber(event.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="monthly-rent" className="mb-1 block text-sm font-semibold">Monthly rent (KES)</label>
              <input
                id="monthly-rent"
                type="number"
                min="1"
                step="any"
                placeholder="e.g. 15000"
                value={monthlyRent}
                onChange={(event) => setMonthlyRent(event.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="size-sqft" className="mb-1 block text-sm font-semibold">Size (sq. ft., optional)</label>
              <input
                id="size-sqft"
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 120"
                value={sizeSqft}
                onChange={(event) => setSizeSqft(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="stall-county" className="mb-1 block text-sm font-semibold">County</label>
              <select id="stall-county" value={county} onChange={(event) => { setCounty(event.target.value); setWard('') }} required className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">Select county</option>
                {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="stall-town" className="mb-1 block text-sm font-semibold">Town / city</label>
              <input
                id="stall-town"
                type="text"
                maxLength={120}
                placeholder="e.g. Nairobi"
                value={town}
                onChange={(event) => setTown(event.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="stall-ward" className="mb-1 block text-sm font-semibold">Ward (optional)</label>
              <input id="stall-ward" type="text" list="keja-stall-ward-options" maxLength={120} placeholder={wardOptions.length ? 'Select or enter ward' : 'Enter ward'} value={ward} onChange={(event) => setWard(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              <datalist id="keja-stall-ward-options">{wardOptions.map((option) => <option key={option} value={option} />)}</datalist>
            </div>
            <div>
              <label htmlFor="stall-location" className="mb-1 block text-sm font-semibold">Estate / market / area</label>
              <input
                id="stall-location"
                type="text"
                maxLength={160}
                placeholder="e.g. Gikomba Market"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="stall-category" className="mb-1 block text-sm font-semibold">Business category</label>
              <select
                id="stall-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option>General</option>
                <option>Fashion &amp; Apparel</option>
                <option>Electronics</option>
                <option>Food &amp; Beverage</option>
                <option>Beauty &amp; Wellness</option>
              </select>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Approximate map pin (optional)</h2>
            <p className="mt-1 text-sm text-slate-600">Click near the stall on the map. The public map rounds the location to protect privacy.</p>
            <KejaMap selectable selectedPoint={mapPoint} onPointSelect={setMapPoint} className="mt-3 h-72" />
            {mapPoint && <p className="mt-2 text-xs text-slate-500">Pin selected: {mapPoint.latitude.toFixed(5)}, {mapPoint.longitude.toFixed(5)}</p>}
            {mapPoint && <button type="button" onClick={() => setMapPoint(null)} className="mt-2 text-xs font-semibold text-rose-700 underline">Remove map pin</button>}
          </section>

          <div>
            <label htmlFor="stall-description" className="mb-1 block text-sm font-semibold">Description</label>
            <textarea
              id="stall-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Describe the space, its frontage, foot traffic, or nearby amenities."
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="stall-media" className="mb-1 block text-sm font-semibold">Photos and videos (up to {MAX_STALL_MEDIA_FILES}, 50 MB each)</label>
            <input
              id="stall-media"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                const validationError = getStallMediaValidationError(files)
                setMediaFiles(validationError ? [] : files)
                if (validationError) {
                  setHasError(true)
                  setMessage(validationError)
                }
              }}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            {mediaFiles.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {mediaFiles.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</li>)}
              </ul>
            )}
          </div>

          {pendingMediaStallId && (
            <button type="button" onClick={() => void retryMediaUpload()} disabled={submitting} className="rounded-md border border-blue-700 px-5 py-3 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">
              Retry media upload
            </button>
          )}

          <button
            type="submit"
            disabled={submitting || Boolean(pendingMediaStallId)}
            className="rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Posting...' : 'Post stall'}
          </button>
        </form>
        )}
      </section>
    </main>
  )
}