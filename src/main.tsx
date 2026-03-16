import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.DEV && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.getRegistrations().then((registrations) => {
			registrations.forEach((registration) => {
				void registration.unregister();
			});
		});
	});
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("/sw.js").catch(() => {
			// no-op: install still works without registration in supported browsers
		});
	});
}
