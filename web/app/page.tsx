'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { useKejaLanguage } from '@/lib/language'
import KejaMap from '@/lib/KejaMap'
import { isListingStale } from '@/lib/listingFreshness'

const CATEGORIES = ['Fashion & Apparel', 'Electronics', 'Food & Beverage', 'Beauty & Wellness', 'General']

interface Stall {
  id: string
  stall_number: string
  monthly_rent: number
  size_sqft: number | null
  status: string
  location_label: string
  county: string | null
  town: string | null
  category: string
  description: string
  latitude: number | null
  longitude: number | null
  last_confirmed_at: string
}

const formatKes = (amount: number) => `KSh ${new Intl.NumberFormat('en-KE').format(amount)}`

const liveCategories = [
  { icon: '⌂', title: 'Homes & rentals', detail: 'Find a place to call home.', href: '/homes' },
  { icon: '▦', title: 'Business spaces', detail: 'Stalls and commercial property.', href: '#listings' },
  { icon: '⚒', title: 'Home services', detail: 'Connect with trusted local pros.', href: '/services' },
  { icon: '↗', title: 'Moving & delivery', detail: 'Request a move with a local provider.', href: '/services' },
  { icon: '💼', title: 'Property jobs', detail: 'Find work or hire locally.', href: '/jobs' },
  { icon: '◎', title: 'Neighborhoods', detail: 'Get to know your next area.', href: '/neighborhoods' },
  { icon: 'KSh', title: 'Financing', detail: 'Explore property finance options.', href: '/financing' },
  { icon: '▤', title: 'Short stays', detail: 'Browse places for a short visit.', href: '/bookings' },
  { icon: '⌁', title: 'Market insights', detail: 'Make informed property decisions.', href: '/insights' },
  { icon: '✦', title: 'MTAA guide', detail: 'Get help finding the right section.', href: '/assistant' },
]

const everydayDepartments = [
  { value: 'properties', label: 'Properties', description: 'Find homes, rentals and business spaces.', icon: '⌂', href: '/homes' },
  { value: 'food', label: 'Market & food', description: 'Shop groceries and discover local food.', icon: '🍲', href: '/directory?department=food' },
  { value: 'construction', label: 'Construction', description: 'Find building materials and contractors.', icon: '⚒', href: '/directory?department=construction' },
  { value: 'education', label: 'Education', description: 'Discover schools, tutors and supplies.', icon: '▤', href: '/directory?department=education' },
  { value: 'health', label: 'Healthcare', description: 'Find clinics, pharmacies and care.', icon: '✚', href: '/directory?department=health' },
  { value: 'transport', label: 'Transport', description: 'Book local transport and delivery.', icon: '↗', href: '/directory?department=transport' },
  { value: 'agriculture', label: 'Agriculture', description: 'Buy and sell farm goods and services.', icon: '❋', href: '/directory?department=agriculture' },
  { value: 'marketplace', label: 'Shopping', description: 'Shop furniture, electronics and more.', icon: '▦', href: '/directory?department=marketplace' },
  { value: 'events', label: 'Events', description: 'Find venues and event professionals.', icon: '✦', href: '/directory?department=events' },
  { value: 'essentials', label: 'Household essentials', description: 'Arrange gas, water, cleaning and laundry.', icon: '⌁', href: '/directory?department=essentials' },
  { value: 'automotive', label: 'Automotive', description: 'Find vehicles, parts and auto services.', icon: '▰', href: '/directory?department=automotive' },
  { value: 'services', label: 'Services', description: 'Connect with trusted local professionals.', icon: '✧', href: '/services' },
]

