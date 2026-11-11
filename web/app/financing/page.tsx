'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface FinancePartner {
  id: string
  business_name: string
  product_type: 'mortgage' | 'construction' | 'asset_finance' | 'other'
  description: string
  counties: string[]
  website_url: string
  contact_phone: string | null
  verification_status: 'pending' | 'verified' | 'suspended'
}

const PRODUCT_LABELS: Record<FinancePartner['product_type'], string> = {
  mortgage: 'Mortgage',
  construction: 'Construction finance',
  asset_finance: 'Asset finance',
  other: 'Other',
}

export default function FinancingDirectoryPage() {
  const [partners, setPartners] = useState<FinancePartner[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [county, setCounty] = useState('')
  const [productType, setProductType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [newProductType, setNewProductType] = useState<FinancePartner['product_type']>('mortgage')
  const [description, setDescription] = useState('')
  const [counties, setCounties] = useState<string[]>([])
  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')

  async function load() {
    const { data, error } = await supabase.from('finance_partners')
      .select('id,business_name,product_type,description,counties,website_url,contact_phone,verification_status')
      .order('business_name')
    if (error) throw error
    setPartners((data ?? []) as FinancePartner[])
  }

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) throw error
        if (data.user) {
          const { data: role, error: roleError } = await supabase.from('platform_user_roles')
            .select('role').eq('user_id', data.user.id).eq('role', 'admin').maybeSingle()
          if (roleError) throw roleError
          if (active) setIsAdmin(Boolean(role))
        }
        await load()
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
  }, [])

  async function createPartner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.from('finance_partners').insert({
        business_name: businessName.trim(),
        product_type: newProductType,
        description: description.trim(),
        counties,
        website_url: website.trim(),
        contact_phone: phone.trim() || null,
      })
      if (error) throw error
      setBusinessName('')
      setDescription('')
      setCounties([])
      setWebsite('')
      setPhone('')
      setMessage('Partner saved. It will be publicly listed after verification.')
      await load()
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(partner: FinancePartner, status: FinancePartner['verification_status']) {
    const { error } = await supabase.from('finance_partners').update({ verification_status: status }).eq('id', partner.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
      return
    }
    setMessage(`Partner marked ${status}.`)
    setHasError(false)
    await load()
  }

  const visiblePartners = partners.filter((partner) =>
    (!county || partner.counties.length === 0 || partner.counties.includes(county))
    && (productType === 'all' || partner.product_type === productType)
    && (isAdmin || partner.verification_status === 'verified')
  )

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link href="/" className="text-xl font-bold text-blue-700">MTAA</Link><nav className="flex gap-4 text-sm"><Link href="/homes" className="text-slate-600 hover:text-blue-700">Properties</Link><Link href="/services" className="text-slate-600 hover:text-blue-700">Services</Link></nav></div></header>
    <section className="mx-auto max-w-6xl px-5 py-9">
      <p className="text-sm font-bold uppercase tracking-wide text-blue-700">Lender directory</p><h1 className="mt-1 text-3xl font-extrabold">Explore financing contacts</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Connect with listed lenders directly to ask about their products and eligibility. MTAA does not provide financial advice, assess applications, endorse loan terms, or guarantee approval. Independently verify all terms and regulatory status before sharing information or applying.</p>
      {message && <p role={hasError ? 'alert' : 'status'} className={`mt-5 rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
      <div className="mt-6 flex flex-wrap gap-3"><label className="text-sm font-medium">County<select value={county} onChange={(event) => setCounty(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">All counties</option>{KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}</select></label><label className="text-sm font-medium">Product<select value={productType} onChange={(event) => setProductType(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"><option value="all">All products</option>{Object.entries(PRODUCT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {loading ? <p className="py-12 text-center text-slate-600">Loading finance partners…</p> : visiblePartners.length === 0 ? <p className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-slate-600">No verified partners match these filters.</p> : <div className="mt-6 grid gap-4 md:grid-cols-2">{visiblePartners.map((partner) => <article key={partner.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{PRODUCT_LABELS[partner.product_type]}</p><h2 className="mt-1 text-xl font-bold">{partner.business_name}</h2></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{partner.verification_status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{partner.description}</p><p className="mt-3 text-xs text-slate-500">Service areas: {partner.counties.length ? partner.counties.join(', ') : 'Not specified'}</p><div className="mt-4 flex flex-wrap gap-3"><a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Visit lender website</a>{partner.contact_phone && <a href={`tel:${partner.contact_phone}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Call {partner.contact_phone}</a>}</div>{isAdmin && <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => void updateStatus(partner, 'verified')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Verify</button><button type="button" onClick={() => void updateStatus(partner, 'suspended')} className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-semibold">Suspend</button></div>}</article>)}</div>}
      {isAdmin && <form onSubmit={(event) => void createPartner(event)} className="mt-8 space-y-3 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Add finance partner</h2><p className="text-sm text-slate-600">Only verified partners are visible to the public.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Business name<input required minLength={2} maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Product type<select value={newProductType} onChange={(event) => setNewProductType(event.target.value as FinancePartner['product_type'])} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{Object.entries(PRODUCT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="block text-sm font-medium">Description<textarea required minLength={20} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Website (HTTPS)<input required type="url" pattern="https://.*" value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Contact phone (optional)<input type="tel" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div><fieldset><legend className="text-sm font-medium">Counties served (none means countrywide)</legend><div className="mt-2 grid max-h-40 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">{KENYA_COUNTIES.map((name) => <label key={name} className="text-xs"><input type="checkbox" checked={counties.includes(name)} onChange={(event) => setCounties((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name))} className="mr-1" />{name}</label>)}</div></fieldset><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Add pending partner'}</button></form>}
    </section>
  </main>
}
