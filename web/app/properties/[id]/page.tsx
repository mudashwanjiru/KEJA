'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { isListingStale } from '@/lib/listingFreshness'
import { useKejaLanguage } from '@/lib/language'

type MediaType = 'image' | 'video'

interface PropertyMedia {
  id: string
  storage_path: string
  media_type: MediaType
  caption: string | null
  position: number
  signedUrl?: string
}

interface NearbyService {
  id: string
  name: string
  category: string
  distance_m: number
  source?: string
}

interface NearbyPlacesResponse {
  services: NearbyService[]
  radius_m: number
  source: string
  attribution: string
}

interface PropertyMapPoint {
  latitude: number
  longitude: number
  is_approximate: boolean
}

interface PropertyReview {
  id: string
  rating: number
  body: string
  created_at: string
}

interface RentalProperty {
  id: string
  title: string
  description: string
  listing_type: 'rent' | 'sale' | 'short_stay'
  property_type: string
  monthly_rent: number | null
  sale_price: number | null
  nightly_price: number | null
  land_size_acres: number | null
  commercial_use: string | null
  booking_policy: string
  cancellation_policy: string
  minimum_stay_nights: number
  maximum_stay_nights: number | null
  deposit: number | null
  bedrooms: number
  bathrooms: number
  size_sqm: number | null
  parking_spaces: number
  water_available: boolean
  electricity_available: boolean
  internet_available: boolean
  network_quality: string | null
  security_features: string[]
  gated_compound: boolean
  pets_allowed: boolean
  furnished: boolean
  floor_label: string | null
  amenities: string[]
  building_name: string | null
  unit_number: string | null
  location_label: string
  location_precision: 'exact' | 'approximate'
  available_date: string | null
  listing_status: string
  verification_status: string
  contact_phone: string | null
  tour_url: string | null
  area_livability_score: number | null
  livability_updated_at: string | null
  last_confirmed_at: string
  rental_property_media: PropertyMedia[]
  property_nearby_services: NearbyService[]
}

const SERVICE_CATEGORIES = [
  ['hospital', 'Hospital', '🏥'],
  ['school', 'School', '🏫'],
  ['university', 'University', '🎓'],
  ['supermarket', 'Supermarket', '🛒'],
  ['pharmacy', 'Pharmacy', '💊'],
  ['bank', 'Bank', '🏦'],
  ['atm', 'ATM', '🏧'],
  ['petrol_station', 'Petrol station', '⛽'],
  ['matatu_stage', 'Matatu stage', '🚏'],
  ['bus_stop', 'Bus stop', '🚌'],
  ['railway_station', 'Railway station', '🚆'],
  ['restaurant', 'Restaurant', '🍽️'],
  ['cafe', 'Cafe', '☕'],
  ['gym', 'Gym', '🏋️'],
  ['mosque', 'Mosque', '🕌'],
  ['church', 'Church', '⛪'],
  ['police_station', 'Police station', '👮'],
  ['fire_station', 'Fire station', '🚒'],
  ['park', 'Park', '🌳'],
  ['shop', 'Shop', '🏪'],
  ['mpesa_agent', 'M-Pesa agent', '💸'],
  ['other', 'Other', '📍'],
] as const

const SERVICE_LABELS = new Map<string, { label: string; icon: string }>(
  SERVICE_CATEGORIES.map(([key, label, icon]) => [key, { label, icon }])
)
const MAX_RADIUS_METERS = 5000

