'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

interface StallReview {
  id: string
  stall_number: string
  monthly_rent: number
  size_sqft: number | null
  status: string
  review_status: 'pending'
}

interface VendorPostReview {
  id: string
  body: string
  created_at: string
  vendor_post_media: Array<{
    id: string
    storage_path: string
    media_type: 'image' | 'video'
    signedUrl?: string
  }>
}

export default function StallReviewPage() {
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [isReviewer, setIsReviewer] = useState(false)
  const [stalls, setStalls] = useState<StallReview[]>([])
  const [vendorPosts, setVendorPosts] = useState<VendorPostReview[]>([])
  const [activeStallId, setActiveStallId] = useState<string | null>(null)
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadReviewQueue() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!session) {
          if (isMounted) {
            setMessage('Sign in with an authorized reviewer account to continue.')
            setHasError(true)
          }
          return
        }

        const { data: reviewer, error: reviewerError } = await supabase
          .from('stall_reviewers')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (reviewerError) throw reviewerError
        if (!reviewer) {
          if (isMounted) {
            setMessage('This account is not authorized to review stall listings.')
            setHasError(true)
          }
          return
        }

        const [stallResult, postResult] = await Promise.all([
          supabase
            .from('stalls')
            .select('id,stall_number,monthly_rent,size_sqft,status,review_status')
            .eq('review_status', 'pending')
            .order('stall_number'),
          supabase
            .from('vendor_posts')
            .select('id,body,created_at,vendor_post_media(id,storage_path,media_type)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        ])

        if (stallResult.error) throw stallResult.error
        if (postResult.error) throw postResult.error
        const posts = (postResult.data ?? []) as unknown as VendorPostReview[]
        const mediaPaths = posts.flatMap((post) => post.vendor_post_media.map((media) => media.storage_path))
        const signedUrlByPath = new Map<string, string>()

        if (mediaPaths.length) {
          const { data: signedUrls, error: signedUrlError } = await supabase
            .storage
            .from('vendor-updates')
            .createSignedUrls(mediaPaths, 300)
          if (signedUrlError) throw signedUrlError
          for (const signedUrl of signedUrls ?? []) {
            if (signedUrl.path && signedUrl.signedUrl) signedUrlByPath.set(signedUrl.path, signedUrl.signedUrl)
          }
        }

        if (isMounted) {
          setIsReviewer(true)
          setStalls((stallResult.data ?? []) as StallReview[])
          setVendorPosts(posts.map((post) => ({
            ...post,
            vendor_post_media: post.vendor_post_media.map((media) => ({
              ...media,
              signedUrl: signedUrlByPath.get(media.storage_path),
            })),
          })))
        }
      } catch (error) {
        console.error('Could not load stall review queue:', error)
        if (isMounted) {
          setMessage(getErrorMessage(error))
          setHasError(true)
        }
      } finally {
        if (isMounted) setCheckingAccess(false)
      }
    }

    void loadReviewQueue()
    return () => {
      isMounted = false
    }
  }, [])

  const handleReview = async (stallId: string, reviewStatus: 'approved' | 'rejected') => {
    setActiveStallId(stallId)
    setMessage('')
    setHasError(false)

    try {
      const { data, error } = await supabase
        .from('stalls')
        .update({ review_status: reviewStatus })
        .eq('id', stallId)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('You no longer have permission to review this listing.')

      setStalls((current) => current.filter((stall) => stall.id !== stallId))
      setMessage(reviewStatus === 'approved' ? 'Stall approved and now public.' : 'Stall rejected.')
    } catch (error) {
      setMessage(`Could not ${reviewStatus} this stall: ${getErrorMessage(error)}`)
      setHasError(true)
    } finally {
      setActiveStallId(null)
    }
  }

  const handleReviewPost = async (postId: string, status: 'approved' | 'rejected') => {
    setActivePostId(postId)
    setMessage('')
    setHasError(false)

    try {
      const { data, error } = await supabase
        .from('vendor_posts')
        .update({ status })
        .eq('id', postId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('You no longer have permission to review this post.')

      setVendorPosts((current) => current.filter((post) => post.id !== postId))
      setMessage(status === 'approved' ? 'Vendor update approved and published.' : 'Vendor update rejected.')
    } catch (error) {
      setMessage(`Could not ${status} this post: ${getErrorMessage(error)}`)
      setHasError(true)
    } finally {
      setActivePostId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold">Stall review queue</h1>
          <nav className="flex items-center gap-4">
            <Link href="/admin/services" className="text-sm font-medium text-blue-700 hover:underline">Service providers</Link>
            <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">Landlord dashboard</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        {message && (
          <p
            role={hasError ? 'alert' : 'status'}
            className={`mb-6 rounded-md px-4 py-3 text-sm ${hasError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
          >
            {message}
          </p>
        )}

        {checkingAccess ? (
          <p className="py-10 text-slate-600">Checking reviewer access...</p>
        ) : !isReviewer ? null : (
          <div className="space-y-12">
            <section>
              <h2 className="mb-4 text-xl font-bold">Vendor updates ({vendorPosts.length})</h2>
              {vendorPosts.length === 0 ? (
                <p className="py-6 text-slate-600">No pending vendor updates.</p>
              ) : (
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {vendorPosts.map((post) => (
                    <article key={post.id} className="py-5">
                      <p className="whitespace-pre-wrap text-slate-800">{post.body}</p>
                      <time className="mt-2 block text-xs text-slate-500">{new Date(post.created_at).toLocaleString()}</time>
                      {post.vendor_post_media.length > 0 && (
                        <div className="mt-4 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
                          {post.vendor_post_media.map((media) => media.signedUrl && (
                            <div key={media.id} className="overflow-hidden rounded-md bg-slate-200">
                              {media.media_type === 'video' ? (
                                <video src={media.signedUrl} controls preload="metadata" className="aspect-video h-full w-full object-cover" />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={media.signedUrl} alt="Submitted vendor update" className="aspect-video h-full w-full object-cover" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReviewPost(post.id, 'approved')}
                          disabled={activePostId !== null}
                          className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                        >
                          {activePostId === post.id ? 'Saving...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReviewPost(post.id, 'rejected')}
                          disabled={activePostId !== null}
                          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-xl font-bold">Stalls ({stalls.length})</h2>
              {stalls.length === 0 ? (
                <p className="py-6 text-slate-600">No pending stall submissions.</p>
              ) : (
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {stalls.map((stall) => (
                    <article key={stall.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <h3 className="font-semibold">{stall.stall_number}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          KES {stall.monthly_rent.toLocaleString()} / month
                          {stall.size_sqft ? ` · ${stall.size_sqft} sq. ft.` : ''}
                          {' · '}{stall.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReview(stall.id, 'approved')}
                          disabled={activeStallId !== null}
                          className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                        >
                          {activeStallId === stall.id ? 'Saving...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReview(stall.id, 'rejected')}
                          disabled={activeStallId !== null}
                          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}