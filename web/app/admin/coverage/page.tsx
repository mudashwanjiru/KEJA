'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface CountyCoverage {
  county: string
  home_listings: number
  commercial_spaces: number
  verified_services: number
  open_jobs: number
  directory_listings: number
  ward_tagged_listings: number
  saved_searches: number
  new_listings_90d: number
}

const number = (value: number) => Number(value ?? 0)

export default function CountyCoveragePage() {
  const [rows, setRows] = useState<CountyCoverage[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_keja_county_coverage')
        if (error) throw error
        if (active) setRows((data ?? []) as CountyCoverage[])
      } catch (error) {
        if (active) setMessage(getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const rankedRows = useMemo(() => [...rows].sort((a, b) => {
    const aTotal = number(a.home_listings) + number(a.commercial_spaces) + number(a.verified_services) + number(a.open_jobs) + number(a.directory_listings)
    const bTotal = number(b.home_listings) + number(b.commercial_spaces) + number(b.verified_services) + number(b.open_jobs) + number(b.directory_listings)
    return aTotal - bTotal || a.county.localeCompare(b.county)
  }), [rows])

  const totalDemand = rows.reduce((sum, row) => sum + number(row.saved_searches), 0)
  const totalRecent = rows.reduce((sum, row) => sum + number(row.new_listings_90d), 0)

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link href="/" className="font-bold text-emerald-900">MTAA Admin</Link><nav className="flex gap-4 text-sm"><Link href="/admin/locations" className="font-semibold text-blue-700 hover:underline">Ward data</Link><Link href="/admin/community" className="text-slate-600 hover:text-blue-700">Moderation</Link></nav></div></header>
    <section className="mx-auto max-w-7xl px-5 py-8">
      <h1 className="text-3xl font-extrabold">County coverage & demand</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Find counties with limited approved listings and recent activity. Saved-search counts use structured county selections, with a legacy text fallback for older searches; they are not a measure of total market demand.</p>
      {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      {loading ? <p className="py-12 text-center text-slate-600">Loading county coverage…</p> : message ? null : <>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">Counties tracked</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">Saved searches mentioning a county</p><p className="mt-1 text-2xl font-bold">{totalDemand.toLocaleString('en-KE')}</p></article>
          <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">Approved listings added in 90 days</p><p className="mt-1 text-2xl font-bold">{totalRecent.toLocaleString('en-KE')}</p></article>
        </div>
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-100"><tr><th className="p-3">County (lowest coverage first)</th><th className="p-3">Homes & land</th><th className="p-3">Commercial</th><th className="p-3">Services</th><th className="p-3">Jobs</th><th className="p-3">Other directory</th><th className="p-3">Ward-tagged</th><th className="p-3">Saved-search signal</th><th className="p-3">New · 90 days</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rankedRows.map((row) => <tr key={row.county}><th className="p-3 font-semibold">{row.county}</th><td className="p-3">{number(row.home_listings)}</td><td className="p-3">{number(row.commercial_spaces)}</td><td className="p-3">{number(row.verified_services)}</td><td className="p-3">{number(row.open_jobs)}</td><td className="p-3">{number(row.directory_listings)}</td><td className="p-3">{number(row.ward_tagged_listings)}</td><td className="p-3">{number(row.saved_searches)}</td><td className="p-3">{number(row.new_listings_90d)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Counts include only approved/verified, currently available records for each category. Saved-search demand counts unique search records, not unique people or total market demand. Use the results to guide outreach, not as a population-level estimate.</p>
      </>}
    </section>
  </main>
}
