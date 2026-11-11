'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

interface PlatformNotification {
  id: string
  kind: string
  body: string
  property_id: string | null
  read_at: string | null
  created_at: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<PlatformNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function loadNotifications() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) {
          if (active) setMessage('Sign in to view your notifications.')
          return
        }
        const { data, error } = await supabase.from('platform_notifications')
          .select('id,kind,body,property_id,read_at,created_at')
          .eq('user_id', sessionData.session.user.id)
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error
        if (active) setNotifications((data ?? []) as PlatformNotification[])
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadNotifications()
    return () => { active = false }
  }, [])

  const markRead = async (notificationId: string) => {
    const { error } = await supabase.from('platform_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
    if (error) setMessage(getErrorMessage(error))
    else setNotifications((current) => current.map((item) => item.id === notificationId
      ? { ...item, read_at: new Date().toISOString() }
      : item))
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4"><Link href="/homes" className="text-lg font-bold text-blue-700">MTAA</Link><nav className="flex gap-4 text-sm"><Link href="/settings/notifications" className="font-semibold text-blue-700 hover:underline">Alert settings</Link><Link href="/saved" className="font-medium text-slate-700 hover:text-blue-700">Saved properties</Link></nav></div></header>
      <section className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-3xl font-bold">Notifications</h1>
        {message && <p role="status" className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
        {loading ? <p className="py-10 text-slate-600">Loading notifications...</p>
          : notifications.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">You&apos;re all caught up.</p>
            : <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-5">{notifications.map((notification) => <article key={notification.id} className="flex items-start justify-between gap-4 py-4"><div><p className="font-medium">{notification.body}</p><p className="mt-1 text-xs capitalize text-slate-500">{notification.kind.replaceAll('_', ' ')} · {new Date(notification.created_at).toLocaleString()}</p>{notification.property_id && <Link href={`/properties/${notification.property_id}`} className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline">Open property</Link>}</div>{!notification.read_at && <button onClick={() => void markRead(notification.id)} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Mark read</button>}</article>)}</div>}
      </section>
    </main>
  )
}
