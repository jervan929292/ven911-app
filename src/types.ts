export interface UserProfile {
  id: string;
  nombre_completo: string;
  cargo: string;
  rol: 'super_admin' | 'super_usuario' | 'usuario';
  estado_presencia: 'activo' | 'ausente';
  ubicacion: string;
  codigo_operador: string;
  cedula: string;
}

export interface GuardShift {
  id: string;
  tipo_guardia: 'operativa' | 'administrativa';
  esquema: string;
  soporte_1_id: string;
  soporte_2_id: string;
  soporte_1_nombre: string;
  soporte_2_nombre: string;
  fecha: string;
  hora_entrada: string;
  hora_salida: string;
  relevo_nombre: string;
  puesto_ubicacion: string;
}

export interface Novedad {
  id: string;
  membrete: string;
  fecha: string;
  hora: string;
  informe: string;
  soporte_guardia: string;
  imagen_url_1: string;
  imagen_url_2: string;
  registrado_por: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_nombre?: string;
  mensaje: string | null;
  adjunto_url?: string | null;
  created_at: string;
}

export interface ShiftChange {
  id: string;
  solicitante_id: string;
  solicitante_nombre?: string;
  solicitante_cedula?: string;
  suplente_id: string;
  suplente_nombre?: string;
  suplente_cedula?: string;
  motivo: string;
  fecha_guardia?: string;
  estado: 'pendiente_suplente' | 'rechazado_suplente' | 'esperando_admin' | 'aprobado_admin' | 'rechazado_admin';
  created_at?: string;
}

export interface Manual {
  id: string;
  titulo: string;
  pdf_url: string;
}