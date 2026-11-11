'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { clearCommerceCart, setCommerceCartQuantity, useCommerceCart } from '@/lib/commerceCart'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface ApiResponse {
  error?: string
  paymentId?: string
  message?: string
  status?: 'pending' | 'paid' | 'failed'
}

export default function CartPage() {
  const cart = useCommerceCart()
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [orderTotal, setOrderTotal] = useState(0)
  const [paymentId, setPaymentId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | ''>('')

  const total = useMemo(() => Math.round(cart.reduce((sum, item) => sum + item.price * item.quantity, 0)), [cart])
  const department = cart[0]?.department
  const orderLabel = department === 'food' ? 'Food order' : 'Marketplace order'

  useEffect(() => {
    if (!paymentId || paymentStatus !== 'pending') return
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const token = sessionData.session?.access_token
        if (!token) throw new Error('Your session expired. Sign in again to check payment.')
        const response = await fetch(`/api/payments/orders/status?id=${encodeURIComponent(paymentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const result = await response.json() as ApiResponse
        if (!response.ok) throw new Error(result.error || 'Could not check payment status.')
        if (active && result.status && result.status !== 'pending') {
          setPaymentStatus(result.status)
          setPaying(false)
          setMessage(result.status === 'paid'
            ? 'Payment confirmed. Your order has been placed.'
            : 'M-Pesa did not complete the payment. You can try again.')
          setIsError(result.status === 'failed')
        }
      } catch (error) {
        if (active) {
          setPaying(false)
          setMessage(getErrorMessage(error))
          setIsError(true)
        }
      }
    }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [paymentId, paymentStatus])

  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session?.access_token) throw new Error('Sign in before placing your order.')
    return data.session.access_token
  }

  async function startPayment(targetOrderId: string) {
    setPaying(true)
    setMessage('')
    setIsError(false)
    try {
      const token = await getAccessToken()
      const response = await fetch('/api/payments/orders/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: targetOrderId, phoneNumber: phone }),
      })
      const result = await response.json() as ApiResponse
      if (!response.ok) throw new Error(result.error || 'Could not start M-Pesa payment.')
      if (!result.paymentId) throw new Error('Payment request ID was not returned.')
      setPaymentId(result.paymentId)
      setPaymentStatus('pending')
      setMessage(result.message || 'Check your phone and enter your M-Pesa PIN. Waiting for confirmation…')
    } catch (error) {
      console.error('Could not start MTAA order payment:', error)
      setMessage(getErrorMessage(error))
      setIsError(true)
      setPaying(false)
    }
  }

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cart.length) return
    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      await getAccessToken()
      setOrderTotal(total)
      const { data, error } = await supabase.rpc('create_keja_order', {
        p_items: cart.map((item) => ({ listing_id: item.listingId, quantity: item.quantity })),
        p_contact_phone: phone.trim(),
        p_delivery_address: address.trim(),
      })
      if (error) throw error
      if (typeof data !== 'string') throw new Error('Order ID was not returned.')
      setOrderId(data)
      clearCommerceCart()
      setMessage('Order created. Request your M-Pesa payment below.')
      await startPayment(data)
    } catch (error) {
      console.error('Could not place MTAA order:', error)
      setMessage(getErrorMessage(error))
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-2xl font-black tracking-tight text-emerald-950">MTAA</Link>
          <Link href="/directory" className="text-sm font-bold text-emerald-800 hover:underline">Continue shopping</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-9 sm:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">{orderLabel}</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Your cart</h1>
        {message && <p role={isError ? 'alert' : 'status'} className={`mt-5 rounded-xl p-4 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{message}</p>}

        {paymentStatus === 'paid' ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-7"><h2 className="text-xl font-bold">Order placed successfully</h2><p className="mt-2 text-sm text-slate-600">Your payment is confirmed. Check your account for order updates.</p><Link href="/dashboard/orders" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2.5 font-bold text-white">View my orders</Link></div>
          : orderId ?           <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Complete payment</h2><p className="mt-2 text-sm text-slate-600">Order {orderId.slice(0, 8).toUpperCase()} · KSh {orderTotal.toLocaleString('en-KE')}</p><label className="mt-5 block text-sm font-semibold">M-Pesa phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal sm:max-w-sm" /></label><button type="button" disabled={paying || !phone.trim()} onClick={() => void startPayment(orderId)} className="mt-4 rounded-lg bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-50">{paying ? 'Waiting for M-Pesa…' : 'Pay with M-Pesa'}</button></section>
            : cart.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-bold">Your cart is empty</h2><p className="mt-2 text-slate-600">Add a priced product or food listing to get started.</p><Link href="/directory" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2.5 font-bold text-white">Browse MTAA directory</Link></div>
              : <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_0.8fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-bold">{department === 'food' ? 'Your food order' : 'Items'}</h2>
                  {cart.map((item) => <article key={item.listingId} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-b-0"><div><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-sm text-slate-600">KSh {item.price.toLocaleString('en-KE')}{item.priceUnit ? ` / ${item.priceUnit}` : ''}</p></div><div className="flex items-center gap-2"><button type="button" aria-label={`Remove one ${item.title}`} onClick={() => setCommerceCartQuantity(item.listingId, item.quantity - 1)} className="grid size-9 place-items-center rounded-lg border border-slate-300 font-bold">−</button><span className="min-w-6 text-center font-semibold">{item.quantity}</span><button type="button" aria-label={`Add one ${item.title}`} onClick={() => {
                    try { setCommerceCartQuantity(item.listingId, item.quantity + 1) } catch (error) { setMessage(getErrorMessage(error)); setIsError(true) }
                  }} className="grid size-9 place-items-center rounded-lg border border-slate-300 font-bold">+</button><button type="button" onClick={() => setCommerceCartQuantity(item.listingId, 0)} className="ml-2 text-sm font-semibold text-red-700 underline">Remove</button></div></article>)}
                  <div className="mt-3 flex justify-between border-t border-slate-200 pt-4 text-lg font-black"><span>Total</span><span>KSh {total.toLocaleString('en-KE')}</span></div>
                </section>
                <form onSubmit={placeOrder} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-bold">Delivery details</h2>
                  <label className="mt-4 block text-sm font-semibold">M-Pesa phone number<input required type="tel" minLength={9} maxLength={20} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal" /></label>
                  <label className="mt-4 block text-sm font-semibold">Delivery address<input required minLength={5} maxLength={500} autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Estate, street, town and delivery instructions" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal" /></label>
                  <p className="mt-4 text-xs leading-5 text-slate-500">The final total is rounded to the nearest shilling for M-Pesa. MTAA does not release payment to sellers until payment is confirmed.</p>
                  <button disabled={saving || paying} className="mt-5 w-full rounded-lg bg-emerald-800 px-4 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-50">{saving ? 'Creating order…' : paying ? 'Starting payment…' : `Place order · KSh ${total.toLocaleString('en-KE')}`}</button>
                </form>
              </div>}
      </section>
    </main>
  )
}
