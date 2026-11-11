'use client'

import { useSyncExternalStore } from 'react'

const CART_STORAGE_KEY = 'keja-commerce-cart'
const CART_EVENT = 'keja-commerce-cart-change'
let cartSnapshot: CommerceCartItem[] | null = null

export type CommerceDepartment = 'marketplace' | 'food'

export interface CommerceCartItem {
  listingId: string
  department: CommerceDepartment
  title: string
  price: number
  priceUnit: string
  quantity: number
  stockQuantity: number | null
}

const EMPTY_CART: CommerceCartItem[] = []

function isCartItem(value: unknown): value is CommerceCartItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CommerceCartItem>
  return typeof item.listingId === 'string'
    && (item.department === 'marketplace' || item.department === 'food')
    && typeof item.title === 'string'
    && typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0
    && typeof item.priceUnit === 'string'
    && Number.isInteger(item.quantity) && Number(item.quantity) > 0
    && (item.stockQuantity === null || (Number.isInteger(item.stockQuantity) && Number(item.stockQuantity) >= 0))
}

function readCart(): CommerceCartItem[] {
  if (typeof window === 'undefined') return EMPTY_CART

  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!stored) return EMPTY_CART
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : EMPTY_CART
  } catch (error) {
    console.error('Could not read the MTAA cart:', error)
    return EMPTY_CART
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const handleChange = () => {
    cartSnapshot = readCart()
    callback()
  }
  window.addEventListener(CART_EVENT, handleChange)
  window.addEventListener('storage', handleChange)
  return () => {
    window.removeEventListener(CART_EVENT, handleChange)
    window.removeEventListener('storage', handleChange)
  }
}

function getSnapshot(): CommerceCartItem[] {
  cartSnapshot ??= readCart()
  return cartSnapshot
}

function getServerSnapshot(): CommerceCartItem[] {
  return EMPTY_CART
}

function saveCart(items: CommerceCartItem[]): void {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  cartSnapshot = items
  window.dispatchEvent(new Event(CART_EVENT))
}

export function useCommerceCart(): CommerceCartItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function addCommerceCartItem(item: Omit<CommerceCartItem, 'quantity'>): void {
  const cart = readCart()
  if (cart.some((cartItem) => cartItem.department !== item.department)) {
    throw new Error('Checkout one department at a time. Finish or clear your current cart first.')
  }
  const existing = cart.find((cartItem) => cartItem.listingId === item.listingId)
  if (existing) {
    const quantity = existing.quantity + 1
    if (item.stockQuantity !== null && quantity > item.stockQuantity) {
      throw new Error('There is not enough stock for another item.')
    }
    saveCart(cart.map((cartItem) => cartItem.listingId === item.listingId
      ? { ...cartItem, quantity }
      : cartItem))
    return
  }
  if (item.stockQuantity === 0) throw new Error('This item is out of stock.')
  saveCart([...cart, { ...item, quantity: 1 }])
}

export function setCommerceCartQuantity(listingId: string, quantity: number): void {
  if (!Number.isFinite(quantity)) {
    throw new Error('Quantity must be a valid number.')
  }

  const cart = readCart()
  const normalizedQuantity = Math.trunc(quantity)
  if (normalizedQuantity < 1) {
    saveCart(cart.filter((item) => item.listingId !== listingId))
    return
  }
  saveCart(cart.map((item) => {
    if (item.listingId !== listingId) return item
    if (item.stockQuantity !== null && normalizedQuantity > item.stockQuantity) {
      throw new Error('Requested quantity exceeds available stock.')
    }
    return { ...item, quantity: Math.min(normalizedQuantity, 99) }
  }))
}

export function clearCommerceCart(): void {
  saveCart(EMPTY_CART)
}
