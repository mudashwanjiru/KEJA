'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

interface AssistantMessage {
  question: string
  answer: string
  link: string
  linkLabel: string
  source?: 'guide' | 'gemini'
}

const suggestions = [
  'I need a home in Nairobi',
  'Find a mover or electrician',
  'I want to buy something',
  'Find food near me',
  'I am looking for a job',
]

function getAssistantResponse(question: string): AssistantMessage {
  const text = question.toLowerCase()
  if (/\b(house|home|rent|rental|apartment|bedsitter|land|property|hostel)\b/.test(text)) {
    return { question, answer: 'I can help you search MTAA homes and land. Add a location or budget in the search bar to narrow your options.', link: `/search?q=${encodeURIComponent(question)}`, linkLabel: 'Search homes & land' }
  }
  if (/\b(mov|delivery|deliver|transport|truck|van|plumb|electric|clean|repair|service|fund[iy])\b/.test(text)) {
    return { question, answer: 'MTAA has service providers for home help and moving. Open a provider profile to request a service and share your requirements.', link: `/search?q=${encodeURIComponent(question)}`, linkLabel: 'Find services' }
  }
  if (/\b(job|work|career|employment|hire|vacancy)\b/.test(text)) {
    return { question, answer: 'Browse open property jobs or search roles and locations across MTAA.', link: '/jobs', linkLabel: 'Browse jobs' }
  }
  if (/\b(food|restaurant|meal|eat|cook|grocer|marketplace|product|buy|sell|shop)\b/.test(text)) {
    const department = /\b(food|restaurant|meal|eat|cook)\b/.test(text) ? 'food' : 'marketplace'
    return { question, answer: department === 'food'
      ? 'Browse food listings and add priced meals to a food order. Orders are paid using M-Pesa when the payment service is configured.'
      : 'Browse local goods listings. Priced products can be added to your cart and paid for with M-Pesa when configured.',
    link: `/directory?department=${department}&q=${encodeURIComponent(question)}`,
    linkLabel: department === 'food' ? 'Browse food' : 'Browse marketplace' }
  }
  if (/\b(hotel|stay|accommodation|guest house|booking|room)\b/.test(text)) {
    return { question, answer: 'Browse accommodation listings and request dates from a host. Requests do not confirm availability or collect payment.', link: `/directory?department=accommodation&q=${encodeURIComponent(question)}`, linkLabel: 'Find accommodation' }
  }
  if (/\b(health|doctor|clinic|hospital|pharmacy|chemist)\b/.test(text)) {
    return { question, answer: 'Browse healthcare listings by service and location. For urgent symptoms or emergencies, contact local emergency services or a qualified clinician.', link: `/directory?department=health&q=${encodeURIComponent(question)}`, linkLabel: 'Browse healthcare' }
  }
  if (/\b(school|education|tutor|course|learn|class)\b/.test(text)) {
    return { question, answer: 'Browse schools, tutors and learning listings, then contact a provider directly for details.', link: `/directory?department=education&q=${encodeURIComponent(question)}`, linkLabel: 'Browse education' }
  }
  if (/\b(farm|farmer|agriculture|produce|crop|livestock|seed)\b/.test(text)) {
    return { question, answer: 'Browse farm produce, agricultural supplies and services in the MTAA directory.', link: `/directory?department=agriculture&q=${encodeURIComponent(question)}`, linkLabel: 'Browse agriculture' }
  }
  if (/\b(event|wedding|venue|photographer|dj|mc|ceremony)\b/.test(text)) {
    return { question, answer: 'Explore event venues and service providers in the MTAA directory.', link: `/directory?department=events&q=${encodeURIComponent(question)}`, linkLabel: 'Browse events' }
  }
  if (/\b(business|company|shop|nearby|directory)\b/.test(text)) {
    return { question, answer: 'Search businesses and services by county, town or category.', link: `/directory?department=businesses&q=${encodeURIComponent(question)}`, linkLabel: 'Browse businesses' }
  }
  return { question, answer: 'I can guide you to homes, business spaces, services, jobs, products, food, accommodation, healthcare, education, agriculture, events and local businesses. Try adding a county or town.', link: `/search?q=${encodeURIComponent(question)}`, linkLabel: 'Search across MTAA' }
}

