import 'server-only'

interface MpesaConfig {
  baseUrl: string
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  partyB: string
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline'
  callbackUrl: string
}

interface StkPushResponse {
  ResponseCode?: string
  CheckoutRequestID?: string
  MerchantRequestID?: string
  CustomerMessage?: string
  errorMessage?: string
}

interface StkQueryResponse {
  CheckoutRequestID?: string
  ResultCode?: string | number
  ResultDesc?: string
  errorMessage?: string
}

function getMpesaConfig(): MpesaConfig {
  const environment = process.env.MPESA_ENVIRONMENT || 'sandbox'
  const baseUrl = environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke'
  const siteUrl = process.env.APP_BASE_URL
  const callbackToken = process.env.MPESA_CALLBACK_TOKEN
  const callbackUrl = siteUrl ? new URL('/api/payments/mpesa/callback', siteUrl) : null

  if (environment !== 'production' && environment !== 'sandbox') {
    throw new Error('MPESA_ENVIRONMENT must be sandbox or production.')
  }
  if (!callbackUrl || callbackUrl.protocol !== 'https:' || !callbackToken || callbackToken.length < 32) {
    throw new Error('Configure APP_BASE_URL and a 32-character MPESA_CALLBACK_TOKEN for HTTPS callbacks.')
  }

  callbackUrl.searchParams.set('token', callbackToken)

  const consumerKey = process.env.MPESA_CONSUMER_KEY
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET
  const shortcode = process.env.MPESA_SHORTCODE
  const passkey = process.env.MPESA_PASSKEY
  const partyB = process.env.MPESA_PARTY_B || shortcode
  const transactionType = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline'

  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !partyB) {
    throw new Error('M-Pesa Daraja credentials are not configured.')
  }
  if (transactionType !== 'CustomerPayBillOnline' && transactionType !== 'CustomerBuyGoodsOnline') {
    throw new Error('MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline.')
  }

  return {
    baseUrl,
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    partyB,
    transactionType,
    callbackUrl: callbackUrl.toString(),
  }
}

export function normalizeKenyanPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `254${digits.slice(1)}`
  if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`
  return /^254[17]\d{8}$/.test(digits) ? digits : null
}

function getNairobiTimestamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`
}

async function getAccessToken(config: MpesaConfig): Promise<string> {
  const authorization = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
  const response = await fetch(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${authorization}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    },
  )
  const result = await response.json() as { access_token?: string; errorMessage?: string }

  if (!response.ok || !result.access_token) {
    throw new Error(result.errorMessage || 'Could not authenticate with M-Pesa.')
  }

  return result.access_token
}

function getStkPassword(config: MpesaConfig, timestamp: string): string {
  return Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
}

export async function initiateStkPush(
  phoneNumber: string,
  amount: number,
  accountReference = 'MTAA',
  transactionDescription = 'MTAA monthly',
): Promise<StkPushResponse> {
  const config = getMpesaConfig()
  const accessToken = await getAccessToken(config)
  const timestamp = getNairobiTimestamp()
  const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: getStkPassword(config, timestamp),
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: config.partyB,
      PhoneNumber: phoneNumber,
      CallBackURL: config.callbackUrl,
      AccountReference: accountReference.slice(0, 12),
      TransactionDesc: transactionDescription.slice(0, 13),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const result = await response.json() as StkPushResponse

  if (!response.ok || result.ResponseCode !== '0' || !result.CheckoutRequestID || !result.MerchantRequestID) {
    throw new Error(result.errorMessage || 'M-Pesa did not accept the payment request.')
  }

  return result
}

export async function queryStkPush(checkoutRequestId: string): Promise<StkQueryResponse> {
  const config = getMpesaConfig()
  const accessToken = await getAccessToken(config)
  const timestamp = getNairobiTimestamp()
  const response = await fetch(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: getStkPassword(config, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const result = await response.json() as StkQueryResponse

  if (!response.ok || result.CheckoutRequestID !== checkoutRequestId || result.ResultCode === undefined) {
    throw new Error(result.errorMessage || 'Could not verify the M-Pesa transaction.')
  }

  return result
}