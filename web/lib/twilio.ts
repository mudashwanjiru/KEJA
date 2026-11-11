import 'server-only'

export class TwilioApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message)
    this.name = 'TwilioApiError'
  }
}

interface TwilioResponse {
  sid?: string
  status?: string
  code?: number
  message?: string
}

async function requestTwilio(endpoint: string, form: URLSearchParams): Promise<TwilioResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) throw new Error('Twilio is not configured on the server.')

  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })

  let result: TwilioResponse
  try {
    result = await response.json() as TwilioResponse
  } catch {
    throw new TwilioApiError('Twilio returned an invalid response.', response.status, null)
  }
  if (!response.ok) {
    throw new TwilioApiError('Twilio rejected the request.', response.status, result.code ? String(result.code) : null)
  }
  return result
}

export async function twilioRequest(
  path: string,
  form: URLSearchParams,
): Promise<TwilioResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  if (!accountSid) throw new Error('Twilio is not configured on the server.')
  return requestTwilio(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}${path}`,
    form,
  )
}

export async function twilioVerifyRequest(
  serviceSid: string,
  action: 'Verifications' | 'VerificationCheck',
  form: URLSearchParams,
): Promise<TwilioResponse> {
  return requestTwilio(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${action}`,
    form,
  )
}
