// Interruptores de funciones que se activan por variable de entorno.

// PDF del sprint con sugerencias de Gemini + envío a Slack. Apagado salvo que
// SPRINT_PDF_ENABLED sea exactamente "true".
export function sprintPdfEnabled(): boolean {
  return process.env.SPRINT_PDF_ENABLED === "true";
}
