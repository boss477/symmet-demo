export var DEFAULT_DISPLAY_STATE = {
  furniture: true,
};

export function toggleDisplayState(state, key) {
  var next = Object.assign({}, state);
  if (Object.prototype.hasOwnProperty.call(next, key)) next[key] = !next[key];
  return next;
}