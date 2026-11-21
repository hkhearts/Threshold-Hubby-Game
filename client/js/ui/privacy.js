// Privacy controls: the souvenir (a still of the door only — no face, no
// numbers) and End & Erase (camera off, session gone, local storage cleared).

export function saveStill({ composer, ui, audio, onDone }) {
  audio?.uiClick();
  ui.screen(null);
  ui.showHud(false);
  ui.showBreathGuide(false);
  composer.render();
  let url;
  try {
    url = composer.renderer.domElement.toDataURL('image/png');
  } catch {
    onDone?.();
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = 'threshold-the-door.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  onDone?.();
}

export function endAndErase({ bridge, ui }) {
  bridge.disconnect(); // stops the camera, closes the socket, terminates the worker
  try {
    localStorage.removeItem('threshold.consent');
    localStorage.removeItem('threshold.introSeen');
  } catch {
    /* ignore */
  }
  ui.clearNarration();
  ui.clearHint();
  ui.screen('screen-farewell');
}
