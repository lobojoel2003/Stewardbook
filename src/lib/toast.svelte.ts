interface Toast {
	id: number;
	message: string;
}

let nextId = 1;

export const toasts = $state<Toast[]>([]);

export function toast(message: string, ms = 3200): void {
	const id = nextId++;
	toasts.push({ id, message });
	while (toasts.length > 3) toasts.shift();
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i >= 0) toasts.splice(i, 1);
	}, ms);
}
