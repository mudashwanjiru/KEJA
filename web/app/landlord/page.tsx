'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import { KENYA_COUNTIES } from '@/lib/kenyaLocations'
import { isListingStale } from '@/lib/listingFreshness'
import { useKejaLanguage } from '@/lib/language'

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_MEDIA_FILES = 12

interface ManagedProperty {
  id: string
  owner_id: string
  title: string
  listing_type: 'rent' | 'sale' | 'short_stay'
  property_type: string
  monthly_rent: number | null
  sale_price: number | null
  nightly_price: number | null
  land_size_acres: number | null
  commercial_use: string | null
  location_label: string
  county: string | null
  town: string | null
  building_name: string | null
  unit_number: string | null
  agency_id: string | null
  featured_until: string | null
  listing_status: string
  verification_status: string
  available_date: string | null
  last_confirmed_at: string
}

interface ViewingRequest {
  id: string
  property_id: string
  requested_at: string
  status: string
  message: string
}

interface StayBooking {
  id: string
  property_id: string
  requester_id: string
  check_in: string
  check_out: string
  guest_count: number
  message: string
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed'
}

interface PropertyStats {
  view_count: number
  viewing_count: number
  message_count: number
}

interface PropertyInquiry {
  id: string
  property_id: string
  sender_id: string
  body: string
  created_at: string
}

interface Notification {
  id: string
  kind: string
  body: string
  property_id: string | null
  read_at: string | null
  created_at: string
}

interface NearbyServiceDraft {
  id: string
  name: string
  category: string
  distance: string
}

interface ManagedAgency {
  id: string
  name: string
  contact_phone: string | null
}

interface VerificationRequest {
  id: string
  account_type: 'landlord' | 'agent'
  status: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
  created_at: string
}

const NEARBY_SERVICE_CATEGORIES = [
  'hospital', 'school', 'university', 'supermarket', 'pharmacy', 'bank', 'atm',
  'petrol_station', 'matatu_stage', 'bus_stop', 'railway_station', 'restaurant',
  'cafe', 'gym', 'mosque', 'church', 'police_station', 'fire_station', 'park',
  'shop', 'mpesa_agent', 'other',
]

