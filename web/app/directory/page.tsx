'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getErrorMessage } from '@/lib/errors'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { useKejaLanguage } from '@/lib/language'
import { supabase } from '@/lib/supabase'
import { addCommerceCartItem, type CommerceDepartment, useCommerceCart } from '@/lib/commerceCart'

const DEPARTMENTS = [
  { value: 'marketplace', label: 'Shopping & household goods', icon: '▦', priceLabel: 'Price (KSh, optional)', unitLabel: 'Price unit', units: ['each', 'set', 'kg', 'litre', 'bag', ''] },
  { value: 'food', label: 'Market & food', icon: '🍲', priceLabel: 'Price (KSh, optional)', unitLabel: 'Price unit', units: ['per meal', 'per plate', 'per person', ''] },
  { value: 'construction', label: 'Construction', icon: '⚒', priceLabel: 'Quote / starting price (KSh, optional)', unitLabel: 'Price unit', units: ['per item', 'per bag', 'per tonne', 'per project', ''] },
  { value: 'health', label: 'Healthcare', icon: '✚', priceLabel: 'Consultation / service price (KSh, optional)', unitLabel: 'Price unit', units: ['per visit', 'per consultation', ''] },
  { value: 'education', label: 'Education', icon: '▤', priceLabel: 'Fees (KSh, optional)', unitLabel: 'Price unit', units: ['per term', 'per course', 'per session', ''] },
  { value: 'transport', label: 'Transport', icon: '↗', priceLabel: 'Starting fare (KSh, optional)', unitLabel: 'Price unit', units: ['per trip', 'per km', ''] },
  { value: 'accommodation', label: 'Hotels & stays', icon: '⌂', priceLabel: 'Starting price (KSh, optional)', unitLabel: 'Price unit', units: ['per night', 'per room', ''] },
  { value: 'agriculture', label: 'Agriculture', icon: '❋', priceLabel: 'Price (KSh, optional)', unitLabel: 'Price unit', units: ['per kg', 'per bag', 'per crate', ''] },
  { value: 'events', label: 'Events', icon: '✦', priceLabel: 'Starting price (KSh, optional)', unitLabel: 'Price unit', units: ['per event', 'per day', ''] },
  { value: 'essentials', label: 'Household essentials', icon: '⌁', priceLabel: 'Price / starting fee (KSh, optional)', unitLabel: 'Price unit', units: ['per delivery', 'per visit', 'per month', ''] },
  { value: 'automotive', label: 'Automotive', icon: '▰', priceLabel: 'Price / starting fee (KSh, optional)', unitLabel: 'Price unit', units: ['per vehicle', 'per service', 'per part', ''] },
  { value: 'businesses', label: 'Business directory', icon: '▣', priceLabel: 'Price (KSh, optional)', unitLabel: 'Price unit', units: [''] },
] as const

type DepartmentValue = (typeof DEPARTMENTS)[number]['value']
type DepartmentFilter = 'all' | DepartmentValue
type RequestField = {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'textarea'
  required?: boolean
  maxLength?: number
  min?: string
  max?: string
  step?: string
  placeholder?: string
  options?: string[]
}

