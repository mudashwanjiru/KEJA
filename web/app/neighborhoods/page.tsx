'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { getErrorMessage } from '@/lib/errors'
import {
  addSignedPostMedia,
  getPostMediaValidationError,
  PostMediaGallery,
  PostMediaPicker,
  uploadPostMedia,
  type PostMediaItem,
} from '@/lib/postMedia'
import { supabase } from '@/lib/supabase'

interface Place {
  id: string
  name: string
  category: string
  description: string
  county: string
  town: string
  area: string
  website_url: string | null
  contact_phone: string | null
  status: string
  submitted_by?: string | null
  media: PostMediaItem[]
}

interface Notice {
  id: string
  title: string
  body: string
  county: string
  town: string
  event_date: string | null
  expires_at: string | null
  media: PostMediaItem[]
}

const PLACE_CATEGORIES = ['school', 'healthcare', 'market', 'transport', 'utility', 'recreation', 'community', 'emergency', 'other']

export default function NeighborhoodGuidePage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [county, setCounty] = useState('')
  const [townFilter, setTownFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('school')
  const [description, setDescription] = useState('')
  const [newCounty, setNewCounty] = useState('')
  const [town, setTown] = useState('')
  const [area, setArea] = useState('')
  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [placeMediaFiles, setPlaceMediaFiles] = useState<File[]>([])
  const [noticeTitle, setNoticeTitle] = useState('')
  const [noticeBody, setNoticeBody] = useState('')
  const [noticeCounty, setNoticeCounty] = useState('')
  const [noticeTown, setNoticeTown] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [noticeMediaFiles, setNoticeMediaFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  const load = useCallback(async (admin: boolean) => {
    let query = supabase.from('neighborhood_places').select('id,name,category,description,county,town,area,website_url,contact_phone,status').order('name').limit(500)
    if (county) query = query.eq('county', county)
    if (categoryFilter) query = query.eq('category', categoryFilter)
    const { data, error } = await query
    if (error) throw error
    const filtered = (data ?? []) as Omit<Place, 'media'>[]
    const placeIds = filtered.map((place) => place.id)
    const { data: placeMediaRows, error: placeMediaError } = placeIds.length
      ? await supabase.from('public_post_media')
        .select('id,place_id,storage_path,media_type,mime_type,position')
        .in('place_id', placeIds)
        .order('position')
      : { data: [], error: null }
    if (placeMediaError) throw placeMediaError
    const signedPlaceMedia = await addSignedPostMedia((placeMediaRows ?? []) as PostMediaItem[])
    const placeMediaById = new Map<string, PostMediaItem[]>()
    for (const media of signedPlaceMedia as (PostMediaItem & { place_id: string })[]) {
      const current = placeMediaById.get(media.place_id) ?? []
      current.push(media)
      placeMediaById.set(media.place_id, current)
    }
    const placesWithMedia = filtered.map((place) => ({
      ...place,
      media: placeMediaById.get(place.id) ?? [],
    }))
    setPlaces(admin ? placesWithMedia : placesWithMedia.filter((place) => place.status === 'approved'))
    let noticeQuery = supabase.from('neighborhood_notices')
      .select('id,title,body,county,town,event_date,expires_at')
      .order('event_date', { ascending: true })
      .limit(100)
    if (county) noticeQuery = noticeQuery.eq('county', county)
    const { data: noticeRows, error: noticeError } = await noticeQuery
    if (noticeError) throw noticeError
    const rawNotices = (noticeRows ?? []) as Omit<Notice, 'media'>[]
    const noticeIds = rawNotices.map((notice) => notice.id)
    const { data: noticeMediaRows, error: noticeMediaError } = noticeIds.length
      ? await supabase.from('public_post_media')
        .select('id,notice_id,storage_path,media_type,mime_type,position')
        .in('notice_id', noticeIds)
        .order('position')
      : { data: [], error: null }
    if (noticeMediaError) throw noticeMediaError
    const signedNoticeMedia = await addSignedPostMedia((noticeMediaRows ?? []) as PostMediaItem[])
    const noticeMediaById = new Map<string, PostMediaItem[]>()
    for (const media of signedNoticeMedia as (PostMediaItem & { notice_id: string })[]) {
      const current = noticeMediaById.get(media.notice_id) ?? []
      current.push(media)
      noticeMediaById.set(media.notice_id, current)
    }
    setNotices(rawNotices.map((notice) => ({
      ...notice,
      media: noticeMediaById.get(notice.id) ?? [],
    })))
  }, [county, categoryFilter])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        let admin = false
        if (data.user) {
          if (active) setUserId(data.user.id)
          const { data: role, error: roleError } = await supabase.from('platform_user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin').maybeSingle()
          if (roleError) throw roleError
          admin = Boolean(role)
          if (active) setIsAdmin(admin)
        }
        await load(admin)
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void initialize()
    return () => { active = false }
  }, [county, categoryFilter, load])

  async function submitPlace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) {
      setMessage('Sign in to suggest a neighborhood place.')
      return
    }
    const mediaValidationError = getPostMediaValidationError(placeMediaFiles)
    if (mediaValidationError) {
      setMessage(mediaValidationError)
      setHasError(true)
      return
    }
    setSaving(true)
    setMessage('')
    let submittedPlaceId: string | null = null
    try {
      const { data: place, error } = await supabase.from('neighborhood_places').insert({
        submitted_by: userId,
        name: name.trim(),
        category,
        description: description.trim(),
        county: newCounty,
        town: town.trim(),
        area: area.trim(),
        website_url: website.trim() || null,
        contact_phone: phone.trim() || null,
      }).select('id').single()
      if (error) throw error
      submittedPlaceId = place.id
      await uploadPostMedia(userId, { column: 'place_id', id: place.id }, placeMediaFiles)
      setName('')
      setDescription('')
      setArea('')
      setWebsite('')
      setPhone('')
      setPlaceMediaFiles([])
      setMessage('Place suggested for review. It will appear in the guide after approval.')
    } catch (error) {
      setMessage(submittedPlaceId
        ? `Your place was submitted, but its photos/videos could not be uploaded: ${getErrorMessage(error)}`
        : getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function submitNotice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) {
      setMessage('Sign in to share a community notice.')
      return
    }
    const mediaValidationError = getPostMediaValidationError(noticeMediaFiles)
    if (mediaValidationError) {
      setMessage(mediaValidationError)
      setHasError(true)
      return
    }
    setSaving(true)
    setMessage('')
    let submittedNoticeId: string | null = null
    try {
      const { data: notice, error } = await supabase.from('neighborhood_notices').insert({
        owner_id: userId,
        title: noticeTitle.trim(),
        body: noticeBody.trim(),
        county: noticeCounty,
        town: noticeTown.trim(),
        event_date: eventDate || null,
        expires_at: expiresAt || null,
      }).select('id').single()
      if (error) throw error
      submittedNoticeId = notice.id
      await uploadPostMedia(userId, { column: 'notice_id', id: notice.id }, noticeMediaFiles)
      setNoticeTitle('')
      setNoticeBody('')
      setEventDate('')
      setExpiresAt('')
      setNoticeMediaFiles([])
      setMessage('Notice submitted for moderator review.')
      await load(isAdmin)
    } catch (error) {
      setMessage(submittedNoticeId
        ? `Your notice was submitted, but its photos/videos could not be uploaded: ${getErrorMessage(error)}`
        : getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function moderate(place: Place, status: 'approved' | 'rejected') {
    const { error } = await supabase.from('neighborhood_places').update({ status }).eq('id', place.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Place marked ${status}.`)
      setHasError(false)
      await load(isAdmin)
    }
  }

  const visiblePlaces = places.filter((place) => !townFilter || `${place.town} ${place.area}`.toLowerCase().includes(townFilter.toLowerCase()))

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-bold text-blue-700">MTAA neighborhoods</Link><nav className="flex gap-4 text-sm"><Link href="/homes" className="text-slate-600 hover:text-blue-700">Homes</Link><Link href="/services" className="text-slate-600 hover:text-blue-700">Services</Link></nav></div></header>
    <section className="mx-auto max-w-6xl px-5 py-9"><h1 className="text-3xl font-extrabold">Neighborhood guide</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Explore community places, essential services, transport, schools, health facilities and recreation. Information is community-submitted and should be confirmed directly; MTAA does not guarantee availability or quality.</p>
      {message && <p role={hasError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"><label className="text-sm font-medium">County<select value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">All counties</option>{KENYA_COUNTIES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">All categories</option>{PLACE_CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-sm font-medium">Town or area<input value={townFilter} onChange={(event) => setTownFilter(event.target.value)} placeholder="Search nearby places" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div>
      {loading ? <p className="py-10 text-center text-slate-600">Loading guide…</p> : visiblePlaces.length === 0 ? <p className="mt-5 rounded-xl border border-slate-200 bg-white p-8 text-slate-600">No approved places match these filters. Help build the guide by suggesting a place.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">{visiblePlaces.map((place) => <article key={place.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-700">{place.category.replaceAll('_', ' ')}</p><h2 className="mt-1 text-xl font-bold">{place.name}</h2></div>{isAdmin && <span className="text-xs capitalize text-slate-500">{place.status}</span>}</div><p className="mt-2 text-sm text-slate-600">{place.area ? `${place.area}, ` : ''}{place.town}, {place.county}</p><PostMediaGallery items={place.media} />{place.description && <p className="mt-3 text-sm leading-6">{place.description}</p>}<div className="mt-3 flex gap-4 text-sm">{place.website_url && <a className="text-blue-700 underline" href={place.website_url} target="_blank" rel="noopener noreferrer">Website</a>}{place.contact_phone && <a className="text-blue-700 underline" href={`tel:${place.contact_phone}`}>Call</a>}</div>{isAdmin && place.status === 'pending' && <div className="mt-3 flex gap-2"><button onClick={() => void moderate(place, 'approved')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Approve</button><button onClick={() => void moderate(place, 'rejected')} className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white">Reject</button></div>}</article>)}</div>}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Community notices</h2><p className="mt-1 text-sm text-slate-600">Local events and notices are reviewed before appearing here.</p>{notices.length === 0 ? <p className="mt-3 text-sm text-slate-600">No current notices.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{notices.filter((notice) => !notice.expires_at || notice.expires_at >= new Date().toISOString().slice(0, 10)).map((notice) => <article key={notice.id} className="rounded-lg border border-slate-200 p-4"><h3 className="font-bold">{notice.title}</h3><p className="mt-1 text-xs text-slate-500">{notice.town}, {notice.county}{notice.event_date ? ` · ${new Date(`${notice.event_date}T00:00:00`).toLocaleDateString()}` : ''}</p><PostMediaGallery items={notice.media} /><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{notice.body}</p></article>)}</div>}</section>
      <form onSubmit={(event) => void submitPlace(event)} className="mt-8 space-y-3 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Suggest a place</h2><p className="text-sm text-slate-600">Suggestions are reviewed before public listing.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Place name<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{PLACE_CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-sm font-medium">County<select required value={newCounty} onChange={(event) => setNewCounty(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select county</option>{KENYA_COUNTIES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Town<input required maxLength={120} value={town} onChange={(event) => setTown(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Area (optional)<input maxLength={120} value={area} onChange={(event) => setArea(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Website (optional)<input type="url" pattern="https://.*" value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div><label className="block text-sm font-medium">Description<textarea maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Public contact phone (optional)<input type="tel" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><PostMediaPicker files={placeMediaFiles} onChange={(files, error) => { setPlaceMediaFiles(files); if (error) { setMessage(error); setHasError(true) } }} /><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Submit suggestion</button></form>
      <form onSubmit={(event) => void submitNotice(event)} className="mt-5 space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-5"><h2 className="text-xl font-bold">Share a community notice</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Title<input required minLength={5} maxLength={120} value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">County<select required value={noticeCounty} onChange={(event) => setNoticeCounty(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select county</option>{KENYA_COUNTIES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Town<input required maxLength={120} value={noticeTown} onChange={(event) => setNoticeTown(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Event date (optional)<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Expires (optional)<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div><label className="block text-sm font-medium">Notice<textarea required minLength={20} maxLength={2000} rows={3} value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><PostMediaPicker files={noticeMediaFiles} onChange={(files, error) => { setNoticeMediaFiles(files); if (error) { setMessage(error); setHasError(true) } }} /><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Submit notice</button></form>
    </section>
  </main>
}
