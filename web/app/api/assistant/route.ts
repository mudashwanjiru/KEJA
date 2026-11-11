import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

interface AssistantRequest {
  question?: unknown
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return Response.json({ error: 'Sign in to use MTAA AI.' }, { status: 401 })

  let input: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 8_000) {
      return Response.json({ error: 'Keep your question under 1,000 characters.' }, { status: 413 })
    }
    input = JSON.parse(rawBody) as unknown
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const body = typeof input === 'object' && input !== null ? input as AssistantRequest : {}
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (question.length < 2 || question.length > 1000) {
    return Response.json({ error: 'Enter a question between 2 and 1,000 characters.' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  if (!apiKey || !/^[a-zA-Z0-9._-]{1,80}$/.test(model)) {
    return Response.json({ error: 'MTAA AI is not configured on the server.' }, { status: 503 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return Response.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) return Response.json({ error: 'MTAA AI is not configured on the server.' }, { status: 503 })
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: allowed, error: rateLimitError } = await userClient.rpc('consume_keja_ai_request')
    if (rateLimitError) throw rateLimitError
    if (!allowed) return Response.json({ error: 'You have reached the MTAA AI limit of 10 questions per minute. Try again shortly.' }, { status: 429 })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are MTAA, a helpful guide for people using a Kenyan homes, services, and local marketplace platform. Answer briefly and practically. You do not have live access to MTAA listings; direct users to search MTAA for current availability and prices. Do not invent listings, phone numbers, fees, laws, or emergency details. Do not diagnose illness, provide legal or financial advice, or handle emergencies; recommend a qualified professional or local emergency service. Never ask for passwords, payment PINs, identity documents, or sensitive medical or financial information. If unsure, say so.',
            }],
          },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!response.ok) {
      console.error('Google Gemini request failed:', response.status)
      return Response.json(
        { error: response.status === 429 ? 'MTAA AI is busy. Please try again shortly.' : 'MTAA AI could not answer right now.' },
        { status: response.status === 429 ? 503 : 502 },
      )
    }
    const result = await response.json() as GeminiResponse
    const answer = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim()
    if (!answer) return Response.json({ error: 'MTAA AI returned no answer. Try the guided MTAA search instead.' }, { status: 502 })
    return Response.json({ answer: answer.slice(0, 5000) })
  } catch (error) {
    console.error('Could not generate MTAA AI response:', error)
    return Response.json({ error: 'MTAA AI could not answer right now. Try the guided MTAA search instead.' }, { status: 502 })
  }
}
