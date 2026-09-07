export const PRESENTATION_IDLE_MS = 2200;

/** Small timer with explicit holds, shared by pointer and keyboard controls. */
export function createPresentationControls(
  change: (visible: boolean) => void,
  hold: () => boolean,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  const wake = () => {
    cancel();
    change(true);
    timer = setTimeout(() => {
      if (!hold()) change(false);
    }, PRESENTATION_IDLE_MS);
  };
  return { wake, dispose: cancel };
}
