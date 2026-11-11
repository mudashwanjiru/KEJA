export const HOME_SERVICE_CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'moving', label: 'Moving' },
  { value: 'painting', label: 'Painting' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'appliance_repair', label: 'Appliance repair' },
  { value: 'pest_control', label: 'Pest control' },
  { value: 'security', label: 'Security installation' },
  { value: 'construction', label: 'Construction & fundis' },
  { value: 'architecture', label: 'Architecture & design' },
  { value: 'surveying', label: 'Land surveying' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'building_supplies', label: 'Building supplies' },
  { value: 'equipment_hire', label: 'Equipment hire' },
  { value: 'storage', label: 'Storage' },
  { value: 'relocation', label: 'Relocation support' },
  { value: 'other', label: 'Other property services' },
] as const

export function getHomeServiceCategoryLabel(value: string): string {
  return HOME_SERVICE_CATEGORIES.find((category) => category.value === value)?.label ?? value
}
