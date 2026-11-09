// Se ejecuta una vez al arrancar el servidor (solo en Node, no en el entorno edge).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
