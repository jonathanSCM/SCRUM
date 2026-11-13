import { flushNotifications } from "@/lib/notifications";
import { flushProjectFeeds } from "@/lib/notify";
import { flushMeetingReminders } from "@/lib/meetings";
import { processPendingTranscriptions, purgeOldAudio } from "@/lib/transcribe";

// Cada minuto envía los resúmenes de avisos que ya cumplieron su ventana (personas y canales de proyecto).
// Si hay varias copias del servidor no pasa nada: cada pendiente se reclama una sola vez.
// DISABLE_NOTIF_TIMER=1 lo apaga (por ejemplo, en las pruebas).
const g = globalThis as unknown as { __notifTimer?: ReturnType<typeof setInterval> };
if (process.env.DISABLE_NOTIF_TIMER !== "1" && !g.__notifTimer) {
  g.__notifTimer = setInterval(async () => {
    try {
      const now = new Date();
      await flushNotifications(now);
      await flushProjectFeeds(now);
      await flushMeetingReminders(now);
      await processPendingTranscriptions();
      if (now.getMinutes() === 0) await purgeOldAudio(now);
    } catch (err) {
      console.error("[avisos] temporizador:", err);
    }
  }, 60_000);
  g.__notifTimer.unref?.();
}