export default function ResidentialLandlordDashboard() {
  const { t } = useKejaLanguage()
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [properties, setProperties] = useState<ManagedProperty[]>([])
  const [agencies, setAgencies] = useState<ManagedAgency[]>([])
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([])
  const [viewings, setViewings] = useState<ViewingRequest[]>([])
  const [stayBookings, setStayBookings] = useState<StayBooking[]>([])
  const [inquiries, setInquiries] = useState<PropertyInquiry[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [stats, setStats] = useState<Record<string, PropertyStats>>({})
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [listingType, setListingType] = useState<'rent' | 'sale' | 'short_stay'>('rent')
  const [propertyType, setPropertyType] = useState('apartment')
  const [title, setTitle] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [nightlyPrice, setNightlyPrice] = useState('')
  const [landSizeAcres, setLandSizeAcres] = useState('')
  const [commercialUse, setCommercialUse] = useState('')
  const [bookingPolicy, setBookingPolicy] = useState('Request to book; the host confirms availability.')
  const [cancellationPolicy, setCancellationPolicy] = useState('Agree cancellation terms with the host before booking.')
  const [minimumStayNights, setMinimumStayNights] = useState('1')
  const [maximumStayNights, setMaximumStayNights] = useState('')
  const [deposit, setDeposit] = useState('')
  const [bedrooms, setBedrooms] = useState('2')
  const [bathrooms, setBathrooms] = useState('1')
  const [size, setSize] = useState('')
  const [parking, setParking] = useState('0')
  const [location, setLocation] = useState('')
  const [county, setCounty] = useState('')
  const [town, setTown] = useState('')
  const [ward, setWard] = useState('')
  const [wardOptions, setWardOptions] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [availableDate, setAvailableDate] = useState('')
  const [amenities, setAmenities] = useState('')
  const [security, setSecurity] = useState('')
  const [floorLabel, setFloorLabel] = useState('')
  const [networkQuality, setNetworkQuality] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [locationPrecision, setLocationPrecision] = useState<'approximate' | 'exact'>('approximate')
  const [tourUrl, setTourUrl] = useState('')
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [water, setWater] = useState(false)
  const [electricity, setElectricity] = useState(false)
  const [internet, setInternet] = useState(false)
  const [gated, setGated] = useState(false)
  const [pets, setPets] = useState(false)
  const [furnished, setFurnished] = useState(false)
  const [nearbyServices, setNearbyServices] = useState<NearbyServiceDraft[]>([
    { id: 'initial-service', name: '', category: 'hospital', distance: '' },
  ])
  const [caretakerPropertyId, setCaretakerPropertyId] = useState('')
  const [caretakerUserId, setCaretakerUserId] = useState('')
  const [staffRole, setStaffRole] = useState<'agent' | 'caretaker'>('caretaker')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [promotionPhone, setPromotionPhone] = useState('')
  const [pendingPromotion, setPendingPromotion] = useState<{ paymentId: string; propertyId: string } | null>(null)
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [buildingName, setBuildingName] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [agencyPhone, setAgencyPhone] = useState('')
  const [agencyMemberId, setAgencyMemberId] = useState('')
  const [agencyMemberRole, setAgencyMemberRole] = useState<'agent' | 'caretaker'>('agent')
  const [selectedAgency, setSelectedAgency] = useState('')
  const [verificationRole, setVerificationRole] = useState<'landlord' | 'agent'>('landlord')
  const [verificationName, setVerificationName] = useState('')
  const [verificationBusiness, setVerificationBusiness] = useState('')
  const [verificationPhone, setVerificationPhone] = useState('')
  const [verificationReference, setVerificationReference] = useState('')

  useEffect(() => {
    let active = true
    async function loadWardOptions() {
      if (!county) {
        setWardOptions([])
        return
      }
      const { data, error } = await supabase.from('keja_ward_reference')
        .select('ward').eq('county', county).order('ward').limit(1000)
      if (error) {
        if (active) setMessage(`Could not load ward reference data: ${getErrorMessage(error)}`)
        return
      }
      if (active) setWardOptions([...new Set((data ?? []).map((row) => row.ward))])
    }
    void loadWardOptions()
    return () => { active = false }
  }, [county])

  const loadDashboard = async (id: string) => {
    const [{ data: propertyRows, error: propertyError }, { data: agencyRows, error: agencyError }, { data: verificationRows, error: verificationError }] = await Promise.all([
      supabase
      .from('rental_properties')
      .select('id,owner_id,title,listing_type,property_type,monthly_rent,sale_price,nightly_price,land_size_acres,commercial_use,location_label,county,town,building_name,unit_number,agency_id,featured_until,listing_status,verification_status,available_date,last_confirmed_at')
      .eq('owner_id', id)
      .order('created_at', { ascending: false }),
      supabase.from('rental_agencies').select('id,name,contact_phone').eq('owner_id', id).order('name'),
      supabase.from('platform_user_verifications').select('id,account_type,status,admin_note,created_at').eq('user_id', id).order('created_at', { ascending: false }),
    ])
    if (propertyError) throw propertyError
    if (agencyError) throw agencyError
    if (verificationError) throw verificationError
    setAgencies((agencyRows ?? []) as ManagedAgency[])
    setVerificationRequests((verificationRows ?? []) as VerificationRequest[])
    const ownRows = (propertyRows ?? []) as ManagedProperty[]
    const [{ data: assignmentRows, error: assignmentError }, { data: agencyMembershipRows, error: agencyMembershipError }] = await Promise.all([
      supabase.from('rental_property_staff')
        .select('property_id')
        .eq('staff_user_id', id)
        .eq('role', 'agent'),
      supabase.from('rental_agency_members')
        .select('agency_id')
        .eq('user_id', id)
        .eq('role', 'agent'),
    ])
    if (assignmentError) throw assignmentError
    if (agencyMembershipError) throw agencyMembershipError
    const assignedIds = (assignmentRows ?? []).map((assignment) => assignment.property_id)
      .filter((propertyId) => !ownRows.some((property) => property.id === propertyId))
    const agencyIds = (agencyMembershipRows ?? []).map((membership) => membership.agency_id)
    let assignedRows: ManagedProperty[] = []
    if (assignedIds.length > 0) {
      const { data, error } = await supabase.from('rental_properties')
        .select('id,owner_id,title,listing_type,property_type,monthly_rent,sale_price,nightly_price,land_size_acres,commercial_use,location_label,county,town,building_name,unit_number,agency_id,featured_until,listing_status,verification_status,available_date,last_confirmed_at')
        .in('id', assignedIds)
      if (error) throw error
      assignedRows = (data ?? []) as ManagedProperty[]
    }
    let agencyProperties: ManagedProperty[] = []
    if (agencyIds.length > 0) {
      const { data, error } = await supabase.from('rental_properties')
        .select('id,owner_id,title,listing_type,property_type,monthly_rent,sale_price,nightly_price,land_size_acres,commercial_use,location_label,county,town,building_name,unit_number,agency_id,featured_until,listing_status,verification_status,available_date,last_confirmed_at')
        .in('agency_id', agencyIds)
      if (error) throw error
      agencyProperties = (data ?? []) as ManagedProperty[]
    }
    const managedProperties = [...new Map(
      [...ownRows, ...assignedRows, ...agencyProperties].map((property) => [property.id, property])
    ).values()]
    setProperties(managedProperties)

    const propertyIds = managedProperties.map((property) => property.id)
    if (propertyIds.length === 0) {
      setViewings([])
      setStayBookings([])
      setStats({})
      return
    }

    const [{ data: viewingRows, error: viewingError }, { data: inquiryRows, error: inquiryError }, { data: notificationRows, error: notificationError }, { data: bookingRows, error: bookingError }, ...propertyStats] = await Promise.all([
      supabase.from('rental_property_viewings')
        .select('id,property_id,requested_at,status,message')
        .in('property_id', propertyIds)
        .order('requested_at', { ascending: true }),
      supabase.from('rental_property_messages')
        .select('id,property_id,sender_id,body,created_at')
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false }),
      supabase.from('platform_notifications')
        .select('id,kind,body,property_id,read_at,created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('short_stay_bookings')
        .select('id,property_id,requester_id,check_in,check_out,guest_count,message,status')
        .in('property_id', propertyIds)
        .order('check_in'),
      ...propertyIds.map((propertyId) => supabase.rpc('manager_rental_property_stats', { property_id: propertyId })),
    ])
    if (viewingError) throw viewingError
    if (inquiryError) throw inquiryError
    if (notificationError) throw notificationError
    if (bookingError) throw bookingError
    setViewings((viewingRows ?? []) as ViewingRequest[])
    setInquiries((inquiryRows ?? []) as PropertyInquiry[])
    setNotifications((notificationRows ?? []) as Notification[])
    setStayBookings((bookingRows ?? []) as StayBooking[])
    setStats(Object.fromEntries(propertyStats.flatMap((result, index) => {
      if (result.error) throw result.error
      const row = Array.isArray(result.data) ? result.data[0] : null
      return row ? [[propertyIds[index], row as PropertyStats]] : []
    })))
  }

  useEffect(() => {
    let active = true
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!active) return
        setCurrentTime(Date.now())
        setUserId(data.session?.user.id ?? null)
        if (data.session?.user.id) await loadDashboard(data.session.user.id)
      } catch (error) {
        if (active) {
          setMessage(getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (active) setChecking(false)
      }
    }
    void checkSession()
    return () => { active = false }
  }, [])

  const publishProperty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId) return
    if (mediaFiles.length > MAX_MEDIA_FILES) {
      setMessage(`Choose no more than ${MAX_MEDIA_FILES} photos or videos.`)
      setHasError(true)
      return
    }
    const invalidFile = mediaFiles.find((file) => !MEDIA_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)
    if (invalidFile) {
      setMessage(`${invalidFile.name} is unsupported or exceeds 50 MB.`)
      setHasError(true)
      return
    }
    if (listingType === 'rent' && Number(monthlyRent) <= 0) {
      setMessage('Enter a monthly rent greater than zero.')
      setHasError(true)
      return
    }
    if (listingType === 'sale' && Number(salePrice) <= 0) {
      setMessage('Enter a sale price greater than zero.')
      setHasError(true)
      return
    }
    if (listingType === 'short_stay' && Number(nightlyPrice) <= 0) {
      setMessage('Enter a nightly rate greater than zero.')
      setHasError(true)
      return
    }
    if (propertyType === 'land' && Number(landSizeAcres) <= 0) {
      setMessage('Enter a land size greater than zero acres.')
      setHasError(true)
      return
    }
    if (propertyType === 'commercial' && !commercialUse.trim()) {
      setMessage('Describe the commercial property use.')
      setHasError(true)
      return
    }
    if (maximumStayNights && Number(maximumStayNights) < Number(minimumStayNights)) {
      setMessage('Maximum stay must be at least the minimum stay.')
      setHasError(true)
      return
    }
    if (nearbyServices.some((service) => {
      const hasAnyValue = service.name.trim() !== '' || service.distance !== ''
      return hasAnyValue && (!service.name.trim()
        || !service.distance
        || !Number.isInteger(Number(service.distance))
        || Number(service.distance) < 1
        || Number(service.distance) > 50000)
    })) {
      setMessage('Complete each nearby service with a name and a distance between 1 and 50,000 metres.')
      setHasError(true)
      return
    }

    setSaving(true)
    setMessage('')
    setHasError(false)
    let propertyId: string | null = null
    const uploadedPaths: string[] = []
    try {
      const { data: property, error } = await supabase.from('rental_properties').insert({
        owner_id: userId,
        title: title.trim(),
        description: description.trim(),
        listing_type: listingType,
        property_type: propertyType,
        building_name: buildingName.trim() || null,
        unit_number: unitNumber.trim() || null,
        monthly_rent: listingType === 'rent' ? Number(monthlyRent) : null,
        sale_price: listingType === 'sale' ? Number(salePrice) : null,
        nightly_price: listingType === 'short_stay' ? Number(nightlyPrice) : null,
        land_size_acres: landSizeAcres ? Number(landSizeAcres) : null,
        commercial_use: commercialUse.trim() || null,
        booking_policy: bookingPolicy.trim(),
        cancellation_policy: cancellationPolicy.trim(),
        minimum_stay_nights: Number(minimumStayNights),
        maximum_stay_nights: maximumStayNights ? Number(maximumStayNights) : null,
        deposit: deposit ? Number(deposit) : null,
        bedrooms: ['land', 'commercial'].includes(propertyType) ? 0 : Number(bedrooms),
        bathrooms: propertyType === 'land' ? 0.5 : Number(bathrooms),
        size_sqm: size ? Number(size) : null,
        parking_spaces: Number(parking),
        water_available: water,
        electricity_available: electricity,
        internet_available: internet,
        network_quality: networkQuality.trim() || null,
        security_features: security.split(',').map((item) => item.trim()).filter(Boolean),
        gated_compound: gated,
        pets_allowed: pets,
        furnished,
        floor_label: floorLabel.trim() || null,
        amenities: amenities.split(',').map((item) => item.trim()).filter(Boolean),
        location_label: [location.trim(), ward.trim(), town.trim(), county].filter(Boolean).join(', '),
        county,
        town: town.trim(),
        ward: ward.trim() || null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        location_precision: locationPrecision,
        available_date: availableDate || null,
        listing_status: 'available',
        contact_phone: phone.trim() || null,
        tour_url: tourUrl.trim() || null,
      }).select('id').single()
      if (error) throw error
      propertyId = property.id

      for (const [position, file] of mediaFiles.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
        const storagePath = `${userId}/${propertyId}/${crypto.randomUUID()}.${extension}`
        const { error: metadataError } = await supabase.from('rental_property_media').insert({
          property_id: propertyId,
          owner_id: userId,
          storage_path: storagePath,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          mime_type: file.type,
          position,
        })
        if (metadataError) throw metadataError
        const { error: uploadError } = await supabase.storage.from('rental-property-media')
          .upload(storagePath, file, { contentType: file.type, upsert: false })
        if (uploadError) {
          await supabase.from('rental_property_media').delete().eq('storage_path', storagePath)
          throw uploadError
        }
        uploadedPaths.push(storagePath)
      }

      const serviceRows = nearbyServices
        .filter((service) => service.name.trim() && service.distance)
        .map((service) => ({
          property_id: propertyId,
          owner_id: userId,
          name: service.name.trim(),
          category: service.category,
          distance_m: Number(service.distance),
        }))
      if (serviceRows.length > 0) {
        const { error: serviceError } = await supabase.from('property_nearby_services').insert(serviceRows)
        if (serviceError) throw serviceError
      }

      setMessage('Property submitted for verification. It will appear in public search after admin approval.')
      setTitle('')
      setDescription('')
      setBuildingName('')
      setUnitNumber('')
      setMediaFiles([])
      setNearbyServices([{ id: crypto.randomUUID(), name: '', category: 'hospital', distance: '' }])
      await loadDashboard(userId)
    } catch (error) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from('rental-property-media').remove(uploadedPaths)
        if (cleanupError) console.error('Could not clean up uploaded property media:', cleanupError.message)
      }
      if (propertyId) {
        const { error: cleanupError } = await supabase.from('rental_properties').delete().eq('id', propertyId)
        if (cleanupError) console.error('Could not roll back incomplete property:', cleanupError.message)
      }
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setSaving(false)
    }
  }

  const updateAvailability = async (propertyId: string, listingStatus: string) => {
    const { error } = await supabase.from('rental_properties')
      .update({ listing_status: listingStatus })
      .eq('id', propertyId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage('Property availability updated.')
      setHasError(false)
      await loadDashboard(userId!)
    }
  }

  const updateStayBooking = async (bookingId: string, status: StayBooking['status']) => {
    const { error } = await supabase.from('short_stay_bookings').update({ status }).eq('id', bookingId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
      return
    }
    setMessage(`Booking request ${status}.`)
    setHasError(false)
    if (userId) await loadDashboard(userId)
  }

  const confirmPropertyFreshness = async (property: ManagedProperty) => {
    setMessage('')
    setHasError(false)
    const { data, error } = await supabase.rpc('confirm_keja_listing_freshness', {
      p_listing_type: 'home',
      p_listing_id: property.id,
    })
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
      return
    }
    setProperties((current) => current.map((item) => item.id === property.id
      ? { ...item, last_confirmed_at: data }
      : item))
    setMessage(`Availability confirmed for ${property.title}.`)
  }

  const updatePropertyPrice = async (property: ManagedProperty) => {
    const price = Number(priceDrafts[property.id])
    if (!Number.isFinite(price) || price <= 0) {
      setMessage('Enter a price greater than zero.')
      setHasError(true)
      return
    }

    const { error } = await supabase.from('rental_properties').update(
      property.listing_type === 'rent'
        ? { monthly_rent: price }
        : property.listing_type === 'short_stay'
          ? { nightly_price: price }
          : { sale_price: price }
    ).eq('id', property.id)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage('Property price updated.')
      setHasError(false)
      setPriceDrafts((current) => {
        const next = { ...current }
        delete next[property.id]
        return next
      })
      await loadDashboard(userId!)
    }
  }

  const updatePropertyAgency = async (propertyId: string, agencyId: string) => {
    const { error } = await supabase.from('rental_properties')
      .update({ agency_id: agencyId || null })
      .eq('id', propertyId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage('Property agency assignment updated.')
      setHasError(false)
      await loadDashboard(userId!)
    }
  }

  const createAgency = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId) return
    const { data, error } = await supabase.from('rental_agencies').insert({
      owner_id: userId,
      name: agencyName.trim(),
      contact_phone: agencyPhone.trim() || null,
    }).select('id,name,contact_phone').single()
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setAgencies((current) => [...current, data as ManagedAgency].sort((a, b) => a.name.localeCompare(b.name)))
      setAgencyName('')
      setAgencyPhone('')
      setMessage('Agency created.')
      setHasError(false)
    }
  }

  const addAgencyMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !selectedAgency) return
    const { error } = await supabase.from('rental_agency_members').insert({
      agency_id: selectedAgency,
      owner_id: userId,
      user_id: agencyMemberId.trim(),
      role: agencyMemberRole,
    })
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setAgencyMemberId('')
      setMessage('Staff member added to the agency. Assign them to individual properties to provide caretaker access.')
      setHasError(false)
    }
  }

  const submitVerificationRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId) return
    const { error } = await supabase.from('platform_user_verifications').insert({
      user_id: userId,
      account_type: verificationRole,
      legal_name: verificationName.trim(),
      business_name: verificationBusiness.trim() || null,
      contact_phone: verificationPhone.trim(),
      reference_url: verificationReference.trim() || null,
    })
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setMessage('Verification request submitted for admin review.')
      setHasError(false)
      setVerificationName('')
      setVerificationBusiness('')
      setVerificationPhone('')
      setVerificationReference('')
      await loadDashboard(userId)
    }
  }

  const startPromotion = async (propertyId: string, plan: 'week' | 'month') => {
    if (!userId) return
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setMessage(getErrorMessage(sessionError))
      setHasError(true)
      return
    }
    const token = sessionData.session?.access_token
    if (!token) {
      setMessage('Your session expired. Sign in again.')
      setHasError(true)
      return
    }
    setSaving(true)
    setMessage('')
    const response = await fetch('/api/payments/residential/start', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId, plan, phoneNumber: promotionPhone }),
    })
    const result = await response.json() as { paymentId?: string; message?: string; error?: string }
    if (result.paymentId) setPendingPromotion({ paymentId: result.paymentId, propertyId })
    setMessage(response.ok ? result.message ?? 'Check your phone and complete M-Pesa payment.' : result.error ?? 'Could not start promotion payment.')
    setHasError(!response.ok)
    setSaving(false)
  }

  const checkPromotionStatus = async () => {
    if (!pendingPromotion) return
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setMessage(getErrorMessage(sessionError))
      setHasError(true)
      return
    }
    const token = sessionData.session?.access_token
    if (!token) {
      setMessage('Your session expired. Sign in again.')
      setHasError(true)
      return
    }
    const response = await fetch(`/api/payments/residential/status?id=${encodeURIComponent(pendingPromotion.paymentId)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const result = await response.json() as { status?: 'pending' | 'paid' | 'failed'; error?: string }
    if (!response.ok) {
      setMessage(result.error ?? 'Could not check payment status.')
      setHasError(true)
    } else if (result.status === 'paid') {
      setMessage('Payment confirmed. The property is now featured.')
      setHasError(false)
      setPendingPromotion(null)
      await loadDashboard(userId!)
    } else if (result.status === 'failed') {
      setMessage('M-Pesa did not complete the payment.')
      setHasError(true)
      setPendingPromotion(null)
    } else {
      setMessage('Payment is still pending. Complete the M-Pesa prompt, then check again.')
      setHasError(false)
    }
  }

  const assignCaretaker = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId) return
    const { error } = await supabase.from('rental_property_staff').insert({
      property_id: caretakerPropertyId,
      owner_id: userId,
      staff_user_id: caretakerUserId.trim(),
      role: staffRole,
    })
    setMessage(error ? getErrorMessage(error) : 'Caretaker assigned. They will only see properties assigned to them.')
    setHasError(Boolean(error))
    if (!error) setCaretakerUserId('')
  }

  const updateViewing = async (viewingId: string, status: 'confirmed' | 'declined') => {
    const { error } = await supabase.from('rental_property_viewings').update({ status }).eq('id', viewingId)
    setMessage(error ? getErrorMessage(error) : `Viewing ${status}.`)
    setHasError(Boolean(error))
    if (!error) setViewings((current) => current.map((viewing) => viewing.id === viewingId ? { ...viewing, status } : viewing))
  }

  const replyToInquiry = async (event: React.FormEvent<HTMLFormElement>, inquiry: PropertyInquiry) => {
    event.preventDefault()
    const body = (replyDrafts[inquiry.id] ?? '').trim()
    if (!body) return
    const { error } = await supabase.rpc('reply_to_property_inquiry', {
      property_id: inquiry.property_id,
      recipient_id: inquiry.sender_id,
      message_body: body,
    })
    setMessage(error ? getErrorMessage(error) : 'Reply sent.')
    setHasError(Boolean(error))
    if (!error) {
      setReplyDrafts((current) => ({ ...current, [inquiry.id]: '' }))
      await loadDashboard(userId!)
    }
  }

  const markNotificationRead = async (notificationId: string) => {
    const { error } = await supabase.from('platform_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
    if (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } else {
      setNotifications((current) => current.map((item) => item.id === notificationId
        ? { ...item, read_at: new Date().toISOString() }
        : item))
    }
  }

  if (checking) return <main className="mx-auto min-h-screen max-w-6xl px-6 py-16 text-slate-600">Loading owner dashboard...</main>
  if (!userId) {
    return <main className="mx-auto min-h-screen max-w-3xl px-6 py-16"><h1 className="text-2xl font-bold">Sign in to manage homes</h1><p className="mt-2 text-slate-600">Use your account to list properties, manage availability and respond to viewing requests.</p><Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">Sign in or register</Link></main>
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link href="/homes" className="text-lg font-bold text-blue-700">StallSpace KE</Link><nav className="flex gap-4 text-sm"><Link href="/caretaker" className="text-slate-700 hover:text-blue-700">Caretaker portal</Link><Link href="/admin/properties" className="text-slate-700 hover:text-blue-700">Admin</Link><Link href="/homes" className="text-slate-700 hover:text-blue-700">Browse homes</Link></nav></div></header>
      <section className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        <div><p className="text-sm font-semibold uppercase text-blue-700">Landlord & agent workspace</p><h1 className="mt-1 text-3xl font-bold">Manage properties</h1><p className="mt-2 text-sm text-slate-600">Publish rentals, land, commercial spaces and short stays; manage inquiries and bookings.</p><Link href="/landlord/management" className="mt-3 inline-flex rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Property management & rent records</Link></div>
        {message && <p role={hasError ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}

        {stayBookings.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold">Short-stay booking requests</h2>
          <p className="mt-1 text-sm text-slate-600">Guests request dates; confirm availability directly. MTAA does not collect booking payments.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{stayBookings.map((booking) => <article key={booking.id} className="rounded-lg border border-slate-200 p-4">
            <p className="font-semibold">{properties.find((item) => item.id === booking.property_id)?.title ?? 'Short-stay property'}</p>
            <p className="mt-1 text-sm text-slate-600">{booking.check_in} to {booking.check_out} · {booking.guest_count} guest{booking.guest_count === 1 ? '' : 's'} · {booking.status}</p>
            {booking.message && <p className="mt-2 text-sm">{booking.message}</p>}
            <p className="mt-2 break-all text-xs text-slate-500">Guest account: {booking.requester_id}</p>
            {booking.status === 'requested' && <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void updateStayBooking(booking.id, 'confirmed')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">Confirm</button>
              <button type="button" onClick={() => void updateStayBooking(booking.id, 'declined')} className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-semibold">Decline</button>
            </div>}
            {booking.status === 'confirmed' && <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void updateStayBooking(booking.id, 'completed')} className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white">Mark completed</button>
              <button type="button" onClick={() => void updateStayBooking(booking.id, 'cancelled')} className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-semibold">Cancel</button>
            </div>}
          </article>)}</div>
        </section>}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(350px,0.8fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Your properties ({properties.length})</h2>
            {properties.length === 0 ? <p className="py-8 text-sm text-slate-600">No residential properties listed yet.</p> : (
              <div className="mt-4 space-y-4">
                {properties.map((property) => (
                  <article key={property.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><Link href={`/properties/${property.id}`} className="font-bold text-blue-800 hover:underline">{property.title}</Link><p className="mt-1 text-sm text-slate-600">{property.location_label} · {property.listing_type === 'rent' ? `KSh ${property.monthly_rent?.toLocaleString()}/month` : property.listing_type === 'short_stay' ? `KSh ${property.nightly_price?.toLocaleString()}/night` : `KSh ${property.sale_price?.toLocaleString()}`}</p>{property.land_size_acres && <p className="mt-1 text-xs text-slate-500">{property.land_size_acres} acres</p>}{property.commercial_use && <p className="mt-1 text-xs text-slate-500">{property.commercial_use}</p>}{(property.building_name || property.unit_number) && <p className="mt-1 text-xs text-slate-500">{property.building_name || 'Building not named'}{property.unit_number ? ` · Unit ${property.unit_number}` : ''}</p>}</div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize">{property.verification_status} · {property.listing_status.replaceAll('_', ' ')}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span>{stats[property.id]?.view_count ?? 0} views</span><span>{stats[property.id]?.viewing_count ?? 0} viewing requests</span><span>{stats[property.id]?.message_count ?? 0} inquiries</span>
                      <label className="flex items-center gap-1">
                        <span className="sr-only">New {property.listing_type === 'rent' ? 'monthly rent' : property.listing_type === 'short_stay' ? 'nightly rate' : 'sale price'}</span>
                        <input type="number" min="1" value={priceDrafts[property.id] ?? String(property.listing_type === 'rent' ? property.monthly_rent ?? '' : property.listing_type === 'short_stay' ? property.nightly_price ?? '' : property.sale_price ?? '')} onChange={(event) => setPriceDrafts((current) => ({ ...current, [property.id]: event.target.value }))} aria-label={`Price for ${property.title}`} className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      </label>
                      <button type="button" onClick={() => void updatePropertyPrice(property)} className="rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Update price</button>
                      <select value={property.listing_status} onChange={(event) => void updateAvailability(property.id, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                        {['available', 'available_soon', 'occupied', 'rented', 'sold'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                      </select>
                      {property.owner_id === userId && <select aria-label={`Agency for ${property.title}`} value={property.agency_id ?? ''} onChange={(event) => void updatePropertyAgency(property.id, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"><option value="">No agency</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select>}
                    </div>
                    {currentTime !== null && property.featured_until && new Date(property.featured_until).getTime() > currentTime && <p className="mt-2 text-xs font-semibold text-amber-700">Featured until {new Date(property.featured_until).toLocaleDateString()}</p>}
                    {isListingStale(property.last_confirmed_at) ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3">
                        <p className="text-sm text-amber-900">{t('ownerConfirmPrompt')} {t('ownerConfirmationAge')}</p>
                        {property.owner_id === userId && <button type="button" onClick={() => void confirmPropertyFreshness(property)} className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800">{t('confirmAvailability')}</button>}
                      </div>
                    ) : <p className="mt-2 text-xs text-slate-500">Last availability confirmation: {new Date(property.last_confirmed_at).toLocaleDateString()}</p>}
                    {property.verification_status === 'verified' && ['available', 'available_soon'].includes(property.listing_status) && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <input type="tel" value={promotionPhone} onChange={(event) => setPromotionPhone(event.target.value)} placeholder="M-Pesa phone number" aria-label="M-Pesa phone for property promotion" className="w-44 rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                      <button type="button" disabled={saving} onClick={() => void startPromotion(property.id, 'week')} className="rounded-md bg-amber-500 px-2 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50">Feature 7 days · KSh 200</button>
                      <button type="button" disabled={saving} onClick={() => void startPromotion(property.id, 'month')} className="rounded-md bg-amber-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Feature 30 days · KSh 500</button>
                    </div>}
                    {pendingPromotion?.propertyId === property.id && <button type="button" onClick={() => void checkPromotionStatus()} className="mt-2 text-xs font-semibold text-blue-700 underline">Check promotion payment status</button>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <form onSubmit={(event) => void publishProperty(event)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Add a property</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Listing type<select value={listingType} onChange={(event) => { const value = event.target.value as 'rent' | 'sale' | 'short_stay'; setListingType(value); if (value === 'short_stay' && ['land', 'commercial'].includes(propertyType)) setPropertyType('apartment') }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="rent">For rent / lease</option><option value="sale">For sale</option><option value="short_stay">Short stay</option></select></label>
              <label className="text-sm font-medium">Property type<select value={propertyType} onChange={(event) => setPropertyType(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2">{['apartment', 'house', 'bedsitter', 'studio', 'townhouse', ...(listingType === 'short_stay' ? [] : ['land', 'commercial']), 'short_stay', 'other'].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label>
            </div>
            <label className="block text-sm font-medium">Listing title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="2-bedroom apartment in Ruiru" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <div className="grid grid-cols-2 gap-3">
              {listingType !== 'short_stay' ? <label className="text-sm font-medium">{listingType === 'rent' ? 'Monthly rent / lease (KES)' : 'Sale price (KES)'}<input required type="number" min="1" value={listingType === 'rent' ? monthlyRent : salePrice} onChange={(event) => listingType === 'rent' ? setMonthlyRent(event.target.value) : setSalePrice(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
                : <label className="text-sm font-medium">Nightly rate (KES)<input required type="number" min="1" value={nightlyPrice} onChange={(event) => setNightlyPrice(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>}
              <label className="text-sm font-medium">Deposit (KES)<input type="number" min="0" value={deposit} onChange={(event) => setDeposit(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            {propertyType === 'land' && <label className="block text-sm font-medium">Land size (acres)<input required type="number" min="0.001" step="0.001" value={landSizeAcres} onChange={(event) => setLandSizeAcres(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>}
            {propertyType === 'commercial' && <label className="block text-sm font-medium">Commercial use / property type<input required maxLength={120} value={commercialUse} onChange={(event) => setCommercialUse(event.target.value)} placeholder="Office, warehouse, retail unit" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>}
            {listingType === 'short_stay' && <section className="space-y-3 rounded-lg bg-blue-50 p-4">
              <h3 className="font-semibold">Booking and cancellation policies</h3>
              <p className="text-xs text-slate-600">Guests request dates; you confirm or decline. MTAA does not collect booking payments.</p>
              <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Minimum nights<input type="number" min="1" max="365" value={minimumStayNights} onChange={(event) => setMinimumStayNights(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium">Maximum nights (optional)<input type="number" min="1" max="365" value={maximumStayNights} onChange={(event) => setMaximumStayNights(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div>
              <label className="block text-sm font-medium">Booking policy<textarea maxLength={2000} value={bookingPolicy} onChange={(event) => setBookingPolicy(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium">Cancellation policy<textarea maxLength={2000} value={cancellationPolicy} onChange={(event) => setCancellationPolicy(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </section>}
            {!['land', 'commercial'].includes(propertyType) && <div className="grid grid-cols-3 gap-3">
              <label className="text-sm font-medium">Bedrooms<input required type="number" min="0" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">Bathrooms<input required type="number" min="0.5" step="0.5" value={bathrooms} onChange={(event) => setBathrooms(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">Size m²<input type="number" min="1" value={size} onChange={(event) => setSize(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Parking spaces<input type="number" min="0" value={parking} onChange={(event) => setParking(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">Available date<input type="date" value={availableDate} onChange={(event) => setAvailableDate(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm font-medium">County<select required value={county} onChange={(event) => { setCounty(event.target.value); setWard('') }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Select county</option>{KENYA_COUNTIES.map((name) => <option key={name}>{name}</option>)}</select></label>
              <label className="block text-sm font-medium">Town / city<input required maxLength={120} value={town} onChange={(event) => setTown(event.target.value)} placeholder="Ruiru" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium">Ward<input list="keja-ward-options" maxLength={120} value={ward} onChange={(event) => setWard(event.target.value)} placeholder={wardOptions.length ? 'Select or enter ward' : 'Enter ward'} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /><datalist id="keja-ward-options">{wardOptions.map((option) => <option key={option} value={option} />)}</datalist></label>
              <label className="block text-sm font-medium">Estate / area<input required maxLength={160} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Membley" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Building / estate<input value={buildingName} onChange={(event) => setBuildingName(event.target.value)} maxLength={120} placeholder="Green View Apartments" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">Unit number<input value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} maxLength={40} placeholder="A02" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Latitude<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">Longitude<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            <label className="block text-sm font-medium">Map location precision<select value={locationPrecision} onChange={(event) => setLocationPrecision(event.target.value as 'approximate' | 'exact')} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="approximate">Approximate (recommended; public map rounded)</option><option value="exact">Exact (publish exact map pin)</option></select></label>
            <label className="block text-sm font-medium">Contact phone<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Description<textarea maxLength={5000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Amenities (comma separated)<input value={amenities} onChange={(event) => setAmenities(event.target.value)} placeholder="Balcony, lift, laundry" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium">Security (comma separated)<input value={security} onChange={(event) => setSecurity(event.target.value)} placeholder="CCTV, security guard" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Floor<input value={floorLabel} onChange={(event) => setFloorLabel(event.target.value)} maxLength={60} placeholder="e.g. 3rd floor" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">Network quality<input value={networkQuality} onChange={(event) => setNetworkQuality(event.target.value)} maxLength={120} placeholder="e.g. 4G coverage" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            </div>
            <label className="block text-sm font-medium">Optional 360° tour URL<input type="url" value={tourUrl} onChange={(event) => setTourUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
            <fieldset className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {[['Water available', water, setWater], ['Electricity', electricity, setElectricity], ['Internet', internet, setInternet], ['Gated compound', gated, setGated], ['Pets allowed', pets, setPets], ['Furnished', furnished, setFurnished]].map(([label, checked, setter]) => (
                <label key={label as string} className="flex items-center gap-2"><input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />{label as string}</label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium">Photos/videos (up to {MAX_MEDIA_FILES}, 50 MB each)<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple onChange={(event) => setMediaFiles(Array.from(event.target.files ?? []))} className="mt-1 block w-full text-sm" /></label>
            <section className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Nearby services (optional)</h3>
                <button type="button" onClick={() => setNearbyServices((current) => [...current, { id: crypto.randomUUID(), name: '', category: 'hospital', distance: '' }])} className="text-xs font-semibold text-blue-700 hover:underline">Add a service</button>
              </div>
              {nearbyServices.map((service, index) => (
                <div key={service.id} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_110px_auto]">
                  <label className="text-xs font-medium">Name<input value={service.name} onChange={(event) => setNearbyServices((current) => current.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))} placeholder="Ruiru Hospital" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2" /></label>
                  <label className="text-xs font-medium">Category<select value={service.category} onChange={(event) => setNearbyServices((current) => current.map((item) => item.id === service.id ? { ...item, category: event.target.value } : item))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2">{NEARBY_SERVICE_CATEGORIES.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>
                  <label className="text-xs font-medium">Distance (m)<input type="number" min="1" max="50000" value={service.distance} onChange={(event) => setNearbyServices((current) => current.map((item) => item.id === service.id ? { ...item, distance: event.target.value } : item))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2" /></label>
                  <button type="button" aria-label={`Remove nearby service ${index + 1}`} onClick={() => setNearbyServices((current) => current.length === 1 ? [{ ...current[0], name: '', distance: '' }] : current.filter((item) => item.id !== service.id))} className="self-end rounded-md px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remove</button>
                </div>
              ))}
              <p className="text-xs text-amber-800">Listing-provided distances and coordinates are estimates and are not independently verified.</p>
            </section>
            <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? 'Publishing...' : 'Publish property'}</button>
          </form>
        </div>

        {pendingPromotion && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>Complete the M-Pesa prompt, then check whether the featured placement is active.</p>
          <button type="button" onClick={() => void checkPromotionStatus()} className="mt-2 rounded-md border border-amber-700 px-3 py-1.5 text-xs font-semibold">Check payment status</button>
        </section>}

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-xl font-bold">Agency workspace</h2>
              <p className="mt-1 text-sm text-slate-600">Create an agency, add team members, and associate listings with your agency. Team access is limited to agency-linked properties; caretakers still require individual property assignments.</p>
            </div>
            {agencies.length > 0 && <div className="space-y-2">{agencies.map((agency) => <article key={agency.id} className="rounded-lg bg-slate-50 p-3"><p className="font-semibold">{agency.name}</p>{agency.contact_phone && <p className="text-sm text-slate-600">{agency.contact_phone}</p>}</article>)}</div>}
            <form onSubmit={(event) => void createAgency(event)} className="space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold">Create agency</h3>
              <input required minLength={2} maxLength={120} value={agencyName} onChange={(event) => setAgencyName(event.target.value)} placeholder="Agency name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input type="tel" value={agencyPhone} onChange={(event) => setAgencyPhone(event.target.value)} placeholder="Agency phone (optional)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={!userId} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create agency</button>
            </form>
            {agencies.length > 0 && <form onSubmit={(event) => void addAgencyMember(event)} className="space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold">Add agency staff</h3>
              <select required value={selectedAgency} onChange={(event) => setSelectedAgency(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Choose agency</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select>
              <input required value={agencyMemberId} onChange={(event) => setAgencyMemberId(event.target.value)} placeholder="Staff Supabase Auth user UUID" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <select value={agencyMemberRole} onChange={(event) => setAgencyMemberRole(event.target.value as 'agent' | 'caretaker')} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="agent">Agent</option><option value="caretaker">Caretaker</option></select>
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Add staff member</button>
            </form>}
          </div>

          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-xl font-bold">Landlord / agent verification</h2>
              <p className="mt-1 text-sm text-slate-600">Submit business/contact details for manual review. Do not submit passwords, identity document numbers, or sensitive financial information.</p>
            </div>
            {verificationRequests.map((request) => <article key={request.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold capitalize">{request.account_type} · {request.status}</p>{request.admin_note && <p className="mt-1 text-slate-600">Admin note: {request.admin_note}</p>}<p className="mt-1 text-xs text-slate-500">{new Date(request.created_at).toLocaleDateString()}</p></article>)}
            <form onSubmit={(event) => void submitVerificationRequest(event)} className="space-y-3 border-t border-slate-100 pt-4">
              <select value={verificationRole} onChange={(event) => setVerificationRole(event.target.value as 'landlord' | 'agent')} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="landlord">Landlord / property owner</option><option value="agent">Real estate agent</option></select>
              <input required minLength={2} maxLength={120} value={verificationName} onChange={(event) => setVerificationName(event.target.value)} placeholder="Legal name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input maxLength={120} value={verificationBusiness} onChange={(event) => setVerificationBusiness(event.target.value)} placeholder="Business / agency name (optional)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input required minLength={7} maxLength={30} type="tel" value={verificationPhone} onChange={(event) => setVerificationPhone(event.target.value)} placeholder="Contact phone" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input type="url" value={verificationReference} onChange={(event) => setVerificationReference(event.target.value)} placeholder="Public business reference URL (optional)" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={verificationRequests.some((request) => request.account_type === verificationRole && request.status === 'pending')} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit for verification</button>
            </form>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Viewing requests ({viewings.filter((item) => item.status === 'requested').length} pending)</h2>
            {viewings.length === 0 ? <p className="mt-3 text-sm text-slate-600">No viewing requests yet.</p> : <div className="mt-4 space-y-3">{viewings.map((viewing) => <article key={viewing.id} className="rounded-lg bg-slate-50 p-4"><p className="font-semibold">{properties.find((property) => property.id === viewing.property_id)?.title ?? 'Property'}</p><p className="mt-1 text-sm text-slate-600">{new Date(viewing.requested_at).toLocaleString()} · <span className="capitalize">{viewing.status}</span></p>{viewing.message && <p className="mt-2 text-sm">{viewing.message}</p>}{viewing.status === 'requested' && <div className="mt-3 flex gap-2"><button onClick={() => void updateViewing(viewing.id, 'confirmed')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Confirm</button><button onClick={() => void updateViewing(viewing.id, 'declined')} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">Decline</button></div>}</article>)}</div>}
          </div>
          <form onSubmit={(event) => void assignCaretaker(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Assign property staff</h2>
            <p className="text-sm text-slate-600">Use the staff member&apos;s Supabase user ID. Caretakers receive assigned-property operations only, not owner financial information. Agents can manage assigned property listings.</p>
            <select value={caretakerPropertyId} onChange={(event) => setCaretakerPropertyId(event.target.value)} required className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Choose a property</option>{properties.filter((property) => property.owner_id === userId).map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select>
            <select value={staffRole} onChange={(event) => setStaffRole(event.target.value as 'agent' | 'caretaker')} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="caretaker">Caretaker</option><option value="agent">Agent</option></select>
            <input required value={caretakerUserId} onChange={(event) => setCaretakerUserId(event.target.value)} placeholder="Caretaker user UUID" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button disabled={properties.every((property) => property.owner_id !== userId)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Assign staff member</button>
          </form>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Property inquiries ({inquiries.length})</h2>
            {inquiries.length === 0 ? <p className="mt-3 text-sm text-slate-600">No messages yet.</p> : <div className="mt-4 space-y-3">{inquiries.map((inquiry) => <article key={inquiry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-500">{properties.find((property) => property.id === inquiry.property_id)?.title} · {new Date(inquiry.created_at).toLocaleString()}</p><p className="mt-2 text-sm text-slate-800">{inquiry.body}</p><p className="mt-1 break-all text-xs text-slate-500">Contact user ID: {inquiry.sender_id}</p><form onSubmit={(event) => void replyToInquiry(event, inquiry)} className="mt-3 flex gap-2"><input maxLength={4000} value={replyDrafts[inquiry.id] ?? ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [inquiry.id]: event.target.value }))} placeholder="Write a reply..." className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Reply</button></form></article>)}</div>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-bold">Notifications ({notifications.filter((item) => !item.read_at).length} unread)</h2>
            {notifications.length === 0 ? <p className="mt-3 text-sm text-slate-600">No notifications.</p> : <div className="mt-4 divide-y divide-slate-100">{notifications.map((notification) => <article key={notification.id} className="flex items-start justify-between gap-3 py-3"><div><p className="text-sm">{notification.body}</p><p className="mt-1 text-xs capitalize text-slate-500">{notification.kind.replaceAll('_', ' ')} · {new Date(notification.created_at).toLocaleString()}</p></div>{!notification.read_at && <button onClick={() => void markNotificationRead(notification.id)} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Mark read</button>}</article>)}</div>}
          </div>
        </section>
      </section>
    </main>
  )
}
