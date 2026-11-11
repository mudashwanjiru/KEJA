'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

interface SavedSearch {
  id: string
  search_text: string
  location: string
  county: string | null
  listing_type: 'rent' | 'sale' | 'short_stay'
  max_price: number | null
  min_bedrooms: number | null
  service_categories: string[]
  service_radius_m: number
  notify_new_listings: boolean
  created_at: string
}

export default function SavedSearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadSearches() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) {
          if (active) setMessage('Sign in to manage saved searches.')
          return
        }
        const { data, error } = await supabase.from('rental_saved_searches')
          .select('id,search_text,location,county,listing_type,max_price,min_bedrooms,service_categories,service_radius_m,notify_new_listings,created_at')
          .order('created_at', { ascending: false })
        if (error) throw error
        if (active) setSearches((data ?? []) as SavedSearch[])
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadSearches()
    return () => { active = false }
  }, [])

  const removeSearch = async (id: string) => {
    const { error } = await supabase.from('rental_saved_searches').delete().eq('id', id)
    if (error) setMessage(getErrorMessage(error))
    else setSearches((current) => current.filter((search) => search.id !== id))
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link href="/homes" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <Link href="/saved" className="text-sm font-medium text-slate-700 hover:text-blue-700">Saved homes</Link>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-3xl font-bold">Saved searches</h1>
        <p className="mt-2 text-sm text-slate-600">Get an in-app notification when a newly verified property matches your location, price, bedrooms, listing type, and selected nearby-service filters.</p>
        {message && <p role="status" className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
        {loading ? <p className="py-10 text-slate-600">Loading saved searches...</p>
          : searches.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">No saved searches yet. Choose your filters on the homes page and select “Save this search”.</p>
            : <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-5">
              {searches.map((search) => (
                <article key={search.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div>
                    <p className="font-semibold">{[search.location, search.county].filter(Boolean).join(', ') || 'Any location'} · {search.listing_type === 'rent' ? 'For rent' : search.listing_type === 'short_stay' ? 'Short stays' : 'For sale'}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {search.max_price ? `Up to KSh ${Number(search.max_price).toLocaleString()} · ` : ''}
                      {search.min_bedrooms !== null ? `${search.min_bedrooms}+ bedrooms` : 'Any bedrooms'}
                    </p>
                    {search.service_categories.length > 0 && <p className="mt-1 text-xs text-slate-500">Nearby: {search.service_categories.map((category) => category.replaceAll('_', ' ')).join(', ')} within {search.service_radius_m < 1000 ? `${search.service_radius_m} m` : `${search.service_radius_m / 1000} km`}</p>}
                    {search.search_text && <p className="mt-1 text-xs text-slate-500">{search.search_text}</p>}
                  </div>
                  <button type="button" onClick={() => void removeSearch(search.id)} className="text-sm font-semibold text-rose-700 hover:underline">Delete</button>
                </article>
              ))}
            </div>}
      </section>
    </main>
  )
}
