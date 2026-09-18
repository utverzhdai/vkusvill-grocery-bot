// Модель помечает картинки строкой "PHOTO: <url>", а протухшую сессию ВкусВилла
// отдельной строкой "AUTH_REQUIRED". Бот вырезает их из текста.
const PHOTO_RE = /^PHOTO:\s*(\S+)\s*$/
const AUTH_MARK = 'AUTH_REQUIRED'

export function parseReply(raw) {
  const photos = []
  let authRequired = false
  const lines = []
  for (const line of raw.split('\n')) {
    const m = line.match(PHOTO_RE)
    if (m) { photos.push(m[1]); continue }
    if (line.trim() === AUTH_MARK) { authRequired = true; continue }
    lines.push(line)
  }
  return { text: lines.join('\n').trim(), photos, authRequired }
}
