'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import KejaMap from '@/lib/KejaMap'
import { isListingStale } from '@/lib/listingFreshness'
import { useKejaLanguage } from '@/lib/language'

interface NearbyService {
  category: string
  name: string
  distance_m: number
}

interface PropertyMapPoint {
  property_id: string
  latitude: number
  longitude: number
  is_approximate: boolean
}

interface ResidentialProperty {
  id: string
  created_at: string
  last_confirmed_at: string
  title: string
  listing_type: 'rent' | 'sale' | 'short_stay'
  property_type: string
  monthly_rent: number | null
  sale_price: number | null
  nightly_price: number | null
  land_size_acres: number | null
  commercial_use: string | null
  bedrooms: number
  bathrooms: number
  size_sqm: number | null
  parking_spaces: number
  water_available: boolean
  location_label: string
  county: string | null
  town: string | null
  ward: string | null
  latitude: number | null
  longitude: number | null
  mapApproximate?: boolean
  listing_status: string
  verification_status: string
  featured_until: string | null
  rental_property_media: Array<{ storage_path: string; media_type: 'image' | 'video' }>
  property_nearby_services: NearbyService[]
  rental_property_reviews: Array<{ rating: number }>
  coverUrl?: string
}

const servicePhrases: Array<{ keys: string[]; category: string }> = [
  { keys: ['hospital', 'healthcare'], category: 'hospital' },
  { keys: ['school'], category: 'school' },
  { keys: ['university', 'campus'], category: 'university' },
  { keys: ['supermarket', 'grocer'], category: 'supermarket' },
  { keys: ['pharmacy', 'chemist'], category: 'pharmacy' },
  { keys: ['matatu', 'stage'], category: 'matatu_stage' },
  { keys: ['bus stop', 'busstop'], category: 'bus_stop' },
  { keys: ['petrol', 'fuel'], category: 'petrol_station' },
  { keys: ['restaurant', 'restaurants'], category: 'restaurant' },
  { keys: ['bank', 'atm'], category: 'bank' },
]

function parseSearch(query: string) {
  const normalized = query.toLowerCase()
  const bedrooms = normalized.match(/(\d+)\s*(?:bed|bedroom)/)?.[1]
  const budget = normalized.match(/(?:under|below|less than|up to|max(?:imum)?|<=?)\s*(?:ksh|kes)?\s*([\d,]+)/)?.[1]
  const radiusKm = normalized.match(/(?:within|near(?:by)?(?: within)?)\s*(500\s*m|[\d.]+\s*km)/)?.[1]
  const radiusMeters = radiusKm
    ? radiusKm.includes('m') && !radiusKm.includes('km')
      ? Number.parseFloat(radiusKm) : Number.parseFloat(radiusKm) * 1000
    : 5000
  return {
    bedrooms: bedrooms ? Number(bedrooms) : null,
    budget: budget ? Number(budget.replaceAll(',', '')) : null,
    radiusMeters,
    requiredCategories: servicePhrases
      .filter(({ keys }) => keys.some((key) => normalized.includes(key)))
      .map(({ category }) => category),
    parking: /\bparking\b/.test(normalized),
    water: /\bwater\b/.test(normalized),
    location: normalized.match(/\bin\s+([a-z][a-z\s-]*?)(?=,| under | below | near | with |$)/)?.[1]?.trim() ?? '',
  }
}

function formatKes(amount: number): string {
  return `KSh ${new Intl.NumberFormat('en-KE').format(amount)}`
}

function distanceMeters(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(toLat - fromLat)
  const longitudeDelta = radians(toLon - fromLon)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(longitudeDelta / 2) ** 2
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)))
}

