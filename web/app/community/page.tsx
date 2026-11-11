'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSubscriptionErrorMessage } from '@/lib/subscription'
import { getErrorMessage } from '@/lib/errors'

const MAX_MEDIA_FILES = 5
const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
])

interface PostMedia {
  id: string
  storage_path: string
  media_type: 'image' | 'video'
  mime_type: string
  signedUrl?: string
}

interface PostComment {
  id: string
  author_display_name: string
  body: string
  created_at: string
}

interface VendorPost {
  id: string
  body: string
  likes_count: number
  created_at: string
  vendor_post_media: PostMedia[]
  vendor_post_comments: PostComment[]
}

export default function CommunityPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [subscriptionChecking, setSubscriptionChecking] = useState(true)
  const [posts, setPosts] = useState<VendorPost[]>([])
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set())
  const [feedLoading, setFeedLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)
  const [postBody, setPostBody] = useState('')
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [posting, setPosting] = useState(false)
  const [activeLikePost, setActiveLikePost] = useState<string | null>(null)
  const [activeCommentPost, setActiveCommentPost] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadPage = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (session) {
          setUserId(session.user.id)
          const { data: subscription, error: subscriptionError } = await supabase
            .from('subscriptions')
            .select('active_until')
            .eq('user_id', session.user.id)
            .maybeSingle()
          if (subscriptionError) throw subscriptionError
          const activeUntil = subscription?.active_until
          if (isMounted) {
            setHasActiveSubscription(Boolean(activeUntil && new Date(activeUntil).getTime() > Date.now()))
          }

          const { data: likeRows, error: likeError } = await supabase
            .from('vendor_post_likes')
            .select('post_id')
            .eq('user_id', session.user.id)
          if (likeError) throw likeError
          if (isMounted) setLikedPostIds(new Set((likeRows ?? []).map((row) => row.post_id)))
        }

        const { data, error } = await supabase
          .from('vendor_posts')
          .select('id,body,likes_count,created_at,vendor_post_media(id,storage_path,media_type,mime_type),vendor_post_comments(id,author_display_name,body,created_at)')
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(30)

        if (error) throw error
        const rows = (data ?? []) as unknown as VendorPost[]
        const storagePaths = rows.flatMap((post) => post.vendor_post_media.map((media) => media.storage_path))
        const signedUrlByPath = new Map<string, string>()

        if (storagePaths.length) {
          const { data: signedUrls, error: signedUrlError } = await supabase
            .storage
            .from('vendor-updates')
            .createSignedUrls(storagePaths, 300)
          if (signedUrlError) throw signedUrlError
          for (const signedUrl of signedUrls ?? []) {
            if (signedUrl.path && signedUrl.signedUrl) signedUrlByPath.set(signedUrl.path, signedUrl.signedUrl)
          }
        }

        if (isMounted) {
          setPosts(rows.map((post) => ({
            ...post,
            vendor_post_media: post.vendor_post_media.map((media) => ({
              ...media,
              signedUrl: signedUrlByPath.get(media.storage_path),
            })),
          })))
        }
      } catch (error) {
        if (isMounted) {
          setMessage(getSubscriptionErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (isMounted) {
          setSubscriptionChecking(false)
          setFeedLoading(false)
        }
      }
    }

    void loadPage()
    return () => { isMounted = false }
  }, [])

  const handleCreatePost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || !hasActiveSubscription) {
      setMessage('An active subscription is required to share a vendor update.')
      setHasError(true)
      return
    }
    if (mediaFiles.length > MAX_MEDIA_FILES) {
      setMessage(`Choose up to ${MAX_MEDIA_FILES} photos or videos.`)
      setHasError(true)
      return
    }
    const invalidFile = mediaFiles.find((file) => !ALLOWED_MEDIA_TYPES.has(file.type) || file.size > MAX_MEDIA_SIZE_BYTES)
    if (invalidFile) {
      setMessage(`${invalidFile.name} is not supported or exceeds 50 MB.`)
      setHasError(true)
      return
    }

    setPosting(true)
    setMessage('')
    setHasError(false)
    let postId: string | null = null
    const uploadedPaths: string[] = []

    try {
      const { data: post, error: postError } = await supabase
        .from('vendor_posts')
        .insert({ owner_id: userId, body: postBody.trim(), status: 'pending' })
        .select('id')
        .single()

      if (postError) throw postError
      postId = post.id

      for (const file of mediaFiles) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
        const storagePath = `${userId}/${postId}/${crypto.randomUUID()}.${extension}`
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
        const { error: mediaError } = await supabase.from('vendor_post_media').insert({
          post_id: postId,
          owner_id: userId,
          storage_path: storagePath,
          media_type: mediaType,
          mime_type: file.type,
          file_size_bytes: file.size,
        })
        if (mediaError) throw mediaError

        const { error: uploadError } = await supabase.storage
          .from('vendor-updates')
          .upload(storagePath, file, { contentType: file.type, upsert: false })
        if (uploadError) {
          await supabase.from('vendor_post_media').delete().eq('storage_path', storagePath)
          throw uploadError
        }
        uploadedPaths.push(storagePath)
      }

      setMessage('Update submitted for review. It will appear in the community after approval.')
      setPostBody('')
      setMediaFiles([])
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from('vendor-updates').remove(uploadedPaths)
      }
      if (postId) await supabase.from('vendor_posts').delete().eq('id', postId)
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setPosting(false)
    }
  }

  const handleLike = async (post: VendorPost) => {
    if (!userId) {
      setMessage('Sign in to like community updates.')
      setHasError(true)
      return
    }

    setActiveLikePost(post.id)
    setMessage('')
    setHasError(false)
    const isLiked = likedPostIds.has(post.id)

    try {
      const result = isLiked
        ? await supabase.from('vendor_post_likes').delete().eq('post_id', post.id).eq('user_id', userId)
        : await supabase.from('vendor_post_likes').insert({ post_id: post.id, user_id: userId })
      if (result.error) throw result.error

      setLikedPostIds((current) => {
        const next = new Set(current)
        if (isLiked) next.delete(post.id)
        else next.add(post.id)
        return next
      })
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, likes_count: Math.max(0, item.likes_count + (isLiked ? -1 : 1)) }
        : item))
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setActiveLikePost(null)
    }
  }

  const handleComment = async (event: React.FormEvent<HTMLFormElement>, postId: string) => {
    event.preventDefault()
    if (!userId) {
      setMessage('Sign in to comment on community updates.')
      setHasError(true)
      return
    }
    const body = (commentDrafts[postId] ?? '').trim()
    if (!body || !displayName.trim()) {
      setMessage('Enter your display name and comment.')
      setHasError(true)
      return
    }

    setActiveCommentPost(postId)
    setMessage('')
    setHasError(false)
    try {
      const { data, error } = await supabase
        .from('vendor_post_comments')
        .insert({
          post_id: postId,
          author_id: userId,
          author_display_name: displayName.trim(),
          body,
        })
        .select('id,author_display_name,body,created_at')
        .single()
      if (error) throw error
      setPosts((current) => current.map((post) => post.id === postId
        ? { ...post, vendor_post_comments: [...post.vendor_post_comments, data as PostComment] }
        : post))
      setCommentDrafts((current) => ({ ...current, [postId]: '' }))
    } catch (error) {
      setMessage(getErrorMessage(error))
      setHasError(true)
    } finally {
      setActiveCommentPost(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-blue-700">StallSpace KE</Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-slate-700 hover:text-blue-700">Marketplace</Link>
            <Link href="/dashboard" className="text-sm font-medium text-slate-700 hover:text-blue-700">Dashboard</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <div className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-bold tracking-tight">Vendor community</h1>
          <p className="mt-2 text-slate-600">Updates from local stalls, shops, and services.</p>
        </div>

        {message && (
          <p
            role={hasError ? 'alert' : 'status'}
            className={`mt-5 rounded-md px-4 py-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
          >
            {message}
          </p>
        )}

        {subscriptionChecking ? (
          <p className="py-8 text-slate-600">Checking posting access...</p>
        ) : userId && hasActiveSubscription ? (
          <form onSubmit={handleCreatePost} className="mt-6 border-b border-slate-200 pb-6">
            <label htmlFor="vendor-post" className="mb-2 block text-sm font-semibold">Share a vendor update</label>
            <textarea
              id="vendor-post"
              value={postBody}
              onChange={(event) => setPostBody(event.target.value)}
              maxLength={2000}
              required
              rows={3}
              placeholder="Share an offer, new product, or service update..."
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm text-slate-700">
                Add photos/videos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  multiple
                  onChange={(event) => setMediaFiles(Array.from(event.target.files ?? []))}
                  className="ml-3 max-w-full text-xs"
                />
              </label>
              <button
                type="submit"
                disabled={posting}
                className="rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {posting ? 'Submitting...' : 'Submit for review'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Up to 5 files, 50 MB each. Posts appear after reviewer approval.</p>
          </form>
        ) : userId ? (
          <div className="mt-6 border-b border-slate-200 pb-6">
            <p className="text-sm text-slate-700">An active subscription is required to share vendor updates.</p>
            <Link href="/dashboard/billing" className="mt-3 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              View subscription
            </Link>
          </div>
        ) : (
          <p className="mt-6 border-b border-slate-200 pb-6 text-sm text-slate-600">
            <Link href="/dashboard" className="font-semibold text-blue-700 underline">Sign in</Link> with an active subscription to post, like, or comment.
          </p>
        )}

        {feedLoading ? (
          <p className="py-10 text-slate-600">Loading community updates...</p>
        ) : posts.length === 0 ? (
          <p className="py-10 text-slate-600">No approved updates yet.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {posts.map((post) => (
              <article key={post.id} className="py-6">
                <p className="whitespace-pre-wrap text-slate-800">{post.body}</p>
                <time className="mt-2 block text-xs text-slate-500">{new Date(post.created_at).toLocaleString()}</time>

                {post.vendor_post_media.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {post.vendor_post_media.map((media) => media.signedUrl && (
                      <div key={media.id} className="overflow-hidden rounded-md bg-slate-200">
                        {media.media_type === 'video' ? (
                          <video src={media.signedUrl} controls preload="metadata" className="aspect-video h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={media.signedUrl} alt="Vendor update" loading="lazy" className="aspect-video h-full w-full object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-4 border-b border-slate-200 pb-4">
                  <button
                    type="button"
                    onClick={() => void handleLike(post)}
                    disabled={activeLikePost === post.id}
                    aria-pressed={likedPostIds.has(post.id)}
                    className="text-sm font-semibold text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {likedPostIds.has(post.id) ? 'Liked' : 'Like'} · {post.likes_count}
                  </button>
                  <span className="text-sm text-slate-500">{post.vendor_post_comments.length} comments</span>
                </div>

                <div className="space-y-3 py-4">
                  {post.vendor_post_comments.map((comment) => (
                    <div key={comment.id} className="text-sm">
                      <span className="font-semibold text-slate-800">{comment.author_display_name}</span>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{comment.body}</p>
                    </div>
                  ))}
                </div>

                {userId && (
                  <form onSubmit={(event) => void handleComment(event, post.id)} className="flex gap-2">
                    <input
                      aria-label="Display name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={60}
                      required
                      placeholder="Your name"
                      className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      aria-label="Write a comment"
                      value={commentDrafts[post.id] ?? ''}
                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                      maxLength={1000}
                      required
                      placeholder="Write a comment..."
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={activeCommentPost === post.id}
                      className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                    >
                      {activeCommentPost === post.id ? 'Sending...' : 'Comment'}
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}