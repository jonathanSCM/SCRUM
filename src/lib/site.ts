// Datos públicos del sitio (landing, términos y privacidad). Se pueden cambiar con variables de entorno.
export const SITE = {
  name: "SCRUM ProShop",
  company: process.env.NEXT_PUBLIC_COMPANY_NAME || "ProShop",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "proshop.soporte@gmail.com",
  url: process.env.NEXTAUTH_URL || "https://scrum.proshop.lat",
  updated: "13 de noviembre de 2026",
};
