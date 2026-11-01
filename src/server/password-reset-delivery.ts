import { AsyncLocalStorage } from "node:async_hooks";

type Delivery = { email: string; send: (token: string) => Promise<void> };
const delivery = new AsyncLocalStorage<Delivery>();

// Native auth endpoints cannot select a club or mail recipient. Only a server
// operation that verified this club's invitation or membership grants delivery.
export function withPasswordResetDelivery<T>(
	scope: Delivery,
	work: () => Promise<T>,
): Promise<T> {
	return delivery.run(scope, work);
}

export async function deliverScopedPasswordReset(data: {
	user: { email: string };
	token: string;
}): Promise<void> {
	const scope = delivery.getStore();
	if (!scope || scope.email !== data.user.email.trim().toLowerCase()) return;
	await scope.send(data.token);
}
