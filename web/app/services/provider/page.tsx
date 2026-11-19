'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage } from '@/lib/errors'
import { HOME_SERVICE_CATEGORIES } from '@/lib/homeServices'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import {
  addSignedPostMedia,
  getPostMediaValidationError,
  MAX_POST_MEDIA_FILES,
  PostMediaGallery,
  PostMediaPicker,
  uploadPostMedia,
  type PostMediaItem,
} from '@/lib/postMedia'
import { supabase } from '@/lib/supabase'

interface ProviderProfile {
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
  verification_status: string
}

interface ServiceRequest {
  id: string
  requester_name: string
  contact_phone: string
  county: string
  town: string
  details: string
  pickup_location: string | null
  destination: string | null
  moving_date: string | null
  transport_type: string | null
  load_details: string | null
  status: 'pending' | 'contacted' | 'accepted' | 'declined' | 'completed'
  created_at: string
}

export default function ServiceProviderWorkspace() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ProviderProfile | null>(null)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyRequest, setBusyRequest] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState('plumbing')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [county, setCounty] = useState('')
  const [town, setTown] = useState('')
  const [serviceAreas, setServiceAreas] = useState('')
  const [startingPrice, setStartingPrice] = useState('')
  const [experience, setExperience] = useState('0')
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [profileMedia, setProfileMedia] = useState<PostMediaItem[]>([])
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)

  const loadProfile = useCallback(async (userId: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('service_providers')
        .select('id,business_name,category,description,contact_phone,county,town,service_areas,starting_price,years_experience,verification_status')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      const provider = data as ProviderProfile | null
      setProfile(provider)
      if (provider) {
        const { data: mediaRows, error: mediaError } = await supabase.from('public_post_media')
          .select('id,provider_id,storage_path,media_type,mime_type,position')
          .eq('provider_id', provider.id)
          .order('position')
        if (mediaError) throw mediaError
        setProfileMedia(await addSignedPostMedia((mediaRows ?? []) as PostMediaItem[]))
        setBusinessName(provider.business_name)
        setCategory(provider.category)
        setDescription(provider.description)
        setPhone(provider.contact_phone)
        setCounty(provider.county)
        setTown(provider.town)
        setServiceAreas(provider.service_areas.join(', '))
        setStartingPrice(provider.starting_price === null ? '' : String(provider.starting_price))
        setExperience(String(provider.years_experience))
        const { data: requestRows, error: requestsError } = await supabase.from('service_requests')
          .select('id,requester_name,contact_phone,county,town,details,pickup_location,destination,moving_date,transport_type,load_details,status,created_at')
          .eq('provider_id', provider.id)
          .order('created_at', { ascending: false })
        if (requestsError) throw requestsError
        setRequests((requestRows ?? []) as ServiceRequest[])
      } else {
        setRequests([])
        setProfileMedia([])
      }
    } catch (error) {
      console.error('Could not load service provider workspace:', error)
      setNotice(`Could not load your provider profile: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        if (active) {
          setUser(data.user)
          if (data.user) void loadProfile(data.user.id)
        }
      } catch (error) {
        console.error('Could not check provider sign-in:', error)
        if (active) {
          setNotice(`Could not check sign-in status: ${getErrorMessage(error)}`)
          setIsError(true)
        }
      } finally {
        if (active) setChecking(false)
      }
    }
    void checkSession()
    return () => { active = false }
  }, [loadProfile])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const mediaValidationError = getPostMediaValidationError(mediaFiles)
    if (mediaValidationError) {
      setNotice(mediaValidationError)
      setIsError(true)
      return
    }
    if (profileMedia.length + mediaFiles.length > MAX_POST_MEDIA_FILES) {
      setNotice(`This profile already has ${profileMedia.length} media files; choose no more than ${MAX_POST_MEDIA_FILES - profileMedia.length} additional files.`)
      setIsError(true)
      return
    }
    setSaving(true)
    setNotice('')
    setIsError(false)
    const values = {
      business_name: businessName.trim(),
      category,
      description: description.trim(),
      contact_phone: phone.trim(),
      county,
      town: town.trim(),
      service_areas: [...new Set(serviceAreas.split(',').map((area) => area.trim()).filter(Boolean))].slice(0, 30),
      starting_price: startingPrice ? Number(startingPrice) : null,
      years_experience: Number(experience),
    }
    let savedProviderId = profile?.id ?? null
    let profileSaved = false
    try {
      if (profile) {
        const { error } = await supabase.from('service_providers').update(values).eq('id', profile.id)
        if (error) throw error
        profileSaved = true
      } else {
        const { data, error } = await supabase.from('service_providers')
          .insert({ ...values, user_id: user.id })
          .select('id')
          .single()
        if (error) throw error
        if (!data) throw new Error('Provider profile was not returned after saving.')
        savedProviderId = data.id
        profileSaved = true
      }
      if (savedProviderId) {
        await uploadPostMedia(user.id, { column: 'provider_id', id: savedProviderId }, mediaFiles)
      }
      setMediaFiles([])
      await loadProfile(user.id)
      setNotice(profile
        ? profile.verification_status === 'verified'
          ? 'Provider profile updated and returned to pending review.'
          : 'Provider profile updated.'
        : 'Profile submitted for verification. It will appear publicly after approval.')
    } catch (error) {
      console.error('Could not save provider profile:', error)
      setNotice(profileSaved
        ? `Your profile was saved, but its photos/videos could not be uploaded: ${getErrorMessage(error)}`
        : `Could not save your profile: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  async function updateRequest(requestId: string, status: ServiceRequest['status']) {
    setBusyRequest(requestId)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('service_requests')
        .update({ status })
        .eq('id', requestId)
        .select('id')
        .single()
      if (error) throw error
      setRequests((current) => current.map((request) => request.id === requestId ? { ...request, status } : request))
      setNotice('Service request updated.')
    } catch (error) {
      console.error('Could not update service request:', error)
      setNotice(`Could not update request: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setBusyRequest(null)
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/services" className="text-xl font-bold text-blue-700">MTAA Services</Link>
          <div className="flex gap-4 text-sm">
            <Link href="/services" className="font-medium text-slate-600 hover:text-blue-700">Browse services</Link>
            <Link href="/dashboard" className="font-medium text-slate-600 hover:text-blue-700">Account</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-9 sm:py-12">
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Provider workspace</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Your home-services profile</h1>
        <p className="mt-2 text-slate-600">Tell customers what you do and where you work. New profiles are reviewed before appearing publicly.</p>
        {notice && <p role={isError ? 'alert' : 'status'} className={`mt-5 rounded-lg p-4 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{notice}</p>}
        {checking ? <p className="py-12 text-center text-slate-600">Checking sign-in…</p>
          : !user ? <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Sign in to offer services</h2><p className="mt-2 text-sm text-slate-600">Create an account or sign in to create your provider profile and manage customer requests.</p><Link href="/dashboard" className="mt-4 inline-flex rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">Sign in or register</Link></section>
            : <div className="mt-7 grid gap-8">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-xl font-bold">{profile ? 'Edit your profile' : 'Create a provider profile'}</h2><p className="mt-1 text-sm text-slate-600">Keep your information accurate so customers know who they are contacting.</p></div>
                  {profile && <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${profile.verification_status === 'verified' ? 'bg-emerald-100 text-emerald-800' : profile.verification_status === 'rejected' || profile.verification_status === 'suspended' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{profile.verification_status}</span>}
                </div>
                <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Business / provider name<input required minLength={2} maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="text-sm font-semibold">Service category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">{HOME_SERVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="text-sm font-semibold">County<select required value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="">Select county</option>{KENYA_COUNTIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className="text-sm font-semibold">Town / city<input required maxLength={120} value={town} onChange={(event) => setTown(event.target.value)} placeholder="e.g. Nakuru" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="text-sm font-semibold">Contact phone<input required type="tel" minLength={7} maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="text-sm font-semibold">Starting price (KSh, optional)<input type="number" min="0" value={startingPrice} onChange={(event) => setStartingPrice(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="text-sm font-semibold">Years of experience<input type="number" min="0" max="80" required value={experience} onChange={(event) => setExperience(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="text-sm font-semibold sm:col-span-2">Other towns / areas served (comma separated)<input value={serviceAreas} onChange={(event) => setServiceAreas(event.target.value)} placeholder="Naivasha, Gilgil, Njoro" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  <label className="text-sm font-semibold sm:col-span-2">Describe your services<textarea required minLength={20} maxLength={3000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the work you do, your availability, and any relevant experience." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                  {profileMedia.length > 0 && <div className="sm:col-span-2"><p className="mb-2 text-sm font-semibold">Current photos and videos</p><PostMediaGallery items={profileMedia} /></div>}
                  <div className="sm:col-span-2">
                    <PostMediaPicker files={mediaFiles} onChange={(files, error) => {
                      setMediaFiles(files)
                      if (error) {
                        setNotice(error)
                        setIsError(true)
                      }
                    }} />
                  </div>
                  <button disabled={saving || loading} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60 sm:col-span-2">{saving ? 'Saving profile…' : profile ? 'Save profile' : 'Submit for verification'}</button>
                </form>
              </section>

              {profile && <section>
                <div className="mb-4"><h2 className="text-2xl font-bold">Customer requests</h2><p className="mt-1 text-sm text-slate-600">Customer contact information is private to you and the customer.</p></div>
                {loading ? <p className="rounded-xl bg-white p-6 text-slate-600">Loading requests…</p>
                  : requests.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No customer requests yet.</p>
                    : <div className="space-y-4">{requests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{request.requester_name}</h3><p className="mt-1 text-sm text-slate-600">{request.town}, {request.county} · {new Date(request.created_at).toLocaleDateString()}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold capitalize text-amber-800">{request.status}</span></div>
                      {request.pickup_location && request.destination && <dl className="mt-4 grid gap-3 rounded-lg bg-emerald-50 p-4 text-sm sm:grid-cols-2">
                        <div><dt className="font-semibold text-emerald-900">Pickup</dt><dd className="mt-0.5 text-slate-700">{request.pickup_location} · {request.town}, {request.county}</dd></div>
                        <div><dt className="font-semibold text-emerald-900">Destination</dt><dd className="mt-0.5 text-slate-700">{request.destination}</dd></div>
                        {request.moving_date && <div><dt className="font-semibold text-emerald-900">Moving date</dt><dd className="mt-0.5 text-slate-700">{new Date(`${request.moving_date}T00:00:00`).toLocaleDateString('en-KE')}</dd></div>}
                        {request.transport_type && <div><dt className="font-semibold text-emerald-900">Transport</dt><dd className="mt-0.5 capitalize text-slate-700">{request.transport_type}</dd></div>}
                        {request.load_details && <div className="sm:col-span-2"><dt className="font-semibold text-emerald-900">Load details</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{request.load_details}</dd></div>}
                      </dl>}
                      {request.details && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.details}</p>}<p className="mt-3 text-sm">Phone: <a href={`tel:${request.contact_phone}`} className="font-semibold text-blue-700 underline">{request.contact_phone}</a></p>
                      {['pending', 'contacted', 'accepted'].includes(request.status) && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyRequest === request.id} onClick={() => void updateRequest(request.id, 'contacted')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Mark contacted</button><button type="button" disabled={busyRequest === request.id} onClick={() => void updateRequest(request.id, 'accepted')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Accept</button><button type="button" disabled={busyRequest === request.id} onClick={() => void updateRequest(request.id, 'declined')} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Decline</button><button type="button" disabled={busyRequest === request.id} onClick={() => void updateRequest(request.id, 'completed')} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">Mark complete</button></div>}
                    </article>)}</div>}
              </section>}
            </div>}
      </div>
    </main>
  )
}
