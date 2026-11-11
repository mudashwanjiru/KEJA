'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import { getSubscriptionErrorMessage, SUBSCRIPTION_PRICE_KES } from '@/lib/subscription'

interface PaymentStatusResponse {
  status?: 'pending' | 'paid' | 'failed'
  error?: string
  paymentId?: string
}

async function getSubscriptionExpiry(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('active_until')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data?.active_until ?? null
}

export default function BillingPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [subscriptionChecking, setSubscriptionChecking] = useState(false)
  const [activeUntil, setActiveUntil] = useState<string | null>(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'paid' | 'failed'>('idle')
  const [startingPayment, setStartingPayment] = useState(false)
  const [checkingPayment, setCheckingPayment] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!isMounted) return
      if (error) {
        setMessage(`Could not check sign-in status: ${error.message}`)
        setHasError(true)
        setAuthChecking(false)
        return
      }

      const session = data.session
      setUserId(session?.user.id ?? null)
      setAccessToken(session?.access_token ?? null)
      setAuthChecking(false)
      if (!session) return

      setSubscriptionChecking(true)
      try {
        const expiry = await getSubscriptionExpiry(session.user.id)
        if (isMounted) {
          setActiveUntil(expiry)
          setHasActiveSubscription(expiry !== null && new Date(expiry).getTime() > Date.now())
        }
      } catch (subscriptionError) {
        if (isMounted) {
          setMessage(getSubscriptionErrorMessage(subscriptionError))
          setHasError(true)
        }
      } finally {
        if (isMounted) setSubscriptionChecking(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  const checkPayment = async (id: string) => {
    if (!accessToken || !userId) return

    setCheckingPayment(true)
    setPaymentId(id)
    setPaymentStatus('pending')
    setMessage('Waiting for M-Pesa confirmation...')
    setHasError(false)

    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await fetch(`/api/payments/mpesa/status?id=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        })
        const result = await response.json() as PaymentStatusResponse

        if (!response.ok) throw new Error(result.error || 'Could not check payment status.')
        if (result.status === 'paid') {
          setPaymentStatus('paid')
          setMessage('Payment confirmed. Your subscription is active.')
          const expiry = await getSubscriptionExpiry(userId)
          setActiveUntil(expiry)
          setHasActiveSubscription(expiry !== null && new Date(expiry).getTime() > Date.now())
          return
        }
        if (result.status === 'failed') {
          setPaymentStatus('failed')
          setMessage('M-Pesa did not complete the payment. Check your phone and try again.')
          setHasError(true)
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      setMessage('Still waiting for confirmation. Use Check payment status to try again.')
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setCheckingPayment(false)
    }
  }

  const handleSubscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!accessToken) return

    setStartingPayment(true)
    setMessage('')
    setHasError(false)

    try {
      const response = await fetch('/api/payments/mpesa/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber }),
      })
      const result = await response.json() as PaymentStatusResponse & { message?: string }

      if (!response.ok) {
        if (result.paymentId) {
          setPaymentId(result.paymentId)
          setPaymentStatus('pending')
          setMessage(result.error || 'A payment request is still pending.')
          setHasError(true)
          return
        }
        throw new Error(result.error || 'Could not start M-Pesa payment.')
      }

      setMessage(result.message || 'Check your phone and enter your M-Pesa PIN.')
      if (result.paymentId) await checkPayment(result.paymentId)
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setStartingPayment(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <Link href="/dashboard" className="text-sm font-medium text-slate-700 hover:text-blue-700">Dashboard</Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Listing subscription</h1>

        {message && (
          <p
            role={hasError ? 'alert' : 'status'}
            className={`mt-5 rounded-md px-4 py-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
          >
            {message}
          </p>
        )}

        {authChecking ? (
          <p className="mt-8 text-slate-600">Checking sign-in...</p>
        ) : !userId ? (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="text-slate-700">Sign in or register before subscribing.</p>
            <Link href="/dashboard" className="mt-4 inline-block rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
              Continue to sign in
            </Link>
          </div>
        ) : subscriptionChecking ? (
          <p className="mt-8 text-slate-600">Checking subscription...</p>
        ) : hasActiveSubscription ? (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="font-semibold text-green-800">Your listing subscription is active.</p>
            <p className="mt-2 text-sm text-slate-600">Access through {activeUntil ? new Date(activeUntil).toLocaleDateString() : ''}.</p>
            <Link href="/dashboard" className="mt-5 inline-block rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
              Continue to dashboard
            </Link>
          </div>
        ) : (
          <div className="mt-8 max-w-xl border-t border-slate-200 pt-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">One month of listing access</h2>
              <p className="text-xl font-bold">KES {SUBSCRIPTION_PRICE_KES.toLocaleString()}</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">Renew manually each month. Approved stall listings remain subject to review.</p>

            <form onSubmit={handleSubscribe} className="mt-6 space-y-4">
              <div>
                <label htmlFor="mpesa-phone" className="mb-1 block text-sm font-semibold">M-Pesa phone number</label>
                <input
                  id="mpesa-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07XXXXXXXX or 2547XXXXXXXX"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                type="submit"
                disabled={startingPayment || checkingPayment || paymentStatus === 'pending'}
                className="rounded-md bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingPayment ? 'Starting M-Pesa...' : 'Pay with M-Pesa'}
              </button>
            </form>

            {paymentId && paymentStatus === 'pending' && !checkingPayment && (
              <button
                type="button"
                onClick={() => void checkPayment(paymentId)}
                className="mt-4 text-sm font-semibold text-blue-700 underline"
              >
                Check payment status
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}