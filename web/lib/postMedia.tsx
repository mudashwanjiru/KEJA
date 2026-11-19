'use client'

import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export const POST_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
])
export const MAX_POST_MEDIA_FILES = 12
export const MAX_POST_MEDIA_FILE_SIZE = 50 * 1024 * 1024
const POST_MEDIA_BUCKET = 'public-post-media'

export type PostMediaTarget =
  | { column: 'listing_id'; id: string }
  | { column: 'provider_id'; id: string }
  | { column: 'job_id'; id: string }
  | { column: 'place_id'; id: string }
  | { column: 'notice_id'; id: string }

export interface PostMediaItem {
  id: string
  storage_path: string
  media_type: 'image' | 'video'
  mime_type: string
  position: number
  signedUrl?: string
}

export function getPostMediaValidationError(files: File[]): string | null {
  if (files.length > MAX_POST_MEDIA_FILES) {
    return `Choose no more than ${MAX_POST_MEDIA_FILES} photos or videos.`
  }
  const invalidFile = files.find((file) => (
    !POST_MEDIA_TYPES.has(file.type) || file.size > MAX_POST_MEDIA_FILE_SIZE
  ))
  return invalidFile ? `${invalidFile.name} is unsupported or exceeds 50 MB.` : null
}

export async function uploadPostMedia(
  ownerId: string,
  target: PostMediaTarget,
  files: File[],
): Promise<void> {
  if (!files.length) return

  const rows = files.map((file, position) => {
    const extension = file.type === 'image/jpeg' ? 'jpg'
      : file.type === 'image/png' ? 'png'
        : file.type === 'image/webp' ? 'webp'
          : file.type === 'video/mp4' ? 'mp4'
            : 'webm'
    return {
      [target.column]: target.id,
      owner_id: ownerId,
      storage_path: `${ownerId}/${target.column}/${target.id}/${crypto.randomUUID()}.${extension}`,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      mime_type: file.type,
      position,
    }
  })

  const { error: metadataError } = await supabase.from('public_post_media').insert(rows)
  if (metadataError) throw metadataError

  const uploadedPaths: string[] = []
  try {
    for (const [index, row] of rows.entries()) {
      const { error } = await supabase.storage.from(POST_MEDIA_BUCKET)
        .upload(row.storage_path, files[index], { contentType: files[index].type, upsert: false })
      if (error) throw error
      uploadedPaths.push(row.storage_path)
    }
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage.from(POST_MEDIA_BUCKET).remove(uploadedPaths)
      if (cleanupError) console.error('Could not clean up uploaded post media:', cleanupError.message)
    }
    const { error: metadataCleanupError } = await supabase.from('public_post_media')
      .delete()
      .in('storage_path', rows.map((row) => row.storage_path))
    if (metadataCleanupError) console.error('Could not clean up post media records:', metadataCleanupError.message)
    throw error
  }
}

export async function addSignedPostMedia<T extends PostMediaItem>(items: T[]): Promise<T[]> {
  if (!items.length) return items
  const { data, error } = await supabase.storage.from(POST_MEDIA_BUCKET)
    .createSignedUrls(items.map((item) => item.storage_path), 300)
  if (error) throw error
  const failedUrl = (data ?? []).find((item) => !item.path || !item.signedUrl || item.error)
  if ((data ?? []).length !== items.length || failedUrl) {
    throw new Error('Could not create secure links for all post photos/videos.')
  }
  const urlsByPath = new Map((data ?? [])
    .filter((item) => item.path && item.signedUrl)
    .map((item) => [item.path, item.signedUrl]))
  return items.map((item) => ({ ...item, signedUrl: urlsByPath.get(item.storage_path) }))
}

export function PostMediaPicker({
  files,
  onChange,
  label = 'Photos and videos',
}: {
  files: File[]
  onChange: (files: File[], validationError: string | null) => void
  label?: string
}) {
  return (
    <div>
      <label className="block text-sm font-semibold">
        {label} (up to {MAX_POST_MEDIA_FILES}, 50 MB each)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? [])
            const validationError = getPostMediaValidationError(selected)
            onChange(validationError ? [] : selected, validationError)
            if (validationError) event.target.value = ''
          }}
          className="mt-1.5 block w-full text-sm"
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</li>)}
        </ul>
      )}
    </div>
  )
}

export function PostMediaGallery({ items }: { items: PostMediaItem[] }) {
  const visibleItems = items.filter((item) => item.signedUrl)
  if (!visibleItems.length) return null

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {visibleItems.map((item) => (
        <div key={item.id} className="overflow-hidden rounded-lg bg-slate-100">
          {item.media_type === 'video' ? (
            <video src={item.signedUrl} controls preload="metadata" className="aspect-video h-full w-full object-cover" aria-label="Post video" />
          ) : (
            <Image src={item.signedUrl!} alt="Post photo" width={640} height={400} unoptimized className="aspect-video h-full w-full object-cover" />
          )}
        </div>
      ))}
    </div>
  )
}
