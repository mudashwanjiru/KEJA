'use client'

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'

export type KejaLanguage = 'en' | 'sw'

const translations = {
  en: {
    language: 'Language',
    english: 'English',
    swahili: 'Kiswahili',
    explore: 'Explore',
    search: 'Search',
    homes: 'Homes',
    services: 'Services',
    jobs: 'Jobs',
    guide: 'MTAA guide',
    listWithKeja: 'List with MTAA',
    findYourPlace: 'Find your place.',
    heroCopy: 'Homes, business spaces, local services and opportunities — all in one place, right here in Kenya.',
    searchAcrossKeja: 'Search across MTAA',
    exploreKeja: 'Explore MTAA',
    ecosystem: 'Explore the MTAA ecosystem',
    everydayLife: 'More of everyday life, on MTAA.',
    departments: 'Explore all departments',
    localListings: 'Explore local listings and submit your business or service to the MTAA directory.',
    county: 'County',
    town: 'Town / city',
    ward: 'Ward',
    area: 'Estate / area',
    loading: 'Loading…',
    addListing: 'Add a listing',
    sendRequest: 'Send service request',
    allCounties: 'All counties',
    category: 'Category',
    allCategories: 'All categories',
    maxMonthlyRent: 'Maximum monthly rent',
    anyBudget: 'Any budget (KSh)',
    availability: 'Availability',
    anyAvailability: 'Any availability',
    available: 'Available',
    occupied: 'Occupied',
    list: 'List',
    map: 'Map',
    clearFilters: 'Clear filters',
    noStallsMatch: 'No spaces match those filters',
    widenStallSearch: 'Try another area or increase your maximum rent.',
    loadingSpaces: 'Loading available spaces…',
    searchSpaces: 'Search spaces',
    areaStallKeyword: 'Area, stall, or keyword',
    spaceCount: 'spaces found',
    spaceCountOne: 'space found',
    monthlyRent: 'Monthly rent',
    viewSpace: 'View space',
    approximatePins: 'Map pins are approximate and rounded for privacy.',
    stallsWithPins: 'spaces with approximate map pins',
    noStallPins: 'No matching stalls have map pins yet. Owners can add approximate pins from their stall dashboard.',
    staleAvailability: 'The owner has not recently confirmed availability.',
    homeSearchTitle: 'Find a place that fits your life.',
    homeSearchDescription: 'Search homes, compare options, and explore nearby services.',
    naturalSearch: 'Search naturally: bedrooms, location, nearby services…',
    forRent: 'For rent',
    forSale: 'For sale',
    shortStays: 'Short stays',
    allPropertyTypes: 'All property types',
    maxMonthlyPrice: 'Max monthly rent',
    maxNightlyPrice: 'Max nightly rate',
    maxPriceKes: 'Max price (KES)',
    anyBedrooms: 'Any bedrooms',
    bedsitterStudio: 'Bedsitter / studio',
    bedrooms: 'bedrooms',
    useMyLocation: 'Use my location',
    refreshMyLocation: 'Refresh my location',
    clearLocation: 'Clear location',
    locationRadius: 'Nearby / location radius',
    service: 'Service',
    anyService: 'Any service',
    saveThisSearch: 'Save this search',
    savingSearch: 'Saving search…',
    manageSavedSearches: 'Manage saved searches',
    savedHomes: 'Saved homes',
    residentialListings: 'Residential listings',
    approximatePinsNote: 'Service distances are listing-provided. Location distances use rounded map pins and are approximate.',
    loadingHomes: 'Loading homes…',
    noHomesMatch: 'No homes match these filters yet. Try widening your search.',
    mapLocationsMissing: 'Map locations are not available for these homes yet.',
    viewProperty: 'View property',
    compare: 'Compare',
    ownerNoRecentHomeConfirm: 'The owner has not confirmed this listing’s availability in the last 30 days. Contact them to confirm before making plans.',
    ownerNoRecentStallConfirm: 'The owner has not confirmed this space’s availability in the last 30 days. Contact them to confirm before making plans.',
    propertyReport: 'Report this listing',
    reportReason: 'Reason',
    fakeListing: 'Fake listing',
    incorrectInformation: 'Incorrect information',
    alreadyUnavailable: 'Already unavailable',
    suspectedScam: 'Suspected scam',
    other: 'Other',
    reportDetailsOptional: 'Details (optional)',
    sendReport: 'Send report',
    sendingReport: 'Sending report…',
    signInToReport: 'Sign in to report this space.',
    stallReportIntro: 'Tell our moderation team what seems wrong with this space.',
    propertyReportIntro: 'Tell our moderation team what seems wrong with this property.',
    listingStatusAvailable: 'The owner has not confirmed availability in the last 30 days.',
    reportSent: 'Report sent to the moderation team.',
    confirmAvailability: 'Confirm availability',
    availabilityConfirmed: 'Availability confirmed',
    ownerConfirmPrompt: 'Please confirm this listing is still available.',
    ownerConfirmationAge: 'It has not been confirmed in 30 days.',
  },
  sw: {
    language: 'Lugha',
    english: 'Kiingereza',
    swahili: 'Kiswahili',
    explore: 'Gundua',
    search: 'Tafuta',
    homes: 'Nyumba',
    services: 'Huduma',
    jobs: 'Kazi',
    guide: 'Mwongozo wa MTAA',
    listWithKeja: 'Tangazo kwenye MTAA',
    findYourPlace: 'Pata makazi yako.',
    heroCopy: 'Nyumba, maeneo ya biashara, huduma za karibu na nafasi mbalimbali — yote sehemu moja, hapa Kenya.',
    searchAcrossKeja: 'Tafuta kwenye MTAA',
    exploreKeja: 'Gundua MTAA',
    ecosystem: 'Gundua huduma za MTAA',
    everydayLife: 'Huduma za kila siku, kwenye MTAA.',
    departments: 'Gundua idara zote',
    localListings: 'Gundua matangazo ya karibu na uweke biashara au huduma yako kwenye saraka ya MTAA.',
    county: 'Kaunti',
    town: 'Mji',
    ward: 'Wadi',
    area: 'Mtaa / eneo',
    loading: 'Inapakia…',
    addListing: 'Ongeza tangazo',
    sendRequest: 'Tuma ombi la huduma',
    allCounties: 'Kaunti zote',
    category: 'Aina',
    allCategories: 'Aina zote',
    maxMonthlyRent: 'Kodi ya juu kwa mwezi',
    anyBudget: 'Bajeti yoyote (KSh)',
    availability: 'Upatikanaji',
    anyAvailability: 'Upatikanaji wowote',
    available: 'Inapatikana',
    occupied: 'Imepangishwa',
    list: 'Orodha',
    map: 'Ramani',
    clearFilters: 'Ondoa vichujio',
    noStallsMatch: 'Hakuna nafasi zinazolingana na vichujio hivyo',
    widenStallSearch: 'Jaribu eneo lingine au ongeza kodi ya juu.',
    loadingSpaces: 'Inapakia nafasi zinazopatikana…',
    searchSpaces: 'Tafuta nafasi',
    areaStallKeyword: 'Eneo, kibanda au neno',
    spaceCount: 'nafasi zimepatikana',
    spaceCountOne: 'nafasi imepatikana',
    monthlyRent: 'Kodi ya mwezi',
    viewSpace: 'Tazama nafasi',
    approximatePins: 'Alama za ramani ni za makadirio na zimezungushwa kulinda faragha.',
    stallsWithPins: 'nafasi zenye alama za makadirio kwenye ramani',
    noStallPins: 'Bado hakuna vibanda vinavyolingana vyenye alama za ramani. Wamiliki wanaweza kuongeza alama kwenye dashibodi yao.',
    staleAvailability: 'Mmiliki hajathibitisha upatikanaji hivi karibuni.',
    homeSearchTitle: 'Pata makazi yanayokufaa.',
    homeSearchDescription: 'Tafuta nyumba, linganisha chaguo na ugundue huduma za karibu.',
    naturalSearch: 'Tafuta kwa vyumba, eneo au huduma za karibu…',
    forRent: 'Ya kupangisha',
    forSale: 'Inauzwa',
    shortStays: 'Makazi ya muda mfupi',
    allPropertyTypes: 'Aina zote za nyumba',
    maxMonthlyPrice: 'Kodi ya juu kwa mwezi',
    maxNightlyPrice: 'Bei ya juu kwa usiku',
    maxPriceKes: 'Bei ya juu (KES)',
    anyBedrooms: 'Idadi yoyote ya vyumba',
    bedsitterStudio: 'Bedsitter / studio',
    bedrooms: 'vyumba vya kulala',
    useMyLocation: 'Tumia eneo langu',
    refreshMyLocation: 'Sasisha eneo langu',
    clearLocation: 'Ondoa eneo',
    locationRadius: 'Umbali wa karibu / eneo',
    service: 'Huduma',
    anyService: 'Huduma yoyote',
    saveThisSearch: 'Hifadhi utafutaji huu',
    savingSearch: 'Inahifadhi utafutaji…',
    manageSavedSearches: 'Dhibiti utafutaji uliohifadhiwa',
    savedHomes: 'Nyumba zilizohifadhiwa',
    residentialListings: 'Matangazo ya nyumba',
    approximatePinsNote: 'Umbali wa huduma umetolewa na mtangazaji. Umbali wa ramani ni wa makadirio.',
    loadingHomes: 'Inapakia nyumba…',
    noHomesMatch: 'Hakuna nyumba zinazolingana na vichujio hivi. Panua utafutaji wako.',
    mapLocationsMissing: 'Maeneo ya ramani bado hayapatikani kwa nyumba hizi.',
    viewProperty: 'Tazama nyumba',
    compare: 'Linganisha',
    ownerNoRecentHomeConfirm: 'Mmiliki hajathibitisha upatikanaji wa tangazo hili ndani ya siku 30. Wasiliana naye kuthibitisha kabla ya kupanga.',
    ownerNoRecentStallConfirm: 'Mmiliki hajathibitisha upatikanaji wa nafasi hii ndani ya siku 30. Wasiliana naye kuthibitisha kabla ya kupanga.',
    propertyReport: 'Ripoti tangazo hili',
    reportReason: 'Sababu',
    fakeListing: 'Tangazo la uongo',
    incorrectInformation: 'Taarifa zisizo sahihi',
    alreadyUnavailable: 'Halipatikani tena',
    suspectedScam: 'Utapeli unaoshukiwa',
    other: 'Nyingine',
    reportDetailsOptional: 'Maelezo (si lazima)',
    sendReport: 'Tuma ripoti',
    sendingReport: 'Inatuma ripoti…',
    signInToReport: 'Ingia ili kuripoti nafasi hii.',
    stallReportIntro: 'Eleza kwa timu ya ukaguzi tatizo la nafasi hii.',
    propertyReportIntro: 'Eleza kwa timu ya ukaguzi tatizo la nyumba hii.',
    listingStatusAvailable: 'Mmiliki hajathibitisha upatikanaji ndani ya siku 30.',
    reportSent: 'Ripoti imetumwa kwa timu ya ukaguzi.',
    confirmAvailability: 'Thibitisha upatikanaji',
    availabilityConfirmed: 'Upatikanaji umethibitishwa',
    ownerConfirmPrompt: 'Tafadhali thibitisha kuwa tangazo hili bado linapatikana.',
    ownerConfirmationAge: 'Halijathibitishwa ndani ya siku 30.',
  },
} as const

