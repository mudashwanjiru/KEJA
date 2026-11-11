'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'

interface WardRow {
  county: string
  sub_county: string
  ward: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

function isWardRow(value: unknown): value is WardRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.county === 'string'
    && typeof row.sub_county === 'string'
    && typeof row.ward === 'string'
}

export default function WardDataAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [rows, setRows] = useState<WardRow[]>([])
  const [sourceUrl, setSourceUrl] = useState('')
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true
    async function checkAdmin() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!auth.user) {
          if (active) setAuthorized(false)
          return
        }
        const { data, error } = await supabase.from('platform_user_roles')
          .select('role').eq('user_id', auth.user.id).eq('role', 'admin').maybeSingle()
        if (error) throw error
        if (active) setAuthorized(Boolean(data))
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void checkAdmin()
    return () => { active = false }
  }, [])

  async function readDataset(file: File | undefined) {
    setRows([])
    setMessage('')
    setIsError(false)
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setMessage('Choose a JSON file smaller than 10 MB.')
      setIsError(true)
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const items = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && 'wards' in parsed
          ? (parsed as { wards: unknown }).wards
          : null
      if (!Array.isArray(items) || items.length === 0 || !items.every(isWardRow)) {
        throw new Error('The JSON must be an array of rows with county, sub_county and ward fields, or an object containing a wards array.')
      }
      const invalid = items.find((row) => !KENYA_COUNTIES.includes(row.county as (typeof KENYA_COUNTIES)[number])
        || !row.sub_county.trim() || !row.ward.trim())
      if (invalid) throw new Error('Every row must use one of MTAA’s 47 county names and include a sub-county and ward.')
      setRows(items.map((row) => ({
        county: row.county.trim(),
        sub_county: row.sub_county.trim(),
        ward: row.ward.trim(),
      })))
      setVersion(file.name.replace(/\.json$/i, '').slice(0, 80))
      setMessage(`${items.length.toLocaleString('en-KE')} rows ready to import. Confirm the source and version before importing.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read the ward dataset.')
      setIsError(true)
    }
  }

  async function importDataset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rows.length) return
    setBusy(true)
    setMessage('')
    setIsError(false)
    try {
      const { data, error } = await supabase.rpc('import_keja_ward_reference', {
        p_source_url: sourceUrl.trim(),
        p_source_version: version.trim(),
        p_wards: rows,
      })
      if (error) throw error
      setMessage(`Imported or updated ${Number(data).toLocaleString('en-KE')} ward records.`)
      setRows([])
    } catch (error) {
      setMessage(getErrorMessage(error))
      setIsError(true)
    } finally {
      setBusy(false)
    }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4"><Link href="/" className="font-bold text-emerald-900">MTAA Admin</Link><Link href="/admin/coverage" className="text-sm font-semibold text-blue-700 hover:underline">County coverage</Link></div></header>
    <section className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-3xl font-extrabold">Kenya ward reference data</h1>
      <p className="mt-3 leading-7 text-slate-600">Import a sourced ward dataset as JSON. MTAA does not bundle an official boundary dataset yet; confirm the source is authoritative and include its version/date. Importing reference data does not automatically reclassify older listings.</p>
      {message && <p role={isError ? 'alert' : 'status'} className={`mt-4 rounded-lg p-3 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900'}`}>{message}</p>}
      {loading ? <p className="py-10 text-slate-600">Checking administrator access…</p> : authorized !== true ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Sign in with a MTAA administrator account to import reference data.</p> : <form onSubmit={importDataset} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <label className="block text-sm font-semibold">Ward dataset JSON<input type="file" accept="application/json,.json" onChange={(event) => void readDataset(event.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Authoritative source URL<input type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
          <label className="block text-sm font-semibold">Dataset version or publication date<input required maxLength={80} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="e.g. IEBC ward register, 2022" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700"><p className="font-bold">Expected JSON</p><pre className="mt-2 overflow-x-auto text-xs">{`[\n  { "county": "Nairobi", "sub_county": "Westlands", "ward": "Kitisuru" }\n]`}</pre><p className="mt-2">County names must match MTAA’s 47-county list exactly. The source URL and version are stored with each record.</p></div>
        <button type="submit" disabled={busy || rows.length === 0} className="rounded-lg bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Importing…' : `Import ${rows.length ? rows.length.toLocaleString('en-KE') : ''} ward rows`}</button>
      </form>}
    </section>
  </main>
}
