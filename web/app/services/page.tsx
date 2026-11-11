'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { getHomeServiceCategoryLabel, HOME_SERVICE_CATEGORIES } from '@/lib/homeServices'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { supabase } from '@/lib/supabase'

interface Provider {
  id: string
  business_name: string
  category: string
  description: string
  county: string
  town: string
  service_areas: string[]
  starting_price: number | null
  years_experience: number
  verification_status: string
}

export default function HomeServicesPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [category, setCategory] = useState('')
  const [county, setCounty] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadProviders() {
      setLoading(true)
      setError('')
      try {
        let query = supabase.from('service_providers')
          .select('id,business_name,category,description,county,town,service_areas,starting_price,years_experience,verification_status')
          .eq('verification_status', 'verified')
        if (category) query = query.eq('category', category)
        if (county) query = query.eq('county', county)
        const { data, error: queryError } = await query.order('business_name').limit(200)
        if (queryError) throw queryError
        if (active) setProviders((data ?? []) as Provider[])
      } catch (loadError) {
        console.error('Could not load home service providers:', loadError)
        if (active) setError(`Could not load providers: ${getErrorMessage(loadError)}`)
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadProviders()
    return () => { active = false }
  }, [category, county])

  const filteredProviders = providers.filter((provider) => {
    const query = search.trim().toLowerCase()
    return !query || [
      provider.business_name,
      provider.description,
      provider.town,
      provider.county,
      ...provider.service_areas,
    ].some((value) => value.toLowerCase().includes(query))
  })

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="text-xl font-bold text-blue-700">MTAA</Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/homes" className="font-medium text-slate-600 hover:text-blue-700">Homes</Link>
            <Link href="/jobs" className="font-medium text-slate-600 hover:text-blue-700">Property jobs</Link>
            <Link href="/neighborhoods" className="font-medium text-slate-600 hover:text-blue-700">Neighborhoods</Link>
            <Link href="/insights" className="font-medium text-slate-600 hover:text-blue-700">Market insights</Link>
            <Link href="/" className="font-medium text-slate-600 hover:text-blue-700">Stalls</Link>
            <Link href="/services/provider" className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800">Join as a provider</Link>
          </nav>
        </div>
      </header>

      <section className="bg-emerald-950 px-5 py-14 text-white sm:py-18">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-200">Trusted local professionals</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">Find help for your home</h1>
          <p className="mt-4 max-w-2xl text-lg leading-7 text-emerald-100">Connect with plumbers, electricians, cleaners, movers, and other service providers across Kenya.</p>
          <div className="mt-7 grid gap-3 rounded-xl bg-white p-3 text-slate-900 sm:grid-cols-3">
            <label className="text-sm font-semibold">Search name or area
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. cleaner in Ruiru" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal" />
            </label>
            <label className="text-sm font-semibold">Service
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-normal">
                <option value="">All services</option>
                {HOME_SERVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">County
              <select value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-normal">
                <option value="">All counties</option>
                {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Home service providers</h2>
            <p className="mt-1 text-sm text-slate-600">{loading ? 'Loading providers…' : `${filteredProviders.length} verified ${filteredProviders.length === 1 ? 'provider' : 'providers'}`}</p>
          </div>
          <Link href="/services/provider" className="text-sm font-semibold text-blue-700 hover:underline">Offer your services &rarr;</Link>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        {!loading && !error && filteredProviders.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h3 className="text-lg font-bold">No providers found for those filters</h3>
            <p className="mt-2 text-sm text-slate-600">Try another county or service. New provider profiles appear after verification.</p>
          </div>
        )}
        {loading && <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">Finding local professionals…</p>}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProviders.map((provider) => (
            <article key={provider.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{getHomeServiceCategoryLabel(provider.category)}</p>
                  <h3 className="mt-1 text-xl font-bold">{provider.business_name}</h3>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Verified</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{provider.town}, {provider.county}</p>
              <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-700">{provider.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{provider.years_experience} years experience</span>
                {provider.starting_price !== null && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">From KSh {Number(provider.starting_price).toLocaleString('en-KE')}</span>}
              </div>
              {provider.service_areas.length > 0 && <p className="mt-3 text-xs text-slate-500">Also serves: {provider.service_areas.join(', ')}</p>}
              <Link href={`/services/${provider.id}`} className="mt-5 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">View profile</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
