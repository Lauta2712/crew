/** Las claves son códigos internos ya persistidos en `attendances.checkin_method` — no se renombran. */
const CHECKIN_METHOD_LABELS = {
  qr_camera: 'QR',
  qr_manual: 'QR manual',
  manual: 'Manual',
  qr_muro_libre: 'QR acceso libre',
  manual_muro_libre: 'Manual acceso libre',
  retroactivo: 'Retroactivo',
  retroactivo_muro_libre: 'Retroactivo acceso libre',
}

export function formatCheckinMethod(value) {
  if (!value) return 'Manual'
  return CHECKIN_METHOD_LABELS[value] ?? value
}
