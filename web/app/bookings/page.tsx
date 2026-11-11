'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface StayBooking {
  id: string
  property_id: string
  check_in: string
  check_out: string
  guest_count: number
  message: string
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed'
  rental_properties: { title: string; location_label: string; nightly_price: number | null } | null
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<StayBooking[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load(id: string) {
    const { data, error } = await supabase.from('short_stay_bookings')
      .select('id,property_id,check_in,check_out,guest_count,message,status,rental_properties(title,location_label,nightly_price)')
      .eq('requester_id', id).order('created_at', { ascending: false })
    if (error) throw error
    setBookings((data ?? []) as unknown as StayBooking[])
  }

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!data.user) return
        if (active) setUserId(data.user.id)
        await load(data.user.id)
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => { active = false }
  }, [])

  async function cancel(bookingId: string) {
    const { error } = await supabase.from('short_stay_bookings').update({ status: 'cancelled' }).eq('id', bookingId)
    if (error) setMessage(getErrorMessage(error))
    else if (userId) {
      setMessage('Booking request cancelled.')
      await load(userId)
    }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><Link href="/homes" className="text-lg font-bold text-blue-700">MTAA stays</Link><Link href="/homes" className="text-sm font-semibold text-slate-600 hover:text-blue-700">Browse properties</Link></div></header>
    <section className="mx-auto max-w-5xl px-5 py-8"><h1 className="text-3xl font-extrabold">My stay requests</h1><p className="mt-2 text-sm text-slate-600">Hosts confirm or decline requests. Confirm directly with the host any payment and cancellation terms; MTAA does not collect booking payments.</p>
      {message && <p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
      {loading ? <p className="py-12 text-center text-slate-600">Loading booking requests…</p> : !userId ? <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6"><p>Sign in to view your stay requests.</p><Link href="/dashboard" className="mt-3 inline-block font-semibold text-blue-700 underline">Sign in</Link></div>
        : bookings.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-slate-600">You haven’t requested any stay dates yet.</p>
          : <div className="mt-6 space-y-3">{bookings.map((booking) => <article key={booking.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/properties/${booking.property_id}`} className="text-lg font-bold text-blue-800 hover:underline">{booking.rental_properties?.title ?? 'Short-stay property'}</Link><p className="mt-1 text-sm text-slate-600">{booking.rental_properties?.location_label}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold capitalize">{booking.status}</span></div><p className="mt-3 text-sm">Requested dates: {booking.check_in} to {booking.check_out} · {booking.guest_count} guest{booking.guest_count === 1 ? '' : 's'}</p>{booking.rental_properties?.nightly_price && <p className="mt-1 text-sm text-slate-600">Listed rate: KSh {Number(booking.rental_properties.nightly_price).toLocaleString('en-KE')} / night. Confirm total and payment terms with the host.</p>}{booking.message && <p className="mt-2 text-sm text-slate-600">{booking.message}</p>}{['requested', 'confirmed'].includes(booking.status) && <button type="button" onClick={() => void cancel(booking.id)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold">Cancel request</button>}</article>)}</div>}
    </section>
  </main>
}
