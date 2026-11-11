'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface Order {
  id: string
  buyer_id: string
  department: 'marketplace' | 'food'
  contact_phone: string
  delivery_address: string
  total_amount: number
  status: string
  payment_status: string
  created_at: string
}

interface OrderItem {
  id: string
  order_id: string
  seller_id: string
  title: string
  quantity: number
  unit_price: number
  price_unit: string
  fulfillment_status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'declined'
}

interface StayRequest {
  id: string
  listing_id: string
  guest_id: string
  guest_name: string
  contact_phone: string
  check_in: string
  check_out: string
  guest_count: number
  message: string
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed'
  created_at: string
  keja_directory_listings: { title: string; owner_id: string } | null
}

const nextFulfillment: Record<OrderItem['fulfillment_status'], Array<{ status: OrderItem['fulfillment_status']; label: string }>> = {
  pending: [{ status: 'accepted', label: 'Accept order' }, { status: 'declined', label: 'Decline' }],
  accepted: [{ status: 'preparing', label: 'Start preparing' }, { status: 'declined', label: 'Decline' }],
  preparing: [{ status: 'ready', label: 'Mark ready' }, { status: 'completed', label: 'Complete' }],
  ready: [{ status: 'completed', label: 'Complete' }],
  completed: [],
  declined: [],
}

