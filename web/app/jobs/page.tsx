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

type JobStatus = 'pending' | 'open' | 'closed' | 'rejected'
type ApplicationStatus = 'submitted' | 'reviewing' | 'shortlisted' | 'declined'

interface Job {
  id: string
  owner_id: string
  title: string
  category: string
  employment_type: string
  description: string
  county: string
  town: string
  pay_min: number | null
  pay_max: number | null
  status: JobStatus
  created_at: string
  media: PostMediaItem[]
}

interface Application {
  id: string
  job_id: string
  applicant_id: string
  applicant_name: string
  contact_phone: string
  message: string
  status: ApplicationStatus
  created_at: string
}

const JOB_CATEGORIES = ['caretaker', 'property_agent', 'cleaner', 'security', 'maintenance', 'construction', 'moving', 'other']
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'casual']

export default function PropertyJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [county, setCounty] = useState('')
  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [jobId, setJobId] = useState('')
  const [applicationText, setApplicationText] = useState('')
  const [title, setTitle] = useState('')
  const [newCategory, setNewCategory] = useState('caretaker')
  const [employmentType, setEmploymentType] = useState('full_time')
  const [description, setDescription] = useState('')
  const [town, setTown] = useState('')
  const [newCounty, setNewCounty] = useState('')
  const [payMin, setPayMin] = useState('')
  const [payMax, setPayMax] = useState('')
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  const load = useCallback(async (id: string | null) => {
    let query = supabase.from('property_jobs')
      .select('id,owner_id,title,category,employment_type,description,county,town,pay_min,pay_max,status,created_at')
      .order('created_at', { ascending: false }).limit(200)
    if (county) query = query.eq('county', county)
    if (category) query = query.eq('category', category)
    const [{ data: jobRows, error: jobsError }, appResult] = await Promise.all([
      query,
      id
        ? supabase.from('property_job_applications')
          .select('id,job_id,applicant_id,applicant_name,contact_phone,message,status,created_at')
          .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (jobsError) throw jobsError
    if (appResult.error) throw appResult.error
    const rows = (jobRows ?? []) as Omit<Job, 'media'>[]
    const jobIds = rows.map((job) => job.id)
    const { data: mediaRows, error: mediaError } = jobIds.length
      ? await supabase.from('public_post_media')
        .select('id,job_id,storage_path,media_type,mime_type,position')
        .in('job_id', jobIds)
        .order('position')
      : { data: [], error: null }
    if (mediaError) throw mediaError
    const signedMedia = await addSignedPostMedia((mediaRows ?? []) as PostMediaItem[])
    const mediaByJob = new Map<string, PostMediaItem[]>()
    for (const media of signedMedia as (PostMediaItem & { job_id: string })[]) {
      const current = mediaByJob.get(media.job_id) ?? []
      current.push(media)
      mediaByJob.set(media.job_id, current)
    }
    setJobs(rows.map((job) => ({ ...job, media: mediaByJob.get(job.id) ?? [] })))
    setApplications((appResult.data ?? []) as Application[])
  }, [county, category])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        const id = data.user?.id ?? null
        if (active) setUserId(id)
        if (id) {
          const { data: role, error: roleError } = await supabase.from('platform_user_roles').select('role').eq('user_id', id).eq('role', 'admin').maybeSingle()
          if (roleError) throw roleError
          if (active) setIsAdmin(Boolean(role))
        }
        await load(id)
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
  }, [county, category, load])

  async function postJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return
    const mediaValidationError = getPostMediaValidationError(mediaFiles)
    if (mediaValidationError) {
      setMessage(mediaValidationError)
      setHasError(true)
      return
    }
    setSaving(true)
    setMessage('')
    let submittedJobId: string | null = null
    try {
      const { data: job, error } = await supabase.from('property_jobs').insert({
        owner_id: userId,
        title: title.trim(),
        category: newCategory,
        employment_type: employmentType,
        description: description.trim(),
        county: newCounty,
        town: town.trim(),
        pay_min: payMin ? Number(payMin) : null,
        pay_max: payMax ? Number(payMax) : null,
      }).select('id').single()
      if (error) throw error
      submittedJobId = job.id
      await uploadPostMedia(userId, { column: 'job_id', id: job.id }, mediaFiles)
      setTitle('')
      setDescription('')
      setTown('')
      setNewCounty('')
      setPayMin('')
      setPayMax('')
      setMediaFiles([])
      setMessage('Job submitted for moderation. It will be visible after approval.')
      await load(userId)
    } catch (error) {
      setMessage(submittedJobId
        ? `Your job post was submitted, but its photos/videos could not be uploaded: ${getErrorMessage(error)}`
        : getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId || !jobId) {
      setMessage('Sign in and select an open role to apply.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.from('property_job_applications').insert({
        job_id: jobId,
        applicant_id: userId,
        applicant_name: name.trim(),
        contact_phone: phone.trim(),
        message: applicationText.trim(),
      })
      if (error) throw error
      setApplicationText('')
      setMessage('Application sent. The listing owner can contact you using the details you provided.')
      await load(userId)
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function updateJob(job: Job, status: JobStatus) {
    const { error } = await supabase.from('property_jobs').update({ status }).eq('id', job.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage(`Job marked ${status}.`)
      setHasError(false)
      await load(userId)
    }
  }

  async function updateApplication(application: Application, status: ApplicationStatus) {
    const { error } = await supabase.from('property_job_applications').update({ status }).eq('id', application.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item))
    }
  }

  const myApplications = applications.filter((application) => application.applicant_id === userId)
  const employerApplications = applications.filter((application) => jobs.some((job) => job.id === application.job_id && job.owner_id === userId))

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-bold text-blue-700">MTAA opportunities</Link><nav className="flex gap-4 text-sm"><Link href="/homes" className="text-slate-600 hover:text-blue-700">Properties</Link><Link href="/services" className="text-slate-600 hover:text-blue-700">Services</Link></nav></div></header>
    <section className="mx-auto max-w-6xl px-5 py-9">
      <h1 className="text-3xl font-extrabold">Property jobs & gigs</h1><p className="mt-2 text-sm text-slate-600">Find caretaker, maintenance, construction, moving, cleaning and property-agent opportunities. Applications are shared only with you and the listing owner.</p>
      {message && <p role={hasError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      <div className="mt-5 flex flex-wrap gap-3"><label className="text-sm font-medium">County<select value={county} onChange={(event) => setCounty(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">All counties</option>{KENYA_COUNTIES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Role<select value={category} onChange={(event) => setCategory(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">All roles</option>{JOB_CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label></div>
      {loading ? <p className="py-10 text-center text-slate-600">Loading opportunities…</p> : jobs.filter((job) => job.status === 'open' || job.owner_id === userId || isAdmin).length === 0 ? <p className="mt-5 rounded-xl border border-slate-200 bg-white p-8 text-slate-600">No roles match yet.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">{jobs.filter((job) => job.status === 'open' || job.owner_id === userId || isAdmin).map((job) => <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-700">{job.category.replaceAll('_', ' ')} · {job.employment_type.replaceAll('_', ' ')}</p><h2 className="mt-1 text-xl font-bold">{job.title}</h2></div><span className="text-xs font-semibold capitalize text-slate-500">{job.status}</span></div><p className="mt-2 text-sm text-slate-600">{job.town}, {job.county}</p><PostMediaGallery items={job.media} /><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{job.description}</p><p className="mt-3 text-sm font-semibold text-slate-700">{job.pay_min || job.pay_max ? `KSh ${Number(job.pay_min ?? job.pay_max).toLocaleString()}${job.pay_max ? `–${Number(job.pay_max).toLocaleString()}` : '+'}` : 'Pay discussed with employer'}</p>{job.status === 'open' && userId && userId !== job.owner_id && <button type="button" onClick={() => setJobId(job.id)} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Apply</button>}{(isAdmin || job.owner_id === userId) && <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">{isAdmin && job.status === 'pending' && <button onClick={() => void updateJob(job, 'open')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>}{isAdmin && job.status === 'pending' && <button onClick={() => void updateJob(job, 'rejected')} className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white">Reject</button>}{job.owner_id === userId && job.status === 'open' && <button onClick={() => void updateJob(job, 'closed')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">Close listing</button>}</div>}</article>)}</div>}

      {jobId && <form onSubmit={(event) => void apply(event)} className="mt-6 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-5"><div className="flex justify-between"><h2 className="text-lg font-bold">Apply for selected role</h2><button type="button" onClick={() => setJobId('')} aria-label="Close application" className="text-sm underline">Close</button></div><label className="block text-sm font-medium">Your name<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Phone<input required type="tel" minLength={7} maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium">Why are you a good fit?<textarea required minLength={10} maxLength={2000} rows={4} value={applicationText} onChange={(event) => setApplicationText(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Send application</button></form>}

      {userId && <form onSubmit={(event) => void postJob(event)} className="mt-8 space-y-3 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Post a role</h2><p className="text-sm text-slate-600">Job posts are reviewed before appearing publicly.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Title<input required minLength={5} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Category<select value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{JOB_CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-sm font-medium">Employment type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{EMPLOYMENT_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label className="text-sm font-medium">County<select required value={newCounty} onChange={(event) => setNewCounty(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select county</option>{KENYA_COUNTIES.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Town<input required maxLength={120} value={town} onChange={(event) => setTown(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Pay range (KES, optional)<span className="mt-1 flex gap-2"><input aria-label="Minimum pay" type="number" min="0" value={payMin} onChange={(event) => setPayMin(event.target.value)} placeholder="From" className="w-full rounded-md border border-slate-300 px-3 py-2" /><input aria-label="Maximum pay" type="number" min="0" value={payMax} onChange={(event) => setPayMax(event.target.value)} placeholder="To" className="w-full rounded-md border border-slate-300 px-3 py-2" /></span></label></div><label className="block text-sm font-medium">Description<textarea required minLength={20} maxLength={3000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><PostMediaPicker files={mediaFiles} onChange={(files, error) => { setMediaFiles(files); if (error) { setMessage(error); setHasError(true) } }} /><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Submit job for review</button></form>}

      {myApplications.length > 0 && <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">My applications</h2><div className="mt-3 space-y-2">{myApplications.map((application) => <p key={application.id} className="text-sm">{jobs.find((job) => job.id === application.job_id)?.title ?? 'Job'} · <span className="capitalize">{application.status}</span></p>)}</div></section>}
      {employerApplications.length > 0 && <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Applications to your roles</h2><div className="mt-3 space-y-3">{employerApplications.map((application) => <article key={application.id} className="rounded-lg border border-slate-200 p-4"><p className="font-semibold">{application.applicant_name} · {jobs.find((job) => job.id === application.job_id)?.title}</p><a href={`tel:${application.contact_phone}`} className="mt-1 text-sm text-blue-700 underline">{application.contact_phone}</a><p className="mt-2 text-sm">{application.message}</p><div className="mt-2 flex gap-2">{(['reviewing', 'shortlisted', 'declined'] as const).map((status) => <button key={status} onClick={() => void updateApplication(application, status)} className="rounded border border-slate-300 px-2 py-1 text-xs capitalize">{status}</button>)}</div></article>)}</div></section>}
    </section>
  </main>
}
