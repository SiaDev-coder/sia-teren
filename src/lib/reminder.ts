export const BACKUP_REMINDER_DAYS = 7

/**
 * Amintire de backup: au trecut 7 zile de la ultima copie (sau de la prima înregistrare,
 * dacă nu există nicio copie) și există date noi după ultima copie.
 */
export function backupReminderDue(
  lastBackupAt: number | null,
  lastDataChangeAt: number | null,
  firstDataAt: number | null,
  now = Date.now(),
): boolean {
  if (lastDataChangeAt === null) return false
  const ref = lastBackupAt ?? firstDataAt
  if (ref === null) return false
  const hasNew = lastBackupAt === null || lastDataChangeAt > lastBackupAt
  return hasNew && now - ref >= BACKUP_REMINDER_DAYS * 864e5
}
