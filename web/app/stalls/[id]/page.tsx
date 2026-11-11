'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { isListingStale } from '@/lib/listingFreshness'
import { useKejaLanguage } from '@/lib/language'

interface Stall {
  id: string
  stall_number: string
  monthly_rent: number
  size_sqft: number | null
  status: string
  location_label: string
  county: string | null
  town: string | null
  category: string
  description: string
  last_confirmed_at: string
}

interface StallMedia {
  id: string
  storage_path: string
  media_type: 'image' | 'video'
  position: number
  signedUrl?: string
}

const formatKes = (amount: number) => `KSh ${new Intl.NumberFormat('en-KE').format(amount)}`

function StallDetailContent() {
  const { t } = useKejaLanguage()
  const { id } = useParams<{ id: string }>()
  const [stall, setStall] = useState<Stall | null>(null)
  const [media, setMedia] = useState<StallMedia[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  const [reportReason, setReportReason] = useState('fake_listing')
  const [reportDetails, setReportDetails] = useState('')
  const [reportNotice, setReportNotice] = useState('')
  const [reportNoticeIsError, setReportNoticeIsError] = useState(false)
  const [reportSubmitting, setReportSubmitting] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadPage() {
      try {
        const [{ data, error }, { data: authData, error: authError }] = await Promise.all([
          supabase.from('stalls')
            .select('id,stall_number,monthly_rent,size_sqft,status,location_label,county,town,category,description,last_confirmed_at')
            .eq('id', id)
            .maybeSingle(),
          supabase.auth.getUser(),
        ])
        if (error) throw error
        if (authError) throw authError
        let mediaRows: StallMedia[] = []
        if (data) {
          const { data: rows, error: mediaError } = await supabase
            .from('stall_media')
            .select('id,storage_path,media_type,position')
            .eq('stall_id', data.id)
            .order('position')
          if (mediaError) throw mediaError
          mediaRows = (rows ?? []) as StallMedia[]

          if (mediaRows.length > 0) {
            const { data: signedUrls, error: signedUrlError } = await supabase.storage
              .from('commercial-stall-media')
              .createSignedUrls(mediaRows.map((item) => item.storage_path), 300)
            if (signedUrlError) throw signedUrlError
            const urlsByPath = new Map(
              (signedUrls ?? [])
                .filter((item) => item.path && item.signedUrl)
                .map((item) => [item.path, item.signedUrl])
            )
            mediaRows = mediaRows.map((item) => ({
              ...item,
              signedUrl: urlsByPath.get(item.storage_path) ?? undefined,
            }))
          }
        }
        if (isMounted) {
          setStall(data as Stall | null)
          setUser(authData.user)
          setMedia(mediaRows)
        }
      } catch (error) {
        console.error('Could not load stall details:', error)
        if (isMounted) {
          setNotice(`Could not load this listing: ${getErrorMessage(error)}`)
          setNoticeIsError(true)
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void loadPage()
    return () => { isMounted = false }
  }, [id])

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !stall) {
      setNotice('Sign in before sending an inquiry or application.')
      setNoticeIsError(true)
      return
    }

    setSubmitting(true)
    setNotice('')
    setNoticeIsError(false)
    try {
      const { error } = await supabase.from('stall_inquiries').insert({
        stall_id: stall.id,
        applicant_id: user.id,
        business_name: businessName.trim(),
        contact_phone: phone.trim(),
        message: message.trim(),
      })
      if (error) throw error
      setNotice('Your inquiry has been sent to the landlord. You can expect them to contact you using the number provided.')
      setBusinessName('')
      setPhone('')
      setMessage('')
    } catch (error) {
      console.error('Could not submit stall inquiry:', error)
      setNotice(/duplicate key|unique constraint/i.test(getErrorMessage(error))
        ? 'You have already sent an inquiry for this space.'
        : `Could not send your inquiry: ${getErrorMessage(error)}`)
      setNoticeIsError(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !stall) {
      setReportNotice('Sign in before reporting a listing.')
      setReportNoticeIsError(true)
      return
    }

    setReportSubmitting(true)
    setReportNotice('')
    setReportNoticeIsError(false)
    try {
      const { error } = await supabase.from('commercial_stall_reports').insert({
        stall_id: stall.id,
        reporter_id: user.id,
        reason: reportReason,
        details: reportDetails.trim(),
        status: 'pending',
      })
      if (error) throw error
      setReportNotice(t('reportSent'))
      setReportDetails('')
    } catch (error) {
      console.error('Could not submit stall report:', error)
      setReportNotice(`Could not send your report: ${getErrorMessage(error)}`)
      setReportNoticeIsError(true)
    } finally {
      setReportSubmitting(false)
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="font-medium text-slate-600 hover:text-blue-700">Browse spaces</Link>
            <Link href="/landlord/stalls" className="font-medium text-slate-600 hover:text-blue-700">Landlord dashboard</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:underline">&larr; Back to listings</Link>
        {loading ? (
          <p className="py-20 text-center text-slate-600">Loading stall details…</p>
        ) : !stall ? (
          <div className="mx-auto mt-8 max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-2xl font-bold">Listing unavailable</h1>
            <p className="mt-2 text-slate-600">{notice || 'This space may have been removed or is not currently public.'}</p>
            <Link href="/" className="mt-5 inline-block font-semibold text-blue-700 hover:underline">Return to listings</Link>
          </div>
        ) : (
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <div>
              {media.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {media.map((item) => item.signedUrl && (
                    <div key={item.id} className="overflow-hidden rounded-xl bg-slate-200">
                      {item.media_type === 'video' ? (
                        <video src={item.signedUrl} controls preload="metadata" className="aspect-video w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.signedUrl} alt={`${stall.stall_number} commercial space`} className="aspect-video w-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-64 items-end rounded-2xl bg-gradient-to-br from-sky-200 via-blue-100 to-indigo-200 p-6 sm:h-80">
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-bold capitalize text-emerald-800">{stall.status}</span>
                </div>
              )}
              <div className="mt-6">
                <p className="text-sm font-bold uppercase tracking-wider text-blue-700">{stall.category}</p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{stall.stall_number}</h1>
                <p className="mt-2 text-lg text-slate-600">{[stall.location_label, stall.town, stall.county].filter(Boolean).join(', ') || 'Location available on request'}</p>
                {isListingStale(stall.last_confirmed_at) && <p className="mt-3 inline-block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('ownerNoRecentStallConfirm')}</p>}
                <div className="mt-6 flex flex-wrap gap-3">
                  <span className="rounded-lg bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <span className="block text-xs font-semibold uppercase text-slate-500">Monthly rent</span>
                    <span className="mt-1 block text-lg font-bold text-blue-800">{formatKes(stall.monthly_rent)}</span>
                  </span>
                  {stall.size_sqft && (
                    <span className="rounded-lg bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                      <span className="block text-xs font-semibold uppercase text-slate-500">Floor area</span>
                      <span className="mt-1 block text-lg font-bold">{stall.size_sqft} sq. ft.</span>
                    </span>
                  )}
                </div>
                <section className="mt-8 border-t border-slate-200 pt-6">
                  <h2 className="text-xl font-bold">About this space</h2>
                  <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-600">
                    {stall.description || 'Contact the landlord to learn more about this commercial space.'}
                  </p>
                </section>
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-bold">Interested in this space?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Send the landlord an inquiry or tell them about your business. They will follow up using your contact number.</p>
              {notice && (
                <p role={noticeIsError ? 'alert' : 'status'} className={`mt-4 rounded-lg px-3 py-3 text-sm ${noticeIsError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
                  {notice}
                </p>
              )}
              {user ? (
                <form onSubmit={submitApplication} className="mt-5 space-y-4">
                  <label className="block text-sm font-semibold">
                    Business name
                    <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={120} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="block text-sm font-semibold">
                    Contact phone
                    <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={7} maxLength={32} required placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="block text-sm font-semibold">
                    Message to landlord
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={2000} required rows={4} placeholder="Tell them what you plan to use the space for…" className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <button type="submit" disabled={submitting || stall.status.toLowerCase() !== 'vacant'} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {submitting ? 'Sending inquiry…' : stall.status.toLowerCase() === 'vacant' ? 'Send inquiry / apply' : 'Currently unavailable'}
                  </button>
                </form>
              ) : (
                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-700">Sign in to send an inquiry or application for this space.</p>
                  <Link href="/dashboard" className="mt-3 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Sign in or create an account</Link>
                </div>
              )}
              <p className="mt-4 text-xs leading-5 text-slate-500">Your contact information is shared with the landlord for this inquiry only.</p>
            </aside>
          </div>
        )}
        {stall && !loading && (
          <details className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-lg font-bold">{t('propertyReport')}</summary>
            <p className="mt-2 text-sm text-slate-600">{t('stallReportIntro')}</p>
            {reportNotice && (
              <p role={reportNoticeIsError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${reportNoticeIsError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {reportNotice}
              </p>
            )}
            {user ? (
              <form onSubmit={(event) => void submitReport(event)} className="mt-4 max-w-2xl space-y-3">
                <label className="block text-sm font-semibold">
                  {t('reportReason')}
                  <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                    <option value="fake_listing">{t('fakeListing')}</option>
                    <option value="incorrect_information">{t('incorrectInformation')}</option>
                    <option value="unavailable">{t('alreadyUnavailable')}</option>
                    <option value="scam">{t('suspectedScam')}</option>
                    <option value="other">{t('other')}</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  {t('reportDetailsOptional')}
                  <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={2000} rows={4} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <button type="submit" disabled={reportSubmitting} className="rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50">
                  {reportSubmitting ? t('sendingReport') : t('sendReport')}
                </button>
              </form>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-slate-700">{t('signInToReport')}</p>
                <Link href="/dashboard" className="mt-3 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Sign in or create an account</Link>
              </div>
            )}
          </details>
        )}
      </div>
    </main>
  )
}

export default function StallDetailPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen max-w-5xl px-5 py-16 text-slate-600">Loading stall details…</main>}>
      <StallDetailContent />
    </Suspense>
  )
}