export default function HomesMarketplacePage() {
  const { t } = useKejaLanguage()
  const [properties, setProperties] = useState<ResidentialProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [county, setCounty] = useState('')
  const [listingType, setListingType] = useState<'rent' | 'sale' | 'short_stay'>('rent')
  const [propertyType, setPropertyType] = useState('all')
  const [maxPrice, setMaxPrice] = useState('')
  const [minBedrooms, setMinBedrooms] = useState('')
  const [serviceRadius, setServiceRadius] = useState(2000)
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedServiceCategory, setSelectedServiceCategory] = useState('all')
  const [presentation, setPresentation] = useState<'list' | 'map'>('list')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [comparison, setComparison] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [savingSearch, setSavingSearch] = useState(false)
  const [currentTime, setCurrentTime] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function loadListings() {
      try {
        setLoading(true)
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const currentUserId = sessionData.session?.user.id ?? null
        if (active) setUserId(currentUserId)

        let listingsQuery = supabase.from('rental_properties').select(`
            id,created_at,title,listing_type,property_type,monthly_rent,sale_price,nightly_price,land_size_acres,commercial_use,bedrooms,bathrooms,
            size_sqm,parking_spaces,water_available,location_label,county,town,ward,
            listing_status,verification_status,featured_until,last_confirmed_at,
            rental_property_media(storage_path,media_type),
            property_nearby_services(category,name,distance_m),
            rental_property_reviews(rating)
          `).in('listing_status', ['available', 'available_soon']).eq('verification_status', 'verified')
        if (county) listingsQuery = listingsQuery.eq('county', county)
        const [{ data, error }, favoriteResult] = await Promise.all([
          listingsQuery.order('created_at', { ascending: false }).limit(200),
          currentUserId
            ? supabase.from('rental_property_favorites').select('property_id').eq('user_id', currentUserId)
            : Promise.resolve({ data: [], error: null }),
        ])
        if (error) throw error
        if (favoriteResult.error) throw favoriteResult.error

        const rows = ((data ?? []) as unknown as ResidentialProperty[]).sort((a, b) => {
          const aFeatured = a.featured_until ? new Date(a.featured_until).getTime() > Date.now() : false
          const bFeatured = b.featured_until ? new Date(b.featured_until).getTime() > Date.now() : false
          return Number(bFeatured) - Number(aFeatured)
            || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        const { data: mapPoints, error: mapError } = await supabase.rpc('rental_property_map_points', {
          property_ids: rows.map((property) => property.id),
        })
        if (mapError) throw mapError
        const pointById = new Map<string, PropertyMapPoint>(
          ((mapPoints ?? []) as PropertyMapPoint[]).map((point) => [point.property_id, point])
        )
        const coverPaths = rows.map((property) =>
          property.rental_property_media.find((media) => media.media_type === 'image')?.storage_path
        ).filter((path): path is string => Boolean(path))
        const urls = new Map<string, string>()
        if (coverPaths.length) {
          const { data: signedUrls, error: signedError } = await supabase.storage
            .from('rental-property-media')
            .createSignedUrls(coverPaths, 300)
          if (signedError) throw signedError
          for (const signed of signedUrls ?? []) {
            if (signed.path && signed.signedUrl) urls.set(signed.path, signed.signedUrl)
          }
        }

        if (active) {
          setProperties(rows.map((property) => ({
            ...property,
            latitude: pointById.get(property.id)?.latitude ?? null,
            longitude: pointById.get(property.id)?.longitude ?? null,
            mapApproximate: pointById.get(property.id)?.is_approximate ?? true,
            coverUrl: property.rental_property_media.find((media) => media.media_type === 'image')
              ? urls.get(property.rental_property_media.find((media) => media.media_type === 'image')?.storage_path ?? '')
              : undefined,
          })))
          setFavorites(new Set((favoriteResult.data ?? []).map((row) => row.property_id)))
        }
      } catch (error) {
        if (active) setErrorMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }

    const timer = window.setTimeout(() => {
      setCurrentTime(Date.now())
      const saved = window.localStorage.getItem('keja-property-comparison')
      if (!saved) return
      try {
        setComparison(new Set(JSON.parse(saved) as string[]))
      } catch {
        window.localStorage.removeItem('keja-property-comparison')
      }
    }, 0)
    void loadListings()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [county])

  const parsed = useMemo(() => parseSearch(search), [search])
  const recommendedProperties = useMemo(() => {
    const savedProperties = properties.filter((property) => favorites.has(property.id))
    if (savedProperties.length === 0) return []

    return properties
      .filter((property) => property.listing_type === listingType
        && !favorites.has(property.id)
        && property.listing_status !== 'occupied')
      .map((property) => {
        const price = listingType === 'rent' ? property.monthly_rent : listingType === 'short_stay' ? property.nightly_price : property.sale_price
        const score = Math.max(...savedProperties.map((saved) => {
          let similarity = 0
          if (saved.location_label.toLowerCase() === property.location_label.toLowerCase()) similarity += 3
          else if (saved.location_label.toLowerCase().includes(property.location_label.toLowerCase())
            || property.location_label.toLowerCase().includes(saved.location_label.toLowerCase())) similarity += 2
          if (saved.property_type === property.property_type) similarity += 2
          if (Math.abs(saved.bedrooms - property.bedrooms) <= 1) similarity += 1
          const savedPrice = listingType === 'rent' ? saved.monthly_rent : listingType === 'short_stay' ? saved.nightly_price : saved.sale_price
          if (price && savedPrice && Math.abs(price - savedPrice) / Math.max(price, savedPrice) <= 0.3) similarity += 1
          return similarity
        }))
        return { property, score }
      })
      .filter(({ score }) => score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ property }) => property)
  }, [properties, favorites, listingType])

  const filteredProperties = useMemo(() => properties.filter((property) => {
    const price = listingType === 'rent' ? property.monthly_rent : listingType === 'short_stay' ? property.nightly_price : property.sale_price
    const fullLocation = [property.location_label, property.ward, property.town, property.county].filter(Boolean).join(' ')
    const queryText = `${property.title} ${property.property_type} ${fullLocation}`.toLowerCase()
    const matchesLocation = parsed.location
      ? fullLocation.toLowerCase().includes(parsed.location)
      : true
    const matchesQuery = !search || queryText.includes(search.toLowerCase())
      || (parsed.location.length > 0 && matchesLocation)
    const requiredCategories = parsed.requiredCategories
    return property.listing_type === listingType
      && (propertyType === 'all' || property.property_type === propertyType)
      && property.listing_status !== 'occupied'
      && matchesQuery
      && matchesLocation
      && (!county || (property.county ?? property.location_label).toLowerCase().includes(county.toLowerCase()))
      && (price !== null && price !== undefined)
      && (!selectedLocation
        || (property.latitude !== null && property.longitude !== null
          && distanceMeters(selectedLocation.latitude, selectedLocation.longitude, property.latitude, property.longitude) <= serviceRadius))
      && (!maxPrice || price <= Number(maxPrice))
      && (!parsed.budget || price <= parsed.budget)
      && (!minBedrooms || property.bedrooms >= Number(minBedrooms))
      && (parsed.bedrooms === null || property.bedrooms === parsed.bedrooms)
      && (!parsed.parking || property.parking_spaces > 0)
      && (!parsed.water || property.water_available)
      && (selectedServiceCategory === 'all' || property.property_nearby_services.some(
        (service) => service.category === selectedServiceCategory && service.distance_m <= serviceRadius
      ))
      && requiredCategories.every((category) => property.property_nearby_services.some(
        (service) => service.category === category && service.distance_m <= Math.min(serviceRadius, parsed.radiusMeters)
      ))
  }), [properties, listingType, propertyType, search, county, maxPrice, minBedrooms, serviceRadius, selectedServiceCategory, selectedLocation, parsed])

  const useCurrentLocation = () => {
    setActionMessage('')
    if (!navigator.geolocation) {
      setActionMessage('Location search is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setSelectedLocation({ latitude: coords.latitude, longitude: coords.longitude })
        setActionMessage('Showing homes within the selected radius. Distances use approximate public map pins.')
      },
      (error) => {
        setActionMessage(error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access in your browser to search nearby.'
          : 'Your location could not be determined. Try again or search by area name.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const changeComparison = (propertyId: string) => {
    setComparison((current) => {
      const next = new Set(current)
      if (next.has(propertyId)) next.delete(propertyId)
      else if (next.size < 3) next.add(propertyId)
      else {
        setActionMessage('Compare up to three properties at a time.')
        return current
      }
      window.localStorage.setItem('keja-property-comparison', JSON.stringify([...next]))
      return next
    })
  }

  const toggleFavorite = async (propertyId: string) => {
    if (!userId) {
      setActionMessage('Sign in from the dashboard to save properties.')
      return
    }
    setActionMessage('')
    const isFavorite = favorites.has(propertyId)
    const result = isFavorite
      ? await supabase.from('rental_property_favorites').delete().eq('user_id', userId).eq('property_id', propertyId)
      : await supabase.from('rental_property_favorites').insert({ user_id: userId, property_id: propertyId })
    if (result.error) {
      setActionMessage(getErrorMessage(result.error))
      return
    }
    setFavorites((current) => {
      const next = new Set(current)
      if (isFavorite) next.delete(propertyId)
      else next.add(propertyId)
      return next
    })
  }

  const saveCurrentSearch = async () => {
    if (!userId) {
      setActionMessage('Sign in to save a search and get new-listing notifications.')
      return
    }
    if (selectedLocation) {
      setActionMessage('Saved-search alerts currently support area-name searches, not browser-location radius searches. Clear your location to save this search.')
      return
    }
    setSavingSearch(true)
    setActionMessage('')
    const { error } = await supabase.from('rental_saved_searches').insert({
      user_id: userId,
      search_text: search.trim().slice(0, 300),
      location: parsed.location,
      county: county || null,
      listing_type: listingType,
      max_price: maxPrice ? Number(maxPrice) : parsed.budget,
      min_bedrooms: minBedrooms ? Number(minBedrooms) : parsed.bedrooms,
      service_categories: [...new Set([
        ...parsed.requiredCategories,
        ...(selectedServiceCategory === 'all' ? [] : [selectedServiceCategory]),
      ])],
      service_radius_m: Math.min(serviceRadius, parsed.radiusMeters),
      notify_new_listings: true,
    })
    setActionMessage(error
      ? getErrorMessage(error)
      : 'Search saved. You’ll get an in-app notification when a verified listing matches its main filters.')
    setSavingSearch(false)
  }

  const comparedProperties = properties.filter((property) => comparison.has(property.id))
  const mapMarkers = useMemo(() => filteredProperties.flatMap((property) => (
    property.latitude === null || property.longitude === null
      ? []
      : [{
          id: property.id,
          latitude: property.latitude,
          longitude: property.longitude,
          label: `${property.title} · ${property.location_label}`,
          href: `/properties/${property.id}`,
        }]
  )), [filteredProperties])

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">MTAA</Link>
          <div className="flex flex-wrap items-center gap-4"><Link href="/bookings" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Stay requests</Link><Link href="/tenant" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Tenant portal</Link><Link href="/jobs" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Property jobs</Link><Link href="/insights" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Market insights</Link><Link href="/financing" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Financing</Link><Link href="/neighborhoods" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Neighborhoods</Link></div>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
            <Link href="/community" className="text-slate-700 hover:text-blue-700">Community</Link>
            <Link href="/services" className="text-slate-700 hover:text-blue-700">Home services</Link>
            <Link href="/dashboard" className="text-slate-700 hover:text-blue-700">Sign in</Link>
            <Link href="/landlord" className="font-semibold text-blue-700">List a home</Link>
          </nav>
        </div>
      </header>

      <section id="main-content" tabIndex={-1} className="bg-blue-950 px-5 py-10 text-white sm:py-14">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-200">{t('homes')}</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{t('homeSearchTitle')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-blue-100">{t('homeSearchDescription')} Try “2 bedroom in Ruiru under 25,000 near a hospital with parking and water”.</p>
          <div className="mt-6 grid gap-3 rounded-xl bg-white p-3 text-slate-900 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('naturalSearch')} aria-label="Search residential properties" className="min-w-0 rounded-lg border border-slate-300 px-4 py-3" />
            <select value={county} onChange={(event) => setCounty(event.target.value)} aria-label={t('county')} className="rounded-lg border border-slate-300 bg-white px-3 py-3">
              <option value="">{t('allCounties')}</option>
              {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
            </select>
            <select value={listingType} onChange={(event) => setListingType(event.target.value as 'rent' | 'sale' | 'short_stay')} aria-label="Listing type" className="rounded-lg border border-slate-300 bg-white px-3 py-3">
              <option value="rent">{t('forRent')}</option>
              <option value="sale">{t('forSale')}</option>
              <option value="short_stay">{t('shortStays')}</option>
            </select>
            <select value={propertyType} onChange={(event) => setPropertyType(event.target.value)} aria-label="Property type" className="rounded-lg border border-slate-300 bg-white px-3 py-3">
              <option value="all">{t('allPropertyTypes')}</option>
              {['apartment', 'house', 'bedsitter', 'studio', 'townhouse', 'land', 'commercial', 'short_stay', 'other'].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
            </select>
            <input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={listingType === 'rent' ? t('maxMonthlyPrice') : listingType === 'short_stay' ? t('maxNightlyPrice') : t('maxPriceKes')} aria-label={t('maxPriceKes')} className="w-full rounded-lg border border-slate-300 px-3 py-3 md:w-44" />
            <select value={minBedrooms} onChange={(event) => setMinBedrooms(event.target.value)} aria-label={t('anyBedrooms')} className="rounded-lg border border-slate-300 bg-white px-3 py-3">
              <option value="">{t('anyBedrooms')}</option>
              {[0, 1, 2, 3, 4, 5].map((beds) => <option key={beds} value={beds}>{beds === 0 ? t('bedsitterStudio') : `${beds}+ ${t('bedrooms')}`}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-blue-100">
            <button type="button" onClick={useCurrentLocation} className="rounded-md bg-white px-3 py-1.5 font-semibold text-blue-900">
              {selectedLocation ? t('refreshMyLocation') : t('useMyLocation')}
            </button>
            {selectedLocation && (
              <button type="button" onClick={() => setSelectedLocation(null)} className="underline underline-offset-2">
                {t('clearLocation')}
              </button>
            )}
            <label>
              {t('locationRadius')}
              <select value={serviceRadius} onChange={(event) => setServiceRadius(Number(event.target.value))} className="ml-2 rounded-md border-0 bg-white px-2 py-1.5 text-slate-900">
                <option value={500}>500 m</option><option value={1000}>1 km</option><option value={2000}>2 km</option><option value={5000}>5 km</option>
              </select>
            </label>
            <label>
              {t('service')}
              <select value={selectedServiceCategory} onChange={(event) => setSelectedServiceCategory(event.target.value)} className="ml-2 rounded-md border-0 bg-white px-2 py-1.5 text-slate-900">
                <option value="all">{t('anyService')}</option>
                {[
                  ['hospital', 'Hospital'], ['school', 'School'], ['university', 'University'],
                  ['supermarket', 'Supermarket'], ['pharmacy', 'Pharmacy'], ['bank', 'Bank'],
                  ['atm', 'ATM'], ['petrol_station', 'Petrol station'], ['matatu_stage', 'Matatu stage'],
                  ['bus_stop', 'Bus stop'], ['railway_station', 'Railway station'],
                  ['restaurant', 'Restaurant'], ['cafe', 'Cafe'], ['gym', 'Gym'],
                  ['mosque', 'Mosque'], ['church', 'Church'], ['police_station', 'Police station'],
                  ['fire_station', 'Fire station'], ['park', 'Park'], ['shop', 'Shop'],
                  ['mpesa_agent', 'M-Pesa agent'],
                ].map(([category, label]) => <option key={category} value={category}>{label}</option>)}
              </select>
            </label>
            <span>Natural search filters beds, budget, location, amenities and named services.</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => void saveCurrentSearch()} disabled={savingSearch} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-900 disabled:opacity-60">
              {savingSearch ? t('savingSearch') : t('saveThisSearch')}
            </button>
            <Link href="/saved-searches" className="text-sm font-semibold text-blue-100 underline underline-offset-2">{t('manageSavedSearches')}</Link>
            <Link href="/saved" className="text-sm font-semibold text-blue-100 underline underline-offset-2">{t('savedHomes')}</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t('residentialListings')} <span className="text-base font-medium text-slate-500">({filteredProperties.length})</span></h2>
            <p className="mt-1 text-sm text-slate-500">{t('approximatePinsNote')}</p>
          </div>
          <div className="flex rounded-lg border border-slate-300 bg-white p-1 text-sm">
            <button type="button" onClick={() => setPresentation('list')} aria-pressed={presentation === 'list'} className={`rounded-md px-3 py-1.5 ${presentation === 'list' ? 'bg-blue-700 text-white' : 'text-slate-700'}`}>{t('list')}</button>
            <button type="button" onClick={() => setPresentation('map')} aria-pressed={presentation === 'map'} className={`rounded-md px-3 py-1.5 ${presentation === 'map' ? 'bg-blue-700 text-white' : 'text-slate-700'}`}>{t('map')}</button>
          </div>
        </div>

        {actionMessage && <p role="status" aria-live="polite" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{actionMessage}</p>}
        {errorMessage && <p role="alert" aria-live="assertive" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{errorMessage}</p>}
        {recommendedProperties.length > 0 && (
          <section className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-5">
            <h2 className="text-lg font-bold">Recommended from your saved homes</h2>
            <p className="mt-1 text-sm text-slate-600">Suggestions use similarities in location, property type, bedroom count, and price from homes you’ve saved.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {recommendedProperties.map((property) => (
                <Link key={property.id} href={`/properties/${property.id}`} className="rounded-lg border border-blue-100 bg-white p-4 hover:border-blue-400">
                  <p className="font-semibold">{property.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{property.location_label} · {property.bedrooms} bedrooms</p>
                  <p className="mt-2 text-sm font-bold text-blue-700">
                    {formatKes((property.listing_type === 'rent' ? property.monthly_rent : property.listing_type === 'short_stay' ? property.nightly_price : property.sale_price) ?? 0)}
                    {property.listing_type === 'rent' ? ' / month' : property.listing_type === 'short_stay' ? ' / night' : ''}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
        {loading ? <p role="status" aria-live="polite" className="py-12 text-center text-slate-600">Loading homes...</p>
          : filteredProperties.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">No homes match these filters yet. Try widening your search.</p>
            : (
              <div className={`mt-6 grid gap-6 ${presentation === 'map' ? 'lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
                <div className={`grid content-start gap-4 ${presentation === 'map' ? 'hidden sm:hidden lg:grid' : 'sm:grid-cols-1'}`}>
                  {filteredProperties.map((property) => {
                    const price = property.listing_type === 'rent' ? property.monthly_rent : property.listing_type === 'short_stay' ? property.nightly_price : property.sale_price
                    const selectedDistance = selectedLocation && property.latitude !== null && property.longitude !== null
                      ? distanceMeters(selectedLocation.latitude, selectedLocation.longitude, property.latitude, property.longitude)
                      : null
                    const nearby = property.property_nearby_services
                      .filter((service) => service.distance_m <= serviceRadius)
                      .sort((a, b) => a.distance_m - b.distance_m)
                      .slice(0, 2)
                    return (
                      <article key={property.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        {property.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={property.coverUrl} alt={property.title} className="h-48 w-full object-cover" />
                        ) : <div className="flex h-40 items-center justify-center bg-slate-100 text-sm text-slate-500">Property photos coming soon</div>}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase text-blue-700">{property.property_type.replaceAll('_', ' ')}</p>
                              <h3 className="mt-1 text-lg font-bold">{property.title}</h3>
                              <p className="mt-1 text-sm text-slate-600">📍 {property.location_label}</p>
                              {selectedDistance !== null && (
                                <p className="mt-1 text-xs text-slate-500">
                                  About {selectedDistance < 1000
                                    ? `${selectedDistance} m`
                                    : `${(selectedDistance / 1000).toFixed(1)} km`} from your selected location
                                </p>
                              )}
                              {currentTime !== null && property.featured_until && new Date(property.featured_until).getTime() > currentTime && <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Featured</p>}
                            </div>
                            <button type="button" onClick={() => void toggleFavorite(property.id)} aria-pressed={favorites.has(property.id)} aria-label={favorites.has(property.id) ? 'Remove saved property' : 'Save property'} className="rounded-full border border-slate-200 px-3 py-1 text-lg text-rose-600 hover:bg-rose-50">{favorites.has(property.id) ? '♥' : '♡'}</button>
                          </div>
                          <p className="mt-3 text-xl font-extrabold text-blue-700">{price === null ? 'Price on request' : formatKes(price)}{property.listing_type === 'rent' ? <span className="text-xs font-medium text-slate-500"> / month</span> : property.listing_type === 'short_stay' ? <span className="text-xs font-medium text-slate-500"> / night</span> : null}</p>
                          {property.property_type === 'land' ? <p className="mt-2 text-sm text-slate-700">{property.land_size_acres ? `${property.land_size_acres} acres` : 'Land size not listed'}</p>
                            : property.property_type === 'commercial' ? <p className="mt-2 text-sm text-slate-700">{property.commercial_use || 'Commercial property'}</p>
                              : <p className="mt-2 text-sm text-slate-700">{property.bedrooms} beds · {property.bathrooms} baths · {property.size_sqm ? `${property.size_sqm} m²` : 'Size not listed'}</p>}
                          {property.rental_property_reviews.length > 0 && <p className="mt-2 text-sm text-amber-700">★ {(property.rental_property_reviews.reduce((total, review) => total + review.rating, 0) / property.rental_property_reviews.length).toFixed(1)} <span className="text-xs text-slate-500">({property.rental_property_reviews.length} reviews)</span></p>}
                          {isListingStale(property.last_confirmed_at) && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{t('staleAvailability')}</p>}
                          {nearby.length > 0 && <p className="mt-2 text-xs text-slate-600">{nearby.map((service) => `${service.name} ${service.distance_m < 1000 ? `${service.distance_m} m` : `${(service.distance_m / 1000).toFixed(1)} km`}`).join(' · ')}</p>}
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <Link href={`/properties/${property.id}`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">View property</Link>
                            <label className="text-xs text-slate-600"><input type="checkbox" checked={comparison.has(property.id)} onChange={() => changeComparison(property.id)} className="mr-1 accent-blue-700" />Compare</label>
                            {property.verification_status === 'verified' && <span className="text-xs font-semibold text-emerald-700">✓ Verified</span>}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
                {presentation === 'map' && (
                  <div className="space-y-2 lg:sticky lg:top-4">
                    <p className="text-xs text-slate-600">{t('approximatePins')}</p>
                    {mapMarkers.length > 0
                      ? <KejaMap markers={mapMarkers} className="h-[460px]" />
                      : <div className="flex h-[460px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">{t('mapLocationsMissing')}</div>}
                  </div>
                )}
              </div>
            )}

        {comparedProperties.length > 0 && (
          <section className="mt-10 overflow-x-auto rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold">Compare properties ({comparedProperties.length}/3)</h2>
              <button type="button" onClick={() => { setComparison(new Set()); window.localStorage.removeItem('keja-property-comparison') }} className="text-sm font-semibold text-blue-700 hover:underline">Clear comparison</button>
            </div>
            <table className="mt-4 w-full min-w-[600px] text-left text-sm">
              <thead><tr><th className="p-2">Property</th>{comparedProperties.map((property) => <th key={property.id} className="p-2">{property.title}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                <tr><th className="p-2">Location</th>{comparedProperties.map((property) => <td key={property.id} className="p-2">{property.location_label}</td>)}</tr>
                <tr><th className="p-2">Price</th>{comparedProperties.map((property) => <td key={property.id} className="p-2">{formatKes(property.listing_type === 'rent' ? property.monthly_rent ?? 0 : property.listing_type === 'short_stay' ? property.nightly_price ?? 0 : property.sale_price ?? 0)}{property.listing_type === 'short_stay' ? ' / night' : property.listing_type === 'rent' ? ' / month' : ''}</td>)}</tr>
                <tr><th className="p-2">Bedrooms / baths</th>{comparedProperties.map((property) => <td key={property.id} className="p-2">{property.bedrooms} / {property.bathrooms}</td>)}</tr>
                <tr><th className="p-2">Parking / water</th>{comparedProperties.map((property) => <td key={property.id} className="p-2">{property.parking_spaces} / {property.water_available ? 'Available' : 'Not listed'}</td>)}</tr>
              </tbody>
            </table>
          </section>
        )}
      </section>
    </main>
  )
}