const REQUEST_FIELDS: Partial<Record<DepartmentValue, RequestField[]>> = {
  health: [
    { key: 'service_requested', label: 'Service requested', type: 'text', required: true, maxLength: 120, placeholder: 'e.g. dental consultation' },
    { key: 'appointment_date', label: 'Appointment date', type: 'date', required: true },
    { key: 'appointment_period', label: 'Preferred time', type: 'select', required: true, options: ['morning', 'afternoon', 'evening'] },
  ],
  education: [
    { key: 'program', label: 'Course / program', type: 'text', required: true, maxLength: 120 },
    { key: 'learner_count', label: 'Number of learners', type: 'number', required: true, min: '1', max: '50', step: '1' },
    { key: 'preferred_start_date', label: 'Preferred start date', type: 'date', required: true },
  ],
  transport: [
    { key: 'pickup_location', label: 'Pickup location', type: 'text', required: true, maxLength: 160 },
    { key: 'destination', label: 'Destination', type: 'text', required: true, maxLength: 160 },
    { key: 'travel_date', label: 'Travel date', type: 'date', required: true },
    { key: 'transport_type', label: 'Transport type', type: 'select', required: true, options: ['passenger', 'moving', 'delivery', 'other'] },
    { key: 'load_details', label: 'Passengers / load details', type: 'textarea', required: true, maxLength: 500 },
  ],
  agriculture: [
    { key: 'item', label: 'Produce / farm service', type: 'text', required: true, maxLength: 120 },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, min: '0.01', max: '1000000', step: '0.01' },
    { key: 'unit', label: 'Unit', type: 'select', required: true, options: ['kg', 'bag', 'crate', 'litre', 'piece', 'other'] },
    { key: 'delivery_location', label: 'Delivery location', type: 'text', required: true, maxLength: 160 },
  ],
  events: [
    { key: 'event_date', label: 'Event date', type: 'date', required: true },
    { key: 'guest_count', label: 'Expected guests', type: 'number', required: true, min: '1', max: '50000', step: '1' },
    { key: 'venue', label: 'Venue / location', type: 'text', required: true, maxLength: 160 },
    { key: 'service_required', label: 'Service required', type: 'text', required: true, maxLength: 300, placeholder: 'e.g. photography, catering, sound' },
  ],
  businesses: [
    { key: 'inquiry_topic', label: 'Inquiry topic', type: 'text', required: true, maxLength: 160 },
    { key: 'organization_name', label: 'Organization name (optional)', type: 'text', maxLength: 160 },
  ],
}

