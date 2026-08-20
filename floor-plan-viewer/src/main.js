import { initFloorPlanViewer } from "./viewer/floorPlanViewer.js";
import { getInitialTheme, nextTheme, THEME_KEY } from "./lib/themePreference.js";

var themeButton = document.getElementById("theme-toggle");
var storedTheme = localStorage.getItem(THEME_KEY);
var theme = getInitialTheme({
	stored: storedTheme,
	systemDark: window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches,
});

function applyTheme(next) {
	theme = next;
	document.documentElement.dataset.theme = theme;
	localStorage.setItem(THEME_KEY, theme);
	if (themeButton) {
		themeButton.textContent = theme === "dark" ? "Light" : "Dark";
		themeButton.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
	}
}

applyTheme(theme);
if (themeButton) {
	themeButton.addEventListener("click", function () {
		applyTheme(nextTheme(theme));
	});
}

initFloorPlanViewer();
