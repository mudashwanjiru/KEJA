'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getSubscriptionErrorMessage } from '@/lib/subscription'
import { getErrorMessage } from '@/lib/errors'
import {
  getStallMediaValidationError,
  MAX_STALL_MEDIA_FILES,
  uploadStallMedia,
} from '@/lib/stallMedia'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'

export default function LandlordDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin')
  const [authMessage, setAuthMessage] = useState('')
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)
  const [subscriptionChecking, setSubscriptionChecking] = useState(false)
  const [subscriptionActive, setSubscriptionActive] = useState(false)
  const [subscriptionUntil, setSubscriptionUntil] = useState<string | null>(null)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [stallNumber, setStallNumber] = useState('')
  const [sizeSqft, setSizeSqft] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('General')
  const [description, setDescription] = useState('')
  const [county, setCounty] = useState('')
  const [town, setTown] = useState('')
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [pendingMediaStallId, setPendingMediaStallId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let isMounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setSubscriptionChecking(Boolean(session))
        setUser(session?.user ?? null)
        setAuthChecking(false)
      }
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      if (error) setAuthMessage(`Could not check sign-in status: ${error.message}`)
      setSubscriptionChecking(Boolean(data.session))
      setUser(data.session?.user ?? null)
      setAuthChecking(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    if (!user) {
      return () => { isMounted = false }
    }

    const loadSubscription = async () => {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('active_until')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!isMounted) return
        if (error) {
          setSubscriptionError(getSubscriptionErrorMessage(error))
          setSubscriptionActive(false)
          return
        }

        const activeUntil = data?.active_until ?? null
        setSubscriptionUntil(activeUntil)
        setSubscriptionActive(activeUntil !== null && new Date(activeUntil).getTime() > Date.now())
      } catch (error) {
        if (isMounted) setSubscriptionError(getSubscriptionErrorMessage(error))
      } finally {
        if (isMounted) setSubscriptionChecking(false)
      }
    }

    void loadSubscription()

    return () => { isMounted = false }
  }, [user])

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAuthSubmitting(true)
    setAuthMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setNeedsEmailConfirmation(/email not confirmed/i.test(error.message))
        setAuthMessage(`Sign in failed: ${error.message}`)
      } else {
        setSubscriptionChecking(true)
        setNeedsEmailConfirmation(false)
        setUser(data.user)
        setPassword('')
      }
    } catch (error) {
      setAuthMessage(`Sign in failed: ${getErrorMessage(error)}`)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleResendConfirmation = async () => {
    setAuthSubmitting(true)
    setAuthMessage('')

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      })

      if (error) {
        setAuthMessage(`Could not resend confirmation email: ${error.message}`)
      } else {
        setNeedsEmailConfirmation(false)
        setAuthMessage(`Confirmation email sent to ${email}. Check your inbox and spam folder.`)
      }
    } catch (error) {
      setAuthMessage(`Could not resend confirmation email: ${getErrorMessage(error)}`)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setAuthMessage('Passwords do not match.')
      return
    }

    setAuthSubmitting(true)
    setAuthMessage('')

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      })

      if (error) {
        setAuthMessage(`Registration failed: ${error.message}`)
      } else if (data.session) {
        setSubscriptionChecking(true)
        setUser(data.user)
        setPassword('')
        setConfirmPassword('')
        setAuthMessage('Account created. Subscribe to submit stalls for review.')
      } else {
        setAuthMode('signin')
        setPassword('')
        setConfirmPassword('')
        setAuthMessage('Account created. Confirm your email, sign in, then subscribe to submit stalls for review.')
      }
    } catch (error) {
      setAuthMessage(`Registration failed: ${getErrorMessage(error)}`)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    setAuthSubmitting(true)
    setAuthMessage('')

    try {
      const { error } = await supabase.auth.signOut()
      if (error) setAuthMessage(`Sign out failed: ${error.message}`)
      else setUser(null)
    } catch (error) {
      setAuthMessage(`Sign out failed: ${getErrorMessage(error)}`)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleAddStall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !subscriptionActive) {
      setMessage('An active subscription is required. Subscribe to list a stall.')
      return
    }
    const mediaValidationError = getStallMediaValidationError(mediaFiles)
    if (mediaValidationError) {
      setMessage(mediaValidationError)
      return
    }
    setLoading(true)
    setMessage('')
    let createdStallId: string | null = null

    const showAddError = (message: string) => {
      if (/failed to fetch|networkerror/i.test(message)) {
        console.warn('Could not reach Supabase:', message)
        setMessage(
          'Could not reach Supabase. Update NEXT_PUBLIC_SUPABASE_URL in web/.env.local to your active project URL, then restart the dev server.'
        )
      } else if (/could not find.*owner_id.*schema cache/i.test(message)) {
        console.warn('Supabase stall ownership migration is not applied:', message)
        setMessage(
          'Could not find stalls.owner_id in Supabase. Run the landlord access migration in the Supabase SQL Editor, wait for the schema cache to refresh, then retry.'
        )
      } else if (/row-level security|violates.*policy/i.test(message)) {
        console.warn('Stall insert blocked by Supabase access rules:', message)
        setMessage(
          'An active subscription is required to list stalls. Check your subscription or subscribe to continue.'
        )
      } else {
        console.error('Error adding stall:', message)
        setMessage(`Error adding stall: ${message}`)
      }
    }

    try {
      const { error: landlordError } = await supabase
        .from('landlords')
        .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
      if (landlordError) throw landlordError

      const { data: stall, error } = await supabase.from('stalls').insert([
        {
          property_id: null,
          stall_number: stallNumber,
          size_sqft: parseFloat(sizeSqft) || 0,
          monthly_rent: parseFloat(monthlyRent) || 0,
          location_label: location.trim(),
          county,
          town: town.trim(),
          category,
          description: description.trim(),
          status: 'vacant',
          owner_id: user.id,
          review_status: 'pending',
        },
      ]).select('id').single()

      if (error) throw error
      createdStallId = stall.id
      setPendingMediaStallId(stall.id)
      await uploadStallMedia(user.id, stall.id, mediaFiles)
      setPendingMediaStallId(null)
      setMessage('Stall submitted for review. It will appear publicly after approval.')
      setStallNumber('')
      setSizeSqft('')
      setMonthlyRent('')
      setLocation('')
      setCategory('General')
      setDescription('')
      setCounty('')
      setTown('')
      setMediaFiles([])
    } catch (error) {
      if (createdStallId) {
        setMessage(`Your stall was submitted, but its photos/videos could not be uploaded: ${getErrorMessage(error)}`)
      } else {
        showAddError(getErrorMessage(error))
      }
    } finally {
      setLoading(false)
    }
  }

  const retryMediaUpload = async () => {
    if (!user || !pendingMediaStallId) return
    setLoading(true)
    setMessage('')
    try {
      await uploadStallMedia(user.id, pendingMediaStallId, mediaFiles)
      setPendingMediaStallId(null)
      setMediaFiles([])
      setMessage('Photos and videos uploaded successfully.')
    } catch (error) {
      setMessage(`Could not upload photos/videos: ${getErrorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const authMessageIsSuccess = /^(Account created|Confirmation email sent)/.test(authMessage)

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-800">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Landlord Dashboard</h1>
          <div className="flex items-center gap-4">
            {user?.email && <span className="text-sm text-slate-600">{user.email}</span>}
            {user && (
              <Link href="/landlord/stalls" className="text-sm font-medium text-blue-600 hover:underline">
                My stalls & inquiries
              </Link>
            )}
            {user && (
              <Link href="/dashboard/billing" className="text-sm font-medium text-blue-600 hover:underline">
                Subscription
              </Link>
            )}
            {user && (
              <Link href="/admin/reviews" className="text-sm font-medium text-blue-600 hover:underline">
                Review queue
              </Link>
            )}
            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={authSubmitting}
                className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
              >
                Sign out
              </button>
            )}
            <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">
            &larr; Back to Homepage
            </Link>
          </div>
        </div>

        {authChecking ? (
          <p className="py-12 text-center text-slate-600">Checking landlord sign-in...</p>
        ) : !user ? (
          <section className="max-w-lg bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h2 className="text-xl font-bold mb-2 text-slate-800">
              {authMode === 'signin' ? 'Landlord sign in' : 'Register as a landlord'}
            </h2>
            <p className="text-sm text-slate-600 mb-5">
              {authMode === 'signin'
                ? 'Sign in to manage your listing subscription or register as a landlord.'
                : 'Create an account, confirm your email, then subscribe to post stalls.'}
            </p>
            <div className="mb-5 grid grid-cols-2 rounded-lg border border-slate-300 p-1" role="group" aria-label="Account action">
              <button
                type="button"
                aria-pressed={authMode === 'signin'}
                onClick={() => { setAuthMode('signin'); setAuthMessage(''); setNeedsEmailConfirmation(false) }}
                className={`rounded-md px-3 py-2 text-sm font-medium ${authMode === 'signin' ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                aria-pressed={authMode === 'register'}
                onClick={() => { setAuthMode('register'); setAuthMessage(''); setNeedsEmailConfirmation(false) }}
                className={`rounded-md px-3 py-2 text-sm font-medium ${authMode === 'register' ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                Register
              </button>
            </div>
            {authMessage && (
              <p
                role={authMessageIsSuccess ? 'status' : 'alert'}
                className={`mb-4 text-sm ${authMessageIsSuccess ? 'text-green-700' : 'text-red-700'}`}
              >
                {authMessage}
              </p>
            )}
            {needsEmailConfirmation && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={authSubmitting}
                className="mb-4 text-sm font-semibold text-blue-700 underline disabled:opacity-50"
              >
                {authSubmitting ? 'Sending confirmation...' : 'Resend confirmation email'}
              </button>
            )}
            <form onSubmit={authMode === 'signin' ? handleSignIn : handleRegister} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold mb-1">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold mb-1">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              {authMode === 'register' && (
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-semibold mb-1">Confirm password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50"
              >
                {authSubmitting
                  ? authMode === 'signin' ? 'Signing in...' : 'Creating account...'
                  : authMode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <p className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
              A subscription is required before you can submit a stall.
            </p>
          </section>
        ) : (
          <section className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            {subscriptionChecking ? (
              <p className="py-8 text-slate-600">Checking subscription...</p>
            ) : !subscriptionActive ? (
              <div className="py-4">
                <h2 className="text-xl font-bold text-slate-800">Subscription required</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {subscriptionUntil
                    ? `Your listing access ended ${new Date(subscriptionUntil).toLocaleDateString()}.`
                    : 'Subscribe for KES 1,000 per month to submit stalls for review.'}
                </p>
                {subscriptionError && <p role="alert" className="mt-3 text-sm text-red-700">{subscriptionError}</p>}
                <Link href="/dashboard/billing" className="mt-5 inline-block rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
                  View subscription
                </Link>
              </div>
            ) : (
              <>
            <h2 className="text-xl font-bold mb-1 text-slate-800">Add New Commercial Stall</h2>
            {subscriptionUntil && <p className="mb-4 text-sm text-slate-600">Subscription active through {new Date(subscriptionUntil).toLocaleDateString()}.</p>}

            {authMessage && <p role="status" className="mb-4 text-sm text-slate-700">{authMessage}</p>}
            {message && (
              <div
                role="status"
                className={`p-4 mb-4 rounded-lg text-sm font-medium ${
                  /^(Error|Could not|This account|Your stall was submitted, but)/.test(message)
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {message}
              </div>
            )}

            <form onSubmit={handleAddStall} className="space-y-4">
              <div>
                <label htmlFor="stall-number" className="block text-sm font-semibold mb-1">Stall / Unit Number *</label>
                <input
                  id="stall-number"
                  type="text"
                  placeholder="e.g., Stall B-04"
                  value={stallNumber}
                  onChange={(e) => setStallNumber(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="monthly-rent" className="block text-sm font-semibold mb-1">Monthly Rent (KES / USD) *</label>
                  <input
                    id="monthly-rent"
                    type="number"
                    placeholder="e.g., 15000"
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="size-sqft" className="block text-sm font-semibold mb-1">Size (Sq. Ft)</label>
                  <input
                    id="size-sqft"
                    type="number"
                    placeholder="e.g., 120"
                    value={sizeSqft}
                    onChange={(e) => setSizeSqft(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="stall-county" className="mb-1 block text-sm font-semibold">County *</label>
                  <select
                    id="stall-county"
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select county</option>
                    {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="stall-town" className="mb-1 block text-sm font-semibold">Town / city *</label>
                  <input
                    id="stall-town"
                    type="text"
                    maxLength={120}
                    placeholder="e.g., Nairobi"
                    value={town}
                    onChange={(e) => setTown(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="stall-location" className="mb-1 block text-sm font-semibold">Estate / market / area *</label>
                  <input
                    id="stall-location"
                    type="text"
                    maxLength={160}
                    placeholder="e.g., Gikomba Market"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="stall-category" className="mb-1 block text-sm font-semibold">Business category</label>
                  <select
                    id="stall-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>General</option>
                    <option>Fashion &amp; Apparel</option>
                    <option>Electronics</option>
                    <option>Food &amp; Beverage</option>
                    <option>Beauty &amp; Wellness</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="stall-description" className="mb-1 block text-sm font-semibold">Description</label>
                <textarea
                  id="stall-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe the space, its frontage, foot traffic, or nearby amenities."
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="dashboard-stall-media" className="mb-1 block text-sm font-semibold">Photos and videos (up to {MAX_STALL_MEDIA_FILES}, 50 MB each)</label>
                <input
                  id="dashboard-stall-media"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    const validationError = getStallMediaValidationError(files)
                    setMediaFiles(validationError ? [] : files)
                    if (validationError) setMessage(validationError)
                  }}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                {mediaFiles.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {mediaFiles.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</li>)}
                  </ul>
                )}
              </div>

              {pendingMediaStallId && (
                <button type="button" onClick={() => void retryMediaUpload()} disabled={loading} className="rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                  Retry media upload
                </button>
              )}

              <button
                type="submit"
                disabled={loading || Boolean(pendingMediaStallId)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'List Commercial Stall'}
              </button>
            </form>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}