interface DirectoryListing {
  id: string
  department: DepartmentValue
  title: string
  category: string
  description: string
  county: string
  town: string
  contact_name: string
  contact_phone: string
  price: number | null
  price_unit: string
  stock_quantity: number | null
  website_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function DirectoryContent() {
  const { t } = useKejaLanguage()
  const searchParams = useSearchParams()
  const initialDepartment = searchParams.get('department')
  const [listings, setListings] = useState<DirectoryListing[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [department, setDepartment] = useState<DepartmentFilter>(
    DEPARTMENTS.some((item) => item.value === initialDepartment)
      ? initialDepartment as DepartmentValue
      : 'all',
  )
  const [county, setCounty] = useState('')
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [newCounty, setNewCounty] = useState('')
  const [town, setTown] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [price, setPrice] = useState('')
  const [priceUnit, setPriceUnit] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const cart = useCommerceCart()
  const [cartNotice, setCartNotice] = useState('')
  const [selectedStay, setSelectedStay] = useState<DirectoryListing | null>(null)
  const [stayName, setStayName] = useState('')
  const [stayPhone, setStayPhone] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guestCount, setGuestCount] = useState('1')
  const [stayMessage, setStayMessage] = useState('')
  const [savingStay, setSavingStay] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<DirectoryListing | null>(null)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [requestDetails, setRequestDetails] = useState<Record<string, string>>({})
  const [savingRequest, setSavingRequest] = useState(false)

  const activeDepartment = DEPARTMENTS.find((item) => item.value === department)

  useEffect(() => {
    let active = true
    async function fetchListings() {
      setLoading(true)
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        let request = supabase.from('keja_directory_listings')
          .select('id,department,title,category,description,county,town,contact_name,contact_phone,price,price_unit,stock_quantity,website_url,status,created_at')
          .order('created_at', { ascending: false })
          .limit(300)
        if (department !== 'all') request = request.eq('department', department)
        if (county) request = request.eq('county', county)
        const { data, error } = await request
        if (error) throw error
        if (active) {
          setUser(authData.user)
          setListings((data ?? []) as DirectoryListing[])
        }
      } catch (error) {
        console.error('Could not load MTAA directory listings:', error)
        if (active) {
          setNotice(`Could not load listings: ${getErrorMessage(error)}`)
          setIsError(true)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void fetchListings()
    return () => { active = false }
  }, [county, department, refreshToken])

  const filteredListings = useMemo(() => {
    const term = query.trim().toLowerCase()
    return listings.filter((listing) => !term || [
      listing.title,
      listing.category,
      listing.description,
      listing.county,
      listing.town,
    ].some((value) => value.toLowerCase().includes(term)))
  }, [listings, query])

  async function submitListing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || department === 'all') {
      setNotice('Choose a department and sign in before submitting a listing.')
      setIsError(true)
      return
    }
    setSaving(true)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('keja_directory_listings').insert({
        owner_id: user.id,
        department,
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        county: newCounty,
        town: town.trim(),
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        price: price ? Number(price) : null,
        price_unit: priceUnit,
        ...(department === 'marketplace' && stockQuantity !== '' ? { stock_quantity: Number(stockQuantity) } : {}),
        website_url: websiteUrl.trim() || null,
      })
      if (error) throw error
      setNotice('Your listing was submitted for review. It will appear publicly after approval.')
      setTitle('')
      setCategory('')
      setDescription('')
      setNewCounty('')
      setTown('')
      setContactName('')
      setContactPhone('')
      setPrice('')
      setPriceUnit('')
      setStockQuantity('')
      setWebsiteUrl('')
      setShowForm(false)
      setRefreshToken((current) => current + 1)
    } catch (error) {
      console.error('Could not submit MTAA directory listing:', error)
      setNotice(`Could not submit your listing: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  async function submitStayRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStay || !user) {
      setNotice('Sign in before requesting accommodation.')
      setIsError(true)
      return
    }

    if (new Date(`${checkOut}T00:00:00`) <= new Date(`${checkIn}T00:00:00`)) {
      setNotice('Check-out must be after check-in.')
      setIsError(true)
      return
    }
    setSavingStay(true)
    setNotice('')
    setIsError(false)
    try {
      const { error } = await supabase.from('keja_stay_requests').insert({
        listing_id: selectedStay.id,
        guest_id: user.id,
        guest_name: stayName.trim(),
        contact_phone: stayPhone.trim(),
        check_in: checkIn,
        check_out: checkOut,
        guest_count: Number(guestCount),
        message: stayMessage.trim(),
      })
      if (error) throw error
      setNotice('Your stay request was sent to the host. Agree on price and payment directly with them.')
      setSelectedStay(null)
      setStayName('')
      setStayPhone('')
      setCheckIn('')
      setCheckOut('')
      setGuestCount('1')
      setStayMessage('')
    } catch (error) {
      console.error('Could not send MTAA stay request:', error)
      setNotice(`Could not send your stay request: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setSavingStay(false)
    }
  }

  async function submitDirectoryRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRequest || !user) {
      setNotice('Sign in before contacting this provider.')
      setIsError(true)
      return
    }
    setSavingRequest(true)
    setNotice('')
    setIsError(false)
    try {
      const detailKeysByDepartment: Partial<Record<DepartmentValue, string[]>> = {
        health: ['service_requested', 'appointment_date', 'appointment_period'],
        education: ['program', 'learner_count', 'preferred_start_date'],
        transport: ['pickup_location', 'destination', 'travel_date', 'transport_type', 'load_details'],
        agriculture: ['item', 'quantity', 'unit', 'delivery_location'],
        events: ['event_date', 'guest_count', 'venue', 'service_required'],
        businesses: ['inquiry_topic', 'organization_name'],
      }
      const numericDetailKeys = ['learner_count', 'quantity', 'guest_count']
      const details: Record<string, string | number> = {}
      for (const key of detailKeysByDepartment[selectedRequest.department] ?? []) {
        const value = requestDetails[key]?.trim() ?? ''
        details[key] = numericDetailKeys.includes(key) ? Number(value) : value
      }
      const dateKeyByDepartment: Partial<Record<DepartmentValue, string>> = {
        health: 'appointment_date',
        education: 'preferred_start_date',
        transport: 'travel_date',
        events: 'event_date',
      }
      const dateKey = dateKeyByDepartment[selectedRequest.department]
      const { error } = await supabase.from('keja_directory_requests').insert({
        listing_id: selectedRequest.id,
        requester_id: user.id,
        message: selectedRequest.department === 'health'
          ? 'Appointment request. No medical details provided.'
          : requestMessage.trim(),
        requested_date: dateKey ? requestDetails[dateKey] || null : requestedDate || null,
        request_details: details,
      })
      if (error) throw error
      setSelectedRequest(null)
      setRequestMessage('')
      setRequestedDate('')
      setRequestDetails({})
      setNotice('Your request was sent. Track the provider’s reply in your dashboard.')
    } catch (error) {
      setNotice(`Could not send your request: ${getErrorMessage(error)}`)
      setIsError(true)
    } finally {
      setSavingRequest(false)
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="text-2xl font-black tracking-tight text-emerald-950">MTAA</Link>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link href="/" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Home</Link>
            <Link href="/search" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Search MTAA</Link>
            <Link href="/dashboard/orders" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">My orders & stays</Link>
            <Link href="/dashboard/requests" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">Department requests</Link>
            <Link href="/dashboard/listings" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-emerald-50">My listings</Link>
            <Link href="/dashboard" className="rounded-lg bg-emerald-800 px-4 py-2 text-white hover:bg-emerald-900">My MTAA</Link>
          </div>
        </nav>
      </header>

      <section className="bg-emerald-950 px-5 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-lime-300">Discover local Kenya</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">More of everyday life, on MTAA.</h1>
          <p className="mt-3 max-w-3xl leading-7 text-emerald-100">Discover groceries, construction supplies, healthcare, education, transport, farm produce, shopping, events, household essentials, automotive services and more.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-9 sm:py-12">
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-semibold">Department
            <select value={department} onChange={(event) => setDepartment(event.target.value as DepartmentFilter)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3">
              <option value="all">All departments</option>
              {DEPARTMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Search listings
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, service or area" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">County
            <select value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-3">
              <option value="">All counties</option>
              {KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-2xl font-black">{activeDepartment?.label ?? 'Explore all departments'}</h2><p className="mt-1 text-sm text-slate-600">{loading ? 'Loading listings…' : `${filteredListings.length} ${filteredListings.length === 1 ? 'listing' : 'listings'} found`}</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/cart" className="rounded-xl border border-emerald-800 px-4 py-3 font-bold text-emerald-900 hover:bg-emerald-50">Cart ({cart.reduce((total, item) => total + item.quantity, 0)})</Link><button type="button" onClick={() => { setShowForm((open) => !open); setNotice(''); setIsError(false) }} className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900">
            {showForm ? 'Close form' : t('addListing')}
          </button></div>
        </div>

        {department === 'health' && <p role="note" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">MTAA reviews submitted listings but does not independently verify healthcare credentials. Confirm a provider&apos;s current registration with the relevant professional regulator. Appointment requests collect logistics only; do not share symptoms or medical records here.</p>}

        {notice && <p role={isError ? 'alert' : 'status'} className={`mt-5 rounded-xl p-4 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{notice}</p>}
        {cartNotice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{cartNotice}</p>}

        {showForm && <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
          <h3 className="text-xl font-bold">Submit a local listing</h3>
          {!user ? <div className="mt-3"><p className="text-sm text-slate-600">Sign in to submit a listing. Submissions are reviewed before being shown publicly.</p><Link href="/dashboard" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2.5 font-bold text-white hover:bg-emerald-900">Sign in or create account</Link></div>
            : department === 'all' ? <p className="mt-3 text-sm text-slate-600">Select one department above before adding a listing.</p>
              : <form onSubmit={submitListing} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">Department<input disabled value={activeDepartment?.label ?? ''} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">Listing name<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={department === 'marketplace' ? 'Product name' : 'Business or service name'} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">Category<input required minLength={2} maxLength={80} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. fresh produce, restaurant, clinic" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">County<select required value={newCounty} onChange={(event) => setNewCounty(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Select county</option>{KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}</select></label>
                <label className="text-sm font-semibold">Town / area<input required minLength={1} maxLength={120} value={town} onChange={(event) => setTown(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">Contact name<input required minLength={2} maxLength={120} value={contactName} onChange={(event) => setContactName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">Contact phone<input required type="tel" minLength={7} maxLength={32} value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">{activeDepartment?.priceLabel ?? 'Price (KSh, optional)'}<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="text-sm font-semibold">{activeDepartment?.unitLabel ?? 'Price unit'}<select value={priceUnit} onChange={(event) => setPriceUnit(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Not specified</option>{activeDepartment?.units.filter(Boolean).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                <label className="text-sm font-semibold">Website <span className="font-normal text-slate-500">(optional, HTTPS)</span><input type="url" pattern="https://.*" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.co.ke" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                {department === 'marketplace' && <label className="text-sm font-semibold">Stock quantity <span className="font-normal text-slate-500">(optional)</span><input type="number" min="0" max="1000000" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} placeholder="Leave blank for unlimited" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>}
                <label className="text-sm font-semibold sm:col-span-2">Description<textarea required minLength={20} maxLength={3000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the product, business or service, availability and any useful details." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <button disabled={saving} className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-60 sm:col-span-2">{saving ? 'Submitting…' : 'Submit for review'}</button>
              </form>}
        </section>}

        {loading ? <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">Finding local listings…</p>
          : filteredListings.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h3 className="text-xl font-bold">No listings found</h3><p className="mt-2 text-slate-600">Try another department or area, or be the first to add a listing.</p></div>
            : <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredListings.map((listing) => {
              const listingDepartment = DEPARTMENTS.find((item) => item.value === listing.department)
              const commerceDepartment: CommerceDepartment | null = listing.department === 'marketplace' || listing.department === 'food'
                ? listing.department
                : null
              return <article key={listing.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900">{listingDepartment?.icon} {listingDepartment?.label}</span>{listing.status === 'pending' && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">In review</span>}</div>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-800">{listing.category}</p>
                <h3 className="mt-1 text-xl font-bold">{listing.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{listing.town}, {listing.county}</p>
                <p className="mt-4 line-clamp-4 flex-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{listing.description}</p>
                {listing.price !== null && <p className="mt-4 font-bold text-emerald-900">KSh {Number(listing.price).toLocaleString('en-KE')}{listing.price_unit ? ` / ${listing.price_unit}` : ''}</p>}
                {listing.department === 'marketplace' && listing.stock_quantity !== null && <p className="mt-1 text-xs text-slate-500">{listing.stock_quantity} in stock</p>}
                {commerceDepartment && listing.price !== null && listing.price > 0 && <button type="button" disabled={listing.stock_quantity === 0} onClick={() => {
                  try {
                    addCommerceCartItem({
                      listingId: listing.id,
                      department: commerceDepartment,
                      title: listing.title,
                      price: Number(listing.price),
                      priceUnit: listing.price_unit,
                      stockQuantity: listing.stock_quantity,
                    })
                    setCartNotice(`${listing.title} added to your cart.`)
                  } catch (error) {
                    setCartNotice(getErrorMessage(error))
                  }
                }} className="mt-4 rounded-lg border border-emerald-800 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">{listing.stock_quantity === 0 ? 'Out of stock' : listing.department === 'food' ? 'Add to food order' : 'Add to cart'}</button>}
                {listing.department === 'accommodation' && <button type="button" onClick={() => { setSelectedStay(listing); setNotice('') }} className="mt-4 rounded-lg border border-emerald-800 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50">Request stay</button>}
                {listing.status === 'approved' && !['marketplace', 'food', 'accommodation'].includes(listing.department) && <button type="button" onClick={() => { setSelectedRequest(listing); setNotice('') }} className="mt-4 rounded-lg border border-emerald-800 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50">{t('sendRequest')}</button>}
                <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-sm font-semibold">{listing.contact_name}</p><a href={`tel:${listing.contact_phone}`} className="mt-1 inline-block text-sm font-bold text-emerald-800 underline">{listing.contact_phone}</a>{listing.website_url && <a href={listing.website_url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm font-semibold text-emerald-800 underline">{listing.website_url}</a>}</div>
              </article>
            })}</div>}
        {selectedStay && <section className="mt-7 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-emerald-800">Stay request</p><h3 className="mt-1 text-xl font-bold">{selectedStay.title}</h3><p className="mt-1 text-sm text-slate-600">{selectedStay.town}, {selectedStay.county} · Listed rate {selectedStay.price === null ? 'not provided' : `KSh ${Number(selectedStay.price).toLocaleString('en-KE')}${selectedStay.price_unit ? ` / ${selectedStay.price_unit}` : ''}`}</p></div><button type="button" onClick={() => setSelectedStay(null)} className="text-sm font-semibold text-slate-600 underline">Close</button></div>
          {!user ? <p className="mt-4 text-sm text-slate-600">Sign in to request accommodation. <Link href="/dashboard" className="font-bold text-emerald-800 underline">Sign in</Link></p>
            : <form onSubmit={submitStayRequest} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">Your name<input required minLength={2} maxLength={120} value={stayName} onChange={(event) => setStayName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold">Phone number<input required type="tel" minLength={7} maxLength={32} value={stayPhone} onChange={(event) => setStayPhone(event.target.value)} placeholder="+254 7XX XXX XXX" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold">Check-in<input required type="date" min={new Date().toLocaleDateString('en-CA')} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold">Check-out<input required type="date" min={checkIn || new Date().toLocaleDateString('en-CA')} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold">Guests<input required type="number" min="1" max="30" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <label className="text-sm font-semibold sm:col-span-2">Message to host <span className="font-normal text-slate-500">(optional)</span><textarea maxLength={1000} rows={3} value={stayMessage} onChange={(event) => setStayMessage(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">This requests dates; it does not confirm availability or charge you. Agree final pricing and payment with the host.</p>
              <button disabled={savingStay} className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{savingStay ? 'Sending request…' : 'Send stay request'}</button>
            </form>}
        </section>}
        {selectedRequest && <section className="mt-7 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-emerald-800">Provider inquiry · {selectedRequest.category}</p><h2 className="mt-1 text-xl font-bold">{selectedRequest.title}</h2><p className="mt-1 text-sm text-slate-600">{selectedRequest.town}, {selectedRequest.county}</p></div><button type="button" onClick={() => setSelectedRequest(null)} className="text-sm font-semibold text-slate-600 underline">Close</button></div>
          {!user ? <p className="mt-4 text-sm text-slate-600">Sign in to send a request. <Link href="/dashboard" className="font-bold text-emerald-800 underline">Sign in</Link></p>
            : <form onSubmit={submitDirectoryRequest} className="mt-5 grid gap-4 sm:grid-cols-2">
              {selectedRequest.department === 'health' && <p className="text-sm leading-6 text-amber-900 sm:col-span-2">Appointment scheduling only. Do not enter symptoms, diagnoses, medical records, or other sensitive health information.</p>}
              {(REQUEST_FIELDS[selectedRequest.department] ?? []).map((field) => <label key={field.key} className="text-sm font-semibold">
                {field.label}
                {field.type === 'select'
                  ? <select required={field.required} value={requestDetails[field.key] ?? ''} onChange={(event) => setRequestDetails((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                    <option value="">Choose an option</option>{field.options?.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
                  </select>
                  : field.type === 'textarea'
                    ? <textarea required={field.required} minLength={field.required ? 2 : undefined} maxLength={field.maxLength} rows={3} value={requestDetails[field.key] ?? ''} onChange={(event) => setRequestDetails((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                    : <input required={field.required} type={field.type} min={field.type === 'date' ? new Date().toLocaleDateString('en-CA') : field.min} max={field.max} step={field.step} maxLength={field.maxLength} minLength={field.required && field.type === 'text' ? 2 : undefined} value={requestDetails[field.key] ?? ''} onChange={(event) => setRequestDetails((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" />}
              </label>)}
              {selectedRequest.department !== 'health' && <label className="text-sm font-semibold sm:col-span-2">Additional details<textarea required minLength={5} maxLength={2000} rows={3} value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} placeholder="Share any other non-sensitive requirements." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>}
              {selectedRequest.department === 'businesses' && <label className="text-sm font-semibold">Preferred date (optional)<input type="date" min={new Date().toLocaleDateString('en-CA')} value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" /></label>}
              <div className="flex items-end"><button type="submit" disabled={savingRequest} className="rounded-lg bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-50">{savingRequest ? 'Sending…' : 'Send request'}</button></div>
            </form>}
        </section>}
      </section>
    </main>
  )
}

export default function DirectoryPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f7f8f5] p-10 text-center text-slate-600">Loading MTAA directory…</main>}><DirectoryContent /></Suspense>
}
