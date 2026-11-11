'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getErrorMessage } from '@/lib/errors'
import { getHomeServiceCategoryLabel } from '@/lib/homeServices'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { supabase } from '@/lib/supabase'

type Department = 'property' | 'space' | 'service' | 'job' | 'directory'
type DepartmentFilter = 'all' | Department

interface SearchResult {
  id: string
  department: Department
  title: string
  description: string
  location: string
  href: string
  category: string
  price: string | null
}

const DEPARTMENTS: Array<{ value: DepartmentFilter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'property', label: 'Homes & land' },
  { value: 'space', label: 'Business spaces' },
  { value: 'service', label: 'Services & moving' },
  { value: 'job', label: 'Jobs' },
  { value: 'directory', label: 'Everyday listings' },
]

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchText = searchParams.get('q')?.trim() ?? ''
  const [county, setCounty] = useState('')
  const [department, setDepartment] = useState<DepartmentFilter>('all')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const term = searchText.replace(/[,.()%_*"'\\]/g, ' ').replace(/\s+/g, ' ').trim()

    if (term.length < 2) {
      return () => { active = false }
    }

    async function searchListings() {
      setLoading(true)
      setError('')
      try {
        const pattern = `%${term}%`
        let propertyQuery = supabase.from('rental_properties')
          .select('id,title,description,property_type,listing_type,monthly_rent,sale_price,nightly_price,location_label,county,town,ward,bedrooms,listing_status,verification_status')
          .eq('verification_status', 'verified')
          .in('listing_status', ['available', 'available_soon'])
          .or(`title.ilike.${pattern},description.ilike.${pattern},location_label.ilike.${pattern},town.ilike.${pattern},ward.ilike.${pattern},county.ilike.${pattern}`)
          .limit(40)
        let spaceQuery = supabase.from('stalls')
          .select('id,stall_number,monthly_rent,status,location_label,county,town,ward,category,description')
          .eq('status', 'vacant')
          .or(`stall_number.ilike.${pattern},location_label.ilike.${pattern},town.ilike.${pattern},ward.ilike.${pattern},county.ilike.${pattern},category.ilike.${pattern},description.ilike.${pattern}`)
          .limit(40)
        let serviceQuery = supabase.from('service_providers')
          .select('id,business_name,category,description,county,town,service_areas,starting_price,verification_status')
          .eq('verification_status', 'verified')
          .or(`business_name.ilike.${pattern},category.ilike.${pattern},description.ilike.${pattern},county.ilike.${pattern},town.ilike.${pattern}`)
          .limit(40)
        let jobQuery = supabase.from('property_jobs')
          .select('id,title,category,employment_type,description,county,town,pay_min,pay_max,status')
          .eq('status', 'open')
          .or(`title.ilike.${pattern},category.ilike.${pattern},description.ilike.${pattern},county.ilike.${pattern},town.ilike.${pattern}`)
          .limit(40)
        let directoryQuery = supabase.from('keja_directory_listings')
          .select('id,department,title,category,description,county,town,price,price_unit')
          .eq('status', 'approved')
          .or(`title.ilike.${pattern},category.ilike.${pattern},description.ilike.${pattern},county.ilike.${pattern},town.ilike.${pattern}`)
          .limit(60)

        if (county) {
          propertyQuery = propertyQuery.eq('county', county)
          spaceQuery = spaceQuery.eq('county', county)
          serviceQuery = serviceQuery.eq('county', county)
          jobQuery = jobQuery.eq('county', county)
          directoryQuery = directoryQuery.eq('county', county)
        }

        const [properties, spaces, services, jobs, directory] = await Promise.all([
          propertyQuery,
          spaceQuery,
          serviceQuery,
          jobQuery,
          directoryQuery,
        ])
        const queryError = properties.error ?? spaces.error ?? services.error ?? jobs.error ?? directory.error
        if (queryError) throw queryError

        const propertyResults: SearchResult[] = (properties.data ?? []).map((property) => ({
          id: property.id,
          department: 'property',
          title: property.title,
          description: property.description,
          location: [property.location_label, property.ward, property.town, property.county].filter(Boolean).join(', '),
          href: `/properties/${property.id}`,
          category: `${property.property_type} · ${property.listing_type.replace('_', ' ')}`,
          price: property.listing_type === 'sale'
            ? property.sale_price === null ? null : `KSh ${Number(property.sale_price).toLocaleString('en-KE')}`
            : property.listing_type === 'short_stay'
              ? property.nightly_price === null ? null : `KSh ${Number(property.nightly_price).toLocaleString('en-KE')} / night`
              : property.monthly_rent === null ? null : `KSh ${Number(property.monthly_rent).toLocaleString('en-KE')} / month`,
        }))
        const spaceResults: SearchResult[] = (spaces.data ?? []).map((space) => ({
          id: space.id,
          department: 'space',
          title: space.stall_number,
          description: space.description,
          location: [space.location_label, space.ward, space.town, space.county].filter(Boolean).join(', '),
          href: `/stalls/${space.id}`,
          category: space.category,
          price: `KSh ${Number(space.monthly_rent).toLocaleString('en-KE')} / month`,
        }))
        const serviceResults: SearchResult[] = (services.data ?? []).map((service) => ({
          id: service.id,
          department: 'service',
          title: service.business_name,
          description: service.description,
          location: [service.town, service.county].filter(Boolean).join(', '),
          href: `/services/${service.id}`,
          category: getHomeServiceCategoryLabel(service.category),
          price: service.starting_price === null
            ? null
            : `From KSh ${Number(service.starting_price).toLocaleString('en-KE')}`,
        }))
        const jobResults: SearchResult[] = (jobs.data ?? []).map((job) => ({
          id: job.id,
          department: 'job',
          title: job.title,
          description: job.description,
          location: [job.town, job.county].filter(Boolean).join(', '),
          href: '/jobs',
          category: `${job.category.replaceAll('_', ' ')} · ${job.employment_type.replaceAll('_', ' ')}`,
          price: job.pay_min === null && job.pay_max === null
            ? null
            : job.pay_min === null
              ? `Up to KSh ${Number(job.pay_max).toLocaleString('en-KE')}`
              : job.pay_max === null
                ? `KSh ${Number(job.pay_min).toLocaleString('en-KE')}+`
                : `KSh ${Number(job.pay_min).toLocaleString('en-KE')}–${Number(job.pay_max).toLocaleString('en-KE')}`,
        }))
        const departmentLabels: Record<string, string> = {
          marketplace: 'Marketplace',
          food: 'Food & restaurants',
          health: 'Healthcare',
          education: 'Education',
          transport: 'Transport',
          accommodation: 'Hotels & stays',
          agriculture: 'Agriculture',
          events: 'Events',
          businesses: 'Business directory',
        }
        const directoryResults: SearchResult[] = (directory.data ?? []).map((listing) => ({
          id: listing.id,
          department: 'directory',
          title: listing.title,
          description: listing.description,
          location: [listing.town, listing.county].filter(Boolean).join(', '),
          href: `/directory?department=${listing.department}&q=${encodeURIComponent(term)}`,
          category: `${departmentLabels[listing.department] ?? 'Local listing'} · ${listing.category}`,
          price: listing.price === null
            ? null
            : `KSh ${Number(listing.price).toLocaleString('en-KE')}${listing.price_unit ? ` / ${listing.price_unit}` : ''}`,
        }))

        if (active) setResults([...propertyResults, ...spaceResults, ...serviceResults, ...jobResults, ...directoryResults])
      } catch (searchError) {
        console.error('Could not search MTAA listings:', searchError)
        if (active) setError(`Could not search listings: ${getErrorMessage(searchError)}`)
      } finally {
        if (active) setLoading(false)
      }
    }

    void searchListings()
    return () => { active = false }
  }, [county, searchText])

  const filteredResults = useMemo(
    () => searchText.length < 2
      ? []
      : department === 'all' ? results : results.filter((result) => result.department === department),
    [department, results, searchText],
  )

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const query = String(formData.get('q') ?? '').trim()
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="text-2xl font-black tracking-tight text-emerald-950">MTAA</Link>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link href="/" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Home</Link>
            <Link href="/homes" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Homes</Link>
            <Link href="/services" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Services</Link>
            <Link href="/jobs" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Jobs</Link>
            <Link href="/dashboard" className="rounded-lg bg-emerald-800 px-4 py-2 text-white hover:bg-emerald-900">My MTAA</Link>
          </div>
        </nav>
      </header>

      <section className="bg-emerald-950 px-5 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-lime-300">One search, across MTAA</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Find what you need in Kenya.</h1>
          <p className="mt-3 max-w-2xl leading-7 text-emerald-100">Search verified homes, business spaces, service providers, moving support and property jobs in one place.</p>
          <form onSubmit={submitSearch} className="mt-7 grid gap-3 rounded-2xl bg-white p-3 text-slate-900 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="keja-search">Search across MTAA</label>
            <input id="keja-search" name="q" type="search" defaultValue={searchText} minLength={2} maxLength={100} placeholder="Try “2 bedroom in Nakuru”, “mover”, or “electrician”" className="min-w-0 rounded-xl border border-slate-200 px-4 py-3.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            <button type="submit" className="rounded-xl bg-emerald-800 px-6 py-3.5 font-bold text-white hover:bg-emerald-900">Search MTAA</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-9 sm:py-12">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-sm font-semibold text-slate-700">Filter by county
            <select value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 sm:max-w-sm">
              <option value="">All counties</option>
              {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          {searchText && <p className="text-sm text-slate-600">Results for <span className="font-bold text-slate-900">“{searchText}”</span></p>}
        </div>

        <div className="mt-7 flex flex-wrap gap-2" aria-label="Filter results by department">
          {DEPARTMENTS.map((item) => (
            <button key={item.value} type="button" aria-pressed={department === item.value} onClick={() => setDepartment(item.value)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${department === item.value ? 'bg-emerald-800 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-emerald-700'}`}>
              {item.label}{item.value === 'all' ? ` (${results.length})` : ` (${results.filter((result) => result.department === item.value).length})`}
            </button>
          ))}
        </div>

        <div className="mt-6" aria-live="polite">
          {searchText.length < 2 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-bold">Start with one search</h2><p className="mt-2 text-slate-600">Search by name, service, job, property type, or Kenyan county.</p></div>
            : loading ? <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">Searching across MTAA…</p>
            : error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</p>
              : filteredResults.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-bold">No matching listings yet</h2><p className="mt-2 text-slate-600">Try a different search or county. New departments will join this search as MTAA grows.</p></div>
                  : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredResults.map((result) => (
                    <article key={`${result.department}-${result.id}`} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-900">{result.department === 'property' ? 'Home & land' : result.department === 'space' ? 'Business space' : result.department === 'service' ? 'Service' : result.department === 'job' ? 'Job' : 'Everyday listing'}</span>{result.price && <span className="text-right text-sm font-bold text-emerald-900">{result.price}</span>}</div>
                      <h2 className="mt-4 text-xl font-bold">{result.title}</h2>
                      <p className="mt-1 text-sm font-semibold capitalize text-slate-600">{result.category}</p>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{result.description}</p>
                      <p className="mt-3 text-sm text-slate-500">{result.location || 'Kenya'}</p>
                      <Link href={result.href} className="mt-5 inline-flex self-start rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">View details</Link>
                    </article>
                  ))}</div>}
        </div>
      </section>
    </main>
  )
}

export default function SearchPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f7f8f5] p-10 text-center text-slate-600">Loading MTAA search…</main>}><SearchContent /></Suspense>
}
