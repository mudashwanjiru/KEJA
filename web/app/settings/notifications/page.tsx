'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const CONSENT_VERSION = 'keja-alerts-2026-11-v1'

interface NotificationPreferences {
  phone_e164: string | null
  phone_verified_at: string | null
  sms_enabled: boolean
  whatsapp_enabled: boolean
  consent_at: string | null
}

export default function NotificationSettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verified, setVerified] = useState(false)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) {
          if (active) setMessage('Sign in to manage phone alerts.')
          return
        }
        const { data, error } = await supabase.from('keja_notification_preferences')
          .select('phone_e164,phone_verified_at,sms_enabled,whatsapp_enabled,consent_at')
          .eq('user_id', sessionData.session.user.id)
          .maybeSingle()
        if (error) throw error
        if (active) {
          setUserId(sessionData.session.user.id)
          setSessionToken(sessionData.session.access_token)
          const preferences = data as NotificationPreferences | null
          if (preferences) {
            setPhone(preferences.phone_e164 ?? '')
            setVerified(Boolean(preferences.phone_verified_at))
            setSmsEnabled(preferences.sms_enabled)
            setWhatsappEnabled(preferences.whatsapp_enabled)
            setConsentGiven(Boolean(preferences.consent_at))
          }
        }
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function sendVerificationCode() {
    setBusy(true)
    setMessage('')
    setIsError(false)
    try {
      const response = await fetch('/api/notifications/verify/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const result = await response.json() as { message?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not send verification code.')
      setMessage(typeof result.message === 'string' ? result.message : 'A verification code was sent.')
    } catch (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode() {
    setBusy(true)
    setMessage('')
    setIsError(false)
    try {
      const response = await fetch('/api/notifications/verify/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      })
      const result = await response.json() as { message?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not verify the phone number.')
      setVerified(true)
      setSmsEnabled(false)
      setWhatsappEnabled(false)
      setConsentGiven(false)
      setCode('')
      setMessage(typeof result.message === 'string' ? result.message : 'Phone verified. Choose your alert preferences.')
    } catch (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } finally {
      setBusy(false)
    }
  }

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    if ((smsEnabled || whatsappEnabled) && (!verified || !consentGiven)) {
      setMessage('Verify your phone and give consent before enabling alerts.')
      setIsError(true)
      return
    }
    setBusy(true)
    setMessage('')
    setIsError(false)
    try {
      const enabled = smsEnabled || whatsappEnabled
      const { error } = await supabase.from('keja_notification_preferences').upsert({
        user_id: userId,
        sms_enabled: smsEnabled,
        whatsapp_enabled: whatsappEnabled,
        consent_at: enabled ? new Date().toISOString() : null,
        consent_version: enabled ? CONSENT_VERSION : null,
      }, { onConflict: 'user_id' })
      if (error) throw error
      setMessage(enabled ? 'Your alert preferences are saved.' : 'SMS and WhatsApp alerts are turned off.')
      if (!enabled) setConsentGiven(false)
    } catch (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } finally {
      setBusy(false)
    }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4"><Link href="/" className="font-bold text-emerald-900">MTAA</Link><Link href="/notifications" className="text-sm font-semibold text-emerald-800 hover:underline">Notifications</Link></div></header>
    <section className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-3xl font-extrabold">SMS & WhatsApp alerts</h1>
      <p className="mt-3 leading-7 text-slate-600">Verify that you control a Kenyan mobile number before opting in. MTAA sends account and listing notifications only to channels you select. Standard carrier charges may apply. You can turn alerts off here at any time.</p>
      {message && <p role={isError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900'}`}>{message}</p>}
      {loading ? <p className="py-10 text-slate-600">Loading alert preferences…</p> : !userId ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Sign in to manage phone alerts.</p> : <div className="mt-6 space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="text-xl font-bold">Verify your number</h2>
          <label className="mt-4 block text-sm font-semibold">Kenyan mobile number<input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setVerified(false); setSmsEnabled(false); setWhatsappEnabled(false); setConsentGiven(false) }} placeholder="+254712345678" autoComplete="tel" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
          <p className="mt-2 text-xs text-slate-500">Use international format beginning with +254. Verification is limited to 3 code requests per hour.</p>
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy || !sessionToken} onClick={() => void sendVerificationCode()} className="rounded-lg border border-emerald-800 px-4 py-2.5 text-sm font-bold text-emerald-900 disabled:opacity-50">Send SMS code</button>{verified && <span className="self-center text-sm font-bold text-emerald-800">Verified</span>}</div>
          {!verified && <div className="mt-4 flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm font-semibold">Verification code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label><button type="button" disabled={busy || code.length < 4} onClick={() => void verifyCode()} className="self-end rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Verify number</button></div>}
        </section>
        <form onSubmit={savePreferences} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h2 className="text-xl font-bold">Choose alert channels</h2>
          {!verified && <p className="mt-2 text-sm text-slate-600">Complete phone verification before enabling these channels.</p>}
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={smsEnabled} disabled={!verified} onChange={(event) => setSmsEnabled(event.target.checked)} className="mt-1" /><span><span className="block font-semibold">SMS alerts</span><span className="text-sm text-slate-600">Receive MTAA notifications by text message.</span></span></label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" checked={whatsappEnabled} disabled={!verified} onChange={(event) => setWhatsappEnabled(event.target.checked)} className="mt-1" /><span><span className="block font-semibold">WhatsApp alerts</span><span className="text-sm text-slate-600">Receive MTAA notifications on WhatsApp using the verified number.</span></span></label>
          </div>
          {(smsEnabled || whatsappEnabled) && <label className="mt-4 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"><input type="checkbox" checked={consentGiven} onChange={(event) => setConsentGiven(event.target.checked)} className="mt-1" /><span>I agree to receive the MTAA notifications through the selected channels at the verified number. I understand carrier charges may apply and can withdraw consent by turning the channels off here.</span></label>}
          <button type="submit" disabled={busy || ((smsEnabled || whatsappEnabled) && !verified)} className="mt-5 rounded-lg bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-50">{busy ? 'Saving…' : 'Save alert preferences'}</button>
        </form>
      </div>}
    </section>
  </main>
}
