export function ok<T>(data: T) {
  return { success: true, data };
}

export function okMsg<T>(data: T, mensaje: string) {
  return { success: true, mensaje, data };
}
