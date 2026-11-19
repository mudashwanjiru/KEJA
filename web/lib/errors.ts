export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message.length > 0) return message
  }

  return 'An unexpected error occurred.'
}

export function getSchemaMismatchMessage(error: unknown): string | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    typeof error.code !== 'string'
  ) {
    return null
  }

  if (!['42703', 'PGRST202', 'PGRST205'].includes(error.code)) return null

  return 'The Supabase database schema is behind this app. Apply the pending migrations in web/supabase/migrations in order (see web/README.md), then reload.'
}
