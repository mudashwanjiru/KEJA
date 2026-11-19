import 'server-only'

import { SUBSCRIPTION_PRICE_KES } from '@/lib/subscription'

interface PesapalConfig {
  baseUrl: string
  consumerKey: string
  consumerSecret: string
  appBaseUrl: string
  ipnToken: string
}

interface PesapalTokenResponse {
  token?: string
  error?: { message?: string }
}

interface PesapalIpn {
  ipn_id?: string
  url?: string
}

interface PesapalOrderResponse {
  order_tracking_id?: string
  merchant_reference?: string
  redirect_url?: string
  error?: { message?: string }
}

export interface PesapalTransactionStatus {
  payment_status_description?: string
  amount?: string | number
  currency?: string
  confirmation_code?: string
  payment_method?: string
  error?: { message?: string }
}

function getPesapalConfig(): PesapalConfig {
  const environment = process.env.PESAPAL_ENVIRONMENT || 'sandbox'
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('PESAPAL_ENVIRONMENT must be sandbox or production.')
  }

  const { PESAPAL_CONSUMER_KEY: consumerKey, PESAPAL_CONSUMER_SECRET: consumerSecret } = process.env
  const appBaseUrl = process.env.APP_BASE_URL
  const ipnToken = process.env.PESAPAL_IPN_TOKEN
  if (!consumerKey || !consumerSecret) {
    throw new Error('Pesapal merchant credentials are not configured.')
  }
  if (!appBaseUrl || !ipnToken || ipnToken.length < 32) {
    throw new Error('Configure APP_BASE_URL and a 32-character PESAPAL_IPN_TOKEN.')
  }

  const parsedBaseUrl = new URL(appBaseUrl)
  if (parsedBaseUrl.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS for Pesapal.')
  }

  return {
    baseUrl: environment === 'production'
      ? 'https://pay.pesapal.com/v3'
      : 'https://cybqa.pesapal.com/pesapalv3',
    consumerKey,
    consumerSecret,
    appBaseUrl: parsedBaseUrl.origin,
    ipnToken,
  }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const result = await response.json() as T & { error?: { message?: string } }
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || `Pesapal request failed (${response.status}).`)
  }
  return result
}

async function getAccessToken(config: PesapalConfig): Promise<string> {
  const result = await requestJson<PesapalTokenResponse>(
    `${config.baseUrl}/api/Auth/RequestToken`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumer_key: config.consumerKey,
        consumer_secret: config.consumerSecret,
      }),
    },
  )
  if (!result.token) throw new Error('Pesapal did not return an access token.')
  return result.token
}

async function getNotificationId(
  config: PesapalConfig,
  accessToken: string,
): Promise<string> {
  const notificationUrl = new URL('/api/payments/pesapal/ipn', config.appBaseUrl)
  notificationUrl.searchParams.set('token', config.ipnToken)
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }

  const existing = await requestJson<PesapalIpn[] | { ipn_list?: PesapalIpn[] }>(
    `${config.baseUrl}/api/URLSetup/GetIpnList`,
    { headers },
  )
  const existingIpns = Array.isArray(existing) ? existing : existing.ipn_list ?? []
  const existingIpn = existingIpns.find((ipn) => (
    ipn.url && new URL(ipn.url).toString() === notificationUrl.toString() && ipn.ipn_id
  ))
  if (existingIpn?.ipn_id) return existingIpn.ipn_id

  const created = await requestJson<PesapalIpn>(
    `${config.baseUrl}/api/URLSetup/RegisterIPN`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: notificationUrl.toString(),
        ipn_notification_type: 'GET',
      }),
    },
  )
  if (!created.ipn_id) throw new Error('Pesapal did not register the payment notification URL.')
  return created.ipn_id
}

export async function createPesapalSubscriptionOrder(input: {
  requestId: string
  email: string
  displayName: string
}): Promise<{ orderTrackingId: string; redirectUrl: string }> {
  const config = getPesapalConfig()
  const accessToken = await getAccessToken(config)
  const notificationId = await getNotificationId(config, accessToken)
  const callbackUrl = new URL('/dashboard/billing', config.appBaseUrl)
  callbackUrl.searchParams.set('pesapal', 'return')
  callbackUrl.searchParams.set('id', input.requestId)
  const [firstName, ...lastNameParts] = input.displayName.trim().split(/\s+/)
  const lastName = lastNameParts.join(' ') || 'Member'

  const result = await requestJson<PesapalOrderResponse>(
    `${config.baseUrl}/api/Transactions/SubmitOrderRequest`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: input.requestId,
        currency: 'KES',
        amount: String(SUBSCRIPTION_PRICE_KES),
        description: 'MTAA monthly listing subscription',
        callback_url: callbackUrl.toString(),
        notification_id: notificationId,
        billing_address: {
          email_address: input.email,
          country_code: 'KE',
          first_name: firstName || 'MTAA',
          last_name: lastName,
        },
      }),
    },
  )
  if (!result.order_tracking_id || !result.redirect_url) {
    throw new Error('Pesapal did not return a checkout link.')
  }
  const redirectUrl = new URL(result.redirect_url)
  if (redirectUrl.protocol !== 'https:' || !['pay.pesapal.com', 'cybqa.pesapal.com'].includes(redirectUrl.hostname)) {
    throw new Error('Pesapal returned an invalid checkout URL.')
  }
  return { orderTrackingId: result.order_tracking_id, redirectUrl: redirectUrl.toString() }
}

export async function getPesapalTransactionStatus(
  orderTrackingId: string,
): Promise<PesapalTransactionStatus> {
  const config = getPesapalConfig()
  const accessToken = await getAccessToken(config)
  const url = new URL(`${config.baseUrl}/api/Transactions/GetTransactionStatus`)
  url.searchParams.set('orderTrackingId', orderTrackingId)
  return requestJson<PesapalTransactionStatus>(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
}
