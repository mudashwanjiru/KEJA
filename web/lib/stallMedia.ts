import { supabase } from '@/lib/supabase'

export const STALL_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
])
export const MAX_STALL_MEDIA_FILES = 12
export const MAX_STALL_MEDIA_FILE_SIZE = 50 * 1024 * 1024
const STALL_MEDIA_BUCKET = 'commercial-stall-media'

export function getStallMediaValidationError(files: File[]): string | null {
  if (files.length > MAX_STALL_MEDIA_FILES) {
    return `Choose no more than ${MAX_STALL_MEDIA_FILES} photos or videos.`
  }
  const invalidFile = files.find((file) => (
    !STALL_MEDIA_TYPES.has(file.type) || file.size > MAX_STALL_MEDIA_FILE_SIZE
  ))
  return invalidFile ? `${invalidFile.name} is unsupported or exceeds 50 MB.` : null
}

export async function uploadStallMedia(
  ownerId: string,
  stallId: string,
  files: File[],
): Promise<void> {
  if (files.length === 0) return

  const media = files.map((file, position) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
    return {
      stall_id: stallId,
      owner_id: ownerId,
      storage_path: `${ownerId}/${stallId}/${crypto.randomUUID()}.${extension}`,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      mime_type: file.type,
      position,
    }
  })

  const { error: metadataError } = await supabase.from('stall_media').insert(media)
  if (metadataError) throw metadataError

  const uploadedPaths: string[] = []
  try {
    for (const [index, item] of media.entries()) {
      const { error } = await supabase.storage
        .from(STALL_MEDIA_BUCKET)
        .upload(item.storage_path, files[index], {
          contentType: files[index].type,
          upsert: false,
        })
      if (error) throw error
      uploadedPaths.push(item.storage_path)
    }
  } catch (error) {
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from(STALL_MEDIA_BUCKET)
        .remove(uploadedPaths)
      if (cleanupError) console.error('Could not clean up uploaded stall media:', cleanupError.message)
    }
    const { error: metadataCleanupError } = await supabase.from('stall_media')
      .delete()
      .eq('stall_id', stallId)
      .eq('owner_id', ownerId)
    if (metadataCleanupError) {
      console.error('Could not clean up stall media records:', metadataCleanupError.message)
    }
    throw error
  }
}
