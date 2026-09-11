// Estos valores llegan tal cual desde el panel interno (son los enums de
// ahí) -- acá solo se traducen para mostrar, no se vuelven a interpretar.
export const TYPE_LABEL: Record<string, string> = {
  CAMBIO_NECESARIO: "Cambio necesario",
  CAMBIO_A_REALIZAR: "Cambio a realizar",
  CAMBIO_REALIZADO: "Cambio realizado",
  CAMBIO_PENDIENTE: "Cambio pendiente",
};

export const TYPE_COLOR: Record<string, string> = {
  CAMBIO_NECESARIO: "#b8461c",
  CAMBIO_A_REALIZAR: "#35506b",
  CAMBIO_REALIZADO: "#56684a",
  CAMBIO_PENDIENTE: "#9a8f7a",
};

export const PRIORITY_LABEL: Record<string, string> = {
  URGENTE: "Urgente",
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

export const PRIORITY_COLOR: Record<string, string> = {
  URGENTE: "#b8461c",
  ALTA: "#c17a2e",
  MEDIA: "#9a8f7a",
  BAJA: "#6b7d8f",
};

export const DONE_TYPE = "CAMBIO_REALIZADO";
