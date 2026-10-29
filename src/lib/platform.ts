export function isIos(): boolean {
  const ua = navigator.userAgent
  const iDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ se prezintă ca Mac, dar are ecran tactil
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iDevice || iPadOs
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}

/** iPhone/iPad unde aplicația nu e adăugată pe ecranul principal. */
export function isIosNotInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return isIos() && nav.standalone !== true
}
