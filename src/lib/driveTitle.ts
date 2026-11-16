import "server-only";

// El nombre de un documento de Drive (la lógica vive en scrum/driveFetch para que también la use el script de prisma/).
export { fetchDriveTitle } from "@/lib/scrum/driveFetch";
