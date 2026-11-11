import { createClient } from '@supabase/supabase-js'

type ServiceCategory =
  | 'hospital'
  | 'school'
  | 'university'
  | 'supermarket'
  | 'pharmacy'
  | 'bank'
  | 'atm'
  | 'petrol_station'
  | 'matatu_stage'
  | 'bus_stop'
  | 'railway_station'
  | 'restaurant'
  | 'cafe'
  | 'gym'
  | 'mosque'
  | 'church'
  | 'police_station'
  | 'fire_station'
  | 'park'
  | 'shop'
  | 'mpesa_agent'
  | 'other'

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

const SERVICE_TAGS = [
  '[amenity~"^(hospital|clinic|doctors|pharmacy|school|college|university|bank|atm|fuel|bus_station|restaurant|cafe|gym|police|fire_station|place_of_worship)$"][name]',
  '[highway=bus_stop][name]',
  '[railway=station][name]',
  '[shop~"^(supermarket|convenience|department_store|mall|general)$"][name]',
  '[leisure~"^(park|garden|sports_centre)$"][name]',
]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_RADII = new Set([500, 1000, 2000, 5000])

function getCategory(tags: Record<string, string>): ServiceCategory | null {
  const amenity = tags.amenity
  if (amenity === 'hospital' || amenity === 'clinic' || amenity === 'doctors') return 'hospital'
  if (amenity === 'school' || amenity === 'college') return 'school'
  if (amenity === 'university') return 'university'
  if (amenity === 'pharmacy') return 'pharmacy'
  if (amenity === 'bank') return 'bank'
  if (amenity === 'atm') return 'atm'
  if (amenity === 'fuel') return 'petrol_station'
  if (amenity === 'bus_station') return 'bus_stop'
  if (amenity === 'restaurant') return 'restaurant'
  if (amenity === 'cafe') return 'cafe'
  if (amenity === 'gym' || tags.leisure === 'sports_centre') return 'gym'
  if (amenity === 'police') return 'police_station'
  if (amenity === 'fire_station') return 'fire_station'
  if (amenity === 'place_of_worship') {
    if (tags.religion === 'muslim') return 'mosque'
    if (tags.religion === 'christian') return 'church'
  }
  if (tags.highway === 'bus_stop') return 'bus_stop'
  if (tags.railway === 'station') return 'railway_station'
  if (tags.shop === 'supermarket') return 'supermarket'
  if (tags.shop || amenity === 'marketplace') return 'shop'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  return null
}

function distanceMeters(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(toLat - fromLat)
  const longitudeDelta = radians(toLon - fromLon)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(longitudeDelta / 2) ** 2
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)))
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const propertyId = params.get('propertyId')
  const radius = Number(params.get('radius') ?? '2000')
  if (!propertyId || !UUID_PATTERN.test(propertyId) || !ALLOWED_RADII.has(radius)) {
    return Response.json({ error: 'Provide a valid property and a radius of 500, 1,000, 2,000 or 5,000 metres.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json({ error: 'Nearby services are not configured on the server.' }, { status: 503 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: points, error: pointsError } = await supabase.rpc('rental_property_map_points', {
      property_ids: [propertyId],
    })
    if (pointsError) throw pointsError
    const point = points?.[0]
    if (!point) return Response.json({ error: 'No public map location is available for this property.' }, { status: 404 })

    const query = `[out:json][timeout:20];(${SERVICE_TAGS
      .map((selector) => `nwr(around:${radius},${point.latitude},${point.longitude})${selector};`)
      .join('')});out center tags 300;`
    const overpassUrl = 'https://overpass-api.de/api/interpreter'
    const response = await fetch(`${overpassUrl}?${new URLSearchParams({ data: query })}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
      next: { revalidate: 3600 },
    })
    if (!response.ok) {
      console.error('OpenStreetMap Overpass request failed:', response.status)
      return Response.json({ error: 'The nearby-place data service is temporarily unavailable.' }, { status: 502 })
    }

    const result = await response.json() as OverpassResponse
    const services = (result.elements ?? []).flatMap((element) => {
      const tags = element.tags ?? {}
      const category = getCategory(tags)
      const latitude = element.lat ?? element.center?.lat
      const longitude = element.lon ?? element.center?.lon
      const name = tags.name?.trim()
      if (!category || !name || latitude === undefined || longitude === undefined) return []
      const distance = distanceMeters(point.latitude, point.longitude, latitude, longitude)
      if (distance > radius) return []
      return [{
        id: `osm:${element.type}:${element.id}`,
        name,
        category,
        distance_m: distance,
        source: 'OpenStreetMap',
      }]
    })
    services.sort((a, b) => a.distance_m - b.distance_m)

    return Response.json(
      { services, radius_m: radius, source: 'OpenStreetMap', attribution: '© OpenStreetMap contributors' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch (error) {
    console.error('Could not load nearby places:', error)
    return Response.json({ error: 'Nearby-place data could not be loaded right now.' }, { status: 502 })
  }
}