function formatDistance(distance: number): string {
  return distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`
}

function formatKes(amount: number): string {
  return `KSh ${new Intl.NumberFormat('en-KE').format(amount)}`
}

function getWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

function RentalPropertyPageContent() {
  const { t } = useKejaLanguage()
  const params = useParams<{ id: string }>()
  const propertyId = params.id
  const [property, setProperty] = useState<RentalProperty | null>(null)
  const [mapPoint, setMapPoint] = useState<PropertyMapPoint | null>(null)
  const [liveServices, setLiveServices] = useState<NearbyService[]>([])
  const [nearbySource, setNearbySource] = useState('')
  const [nearbyError, setNearbyError] = useState('')
  const [nearbyLoading, setNearbyLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [reviews, setReviews] = useState<PropertyReview[]>([])
  const [viewingDate, setViewingDate] = useState('')
  const [viewingNote, setViewingNote] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guestCount, setGuestCount] = useState('1')
  const [bookingMessage, setBookingMessage] = useState('')
  const [reviewRating, setReviewRating] = useState('5')
  const [reviewBody, setReviewBody] = useState('')
  const [reportReason, setReportReason] = useState('fake_listing')
  const [reportDetails, setReportDetails] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)
  const [radius, setRadius] = useState(2000)
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    let active = true

    async function loadProperty() {
      try {
        const { data, error } = await supabase
          .from('rental_properties')
          .select(`
            id,title,description,listing_type,property_type,monthly_rent,sale_price,nightly_price,land_size_acres,commercial_use,
            booking_policy,cancellation_policy,minimum_stay_nights,maximum_stay_nights,deposit,bedrooms,bathrooms,size_sqm,
            parking_spaces,water_available,electricity_available,internet_available,
            network_quality,security_features,gated_compound,pets_allowed,furnished,
            floor_label,amenities,building_name,unit_number,location_label,location_precision,available_date,
            listing_status,verification_status,contact_phone,tour_url,
            area_livability_score,livability_updated_at,last_confirmed_at,
            rental_property_media(id,storage_path,media_type,caption,position),
            property_nearby_services(id,name,category,distance_m)
          `)
          .eq('id', propertyId)
          .neq('listing_status', 'draft')
          .maybeSingle()

        if (error) throw error
        if (!data) {
          if (active) setErrorMessage('This property could not be found or is not published.')
          return
        }

        const row = data as unknown as RentalProperty
        const { data: mapPoints, error: mapError } = await supabase.rpc('rental_property_map_points', {
          property_ids: [propertyId],
        })
        if (mapError) throw mapError
        if (active) setMapPoint((mapPoints as PropertyMapPoint[] | null)?.[0] ?? null)
        try {
          const nearbyResponse = await fetch(`/api/nearby?propertyId=${encodeURIComponent(propertyId)}&radius=${MAX_RADIUS_METERS}`)
          const nearbyResult = await nearbyResponse.json() as NearbyPlacesResponse | { error?: string }
          if (!nearbyResponse.ok) {
            if (active) setNearbyError('error' in nearbyResult ? nearbyResult.error ?? 'Nearby data is currently unavailable.' : 'Nearby data is currently unavailable.')
          } else if ('services' in nearbyResult && active) {
            setLiveServices(nearbyResult.services)
            setNearbySource(nearbyResult.attribution)
          }
        } catch (nearbyFetchError) {
          if (active) setNearbyError(getErrorMessage(nearbyFetchError))
        }
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const currentUserId = sessionData.session?.user.id ?? null
        if (active) setUserId(currentUserId)

        const media = [...(row.rental_property_media ?? [])].sort((a, b) => a.position - b.position)
        const paths = media.map((item) => item.storage_path)
        const signedUrlByPath = new Map<string, string>()

        if (paths.length > 0) {
          const { data: signedUrls, error: signedUrlError } = await supabase.storage
            .from('rental-property-media')
            .createSignedUrls(paths, 300)
          if (signedUrlError) throw signedUrlError
          for (const item of signedUrls ?? []) {
            if (item.path && item.signedUrl) signedUrlByPath.set(item.path, item.signedUrl)
          }
        }

        if (active) {
          setProperty({
            ...row,
            rental_property_media: media.map((item) => ({
              ...item,
              signedUrl: signedUrlByPath.get(item.storage_path),
            })),
            property_nearby_services: [...(row.property_nearby_services ?? [])]
              .sort((a, b) => a.distance_m - b.distance_m),
          })
        }

        const actionQueries = currentUserId
          ? await Promise.all([
            supabase.from('rental_property_favorites')
              .select('property_id').eq('property_id', propertyId).eq('user_id', currentUserId).maybeSingle(),
            supabase.from('rental_property_reviews')
              .select('id,rating,body,created_at').eq('property_id', propertyId).eq('status', 'approved').order('created_at', { ascending: false }),
          ])
          : [null, await supabase.from('rental_property_reviews')
            .select('id,rating,body,created_at').eq('property_id', propertyId).eq('status', 'approved').order('created_at', { ascending: false })] as const
        if (actionQueries[0]?.error) throw actionQueries[0].error
        if (actionQueries[1].error) throw actionQueries[1].error
        if (active) {
          setIsFavorite(Boolean(actionQueries[0]?.data))
          setReviews((actionQueries[1].data ?? []) as PropertyReview[])
        }

        const { error: viewError } = await supabase.rpc('record_rental_property_view', { property_id: propertyId })
        if (viewError && active) setActionMessage(`View count could not be recorded: ${getErrorMessage(viewError)}`)
      } catch (error) {
        if (active) setErrorMessage(getErrorMessage(error))
      } finally {
        if (active) {
          setLoading(false)
          setNearbyLoading(false)
        }
      }
    }

    void loadProperty()
    return () => { active = false }
  }, [propertyId])

  const visibleServices = useMemo(() => {
    if (!property) return []
    const combined = [...property.property_nearby_services, ...liveServices]
    const unique = new Map<string, NearbyService>()
    for (const service of combined) {
      const key = `${service.category}:${service.name.trim().toLowerCase()}`
      if (!unique.has(key)) unique.set(key, service)
    }
    return [...unique.values()].filter((service) =>
      service.distance_m <= radius && (categoryFilter === 'all' || service.category === categoryFilter)
    ).sort((a, b) => a.distance_m - b.distance_m)
  }, [property, liveServices, radius, categoryFilter])

  const amenityGroups = [
    { label: 'Healthcare', categories: ['hospital', 'pharmacy'] },
    { label: 'Education', categories: ['school', 'university'] },
    { label: 'Shopping & essentials', categories: ['supermarket', 'shop', 'bank', 'atm', 'mpesa_agent'] },
    { label: 'Transport', categories: ['matatu_stage', 'bus_stop', 'railway_station', 'petrol_station'] },
    { label: 'Parks & recreation', categories: ['park', 'gym', 'restaurant', 'cafe'] },
    { label: 'Emergency services', categories: ['police_station', 'fire_station'] },
  ]
  const amenityCoverage = liveServices.length > 0
    ? Math.round(amenityGroups.filter((group) => liveServices.some((service) =>
      group.categories.includes(service.category) && service.distance_m <= radius
    )).length / amenityGroups.length * 100)
    : null

  if (loading) {
    return <main id="main-content" role="status" aria-live="polite" className="mx-auto min-h-screen max-w-5xl px-6 py-16 text-slate-600">Loading property details...</main>
  }

  if (errorMessage || !property) {
    return (
      <main id="main-content" className="mx-auto min-h-screen max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:underline">← Marketplace</Link>
        <div role="alert" className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-bold">Property details unavailable</h1>
          <p className="mt-2 text-sm">{errorMessage || 'This property could not be found.'}</p>
          {/rental_properties|schema cache|relation/i.test(errorMessage) && (
            <p className="mt-3 text-sm">Apply the residential property profiles migration listed in the project README.</p>
          )}
        </div>
      </main>
    )
  }

  const statusLabel = property.listing_status === 'available'
    ? 'Vacant'
    : property.listing_status.replaceAll('_', ' ')
  const waUrl = property.contact_phone ? getWhatsAppUrl(property.contact_phone) : null
  const serviceCategories = Array.from(new Set(property.property_nearby_services.map((service) => service.category)))
    .concat(Array.from(new Set(liveServices.map((service) => service.category))))
    .filter((category, index, categories) => categories.indexOf(category) === index)
    .map((category) => ({ category, label: SERVICE_LABELS.get(category)?.label ?? category }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const nearbyMapUrl = mapPoint
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapPoint.longitude - 0.02}%2C${mapPoint.latitude - 0.01}%2C${mapPoint.longitude + 0.02}%2C${mapPoint.latitude + 0.01}&layer=mapnik&marker=${mapPoint.latitude}%2C${mapPoint.longitude}`
    : null

  const requireSignIn = () => {
    if (userId) return true
    setActionMessage('Sign in from the dashboard to save a property, request a viewing, review, report, or message an owner.')
    return false
  }

  const handleFavorite = async () => {
    if (!requireSignIn()) return
    setSubmittingAction(true)
    setActionMessage('')
    const result = isFavorite
      ? await supabase.from('rental_property_favorites').delete().eq('user_id', userId!).eq('property_id', property.id)
      : await supabase.from('rental_property_favorites').insert({ user_id: userId!, property_id: property.id })
    if (result.error) setActionMessage(getErrorMessage(result.error))
    else {
      setIsFavorite(!isFavorite)
      setActionMessage(isFavorite ? 'Removed from saved properties.' : 'Property saved to your favourites.')
    }
    setSubmittingAction(false)
  }

  const handleViewingRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignIn()) return
    const requestedAt = new Date(viewingDate)
    if (!viewingDate || Number.isNaN(requestedAt.getTime()) || requestedAt.getTime() <= Date.now()) {
      setActionMessage('Choose a future date and time for your viewing.')
      return
    }
    setSubmittingAction(true)
    setActionMessage('')
    const { error } = await supabase.from('rental_property_viewings').insert({
      property_id: property.id,
      requester_id: userId,
      requested_at: requestedAt.toISOString(),
      message: viewingNote.trim(),
    })
    setActionMessage(error ? getErrorMessage(error) : 'Viewing request sent. The property contact will follow up.')
    if (!error) {
      setViewingDate('')
      setViewingNote('')
    }
    setSubmittingAction(false)
  }

  const handleStayBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignIn()) return
    const nights = Math.round((new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) / 86_400_000)
    if (!checkIn || !checkOut || !Number.isInteger(nights) || nights < property.minimum_stay_nights
      || (property.maximum_stay_nights !== null && nights > property.maximum_stay_nights)
      || new Date(`${checkIn}T00:00:00`).getTime() < new Date(new Date().toDateString()).getTime()) {
      setActionMessage('Choose future dates that meet the minimum and maximum stay requirements.')
      return
    }
    setSubmittingAction(true)
    setActionMessage('')
    const { error } = await supabase.from('short_stay_bookings').insert({
      property_id: property.id,
      requester_id: userId,
      check_in: checkIn,
      check_out: checkOut,
      guest_count: Number(guestCount),
      message: bookingMessage.trim(),
    })
    setActionMessage(error ? getErrorMessage(error) : 'Date request sent. The host will confirm or decline; no booking payment is collected by MTAA.')
    if (!error) {
      setCheckIn('')
      setCheckOut('')
      setBookingMessage('')
    }
    setSubmittingAction(false)
  }

  const handleReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignIn()) return
    setSubmittingAction(true)
    setActionMessage('')
    const { error } = await supabase.from('rental_property_reviews').insert({
      property_id: property.id,
      author_id: userId,
      rating: Number(reviewRating),
      body: reviewBody.trim(),
      status: 'pending',
    })
    setActionMessage(error ? getErrorMessage(error) : 'Review submitted for moderation.')
    if (!error) setReviewBody('')
    setSubmittingAction(false)
  }

  const handleReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignIn()) return
    setSubmittingAction(true)
    setActionMessage('')
    const { error } = await supabase.from('rental_property_reports').insert({
      property_id: property.id,
      reporter_id: userId,
      reason: reportReason,
      details: reportDetails.trim(),
      status: 'pending',
    })
    setActionMessage(error ? getErrorMessage(error) : t('reportSent'))
    if (!error) setReportDetails('')
    setSubmittingAction(false)
  }

  const handleMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignIn()) return
    setSubmittingAction(true)
    setActionMessage('')
    const { error } = await supabase.rpc('message_property_owner', {
      property_id: property.id,
      message_body: contactMessage.trim(),
    })
    setActionMessage(error ? getErrorMessage(error) : 'Your inquiry was sent to the property owner.')
    if (!error) setContactMessage('')
    setSubmittingAction(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <Link href="/" className="text-sm font-medium text-slate-700 hover:text-blue-700">Marketplace</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {actionMessage && <p role="status" aria-live="polite" className="mb-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{actionMessage}</p>}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
          <section id="main-content" tabIndex={-1}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-blue-700">{property.location_label}</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{property.title}</h1>
                {isListingStale(property.last_confirmed_at) && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('ownerNoRecentHomeConfirm')}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold capitalize text-emerald-800">{statusLabel}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  property.verification_status === 'verified'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {property.verification_status === 'verified' ? 'Verified listing' : `${property.verification_status} listing`}
                </span>
              </div>
            </div>

            {property.rental_property_media.length > 0 ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {property.rental_property_media.map((media) => media.signedUrl && (
                  <div key={media.id} className="overflow-hidden rounded-xl bg-slate-200">
                    {media.media_type === 'video' ? (
                      <video src={media.signedUrl} controls preload="metadata" className="aspect-video w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={media.signedUrl} alt={media.caption ?? property.title} className="aspect-video w-full object-cover" />
                    )}
                    {media.caption && <p className="bg-white px-3 py-2 text-sm text-slate-600">{media.caption}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex aspect-[16/8] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-500">
                Photos and videos will appear here
              </div>
            )}

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Property overview</h2>
              {(property.building_name || property.unit_number) && <p className="mt-2 text-sm text-slate-600">{property.building_name ?? 'Building'}{property.unit_number ? ` · Unit ${property.unit_number}` : ''}</p>}
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                {property.property_type === 'land' ? <div><span className="block text-slate-500">Land size</span><strong>{property.land_size_acres ? `${property.land_size_acres} acres` : 'Not provided'}</strong></div>
                  : property.property_type === 'commercial' ? <div><span className="block text-slate-500">Commercial use</span><strong>{property.commercial_use || 'Not provided'}</strong></div>
                    : <><div><span className="block text-slate-500">Bedrooms</span><strong>{property.bedrooms}</strong></div>
                      <div><span className="block text-slate-500">Bathrooms</span><strong>{property.bathrooms}</strong></div>
                      <div><span className="block text-slate-500">Size</span><strong>{property.size_sqm ? `${property.size_sqm} m²` : 'Not provided'}</strong></div>
                      <div><span className="block text-slate-500">Parking</span><strong>{property.parking_spaces} spaces</strong></div>
                      <div><span className="block text-slate-500">Furnishing</span><strong>{property.furnished ? 'Furnished' : 'Unfurnished'}</strong></div>
                      <div><span className="block text-slate-500">Floor</span><strong>{property.floor_label || 'Not provided'}</strong></div></>}
              </div>
              {property.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{property.description}</p>}
            </div>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">What&apos;s around you?</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Distances are listing-provided estimates from the {property.location_precision} location.
                  </p>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Within
                  <select
                    value={radius}
                    onChange={(event) => setRadius(Number(event.target.value))}
                    className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1.5"
                  >
                    <option value={500}>500 m</option>
                    <option value={1000}>1 km</option>
                    <option value={2000}>2 km</option>
                    <option value={MAX_RADIUS_METERS}>5 km</option>
                  </select>
                </label>
              </div>

              {nearbyMapUrl && (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <iframe title={`Map near ${property.title}`} src={nearbyMapUrl} className="h-64 w-full border-0" loading="lazy" />
                  <p className="bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {mapPoint?.is_approximate ? 'Approximate property location' : 'Exact property pin selected by the owner'} · nearby service distances are listing-provided estimates.
                  </p>
                </div>
              )}

              {serviceCategories.length > 0 && (
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Category
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="ml-2 max-w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
                  >
                    <option value="all">All nearby services</option>
                    {serviceCategories.map(({ category, label }) => <option key={category} value={category}>{label}</option>)}
                  </select>
                </label>
              )}

              {visibleServices.length === 0 ? (
                <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                  {nearbyLoading ? 'Searching mapped nearby places...' : `No nearby services were found within ${formatDistance(radius)}.`}
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-slate-100">
                  {visibleServices.map((service) => {
                    const category = SERVICE_LABELS.get(service.category)
                    return (
                      <li key={service.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                        <span className="text-slate-800">{category?.icon ?? '📍'} {service.name}{service.source && <span className="ml-2 text-[10px] font-medium text-slate-400">Mapped</span>}</span>
                        <span className="shrink-0 font-semibold text-slate-700">{formatDistance(service.distance_m)} straight-line</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {nearbyError && <p role="status" className="mt-3 text-xs text-amber-800">{nearbyError} Owner-provided service estimates remain available.</p>}
              <p className="mt-3 text-xs text-slate-500">
                {nearbySource ? <><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">{nearbySource}</a>. Mapped places can be incomplete or out of date; distances are straight-line estimates, not travel routes.</> : 'Mapped nearby places are sourced from OpenStreetMap and may be incomplete or out of date.'}
              </p>
            </section>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Reviews ({reviews.length})</h2>
              {reviews.length === 0 ? <p className="mt-2 text-sm text-slate-600">No approved reviews yet.</p> : (
                <div className="mt-3 divide-y divide-slate-100">
                  {reviews.map((review) => (
                    <article key={review.id} className="py-3">
                      <p className="text-amber-600">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{review.body}</p>
                      <time className="mt-1 block text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString()}</time>
                    </article>
                  ))}
                </div>
              )}
              {userId && (
                <form onSubmit={(event) => void handleReview(event)} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-medium">Your rating
                    <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1">
                      {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
                    </select>
                  </label>
                  <textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} required maxLength={2000} rows={3} placeholder="Share your experience..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  <button disabled={submittingAction} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit review</button>
                </form>
              )}
            </section>
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">{property.listing_type === 'short_stay' ? 'Nightly rate' : property.listing_type === 'sale' ? 'Sale price' : 'Monthly rent / lease'}</p>
              <p className="mt-1 text-3xl font-extrabold text-blue-700">{(property.listing_type === 'short_stay' ? property.nightly_price : property.listing_type === 'sale' ? property.sale_price : property.monthly_rent) === null ? 'Price on request' : formatKes((property.listing_type === 'short_stay' ? property.nightly_price : property.listing_type === 'sale' ? property.sale_price : property.monthly_rent) ?? 0)}<span className="text-sm font-medium text-slate-500">{property.listing_type === 'rent' ? ' / month' : property.listing_type === 'short_stay' ? ' / night' : ''}</span></p>
              <p className="mt-2 text-sm text-slate-600">Deposit: {property.deposit === null ? 'Not provided' : formatKes(property.deposit)}</p>
              <p className="mt-3 text-sm capitalize text-slate-600">
                Available {property.available_date ? new Date(`${property.available_date}T00:00:00`).toLocaleDateString() : 'now'}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {property.pets_allowed ? 'Pets allowed' : 'No pets'} · {property.gated_compound ? 'Gated compound' : 'Ungated compound'}
              </p>
              {waUrl && (
                <div className="mt-5 flex gap-2">
                  <a href={`tel:${property.contact_phone}`} className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-semibold hover:bg-slate-50">Call</a>
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700">WhatsApp</a>
                </div>
              )}
              <button type="button" onClick={() => void handleFavorite()} disabled={submittingAction} aria-pressed={isFavorite} className="mt-3 w-full rounded-lg border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                {isFavorite ? '♥ Saved to favourites' : '♡ Save property'}
              </button>
            </section>

            {property.listing_status === 'occupied' ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-950">This property is marked occupied and is not currently available for viewings or stay requests.</p>
              : property.listing_type === 'short_stay' ? <form onSubmit={(event) => void handleStayBooking(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Request stay dates</h2>
              <p className="text-xs leading-5 text-slate-600">{property.booking_policy} Minimum {property.minimum_stay_nights} night{property.minimum_stay_nights === 1 ? '' : 's'}{property.maximum_stay_nights ? `; maximum ${property.maximum_stay_nights} nights` : ''}. MTAA does not collect booking payments.</p>
              <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Check-in<input type="date" required min={new Date().toISOString().slice(0, 10)} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Check-out<input type="date" required min={checkIn || new Date().toISOString().slice(0, 10)} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label></div>
              <label className="block text-sm font-medium">Guests<input type="number" min="1" max="30" required value={guestCount} onChange={(event) => setGuestCount(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <textarea value={bookingMessage} onChange={(event) => setBookingMessage(event.target.value)} maxLength={1000} rows={2} placeholder="Optional note for the host" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <p className="text-xs text-slate-500">Cancellation policy: {property.cancellation_policy}</p>
              <button disabled={submittingAction} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Request dates</button>
            </form> : property.property_type !== 'land' && <form onSubmit={(event) => void handleViewingRequest(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Book a viewing</h2>
              <label className="block text-sm font-medium text-slate-700">Preferred date and time
                <input type="datetime-local" value={viewingDate} onChange={(event) => setViewingDate(event.target.value)} required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <textarea value={viewingNote} onChange={(event) => setViewingNote(event.target.value)} maxLength={1000} rows={2} placeholder="Optional note for the owner" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={submittingAction} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Request viewing</button>
            </form>}

            <form onSubmit={(event) => void handleMessage(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Message the owner</h2>
              <textarea value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} maxLength={4000} required rows={3} placeholder="Ask a question about this property..." className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={submittingAction} className="w-full rounded-lg border border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50">Send inquiry</button>
            </form>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Utilities & security</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>{property.water_available ? '✓' : '—'} Water availability</li>
                <li>{property.electricity_available ? '✓' : '—'} Electricity</li>
                <li>{property.internet_available ? '✓' : '—'} Internet{property.network_quality ? ` · ${property.network_quality}` : ''}</li>
                {property.security_features.map((feature) => <li key={feature}>✓ {feature}</li>)}
              </ul>
            </section>

            {property.amenities.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold">Amenities</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <span key={amenity} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{amenity}</span>
                  ))}
                </div>
              </section>
            )}

            {property.tour_url && (
              <a href={property.tour_url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-sm font-semibold text-blue-800 hover:bg-blue-100">
                Explore the 360° tour
              </a>
            )}

            <details className="rounded-xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-lg font-bold">{t('propertyReport')}</summary>
              <p className="mt-2 text-sm text-slate-600">{t('propertyReportIntro')}</p>
              <form onSubmit={(event) => void handleReport(event)} className="mt-4 space-y-3">
                <label className="block text-sm font-semibold">{t('reportReason')}
                <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="fake_listing">{t('fakeListing')}</option>
                  <option value="incorrect_information">{t('incorrectInformation')}</option>
                  <option value="unavailable">{t('alreadyUnavailable')}</option>
                  <option value="scam">{t('suspectedScam')}</option>
                  <option value="other">{t('other')}</option>
                </select>
                </label>
                <label className="block text-sm font-semibold">{t('reportDetailsOptional')}
                <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={2000} rows={3} placeholder={t('reportDetailsOptional')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <button disabled={submittingAction} className="rounded-md border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">{submittingAction ? t('sendingReport') : t('sendReport')}</button>
              </form>
            </details>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold">Area amenity coverage</h2>
              {amenityCoverage === null ? (
                <p className="mt-2 text-sm text-slate-600">Mapped nearby-place data is not available to calculate coverage right now.</p>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-extrabold text-emerald-700">{amenityCoverage}<span className="text-base font-semibold text-slate-500"> / 100</span></p>
                  <p className="mt-1 text-xs text-slate-500">Share of six amenity groups with at least one mapped place within {formatDistance(radius)}. This is not a safety rating or a complete liveability score.</p>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">{amenityGroups.map((group) => {
                    const hasPlace = liveServices.some((service) => group.categories.includes(service.category) && service.distance_m <= radius)
                    return <li key={group.label} className="flex justify-between gap-3"><span>{group.label}</span><strong>{hasPlace ? 'Available' : 'Not found on map'}</strong></li>
                  })}</ul>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}

export default function RentalPropertyPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-5xl px-6 py-16 text-slate-600">Loading property details...</main>}>
      <RentalPropertyPageContent />
    </Suspense>
  )
}
