'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

interface SavedProperty {
  id: string
  title: string
  listing_type: string
  monthly_rent: number | null
  sale_price: number | null
  nightly_price: number | null
  bedrooms: number
  bathrooms: number
  location_label: string
}

export default function SavedPropertiesPage() {
  const [properties, setProperties] = useState<SavedProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadSaved() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) {
          if (active) setMessage('Sign in to view your saved properties.')
          return
        }
        const { data, error } = await supabase.from('rental_property_favorites')
          .select('rental_properties(id,title,listing_type,monthly_rent,sale_price,nightly_price,bedrooms,bathrooms,location_label)')
          .eq('user_id', sessionData.session.user.id)
        if (error) throw error
        if (active) {
          setProperties((data ?? []).flatMap((favorite) => favorite.rental_properties
            ? [favorite.rental_properties as unknown as SavedProperty]
            : []))
        }
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadSaved()
    return () => { active = false }
  }, [])

  const removeSaved = async (propertyId: string) => {
    const { error } = await supabase.from('rental_property_favorites').delete().eq('property_id', propertyId)
    if (error) setMessage(getErrorMessage(error))
    else setProperties((current) => current.filter((property) => property.id !== propertyId))
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/homes" className="text-lg font-bold text-blue-700">StallSpace KE</Link><Link href="/notifications" className="text-sm font-medium text-slate-700 hover:text-blue-700">Notifications</Link></div></header>
      <section className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-3xl font-bold">Saved properties</h1>
        <p className="mt-2 text-sm text-slate-600">Your favourite homes, available across your signed-in sessions.</p>
        {message && <p role="status" className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
        {loading ? <p className="py-10 text-slate-600">Loading saved homes...</p>
          : properties.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">No saved properties yet. Browse homes and select the heart to save one.</p>
            : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{properties.map((property) => {
              const price = property.listing_type === 'sale' ? property.sale_price : property.listing_type === 'short_stay' ? property.nightly_price : property.monthly_rent
              return <article key={property.id} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-600">{property.location_label}</p><h2 className="mt-1 text-lg font-bold">{property.title}</h2><p className="mt-2 font-bold text-blue-700">{price === null ? 'Price on request' : `KSh ${Number(price).toLocaleString()}`}{property.listing_type === 'rent' ? ' / month' : property.listing_type === 'short_stay' ? ' / night' : ''}</p><p className="mt-1 text-sm text-slate-600">{property.bedrooms} bedrooms · {property.bathrooms} bathrooms</p><div className="mt-4 flex items-center justify-between"><Link href={`/properties/${property.id}`} className="text-sm font-semibold text-blue-700 hover:underline">View property</Link><button onClick={() => void removeSaved(property.id)} className="text-sm font-semibold text-rose-700 hover:underline">Remove</button></div></article>
            })}</div>}
      </section>
    </main>
  )
}