export default function Home() {
  const { t } = useKejaLanguage()
  const [stalls, setStalls] = useState<Stall[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [maxRent, setMaxRent] = useState('')
  const [availability, setAvailability] = useState('')
  const [county, setCounty] = useState('')
  const [stallPresentation, setStallPresentation] = useState<'list' | 'map'>('list')

  useEffect(() => {
    let isMounted = true

    async function fetchStalls() {
      try {
        setLoading(true)
        setErrorMsg(null)
        let query = supabase
          .from('stalls')
          .select('id,stall_number,monthly_rent,size_sqft,status,location_label,county,town,category,description,last_confirmed_at')
        if (county) query = query.eq('county', county)
        const { data, error } = await query.order('monthly_rent', { ascending: true })

        if (error) throw error
        const rows = data ?? []
        const { data: mapPoints, error: mapPointsError } = rows.length
          ? await supabase.rpc('commercial_stall_map_points', { stall_ids: rows.map((stall) => stall.id) })
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
        if (isMounted) setStalls(rows.map((stall) => ({
          ...stall,
          latitude: mapPointById.get(stall.id)?.latitude ?? null,
          longitude: mapPointById.get(stall.id)?.longitude ?? null,
        })) as Stall[])
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' &&
                error !== null &&
                'message' in error &&
                typeof error.message === 'string'
              ? error.message
              : String(error)
        const errorName = error instanceof Error ? error.name : 'Unknown error'
        const isNetworkError = /failed to fetch|networkerror|load failed|fetch failed/i.test(message)

        if (!isNetworkError) {
          console.error(`Error fetching stalls (${errorName}): ${message}`, error)
        }
        if (isMounted) {
          setErrorMsg(
            isNetworkError
              ? 'Cannot connect to Supabase. Confirm the project is active and the Project URL and publishable key in web/.env.local match Project Settings → API.'
              : `Could not load spaces: ${message}`
          )
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void fetchStalls()
    return () => { isMounted = false }
  }, [county])

  const filteredStalls = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const rentLimit = maxRent === '' ? null : Number(maxRent)
    return stalls.filter((stall) => {
      const matchesSearch = !query || [
        stall.stall_number,
        stall.location_label,
        stall.county,
        stall.town,
        stall.category,
        stall.description,
      ].some((value) => value?.toLowerCase().includes(query))
      const matchesCategory = selectedCategory === 'all' || stall.category === selectedCategory
      const matchesRent = rentLimit === null || stall.monthly_rent <= rentLimit
      const matchesAvailability = !availability || stall.status.toLowerCase() === availability
      return matchesSearch && matchesCategory && matchesRent && matchesAvailability
        && (!county || stall.county === county)
    })
  }, [availability, county, maxRent, searchQuery, selectedCategory, stalls])
  const stallMapMarkers = useMemo(() => filteredStalls.flatMap((stall) => (
    stall.latitude === null || stall.longitude === null
      ? []
      : [{
          id: stall.id,
          latitude: stall.latitude,
          longitude: stall.longitude,
          label: `${stall.stall_number} · ${stall.location_label}`,
          href: `/stalls/${stall.id}`,
        }]
  )), [filteredStalls])

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 text-2xl font-black tracking-tight text-emerald-950">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-emerald-800 text-lg text-white">M</span>
            MTAA
          </Link>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Link href="#explore" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900">{t('explore')}</Link>
            <Link href="/search" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900">{t('search')}</Link>
            <Link href="/homes" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900">{t('homes')}</Link>
            <Link href="/services" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900">{t('services')}</Link>
            <Link href="/jobs" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900">{t('jobs')}</Link>
            <Link href="/assistant" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900">{t('guide')}</Link>
            <Link href="/landlord" className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">{t('listWithKeja')}</Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate overflow-hidden bg-emerald-950 px-5 py-16 text-white sm:py-24">
        <div aria-hidden="true" className="absolute -right-20 -top-32 -z-10 size-96 rounded-full bg-lime-400/10 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-48 left-1/4 -z-10 size-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-900/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-lime-200">
              <span aria-hidden="true" className="size-2 rounded-full bg-lime-300" />
              Made for life in Kenya
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              {t('findYourPlace')}
              <span className="block text-lime-300">Build what&apos;s next.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-emerald-100 sm:text-xl">
              {t('heroCopy')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/search" className="rounded-xl bg-lime-300 px-5 py-3.5 font-bold text-emerald-950 transition hover:bg-lime-200">
                {t('searchAcrossKeja')}
              </Link>
              <Link href="#explore" className="rounded-xl bg-lime-300 px-5 py-3.5 font-bold text-emerald-950 transition hover:bg-lime-200">
                {t('exploreKeja')}
              </Link>
              <Link href="#listings" className="rounded-xl border border-emerald-600 px-5 py-3.5 font-bold text-white transition hover:bg-emerald-900">
                Find a business space
              </Link>
            </div>
          </div>
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-lime-300">One platform</p>
            <p className="mt-3 text-3xl font-extrabold leading-tight">For the place you live, work and grow.</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm font-semibold text-emerald-50">
              <div className="rounded-xl bg-white/5 p-3"><span className="mr-2 text-lime-300">01</span>Find a home</div>
              <div className="rounded-xl bg-white/5 p-3"><span className="mr-2 text-lime-300">02</span>Grow a business</div>
              <div className="rounded-xl bg-white/5 p-3"><span className="mr-2 text-lime-300">03</span>Get local help</div>
              <div className="rounded-xl bg-white/5 p-3"><span className="mr-2 text-lime-300">04</span>Find opportunity</div>
            </div>
          </aside>
        </div>
      </section>

      <section id="explore" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-14 sm:px-6 sm:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">Everyday, on MTAA</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">What are you looking for?</h2>
            <p className="mt-3 max-w-2xl text-slate-600">Start with what you need today. We&apos;re building a bigger home for everyday needs across Kenya.</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-900">{t('ecosystem')}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {liveCategories.map((category) => (
            <Link key={category.title} href={category.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg">
              <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-2xl font-bold text-emerald-800 transition group-hover:bg-emerald-800 group-hover:text-white">{category.icon}</span>
              <h3 className="mt-4 text-lg font-bold">{category.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{category.detail}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-emerald-800">Explore <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section id="everyday" className="scroll-mt-24 border-y border-slate-200 bg-white px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">Beyond property</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Discover more of everyday Kenya.</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">{t('localListings')}</p>
            </div>
            <Link href="/directory" className="rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50">{t('departments')} <span aria-hidden="true">→</span></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {everydayDepartments.map((item) => (
              <Link key={item.value} href={item.href} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-[#f7f8f5] p-4 transition hover:border-emerald-300 hover:bg-emerald-50">
                <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-xl font-bold text-emerald-800 shadow-sm">{item.icon}</span>
                <span><span className="block font-bold">{item.label}</span><span className="mt-0.5 block text-sm text-slate-600">{item.description}</span></span>
                <span aria-hidden="true" className="ml-auto text-emerald-800 transition group-hover:translate-x-1">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="listings" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-14 sm:px-6 sm:py-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">For biashara</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Find a space for your next move.</h2>
            <p className="mt-2 text-slate-600">{t('everydayLife')}</p>
          </div>
          <Link href="/post" className="rounded-lg px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50">List your space <span aria-hidden="true">→</span></Link>
        </div>

        <div className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-semibold text-slate-700">
            {t('searchSpaces')}
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('areaStallKeyword')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('county')}
            <select value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              <option value="">{t('allCounties')}</option>
              {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('category')}
            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              <option value="all">{t('allCategories')}</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('maxMonthlyRent')}
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={maxRent}
              onChange={(event) => setMaxRent(event.target.value)}
              placeholder={t('anyBudget')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('availability')}
            <select value={availability} onChange={(event) => setAvailability(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              <option value="">{t('anyAvailability')}</option>
              <option value="vacant">{t('available')}</option>
              <option value="occupied">{t('occupied')}</option>
            </select>
          </label>
        </div>

        <p className="mb-4 text-sm text-slate-500" aria-live="polite">
          {loading ? t('loading') : `${filteredStalls.length} ${filteredStalls.length === 1 ? t('spaceCountOne') : t('spaceCount')}`}
        </p>
        <div className="mb-4 flex gap-2">
          <button type="button" aria-pressed={stallPresentation === 'list'} onClick={() => setStallPresentation('list')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${stallPresentation === 'list' ? 'bg-emerald-800 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{t('list')}</button>
          <button type="button" aria-pressed={stallPresentation === 'map'} onClick={() => setStallPresentation('map')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${stallPresentation === 'map' ? 'bg-emerald-800 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{t('map')}</button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-600">Loading available spaces…</div>
        ) : errorMsg ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center text-red-800">{errorMsg}</div>
        ) : filteredStalls.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
            <h3 className="text-lg font-semibold">{t('noStallsMatch')}</h3>
            <p className="mt-2 text-slate-600">{t('widenStallSearch')}</p>
            <button type="button" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setMaxRent(''); setAvailability(''); setCounty('') }} className="mt-4 font-semibold text-emerald-800 hover:underline">
              {t('clearFilters')}
            </button>
          </div>
        ) : (
          <>
          {stallPresentation === 'map' && (
            <section aria-label="Map of commercial spaces" className="mb-6">
              <p className="mb-2 text-xs text-slate-600">{stallMapMarkers.length} {t('stallsWithPins')}. {t('approximatePins')}</p>
              {stallMapMarkers.length
                ? <KejaMap markers={stallMapMarkers} className="h-[460px]" />
                : <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">{t('noStallPins')}</div>}
            </section>
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStalls.map((stall, index) => (
              <article key={stall.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className={`relative flex h-48 items-end bg-gradient-to-br ${index % 3 === 0 ? 'from-emerald-100 via-lime-50 to-teal-100' : index % 3 === 1 ? 'from-amber-100 via-orange-50 to-yellow-100' : 'from-sky-100 via-cyan-50 to-emerald-100'} p-5`}>
                  <span aria-hidden="true" className="absolute right-5 top-3 text-6xl text-emerald-900 opacity-20">⌂</span>
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold capitalize text-emerald-800">{stall.status}</span>
                </div>
                <div className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">{stall.category}</p>
                  <h3 className="mt-1 text-xl font-bold">{stall.stall_number}</h3>
                  <p className="mt-1 text-sm text-slate-600">{[stall.location_label, stall.town, stall.county].filter(Boolean).join(', ') || 'Location available on request'}</p>
                  {isListingStale(stall.last_confirmed_at) && <p className="mt-2 text-xs font-semibold text-amber-800">{t('staleAvailability')}</p>}
                  <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{stall.description || 'A flexible commercial space ready for your business.'}</p>
                  <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('monthlyRent')}</p>
                      <p className="mt-0.5 font-bold text-emerald-900">{formatKes(stall.monthly_rent)}<span className="text-sm font-medium text-slate-500"> / mo</span></p>
                      {stall.size_sqft && <p className="mt-1 text-xs text-slate-500">{stall.size_sqft} sq. ft.</p>}
                    </div>
                    <Link href={`/stalls/${stall.id}`} className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900">{t('viewSpace')}</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          </>
        )}
      </section>

      <footer className="border-t border-slate-200 bg-white px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-sm text-slate-600">
          <Link href="/" className="font-black tracking-tight text-emerald-950">MTAA</Link>
          <p>One platform. Many solutions. Everyday needs.</p>
          <div className="flex gap-4">
            <Link href="/homes" className="hover:text-emerald-800">Homes</Link>
            <Link href="/services" className="hover:text-emerald-800">Services</Link>
            <Link href="/jobs" className="hover:text-emerald-800">Jobs</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
