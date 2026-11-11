'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface ListingSnapshot {
  county: string | null
  property_type: string
  listing_type: 'rent' | 'sale' | 'short_stay'
  monthly_rent: number | null
  sale_price: number | null
  nightly_price: number | null
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function amountFor(listing: ListingSnapshot) {
  return listing.listing_type === 'rent'
    ? listing.monthly_rent
    : listing.listing_type === 'sale'
      ? listing.sale_price
      : listing.nightly_price
}

export default function PropertyInsightsPage() {
  const [listings, setListings] = useState<ListingSnapshot[]>([])
  const [county, setCounty] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        let query = supabase.from('rental_properties')
          .select('county,property_type,listing_type,monthly_rent,sale_price,nightly_price')
          .eq('verification_status', 'verified')
          .in('listing_status', ['available', 'available_soon'])
          .limit(1000)
        if (county) query = query.eq('county', county)
        const { data, error } = await query
        if (error) throw error
        if (active) setListings((data ?? []) as ListingSnapshot[])
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [county])

  const summaries = useMemo(() => {
    const groups = new Map<string, ListingSnapshot[]>()
    for (const listing of listings) {
      const key = `${listing.county ?? 'County not specified'}|${listing.property_type}|${listing.listing_type}`
      groups.set(key, [...(groups.get(key) ?? []), listing])
    }
    return [...groups.entries()].flatMap(([key, group]) => {
      const [groupCounty, propertyType, listingType] = key.split('|')
      const amounts = group.map(amountFor).filter((value): value is number => value !== null && Number(value) > 0).map(Number).sort((a, b) => a - b)
      if (amounts.length < 3) return []
      return [{
        county: groupCounty,
        propertyType,
        listingType: listingType as ListingSnapshot['listing_type'],
        count: amounts.length,
        median: median(amounts),
        low: amounts[0] ?? 0,
        high: amounts[amounts.length - 1] ?? 0,
      }]
    }).sort((a, b) => a.county.localeCompare(b.county) || a.propertyType.localeCompare(b.propertyType))
  }, [listings])

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-bold text-blue-700">MTAA insights</Link><nav className="flex gap-4 text-sm"><Link href="/homes" className="text-slate-600 hover:text-blue-700">Browse listings</Link><Link href="/financing" className="text-slate-600 hover:text-blue-700">Financing</Link></nav></div></header>
    <section className="mx-auto max-w-6xl px-5 py-9"><h1 className="text-3xl font-extrabold">Property market snapshot</h1><p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">These comparisons summarize current, verified MTAA asking prices—not completed transactions, independent valuations, or investment advice. Listings may be incomplete, unrepresentative, or out of date. Use the sample size and contact professionals before making decisions.</p>
      <label className="mt-5 inline-block text-sm font-medium">County<select value={county} onChange={(event) => setCounty(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">All counties</option>{KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}</select></label>
      {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      {loading ? <p className="py-12 text-center text-slate-600">Calculating listing comparisons…</p> : summaries.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-slate-600">There are not yet enough verified listings in a group to provide a useful comparison. A minimum of three listings is required.</p> : <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">County</th><th className="p-3">Property type</th><th className="p-3">Listing</th><th className="p-3">Sample</th><th className="p-3">Median asking price</th><th className="p-3">Observed range</th></tr></thead><tbody className="divide-y divide-slate-100">{summaries.map((summary) => <tr key={`${summary.county}-${summary.propertyType}-${summary.listingType}`}><td className="p-3">{summary.county}</td><td className="p-3 capitalize">{summary.propertyType.replaceAll('_', ' ')}</td><td className="p-3">{summary.listingType === 'rent' ? 'Monthly rent' : summary.listingType === 'sale' ? 'For sale' : 'Nightly stay'}</td><td className="p-3">{summary.count}</td><td className="p-3 font-semibold">KSh {Math.round(summary.median).toLocaleString('en-KE')}{summary.listingType === 'rent' ? '/month' : summary.listingType === 'short_stay' ? '/night' : ''}</td><td className="p-3">KSh {Math.round(summary.low).toLocaleString('en-KE')} – {Math.round(summary.high).toLocaleString('en-KE')}</td></tr>)}</tbody></table></div>}
      <p className="mt-4 text-xs text-slate-500">Comparisons use only listings returned by MTAA’s current search (up to 1,000 per county selection). Groups with fewer than three priced listings are hidden.</p>
    </section>
  </main>
}