export default function OrdersDashboard() {
  const [userId, setUserId] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems] = useState<OrderItem[]>([])
  const [stays, setStays] = useState<StayRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!authData.user) {
          if (active) {
            setUserId('')
            setOrders([])
            setItems([])
            setStays([])
          }
          return
        }
        const [orderResult, stayResult] = await Promise.all([
          supabase.from('keja_orders')
            .select('id,buyer_id,department,contact_phone,delivery_address,total_amount,status,payment_status,created_at')
            .order('created_at', { ascending: false }).limit(100),
          supabase.from('keja_stay_requests')
            .select('id,listing_id,guest_id,guest_name,contact_phone,check_in,check_out,guest_count,message,status,created_at,keja_directory_listings(title,owner_id)')
            .order('created_at', { ascending: false }).limit(100),
        ])
        if (orderResult.error) throw orderResult.error
        if (stayResult.error) throw stayResult.error
        const orderRows = (orderResult.data ?? []) as Order[]
        const orderIds = orderRows.map((order) => order.id)
        const itemResult = orderIds.length
          ? await supabase.from('keja_order_items')
            .select('id,order_id,seller_id,title,quantity,unit_price,price_unit,fulfillment_status')
            .in('order_id', orderIds)
          : { data: [], error: null }
        if (itemResult.error) throw itemResult.error
        if (active) {
          setUserId(authData.user.id)
          setOrders(orderRows)
          setItems((itemResult.data ?? []) as OrderItem[])
          setStays((stayResult.data ?? []) as unknown as StayRequest[])
        }
      } catch (error) {
        console.error('Could not load MTAA orders and stay requests:', error)
        if (active) {
          setNotice(`Could not load account activity: ${getErrorMessage(error)}`)
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadDashboard()
    return () => { active = false }
  }, [refresh])

  async function updateItem(item: OrderItem, fulfillmentStatus: OrderItem['fulfillment_status']) {
    setBusyId(item.id)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('keja_order_items')
        .update({ fulfillment_status: fulfillmentStatus })
        .eq('id', item.id)
      if (error) throw error
      setNotice('Order status updated.')
      setRefresh((current) => current + 1)
    } catch (error) {
      console.error('Could not update MTAA order fulfillment status:', error)
      setNotice(`Could not update order: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setBusyId('')
    }
  }

  async function updateStay(stay: StayRequest, status: StayRequest['status']) {
    setBusyId(stay.id)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('keja_stay_requests').update({ status }).eq('id', stay.id)
      if (error) throw error
      setNotice('Stay request updated.')
      setRefresh((current) => current + 1)
    } catch (error) {
      console.error('Could not update MTAA stay request:', error)
      setNotice(`Could not update stay request: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setBusyId('')
    }
  }

  const relevantOrders = orders.filter((order) =>
    order.buyer_id === userId || items.some((item) => item.order_id === order.id && item.seller_id === userId))
  const relevantStays = stays.filter((stay) =>
    stay.guest_id === userId || stay.keja_directory_listings?.owner_id === userId)

  return <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
    <header className="border-b border-slate-200 bg-white"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-2xl font-black text-emerald-950">MTAA</Link><Link href="/directory" className="text-sm font-bold text-emerald-800 hover:underline">Browse directory</Link></nav></header>
    <section className="mx-auto max-w-6xl px-5 py-9 sm:py-12">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">Account activity</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Orders & stay requests</h1><p className="mt-2 text-slate-600">Track orders you placed, orders for your listings and accommodation requests.</p>
      {notice && <p role={isError ? 'alert' : 'status'} className={`mt-5 rounded-xl p-4 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{notice}</p>}
      {loading ? <p className="mt-6 rounded-xl bg-white p-8 text-center text-slate-600">Loading account activity…</p>
        : !userId ? <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><p>Sign in to see orders and stay requests.</p><Link href="/dashboard" className="mt-3 inline-flex font-bold text-emerald-800 underline">Sign in</Link></div>
          : <>
            <section className="mt-8"><h2 className="text-2xl font-bold">Orders</h2>{relevantOrders.length === 0 ? <p className="mt-3 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No orders yet.</p>
              : <div className="mt-4 space-y-4">{relevantOrders.map((order) => {
                const orderItems = items.filter((item) => item.order_id === order.id && (order.buyer_id === userId || item.seller_id === userId))
                return <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{order.department === 'food' ? 'Food order' : 'Marketplace order'} · {order.id.slice(0, 8).toUpperCase()}</h3><p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString('en-KE')}</p></div><div className="text-right"><p className="font-bold">KSh {Number(order.total_amount).toLocaleString('en-KE')}</p><p className="mt-1 text-sm capitalize text-slate-600">Payment: {order.payment_status.replace('_', ' ')}</p></div></div>
                  {order.buyer_id === userId && <p className="mt-3 text-sm text-slate-600">{order.delivery_address} · {order.contact_phone}</p>}
                  <div className="mt-4 divide-y divide-slate-100">{orderItems.map((item) => <div key={item.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{item.title} × {item.quantity}</p><p className="mt-1 text-sm text-slate-600">KSh {Number(item.unit_price).toLocaleString('en-KE')}{item.price_unit ? ` / ${item.price_unit}` : ''} · <span className="capitalize">{item.fulfillment_status}</span></p></div>{item.seller_id === userId && order.payment_status === 'paid' && <div className="flex flex-wrap gap-2">{nextFulfillment[item.fulfillment_status].map((next) => <button key={next.status} type="button" disabled={busyId === item.id} onClick={() => void updateItem(item, next.status)} className={`rounded-lg px-3 py-2 text-xs font-bold ${next.status === 'declined' ? 'bg-red-50 text-red-800' : 'bg-emerald-800 text-white'} disabled:opacity-50`}>{next.label}</button>)}</div>}</div></div>)}</div>
                </article>
              })}</div>}
            </section>
            <section className="mt-10"><h2 className="text-2xl font-bold">Accommodation</h2>{relevantStays.length === 0 ? <p className="mt-3 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No stay requests yet.</p>
              : <div className="mt-4 space-y-4">{relevantStays.map((stay) => {
                const isHost = stay.keja_directory_listings?.owner_id === userId
                return <article key={stay.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{stay.keja_directory_listings?.title ?? 'Accommodation request'}</h3><p className="mt-1 text-sm text-slate-600">{stay.check_in} to {stay.check_out} · {stay.guest_count} guest{stay.guest_count === 1 ? '' : 's'}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold capitalize text-amber-900">{stay.status}</span></div>
                  <p className="mt-3 text-sm text-slate-700">{isHost ? `Guest: ${stay.guest_name} · ${stay.contact_phone}` : 'Your stay request'}</p>{stay.message && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{stay.message}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">{isHost && stay.status === 'requested' && <><button type="button" disabled={busyId === stay.id} onClick={() => void updateStay(stay, 'confirmed')} className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm dates</button><button type="button" disabled={busyId === stay.id} onClick={() => void updateStay(stay, 'declined')} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Decline</button></>}
                    {isHost && stay.status === 'confirmed' && <button type="button" disabled={busyId === stay.id} onClick={() => void updateStay(stay, 'completed')} className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Mark completed</button>}
                    {!isHost && stay.status === 'requested' && <button type="button" disabled={busyId === stay.id} onClick={() => void updateStay(stay, 'cancelled')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-50">Cancel request</button>}
                  </div>
                </article>
              })}</div>}
            </section>
          </>}
    </section>
  </main>
}
