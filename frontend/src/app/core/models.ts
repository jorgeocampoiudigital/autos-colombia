export type EstadoPago = 'AL_DIA' | 'POR_VENCER' | 'EN_MORA' | 'PENDIENTE';
export type EstadoCelda = 'OCUPADA' | 'VACIA_ASIGNADA' | 'DISPONIBLE' | 'FUERA_SERVICIO';
export type EstadoNovedad = 'ABIERTA' | 'SEGUIMIENTO' | 'CERRADA';
export type TipoNovedad = 'OBSERVACION' | 'DANO' | 'OBJETO_OLVIDADO' | 'INCIDENTE' | 'OTRO';
export type MedioPago = 'TRANSFERENCIA' | 'EFECTIVO' | 'TARJETA' | 'OTRO';
export type Rol = 'ADMIN' | 'OPERADOR';

export interface Operador { id: number; nombre: string; usuario: string; rol: Rol; }
export interface LoginResp { token: string; operador: Operador; }

export interface Pagina<T> { total: number; page: number; per_page: number; items: T[]; }

export interface CeldaResumen {
  id_celda: number; codigo: string; fila: string; tipo: string; estado: EstadoCelda;
  placa_presente: string | null; mensualidad: string | null; placa_asignada: string | null; cliente: string | null;
}
export interface FueraServicio { id_celda: number; codigo: string; motivo: string; fecha_inicio: string; }
export interface CeldasResp {
  total: number; resumen: Record<EstadoCelda, number>; celdas: CeldaResumen[]; fuera_servicio: FueraServicio[];
}
export interface CeldaDetalle extends CeldaResumen {
  ocupacion_fisica: 'OCUPADA' | 'VACIA'; asignacion_mensual: 'ASIGNADA' | 'SIN_ASIGNACION';
  mensualidad_relacionada: {
    id_mensualidad: number; codigo: string; id_usuario: number; cliente: string; placa: string;
    fecha_inicio: string; fecha_fin: string; valor_mensual: number; estado_pago: EstadoPago; saldo: number;
  } | null;
  ultimo_movimiento: { movimiento: 'ENTRADA' | 'SALIDA'; fecha_hora: string; placa: string } | null;
  mantenimiento: { motivo: string; fecha_inicio: string } | null;
}

export interface Movimiento {
  id_movimiento: number; placa: string; tipo: string; cliente: string; celda: string; fecha_entrada: string;
  fecha_salida: string | null; observacion: string | null; operador_entrada: string; operador_salida: string | null;
  estado_pago: EstadoPago | null;
}
export interface EventoHistorial {
  id_movimiento: number; fecha_hora: string; placa: string; movimiento: 'ENTRADA' | 'SALIDA'; celda: string;
  responsable: string; observacion: string | null; cliente: string;
}
export interface ConsultaPlaca {
  placa: string; registrada: boolean; puede_ingresar: boolean; mensaje: string; presente?: boolean;
  cliente?: string;
  vehiculo?: { placa: string; tipo: string; marca: string | null; linea: string | null; color: string | null; anio_modelo: number | null; id_usuario: number };
  mensualidad?: { codigo: string; fecha_fin: string; celda: string; estado_pago: EstadoPago; id_celda: number } | null;
  movimiento_abierto?: { id_movimiento: number; fecha_entrada: string; celda: string } | null;
  celda_sugerida?: { id_celda: number; codigo: string; asignada: boolean } | null;
}
export interface KpisHoy { entradas_hoy: number; salidas_hoy: number; presentes: number; }

export interface ClienteFila {
  id_usuario: number; nombre: string; tipo_documento: string; documento: string; telefono: string | null;
  activo: boolean; placa: string | null; celda: string | null; estado_pago: EstadoPago | null;
}
export interface VehiculoCliente {
  placa: string; tipo: string; marca: string | null; linea: string | null; color: string | null;
  anio_modelo: number | null; id_mensualidad: number | null; mensualidad: string | null; celda: string | null;
  fecha_inicio: string | null; fecha_fin: string | null; valor_mensual: number | null;
  estado_pago: EstadoPago | null; saldo: number | null;
}
export interface Ficha {
  id_usuario: number; nombre: string; tipo_documento: string; documento: string; telefono: string | null;
  email: string | null; direccion: string | null; activo: boolean; created_at: string; vehiculos: VehiculoCliente[];
}
export interface ClientesResp extends Pagina<ClienteFila> {
  kpis: { clientes: number; vehiculos: number; mensualidades_activas: number };
}
export interface VehiculoFila {
  placa: string; tipo: string; marca: string | null; linea: string | null; color: string | null;
  anio_modelo: number | null; id_usuario: number; cliente: string; celda: string | null; estado_pago: EstadoPago | null;
}
export interface MensualidadFila {
  id_mensualidad: number; codigo: string; id_usuario: number; cliente: string; placa: string; celda: string;
  fecha_inicio: string; fecha_fin: string; valor_mensual: number; vigente: boolean;
  estado_pago: EstadoPago | null; saldo: number | null;
}

export interface Cobro {
  id_cobro: number; codigo: string; periodo_inicio: string; periodo_fin: string; fecha_vencimiento: string;
  valor: number; pagado: number; saldo: number; estado: EstadoPago; mensualidad: string; placa: string;
  cliente: string; id_usuario: number; celda: string;
}
export interface Pago {
  id_pago: number; numero_recibo: string; fecha_pago: string; valor: number; medio: MedioPago;
  referencia: string | null; soporte_url: string | null; cobro: string; cliente: string; placa: string;
  recibido_por: string;
}
export interface KpisPagos {
  cobros: number; total: number; pagado: number; saldo: number; cobros_pagados: number;
  cobros_pendientes: number; saldo_mora: number; cobros_mora: number; porcentaje_pagado: number; periodo: string;
}

export interface NovedadFila {
  id_novedad: number; codigo: string; placa: string; tipo: TipoNovedad; titulo: string; descripcion: string;
  estado: EstadoNovedad; fecha_hora: string; fecha_cierre: string | null; responsable: string; cliente: string;
  celda: string | null;
}
export interface Novedad extends NovedadFila {
  evidencias: { nombre: string; url: string; mime_type: string | null }[];
  historial: { estado: EstadoNovedad; comentario: string | null; created_at: string; operador: string }[];
}
export interface NovedadesResp extends Pagina<NovedadFila> {
  conteos: { todas: number; abiertas: number; cerradas: number };
  kpis: { abiertas: number; seguimiento: number; cerradas_mes: number };
}

export interface Resumen {
  ocupacion_fisica: { ocupadas: number; total: number; porcentaje: number };
  vehiculos_presentes: number; entradas_hoy: number; salidas_hoy: number;
  mensualidades: { activas: number; al_dia: number; por_vencer: number; en_mora: number };
  saldo_pendiente: number; saldo_mora: number; celdas: CeldasResp;
  atencion: { mora: { cantidad: number; saldo: number }; fuera_servicio: string[]; novedades_abiertas: number; novedades_seguimiento: number };
  recaudo: { recaudado: number; porcentaje: number; cobros_pagados: number; cobros: number };
  movimientos_recientes: {
    total_hoy: number;
    items: { movimiento: 'ENTRADA' | 'SALIDA'; placa: string; cliente: string; celda: string; fecha_hora: string; registrado_por: string }[];
  };
}
