/**
 * notificationService.ts
 * Manages Desktop Web Notifications and Steam-Style in-app notifications
 * for background processes (downloads, scans, OCR jobs).
 */

export interface TaskNotificationPayload {
	title: string;
	message: string;
	type?: "success" | "info" | "warning" | "error";
	badge?: string;
	timestamp?: number;
}

type NotificationListener = (payload: TaskNotificationPayload) => void;
const listeners: Set<NotificationListener> = new Set();

export const subscribeTaskNotification = (
	listener: NotificationListener,
): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const requestDesktopNotificationPermission = async (): Promise<boolean> => {
	if (!("Notification" in window)) {
		return false;
	}
	if (Notification.permission === "granted") {
		return true;
	}
	if (Notification.permission !== "denied") {
		const res = await Notification.requestPermission();
		return res === "granted";
	}
	return false;
};

export const notifyTaskCompleted = (payload: TaskNotificationPayload) => {
	// 1. Broadcast to in-app Steam-style toast listeners
	for (const listener of listeners) {
		try {
			listener(payload);
		} catch (e) {
			console.error("Error in task notification listener", e);
		}
	}

	// 2. If tab is blurred or hidden, trigger System Desktop Notification
	if ("Notification" in window && Notification.permission === "granted") {
		if (document.hidden || !document.hasFocus()) {
			try {
				const n = new Notification(payload.title, {
					body: payload.message,
					icon: "/favicon.ico",
					silent: false,
				});
				n.onclick = () => {
					window.focus();
					n.close();
				};
			} catch (e) {
				console.error("Failed to display desktop notification", e);
			}
		}
	}
};