type TranslationKey = keyof typeof translations.en

interface LanguageContextValue {
  language: KejaLanguage
  setLanguage: (language: KejaLanguage) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getLanguageSnapshot(): KejaLanguage {
  const stored = window.localStorage.getItem('keja-language')
  return stored === 'sw' ? 'sw' : 'en'
}

function subscribeToLanguage(onChange: () => void) {
  window.addEventListener('keja-language-change', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('keja-language-change', onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function KejaLanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore<KejaLanguage>(
    subscribeToLanguage,
    getLanguageSnapshot,
    () => 'en',
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  function setLanguage(nextLanguage: KejaLanguage) {
    window.localStorage.setItem('keja-language', nextLanguage)
    window.dispatchEvent(new Event('keja-language-change'))
  }

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t: (key) => translations[language][key],
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useKejaLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useKejaLanguage must be used inside KejaLanguageProvider')
  return value
}

export function LanguageControl() {
  const { language, setLanguage, t } = useKejaLanguage()
  return <label className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur">
    <span>{t('language')}</span>
    <select aria-label={t('language')} value={language} onChange={(event) => setLanguage(event.target.value as KejaLanguage)} className="rounded-md border border-slate-300 bg-white px-2 py-1">
      <option value="en">{t('english')}</option>
      <option value="sw">{t('swahili')}</option>
    </select>
  </label>
}
