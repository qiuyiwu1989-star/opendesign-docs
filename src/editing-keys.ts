// Shared with the trusted iframe bridges; keep this function self-contained.
export function composingKey(event: {
  isComposing?: boolean;
  keyCode?: number;
}) {
  return event.isComposing === true || event.keyCode === 229;
}
