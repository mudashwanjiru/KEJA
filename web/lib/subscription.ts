import { getErrorMessage } from '@/lib/errors'

export const SUBSCRIPTION_PRICE_KES = 1000

export function getSubscriptionErrorMessage(error: unknown): string {
	const message = getErrorMessage(error)
	if (/could not find the table ['"]?public\.subscriptions|subscriptions.*schema cache/i.test(message)) {
		return 'Subscription setup is incomplete. Run 20261028000200_mpesa_subscriptions.sql in the Supabase SQL Editor, then refresh this page.'
	}
	return message
}