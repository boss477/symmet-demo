export var THEME_KEY = "symmet-theme";

export function getInitialTheme(options) {
  options = options || {};
  if (options.stored === "dark" || options.stored === "light") return options.stored;
  return "light";
}

export function nextTheme(theme) {
  return theme === "dark" ? "light" : "dark";
}