export default function AssistantPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<'guide' | 'ai'>('guide')
  const [generating, setGenerating] = useState(false)

  function ask(question: string) {
    const clean = question.trim()
    if (clean.length < 2) {
      setNotice('Enter a little more detail so I can suggest the right MTAA section.')
      return
    }
    if (clean.length > 200) {
      setNotice('Please keep your question under 200 characters.')
      return
    }
    setNotice('')
    setMessages((current) => [getAssistantResponse(clean), ...current].slice(0, 10))
    setInput('')
  }

  async function askAi(question: string) {
    const clean = question.trim()
    if (clean.length < 2 || clean.length > 1000) {
      setNotice('Enter a question between 2 and 1,000 characters.')
      return
    }
    setGenerating(true)
    setNotice('')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) {
        setNotice('Sign in to use MTAA AI. The offline MTAA guide works without signing in.')
        return
      }
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: clean }),
      })
      const result = await response.json() as { answer?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'MTAA AI could not answer right now.')
      const answer = result.answer
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('MTAA AI returned an empty answer.')
      setMessages((current) => [{
        question: clean,
        answer,
        link: `/search?q=${encodeURIComponent(clean)}`,
        linkLabel: 'Search current MTAA listings',
        source: 'gemini' as const,
      }, ...current].slice(0, 10))
      setInput('')
    } catch (error) {
      setNotice(getErrorMessage(error))
    } finally {
      setGenerating(false)
    }
  }

  function submitQuestion(question: string) {
    if (mode === 'ai') void askAi(question)
    else ask(question)
  }

  return <main id="main-content" className="min-h-screen bg-[#f7f8f5] text-slate-900">
    <header className="border-b border-slate-200 bg-white"><nav className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4"><Link href="/" className="text-2xl font-black text-emerald-950">MTAA</Link><Link href="/search" className="text-sm font-bold text-emerald-800 hover:underline">Search MTAA</Link></nav></header>
    <section className="mx-auto max-w-4xl px-5 py-9 sm:py-12">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-800">MTAA guide</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">What do you need help finding?</h1>
      <p className="mt-3 max-w-3xl leading-7 text-slate-600">Use the offline guide or ask Google Gemini for general help with MTAA. Neither replaces professional, medical, legal or emergency advice, and AI answers may be inaccurate.</p>
      <div role="group" aria-label="Assistant mode" className="mt-6 flex flex-wrap gap-2">
        <button type="button" aria-pressed={mode === 'guide'} onClick={() => setMode('guide')} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === 'guide' ? 'bg-emerald-800 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>Offline MTAA guide</button>
        <button type="button" aria-pressed={mode === 'ai'} onClick={() => setMode('ai')} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === 'ai' ? 'bg-emerald-800 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>Google Gemini AI</button>
      </div>
      {mode === 'ai' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">Your question will be sent to Google Gemini to generate an answer. Do not include passwords, payment PINs, ID numbers, or sensitive medical or financial information. You can switch to the offline guide at any time.</p>}
      <form onSubmit={(event) => { event.preventDefault(); submitQuestion(input) }} className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <label className="sr-only" htmlFor="assistant-question">Describe what you need</label><input id="assistant-question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={mode === 'ai' ? 1000 : 200} placeholder="e.g. I need a mover in Kiambu" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" /><button disabled={generating} className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white hover:bg-emerald-900 disabled:opacity-50">{generating ? 'Thinking…' : 'Get help'}</button>
      </form>
      {notice && <p role="alert" className="mt-3 text-sm text-red-800">{notice}</p>}
      <div className="mt-4 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => submitQuestion(suggestion)} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-900">{suggestion}</button>)}</div>
      <div className="mt-8 space-y-4">{messages.map((message, index) => <article key={`${message.question}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-emerald-900">You asked</p><p className="mt-1">{message.question}</p><p className="mt-4 text-sm font-bold text-emerald-900">{message.source === 'gemini' ? 'Google Gemini · AI-generated' : 'MTAA offline guide'}</p><p className="mt-1 leading-6 text-slate-700">{message.answer}</p><Link href={message.link} className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">{message.linkLabel}</Link></article>)}</div>
    </section>
  </main>
}
