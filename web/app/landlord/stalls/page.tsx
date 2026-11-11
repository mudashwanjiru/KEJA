'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import KejaMap from '@/lib/KejaMap'
import { isListingStale, LISTING_CONFIRMATION_INTERVAL_DAYS } from '@/lib/listingFreshness'

interface Stall {
  id: string
  stall_number: string
  monthly_rent: number
  size_sqft: number | null
  status: string
  review_status: string
  location_label: string
  county: string | null
  town: string | null
  category: string
  latitude: number | null
  longitude: number | null
  last_confirmed_at: string
}

interface Inquiry {
  id: string
  stall_id: string
  applicant_id: string
  business_name: string
  contact_phone: string
  message: string
  status: 'pending' | 'contacted' | 'accepted' | 'declined'
  created_at: string
}

const formatKes = (amount: number) => `KSh ${new Intl.NumberFormat('en-KE').format(amount)}`

export default function CommercialLandlordDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loading, setLoading] = useState(false)
  const [stalls, setStalls] = useState<Stall[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [error, setError] = useState('')
  const [updatingInquiry, setUpdatingInquiry] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [pinEditingId, setPinEditingId] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<{ latitude: number; longitude: number } | null>(null)
  const [savingPin, setSavingPin] = useState(false)

  const loadDashboard = useCallback(async (ownerId: string) => {
    setLoading(true)
    setError('')
    try {
      const { data: stallRows, error: stallError } = await supabase
        .from('stalls')
        .select('id,stall_number,monthly_rent,size_sqft,status,review_status,location_label,county,town,category,last_confirmed_at')
        .eq('owner_id', ownerId)
        .order('stall_number')
      if (stallError) throw stallError
      const baseStalls = (stallRows ?? []) as Omit<Stall, 'latitude' | 'longitude'>[]
      const { data: mapPoints, error: mapPointsError } = baseStalls.length
        ? await supabase.rpc('commercial_stall_map_points', { stall_ids: baseStalls.map((stall) => stall.id) })
        : { data: [], error: null }
      if (mapPointsError) throw mapPointsError
      const mapPointById = new Map(((mapPoints ?? []) as Array<{
        stall_id: string
        latitude: number
        longitude: number
      }>).map((point) => [
        point.stall_id,
        { latitude: point.latitude, longitude: point.longitude },
      ]))
      const ownedStalls = baseStalls.map((stall) => ({
        ...stall,
        latitude: mapPointById.get(stall.id)?.latitude ?? null,
        longitude: mapPointById.get(stall.id)?.longitude ?? null,
      }))
      setStalls(ownedStalls)

      if (ownedStalls.length === 0) {
        setInquiries([])
        return
      }

      const { data: inquiryRows, error: inquiryError } = await supabase
        .from('stall_inquiries')
        .select('id,stall_id,applicant_id,business_name,contact_phone,message,status,created_at')
        .in('stall_id', ownedStalls.map((stall) => stall.id))
        .order('created_at', { ascending: false })
      if (inquiryError) throw inquiryError
      setInquiries((inquiryRows ?? []) as Inquiry[])
    } catch (loadError) {
      console.error('Could not load commercial landlord dashboard:', loadError)
      setError(`Could not load your stall dashboard: ${getErrorMessage(loadError)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    async function checkSession() {
      try {
        const { data, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (isMounted) {
          setUser(data.user)
          if (data.user) void loadDashboard(data.user.id)
        }
      } catch (authError) {
        console.error('Could not check landlord sign-in:', authError)
        if (isMounted) setError(`Could not check sign-in status: ${getErrorMessage(authError)}`)
      } finally {
        if (isMounted) setCheckingAuth(false)
      }
    }
    void checkSession()
    return () => { isMounted = false }
  }, [loadDashboard])

  async function updateInquiry(inquiryId: string, status: Inquiry['status']) {
    setUpdatingInquiry(inquiryId)
    setNotice('')
    try {
      const { error: updateError } = await supabase
        .from('stall_inquiries')
        .update({ status })
        .eq('id', inquiryId)
        .select('id')
        .single()
      if (updateError) throw updateError
      setInquiries((current) => current.map((inquiry) => inquiry.id === inquiryId ? { ...inquiry, status } : inquiry))
      setNotice('Application status updated.')
    } catch (updateError) {
      console.error('Could not update stall inquiry:', updateError)
      setNotice(`Could not update application: ${getErrorMessage(updateError)}`)
    } finally {
      setUpdatingInquiry(null)
    }
  }

  const confirmStallFreshness = async (stall: Stall) => {
    setNotice('')
    const { data, error: confirmError } = await supabase.rpc('confirm_keja_listing_freshness', {
      p_listing_type: 'stall',
      p_listing_id: stall.id,
    })
    if (confirmError) {
      setError(getErrorMessage(confirmError))
      return
    }
    setStalls((current) => current.map((item) => item.id === stall.id
      ? { ...item, last_confirmed_at: data }
      : item))
    setNotice(`Availability confirmed for ${stall.stall_number}.`)
    setError('')
  }

  const saveStallPin = async () => {
    if (!pinEditingId || !selectedPin) return
    setSavingPin(true)
    setNotice('')
    setError('')
    const { error: saveError } = await supabase.rpc('set_commercial_stall_map_point', {
      p_stall_id: pinEditingId,
      p_latitude: selectedPin.latitude,
      p_longitude: selectedPin.longitude,
    })
    if (saveError) {
      setError(getErrorMessage(saveError))
    } else {
      setStalls((current) => current.map((stall) => stall.id === pinEditingId
        ? { ...stall, latitude: selectedPin.latitude, longitude: selectedPin.longitude }
        : stall))
      setNotice('Approximate map pin saved. Public map pins are rounded for privacy.')
      setPinEditingId(null)
      setSelectedPin(null)
    }
    setSavingPin(false)
  }

  const selectMapPoint = useCallback((point: { latitude: number; longitude: number }) => {
    setSelectedPin(point)
  }, [])

  const stallNames = new Map(stalls.map((stall) => [stall.id, stall.stall_number]))
  const pendingCount = inquiries.filter((inquiry) => inquiry.status === 'pending').length

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <nav aria-label="Landlord navigation" className="flex items-center gap-4 text-sm">
            <Link href="/" className="font-medium text-slate-600 hover:text-blue-700">Browse stalls</Link>
            <Link href="/dashboard" className="font-medium text-slate-600 hover:text-blue-700">Account</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-blue-700">Commercial landlord</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Stall dashboard</h1>
            <p className="mt-2 text-slate-600">Track your listings and respond to tenant inquiries.</p>
          </div>
          <Link href="/post" className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800">+ List a stall</Link>
        </div>

        {checkingAuth ? (
          <p className="py-16 text-center text-slate-600">Checking sign-in…</p>
        ) : !user ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-bold">Sign in to manage your spaces</h2>
            <p className="mt-2 max-w-2xl text-slate-600">Your listings and applicant contact details are private to your account.</p>
            <Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Sign in or create an account</Link>
          </section>
        ) : (
          <>
            <section aria-label="Listing summary" className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-medium text-slate-500">Your spaces</p>
                <p className="mt-2 text-3xl font-extrabold">{stalls.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-medium text-slate-500">Available</p>
                <p className="mt-2 text-3xl font-extrabold">{stalls.filter((stall) => stall.status.toLowerCase() === 'vacant').length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-medium text-slate-500">New applications</p>
                <p className="mt-2 text-3xl font-extrabold">{pendingCount}</p>
              </div>
            </section>

            {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">{notice}</p>}
            {loading ? (
              <p className="py-12 text-center text-slate-600">Loading your spaces and inquiries…</p>
            ) : (
              <>
                <section className="mt-8">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold">Your listings</h2>
                      <p className="mt-1 text-sm text-slate-600">Listings remain private until approved by a reviewer.</p>
                    </div>
                    <Link href="/dashboard" className="text-sm font-semibold text-blue-700 hover:underline">Manage subscription and account</Link>
                  </div>
                  {stalls.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                      <p className="font-semibold">No commercial spaces yet</p>
                      <p className="mt-2 text-sm text-slate-600">Submit your first stall for review to get started.</p>
                      <Link href="/post" className="mt-4 inline-block font-semibold text-blue-700 hover:underline">Post a stall &rarr;</Link>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                          <tr><th className="px-4 py-3">Space</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Rent</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Review</th><th className="px-4 py-3">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stalls.map((stall) => (
                            <tr key={stall.id}>
                              <td className="px-4 py-4"><p className="font-semibold">{stall.stall_number}</p><p className="mt-1 text-xs text-slate-500">{stall.category}{stall.size_sqft ? ` · ${stall.size_sqft} sq. ft.` : ''}</p></td>
                              <td className="px-4 py-4 text-slate-600">{[stall.location_label, stall.town, stall.county].filter(Boolean).join(', ')}</td>
                              <td className="px-4 py-4 font-semibold">{formatKes(stall.monthly_rent)} / mo</td>
                              <td className="px-4 py-4 capitalize text-slate-600">{stall.status}</td>
                              <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${stall.review_status === 'approved' ? 'bg-emerald-100 text-emerald-800' : stall.review_status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{stall.review_status}</span></td>
                              <td className="space-y-2 px-4 py-4">
                                {isListingStale(stall.last_confirmed_at) ? (
                                  <>
                                    <span className="block text-xs text-amber-800">Not confirmed in {LISTING_CONFIRMATION_INTERVAL_DAYS} days</span>
                                    <button type="button" onClick={() => void confirmStallFreshness(stall)} className="block rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800">Confirm available</button>
                                  </>
                                ) : <span className="block text-xs text-slate-500">Confirmed {new Date(stall.last_confirmed_at).toLocaleDateString()}</span>}
                                <button type="button" onClick={() => {
                                  setPinEditingId(stall.id)
                                  setSelectedPin(stall.latitude !== null && stall.longitude !== null
                                    ? { latitude: stall.latitude, longitude: stall.longitude }
                                    : null)
                                }} className="block text-left text-xs font-semibold text-blue-700 underline">{stall.latitude !== null ? 'Update map pin' : 'Add map pin'}</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {pinEditingId && <section className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-semibold">Set an approximate pin for {stallNames.get(pinEditingId)}</h3><p className="mt-1 text-sm text-slate-600">Click the map near the space. The public map rounds locations to protect privacy.</p></div>
                      <button type="button" onClick={() => { setPinEditingId(null); setSelectedPin(null) }} className="text-sm font-semibold text-slate-700 underline">Cancel</button>
                    </div>
                    <KejaMap selectable selectedPoint={selectedPin} onPointSelect={selectMapPoint} className="mt-3 h-72" />
                    {selectedPin && <p className="mt-2 text-xs text-slate-600">Selected pin: {selectedPin.latitude.toFixed(5)}, {selectedPin.longitude.toFixed(5)}</p>}
                    <button type="button" disabled={!selectedPin || savingPin} onClick={() => void saveStallPin()} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingPin ? 'Saving pin…' : 'Save approximate pin'}</button>
                  </section>}
                </section>

                <section className="mt-10">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold">Inquiries and applications</h2>
                    <p className="mt-1 text-sm text-slate-600">Reply directly using the applicant’s contact number.</p>
                  </div>
                  {inquiries.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-7 text-slate-600">No inquiries yet. New applications will appear here.</div>
                  ) : (
                    <div className="space-y-4">
                      {inquiries.map((inquiry) => (
                        <article key={inquiry.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-bold">{inquiry.business_name}</h3>
                              <p className="mt-1 text-sm text-slate-600">For {stallNames.get(inquiry.stall_id) ?? 'your stall'} · {new Date(inquiry.created_at).toLocaleDateString()}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${inquiry.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : inquiry.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{inquiry.status}</span>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{inquiry.message}</p>
                          <p className="mt-3 text-sm"><span className="font-semibold">Phone:</span> <a className="text-blue-700 underline" href={`tel:${inquiry.contact_phone}`}>{inquiry.contact_phone}</a></p>
                          {inquiry.status === 'pending' || inquiry.status === 'contacted' ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button type="button" disabled={updatingInquiry === inquiry.id} onClick={() => void updateInquiry(inquiry.id, 'contacted')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Mark contacted</button>
                              <button type="button" disabled={updatingInquiry === inquiry.id} onClick={() => void updateInquiry(inquiry.id, 'accepted')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Accept</button>
                              <button type="button" disabled={updatingInquiry === inquiry.id} onClick={() => void updateInquiry(inquiry.id, 'declined')} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50">Decline</button>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
