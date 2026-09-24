import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { UserProfile, GuardShift } from '../types';

interface AsistenciaRegistro {
  id: string;
  user_id: string;
  nombre_completo: string;
  codigo_operador: string;
  fecha: string;
  hora_entrada: string;
  hora_salida?: string;
  hora_salida_diligencia?: string;
  hora_retorno_diligencia?: string;
  estado_puntualidad: 'puntual' | 'retraso';
  distancia_metros: number;
  en_diligencia?: boolean;
}

interface DashboardScreenProps {
  profile: UserProfile;
  allProfiles: UserProfile[];
  guardShifts: GuardShift[];
  onTogglePresencia: () => void;
  onRefreshData: () => void;
  onGoToNovedades: () => void;
  onGoToGuardias: () => void;
}

// Coordenadas oficiales CCCT VEN 911 Falcón (Coro)
const COORD_VEN911 = {
  latitud: 11.406100183444154,
  longitud: -69.67846048998261,
  radio_metros: 100,
};

// Lista de Roles / Cargos del VEN 911
const CARGOS_DISPONIBLES = [
  'Coordinador de Tecnología',
  'Analista Programador',
  'Soporte Técnico',
  'Supervisor de Guardia',
  'Operador Integral 911',
  'Despachador de Seguridad',
  'Despachador de Salud / URI',
  'Despachador de Bomberos / PC'
];

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const rad1 = (lat1 * Math.PI) / 180;
  const rad2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad1) * Math.cos(rad2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export default function DashboardScreen({
  profile,
  allProfiles,
  guardShifts,
  onTogglePresencia,
  onRefreshData,
  onGoToNovedades,
  onGoToGuardias,
}: DashboardScreenProps) {
  // ✅ CORRECTO (quita el error de TypeScript):
const esAdmin =
  profile.rol === 'super_admin' ||
  profile.rol === 'super_usuario';
  
  // Control de Ventanas Sub-Módulos ('menu' | 'asistencia' | 'horario' | 'redes' | 'personal')
  const [subVentana, setSubVentana] = useState<'menu' | 'asistencia' | 'horario' | 'redes' | 'personal'>('menu');

  // Asistencia y Geocerca
  const [distanciaActual, setDistanciaActual] = useState<number | null>(null);
  const [verificandoGps, setVerificandoGps] = useState<boolean>(false);
  const [miAsistencia, setMiAsistencia] = useState<AsistenciaRegistro | null>(null);
  const [asistenciasAdmin, setAsistenciasAdmin] = useState<AsistenciaRegistro[]>([]);

  // Diagrama de Red
  const [diagramaUrl, setDiagramaUrl] = useState<string | null>(null);
  const [subiendoDiagrama, setSubiendoDiagrama] = useState<boolean>(false);

  // Formulario Rol de Guardia (Admin)
  const [tipoGuardia, setTipoGuardia] = useState<'operativa' | 'administrativa'>('operativa');
  const [horaEntrada, setHoraEntrada] = useState<string>('08:00');
  const [horaSalida, setHoraSalida] = useState<string>('18:00');
  const [fechaGuardia, setFechaGuardia] = useState<string>(new Date().toISOString().split('T')[0]);
  const [soporte1, setSoporte1] = useState<string>('');
  const [soporte2, setSoporte2] = useState<string>('');
  const [relevo, setRelevo] = useState<string>('');
  const [guardandoTurno, setGuardandoTurno] = useState<boolean>(false);

  // Formulario y Edición de Personal (Admin)
  const [newStaffCode, setNewStaffCode] = useState<string>('');
  const [newStaffCedula, setNewStaffCedula] = useState<string>('');
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffCargo, setNewStaffCargo] = useState<string>(CARGOS_DISPONIBLES[0]);
  const [creatingStaff, setCreatingStaff] = useState<boolean>(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [modalCargoVisible, setModalCargoVisible] = useState<boolean>(false);

  useEffect(() => {
    cargarDiagrama();
    cargarAsistenciaHoy();
    if (esAdmin) cargarAsistenciasAdmin();
  }, []);

  const cargarDiagrama = async () => {
    const { data } = await supabase.from('sala_datos').select('imagen_url').eq('id', 'principal').maybeSingle();
    if (data && data.imagen_url) setDiagramaUrl(data.imagen_url);
  };

  const cargarAsistenciaHoy = async () => {
    const fechaActual = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('asistencia')
      .select('*')
      .eq('user_id', profile.id)
      .eq('fecha', fechaActual)
      .maybeSingle();

    if (data) setMiAsistencia(data as AsistenciaRegistro);
  };

  const cargarAsistenciasAdmin = async () => {
    const fechaActual = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('asistencia')
      .select('*')
      .eq('fecha', fechaActual)
      .order('created_at', { ascending: false });

    if (data) setAsistenciasAdmin(data as AsistenciaRegistro[]);
  };

  // 📍 GPS: ENTRADA / SALIDA / DILIGENCIA
  const verificarGpsYMarcar = async () => {
    setVerificandoGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS Requerido', 'Concede permiso de ubicación para validar que estás en el CCCT VEN 911.');
        setVerificandoGps(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const dist = calcularDistancia(loc.coords.latitude, loc.coords.longitude, COORD_VEN911.latitud, COORD_VEN911.longitud);
      setDistanciaActual(dist);

      const now = new Date();
      const horaStr = now.toTimeString().split(' ')[0].substring(0, 5);
      const fechaStr = now.toISOString().split('T')[0];

      if (dist <= COORD_VEN911.radio_metros) {
        if (!miAsistencia) {
          const esPuntual = now.getHours() < 8 || (now.getHours() === 8 && now.getMinutes() <= 15) || (now.getHours() === 18 && now.getMinutes() <= 15);
          const puntualidad = esPuntual ? 'puntual' : 'retraso';

          const { data, error } = await supabase.from('asistencia').insert([
            {
              user_id: profile.id,
              nombre_completo: profile.nombre_completo,
              codigo_operador: profile.codigo_operador,
              fecha: fechaStr,
              hora_entrada: horaStr,
              estado_puntualidad: puntualidad,
              distancia_metros: dist,
              en_diligencia: false,
            },
          ]).select().single();

          if (!error && data) {
            setMiAsistencia(data as AsistenciaRegistro);
            Alert.alert('✅ Entrada Registrada', `Llegada a las ${horaStr} (${puntualidad.toUpperCase()})\nDistancia: ${dist}m.`);
          }
        } else if (miAsistencia.en_diligencia) {
          const { data, error } = await supabase
            .from('asistencia')
            .update({ en_diligencia: false, hora_retorno_diligencia: horaStr })
            .eq('id', miAsistencia.id)
            .select()
            .single();

          if (!error && data) {
            setMiAsistencia(data as AsistenciaRegistro);
            Alert.alert('🔄 Retorno de Diligencia', `De regreso en el puesto a las ${horaStr}.`);
          }
        } else {
          Alert.alert('En Sede', `Estás dentro del VEN 911 (${dist}m). Entrada registrada: ${miAsistencia.hora_entrada}.`);
        }
      } else {
        if (miAsistencia && !miAsistencia.en_diligencia && !miAsistencia.hora_salida) {
          Alert.alert(
            '⚠️ Salida Detectada',
            `Estás a ${dist}m de la sede.\n¿Es una salida por diligencia de trabajo o tu salida final de guardia?`,
            [
              {
                text: 'Diligencia / Comisión',
                onPress: async () => {
                  const { data } = await supabase
                    .from('asistencia')
                    .update({ en_diligencia: true, hora_salida_diligencia: horaStr })
                    .eq('id', miAsistencia.id)
                    .select()
                    .single();
                  if (data) setMiAsistencia(data as AsistenciaRegistro);
                },
              },
              {
                text: 'Salida de Guardia (Final)',
                style: 'destructive',
                onPress: async () => {
                  const { data } = await supabase
                    .from('asistencia')
                    .update({ hora_salida: horaStr, en_diligencia: false })
                    .eq('id', miAsistencia.id)
                    .select()
                    .single();
                  if (data) setMiAsistencia(data as AsistenciaRegistro);
                },
              },
            ]
          );
        } else {
          Alert.alert('Fuera de Rango', `Estás a ${dist}m del CCCT VEN 911 (Límite: 100m).`);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setVerificandoGps(false);
      if (esAdmin) cargarAsistenciasAdmin();
    }
  };

  const pickDiagramImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!res.canceled && res.assets && res.assets[0]) {
      const uri = res.assets[0].uri;
      setSubiendoDiagrama(true);
      await supabase.from('sala_datos').upsert({ id: 'principal', imagen_url: uri, updated_at: new Date().toISOString() });
      setSubiendoDiagrama(false);
      setDiagramaUrl(uri);
      Alert.alert('Guardado', 'Diagrama actualizado en la sala de datos.');
    }
  };

  const handleGuardarTurno = async () => {
    const s1 = allProfiles.find((p) => p.id === soporte1);
    const s2 = allProfiles.find((p) => p.id === soporte2);

    if (tipoGuardia === 'operativa' && (!s1 || !s2)) {
      Alert.alert('Atención', 'Selecciona los 2 soportes de tecnología para la guardia.');
      return;
    }

    setGuardandoTurno(true);
    await supabase.from('guard_shifts').insert([
      {
        tipo_guardia: tipoGuardia,
        esquema: tipoGuardia === 'operativa' ? '10/72' : 'Admin (L-M-V)',
        soporte_1_id: s1?.id || profile.id,
        soporte_2_id: s2?.id || null,
        soporte_1_nombre: s1?.nombre_completo || profile.nombre_completo,
        soporte_2_nombre: s2?.nombre_completo || 'N/A (Administrativo)',
        fecha: fechaGuardia,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        relevo_nombre: relevo.trim() || 'Relevo programado',
        puesto_ubicacion: 'Sala de Datos / CCCT VEN 911',
      },
    ]);
    setGuardandoTurno(false);
    Alert.alert('Éxito', 'Guardia programada.');
    setRelevo('');
    onRefreshData();
  };

  // Cargar datos al formulario para editar
  const handleIniciarEdicion = (p: UserProfile) => {
    setEditingStaffId(p.id);
    setNewStaffCode(p.codigo_operador || '');
    setNewStaffCedula(p.cedula || '');
    setNewStaffName(p.nombre_completo || '');
    setNewStaffCargo(p.cargo || CARGOS_DISPONIBLES[0]);
  };

  const handleCancelarEdicion = () => {
    setEditingStaffId(null);
    setNewStaffCode('');
    setNewStaffCedula('');
    setNewStaffName('');
    setNewStaffCargo(CARGOS_DISPONIBLES[0]);
  };

  // Guardar nuevo o actualizar existente
  const handleGuardarPersonal = async () => {
    const code = newStaffCode.trim();
    const ced = newStaffCedula.replace(/[^0-9]/g, '');
    if (code.length !== 4 || !ced || !newStaffName.trim()) {
      Alert.alert('Error', 'Completa código (4 dígitos), cédula y nombre.');
      return;
    }

    setCreatingStaff(true);

    if (editingStaffId) {
      // Actualizar personal existente
      const { error } = await supabase
        .from('profiles')
        .update({
          codigo_operador: code,
          cedula: ced,
          nombre_completo: newStaffName.trim(),
          cargo: newStaffCargo.trim(),
        })
        .eq('id', editingStaffId);

      setCreatingStaff(false);
      if (!error) {
        Alert.alert('Actualizado', `Datos de ${newStaffName.trim()} actualizados correctamente.`);
        handleCancelarEdicion();
        onRefreshData();
      } else {
        Alert.alert('Error', error.message);
      }
    } else {
      // Registrar nuevo personal
      const { error } = await supabase.from('profiles').insert([
        {
          codigo_operador: code,
          cedula: ced,
          nombre_completo: newStaffName.trim(),
          cargo: newStaffCargo.trim(),
          rol: 'usuario',
          estado_presencia: 'ausente',
          ubicacion: 'CCCT VEN 911 Falcón',
        },
      ]);

      setCreatingStaff(false);
      if (!error) {
        Alert.alert('Creado', `Operador ${code} registrado exitosamente.`);
        handleCancelarEdicion();
        onRefreshData();
      } else {
        Alert.alert('Error', error.message);
      }
    }
  };

  // Determinar estado: EN TURNO (en radio de la sede), CONECTADO (fuera de sede) o NO CONECTADO
  const obtenerEstadoOperador = (p: UserProfile) => {
    const asistenciaHoy = asistenciasAdmin.find((a) => a.user_id === p.id && !a.hora_salida);
    const estaActivo = p.estado_presencia === 'activo' || !!asistenciaHoy;

    if (!estaActivo) {
      return { label: 'NO CONECTADO', bg: '#dc2626' }; // Rojo
    }

    // Comprobar si está en el radio de la sede
    const distancia = (p as any).distancia_metros ?? asistenciaHoy?.distancia_metros;
    if (distancia !== undefined && distancia !== null && distancia <= COORD_VEN911.radio_metros) {
      return { label: 'EN TURNO', bg: '#16a34a' }; // Verde: en radio de sede
    }

    // Está activo/conectado pero fuera del radio de la sede
    return { label: 'CONECTADO', bg: '#2563eb' }; // Azul
  };

  const misGuardias = guardShifts.filter((g) => g.soporte_1_id === profile.id || g.soporte_2_id === profile.id);

  // ==========================================================
  // VISTA 1: MENÚ PRINCIPAL
  // ==========================================================
  if (subVentana === 'menu') {
    return (
      <ScrollView contentContainerStyle={styles.containerPad}>
        <View style={styles.cardHeaderOperador}>
          <View style={{ flex: 1 }}>
            <Text style={styles.labelOperador}>OPERADOR EN LÍNEA</Text>
            <Text style={styles.nombreOperador}>{profile.nombre_completo}</Text>
            <Text style={styles.cargoOperador}>
              Cod: {profile.codigo_operador || '0911'} • {profile.cargo}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.botonPresenciaMini, profile.estado_presencia === 'activo' ? styles.bgActivo : styles.bgAusente]}
            onPress={onTogglePresencia}
          >
            <Text style={styles.textoPresenciaMini}>
              {profile.estado_presencia === 'activo' ? 'EN TURNO' : 'AUSENTE'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tituloSeccion}>Módulos Operativos</Text>
        <Text style={styles.subtituloSeccion}>Selecciona una opción para abrir su ventana dedicada:</Text>

        <TouchableOpacity style={styles.menuCard} onPress={() => setSubVentana('asistencia')}>
          <View style={styles.iconCircle}><Text style={styles.iconText}>📍</Text></View>
          <View style={styles.menuCardBody}>
            <Text style={styles.menuCardTitle}>Asistencia y Geocerca GPS</Text>
            <Text style={styles.menuCardDesc}>Marcado de entrada a 100m del VEN 911, puntualidad y salidas de comisión.</Text>
          </View>
          <Text style={styles.arrowText}>➔</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuCard} onPress={() => setSubVentana('horario')}>
          <View style={styles.iconCircle}><Text style={styles.iconText}>📅</Text></View>
          <View style={styles.menuCardBody}>
            <Text style={styles.menuCardTitle}>Rol de Guardia y Horarios</Text>
            <Text style={styles.menuCardDesc}>Guardias 10/72, parejas de tecnología, relevos y horario administrativo.</Text>
          </View>
          <Text style={styles.arrowText}>➔</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuCard} onPress={() => setSubVentana('redes')}>
          <View style={styles.iconCircle}><Text style={styles.iconText}>🔌</Text></View>
          <View style={styles.menuCardBody}>
            <Text style={styles.menuCardTitle}>Sala de Datos y Conexiones</Text>
            <Text style={styles.menuCardDesc}>Diagrama de topología de red y visor oficial de la sala de servidores.</Text>
          </View>
          <Text style={styles.arrowText}>➔</Text>
        </TouchableOpacity>

        {/* BOTÓN 4: GESTIÓN DE PERSONAL (SOLO ADMIN / MODO CONTROL) */}
        {esAdmin && (
          <TouchableOpacity style={styles.menuCard} onPress={() => setSubVentana('personal')}>
            <View style={[styles.iconCircle, { backgroundColor: '#1e3a8a' }]}><Text style={styles.iconText}>👥</Text></View>
            <View style={styles.menuCardBody}>
              <Text style={styles.menuCardTitle}>Gestión de Personal y Turnos</Text>
              <Text style={styles.menuCardDesc}>Monitor en vivo de operadores y registro de personal.</Text>
            </View>
            <Text style={styles.arrowText}>➔</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ==========================================================
  // VISTA 2: ASISTENCIA Y GEOCERCA GPS
  // ==========================================================
  if (subVentana === 'asistencia') {
    return (
      <ScrollView contentContainerStyle={styles.containerPad}>
        <TouchableOpacity style={styles.botonVolver} onPress={() => setSubVentana('menu')}>
          <Text style={styles.textoVolver}>← Volver al Menú</Text>
        </TouchableOpacity>

        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>📍 Control de Asistencia Georreferenciada</Text>
          <Text style={styles.panelDesc}>
            Ubicación objetivo: <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>CCCT VEN 911 Coro</Text> (Calle Garcés c/c Federación).
          </Text>

          {distanciaActual !== null && (
            <View style={[styles.statusBox, distanciaActual <= 100 ? styles.statusBoxVerde : styles.statusBoxRojo]}>
              <Text style={styles.statusBoxText}>
                {distanciaActual <= 100
                  ? `✅ Estás en la sede (a ${distanciaActual} metros)`
                  : `❌ Fuera de rango (a ${distanciaActual} metros)`}
              </Text>
            </View>
          )}

          <View style={styles.rowDato}>
            <Text style={styles.rowLabel}>Hora de Entrada:</Text>
            <Text style={styles.rowValue}>
              {miAsistencia?.hora_entrada
                ? `${miAsistencia.hora_entrada} (${miAsistencia.estado_puntualidad.toUpperCase()})`
                : 'Pendiente'}
            </Text>
          </View>

          {miAsistencia?.en_diligencia && (
            <View style={styles.rowDato}>
              <Text style={styles.rowLabel}>Estado de Comisión:</Text>
              <Text style={[styles.rowValue, { color: '#facc15' }]}>
                En diligencia desde las {miAsistencia.hora_salida_diligencia}
              </Text>
            </View>
          )}

          <View style={styles.rowDato}>
            <Text style={styles.rowLabel}>Hora de Salida:</Text>
            <Text style={styles.rowValue}>{miAsistencia?.hora_salida || 'En guardia'}</Text>
          </View>

          <TouchableOpacity
            style={[styles.botonAccionPrincipal, verificandoGps && { opacity: 0.6 }]}
            onPress={verificarGpsYMarcar}
            disabled={verificandoGps}
          >
            {verificandoGps ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.botonAccionTexto}>📡 MARCAR ASISTENCIA CON GPS</Text>
            )}
          </TouchableOpacity>
        </View>

        {esAdmin && (
          <View style={styles.panelCard}>
            <Text style={styles.panelTitle}>📋 Registro de Asistencias Hoy ({asistenciasAdmin.length})</Text>
            {asistenciasAdmin.map((a) => (
              <View key={a.id} style={styles.itemLista}>
                <View>
                  <Text style={styles.itemTitulo}>{a.nombre_completo}</Text>
                  <Text style={styles.itemSub}>
                    Entrada: {a.hora_entrada} • {a.hora_salida ? `Salida: ${a.hora_salida}` : a.en_diligencia ? 'En Diligencia' : 'En Puesto'}
                  </Text>
                </View>
                <View style={[styles.pillBadge, a.estado_puntualidad === 'puntual' ? styles.bgActivo : styles.bgAusente]}>
                  <Text style={styles.pillText}>{a.estado_puntualidad.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ==========================================================
  // VISTA 3: HORARIO Y ROL DE GUARDIA
  // ==========================================================
  if (subVentana === 'horario') {
    return (
      <ScrollView contentContainerStyle={styles.containerPad}>
        <TouchableOpacity style={styles.botonVolver} onPress={() => setSubVentana('menu')}>
          <Text style={styles.textoVolver}>← Volver al Menú</Text>
        </TouchableOpacity>

        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>⏰ Mi Próxima Guardia Asignada</Text>
          {misGuardias.length === 0 ? (
            <Text style={styles.textoVacio}>No tienes guardias asignadas en el cronograma.</Text>
          ) : (
            misGuardias.slice(0, 1).map((g) => (
              <View key={g.id} style={{ marginTop: 6 }}>
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>📅 Fecha: {g.fecha}</Text>
                <Text style={{ color: '#67e8f9', marginTop: 4 }}>Turno: {g.hora_entrada} a {g.hora_salida} ({g.esquema})</Text>
                <Text style={{ color: '#a7f3d0', marginTop: 4 }}>👥 Pareja: {g.soporte_1_nombre} & {g.soporte_2_nombre}</Text>
                <Text style={{ color: '#facc15', marginTop: 4 }}>🔄 Relevo ({g.hora_salida}): {g.relevo_nombre}</Text>
              </View>
            ))
          )}
        </View>

        {esAdmin && (
          <View style={styles.panelCard}>
            <Text style={styles.panelTitle}>⚙️ Programar Guardia (Admin)</Text>

            <View style={styles.tabModoRow}>
              <TouchableOpacity
                style={[styles.tabModoBtn, tipoGuardia === 'operativa' && styles.tabModoBtnActivo]}
                onPress={() => { setTipoGuardia('operativa'); setHoraEntrada('08:00'); setHoraSalida('18:00'); }}
              >
                <Text style={styles.tabModoText}>10/72 Operativa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabModoBtn, tipoGuardia === 'administrativa' && styles.tabModoBtnActivo]}
                onPress={() => { setTipoGuardia('administrativa'); setHoraEntrada('08:00'); setHoraSalida('12:00'); }}
              >
                <Text style={styles.tabModoText}>Admin (L-M-V)</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Entrada</Text>
                <TextInput style={styles.inputField} value={horaEntrada} onChangeText={setHoraEntrada} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Salida</Text>
                <TextInput style={styles.inputField} value={horaSalida} onChangeText={setHoraSalida} />
              </View>
            </View>

            <Text style={styles.inputLabel}>Fecha de Guardia</Text>
            <TextInput style={styles.inputField} value={fechaGuardia} onChangeText={setFechaGuardia} />

            {tipoGuardia === 'operativa' && (
              <>
                <Text style={styles.inputLabel}>Soporte Técnico 1</Text>
                <View style={styles.chipsContainer}>
                  {allProfiles.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chipItem, soporte1 === p.id && styles.chipItemActivo]}
                      onPress={() => setSoporte1(p.id)}
                    >
                      <Text style={styles.chipText}>{p.nombre_completo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Soporte Técnico 2 (Pareja)</Text>
                <View style={styles.chipsContainer}>
                  {allProfiles.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chipItem, soporte2 === p.id && styles.chipItemActivo]}
                      onPress={() => setSoporte2(p.id)}
                    >
                      <Text style={styles.chipText}>{p.nombre_completo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>Relevo de las {horaSalida}</Text>
            <TextInput style={styles.inputField} placeholder="Turno Nocturno" placeholderTextColor="#6ee7b7" value={relevo} onChangeText={setRelevo} />

            <TouchableOpacity style={styles.botonAccionPrincipal} onPress={handleGuardarTurno} disabled={guardandoTurno}>
              <Text style={styles.botonAccionTexto}>{guardandoTurno ? 'Guardando...' : 'PUBLICAR GUARDIA'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>Cronograma General de Turnos ({guardShifts.length})</Text>
          {guardShifts.map((g) => (
            <View key={g.id} style={styles.itemGuardia}>
              <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>📅 {g.fecha} ({g.hora_entrada} a {g.hora_salida})</Text>
              <Text style={{ color: '#4ade80', marginTop: 4 }}>Soportes: {g.soporte_1_nombre} & {g.soporte_2_nombre}</Text>
              <Text style={{ color: '#facc15', fontSize: 12, marginTop: 2 }}>Relevo: {g.relevo_nombre}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ==========================================================
  // VISTA 4: SALA DE DATOS Y REDES
  // ==========================================================
  if (subVentana === 'redes') {
    return (
      <ScrollView contentContainerStyle={styles.containerPad}>
        <TouchableOpacity style={styles.botonVolver} onPress={() => setSubVentana('menu')}>
          <Text style={styles.textoVolver}>← Volver al Menú</Text>
        </TouchableOpacity>

        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>🔌 Diagrama de Red - Sala de Datos</Text>
          <Text style={styles.panelDesc}>Plano de topología física y conexiones del CCCT VEN 911:</Text>

          {diagramaUrl ? (
            <Image source={{ uri: diagramaUrl }} style={styles.imagenDiagrama} resizeMode="contain" />
          ) : (
            <View style={styles.cajaSinDiagrama}>
              <Text style={{ color: '#86efac', fontStyle: 'italic' }}>Aún no se ha cargado el plano de la sala de datos.</Text>
            </View>
          )}

          {esAdmin && (
            <TouchableOpacity style={styles.botonAccionPrincipal} onPress={pickDiagramImage} disabled={subiendoDiagrama}>
              <Text style={styles.botonAccionTexto}>{subiendoDiagrama ? 'Cargando imagen...' : '📷 CARGAR NUEVO DIAGRAMA'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  }

  // ==========================================================
  // VISTA 5: MONITOR DE PERSONAL Y REGISTRO (SOLO ADMIN)
  // ==========================================================
  if (subVentana === 'personal') {
    // Protección estricta: Solo Admin / Modo Control puede ver esta vista
    if (!esAdmin) {
      return (
        <ScrollView contentContainerStyle={styles.containerPad}>
          <TouchableOpacity style={styles.botonVolver} onPress={() => setSubVentana('menu')}>
            <Text style={styles.textoVolver}>← Volver al Menú</Text>
          </TouchableOpacity>
          <View style={[styles.panelCard, { borderColor: '#dc2626' }]}>
            <Text style={[styles.panelTitle, { color: '#f87171' }]}>Acceso Restringido</Text>
            <Text style={styles.panelDesc}>Solo los administradores tienen acceso a este módulo.</Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.containerPad}>
        <TouchableOpacity style={styles.botonVolver} onPress={() => setSubVentana('menu')}>
          <Text style={styles.textoVolver}>← Volver al Menú</Text>
        </TouchableOpacity>

        {/* MONITOR DE PERSONAL EN VIVO */}
        <View style={styles.panelCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.panelTitle}>👥 Monitor de Personal en Vivo</Text>
            <Text style={{ fontSize: 16, color: '#86a89a' }}>⚙️</Text>
          </View>

          {allProfiles.map((p) => {
            const estado = obtenerEstadoOperador(p);

            return (
              <View key={p.id} style={styles.itemLista}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitulo}>{p.nombre_completo}</Text>
                  <Text style={styles.itemSub}>
                    {p.cargo} • Cod: {p.codigo_operador || 'N/A'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* Badge Dinámico: EN TURNO (en sede), CONECTADO (fuera de sede) o NO CONECTADO */}
                  <View style={[styles.pillBadge, { backgroundColor: estado.bg }]}>
                    <Text style={styles.pillText}>{estado.label}</Text>
                  </View>

                  {/* Botón para editar a cualquier personal */}
                  <TouchableOpacity
                    onPress={() => handleIniciarEdicion(p)}
                    style={styles.btnEditar}
                  >
                    <Text style={{ fontSize: 13 }}>✏️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* FORMULARIO DE REGISTRO / EDICIÓN */}
        <View style={styles.panelCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.panelTitle}>
              {editingStaffId ? '✏️ Editar Personal' : '+ Registrar Nuevo Personal'}
            </Text>
            {editingStaffId && (
              <TouchableOpacity onPress={handleCancelarEdicion}>
                <Text style={{ color: '#f87171', fontWeight: 'bold', fontSize: 12 }}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.inputLabel}>Código (4 dígitos)</Text>
          <TextInput
            style={styles.inputField}
            placeholder="1003"
            placeholderTextColor="#6ee7b7"
            value={newStaffCode}
            onChangeText={setNewStaffCode}
            maxLength={4}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Cédula</Text>
          <TextInput
            style={styles.inputField}
            placeholder="28456123"
            placeholderTextColor="#6ee7b7"
            value={newStaffCedula}
            onChangeText={setNewStaffCedula}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Nombre Completo</Text>
          <TextInput
            style={styles.inputField}
            placeholder="Ing. Pedro Pérez"
            placeholderTextColor="#6ee7b7"
            value={newStaffName}
            onChangeText={setNewStaffName}
          />

          {/* SELECTOR DE ROL / CARGO */}
          <Text style={styles.inputLabel}>Rol / Cargo</Text>
          <TouchableOpacity
            style={styles.selectorDropdown}
            onPress={() => setModalCargoVisible(true)}
          >
            <Text style={{ color: '#ffffff', fontSize: 14 }}>{newStaffCargo}</Text>
            <Text style={{ color: '#34d399', fontSize: 11 }}>▼</Text>
          </TouchableOpacity>

          {/* BOTÓN GUARDAR / ACTUALIZAR */}
          <TouchableOpacity
            style={styles.botonAccionPrincipal}
            onPress={handleGuardarPersonal}
            disabled={creatingStaff}
          >
            <Text style={styles.botonAccionTexto}>
              {creatingStaff
                ? 'Guardando...'
                : editingStaffId
                ? 'ACTUALIZAR PERSONAL'
                : 'GUARDAR OPERADOR'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* MODAL SELECTOR DE CARGOS */}
        <Modal visible={modalCargoVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Seleccionar Rol / Cargo</Text>
              {CARGOS_DISPONIBLES.map((cargo) => (
                <TouchableOpacity
                  key={cargo}
                  style={[
                    styles.modalOpcion,
                    newStaffCargo === cargo && styles.modalOpcionActiva,
                  ]}
                  onPress={() => {
                    setNewStaffCargo(cargo);
                    setModalCargoVisible(false);
                  }}
                >
                  <Text style={styles.modalOpcionTexto}>{cargo}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalBtnCerrar}
                onPress={() => setModalCargoVisible(false)}
              >
                <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  containerPad: { padding: 16, paddingBottom: 110, backgroundColor: '#04271c' },
  cardHeaderOperador: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064230',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0a5c43',
    marginBottom: 20,
  },
  labelOperador: { color: '#a7f3d0', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  nombreOperador: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  cargoOperador: { color: '#4ade80', fontSize: 12, marginTop: 2 },
  botonPresenciaMini: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  textoPresenciaMini: { color: '#ffffff', fontWeight: 'bold', fontSize: 11 },
  bgActivo: { backgroundColor: '#16a34a' },
  bgAusente: { backgroundColor: '#dc2626' },
  tituloSeccion: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtituloSeccion: { color: '#a7f3d0', fontSize: 12, marginBottom: 16 },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064230',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0a5c43',
    marginBottom: 12,
  },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#03251a', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  iconText: { fontSize: 20 },
  menuCardBody: { flex: 1 },
  menuCardTitle: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  menuCardDesc: { color: '#d1fae5', fontSize: 12, marginTop: 2 },
  arrowText: { color: '#4ade80', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  botonVolver: { marginBottom: 14 },
  textoVolver: { color: '#4ade80', fontWeight: 'bold', fontSize: 15 },
  panelCard: { backgroundColor: '#064230', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#0a5c43', marginBottom: 16 },
  panelTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  panelDesc: { color: '#d1fae5', fontSize: 13, marginBottom: 14 },
  statusBox: { padding: 12, borderRadius: 8, marginBottom: 12, alignItems: 'center' },
  statusBoxVerde: { backgroundColor: '#065f46' },
  statusBoxRojo: { backgroundColor: '#7f1d1d' },
  statusBoxText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  rowDato: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#08533c' },
  rowLabel: { color: '#a7f3d0', fontSize: 13 },
  rowValue: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  botonAccionPrincipal: { backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 14 },
  botonAccionTexto: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  itemLista: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#08533c' },
  itemTitulo: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  itemSub: { color: '#a7f3d0', fontSize: 11, marginTop: 2 },
  pillBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  btnEditar: { backgroundColor: '#093626', padding: 6, borderRadius: 8 },
  textoVacio: { color: '#a7f3d0', fontStyle: 'italic', marginVertical: 6 },
  tabModoRow: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  tabModoBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#03251a', alignItems: 'center', borderWidth: 1, borderColor: '#0a5c43' },
  tabModoBtnActivo: { backgroundColor: '#16a34a', borderColor: '#4ade80' },
  tabModoText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  inputLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  inputField: { backgroundColor: '#031f16', borderWidth: 1, borderColor: '#0a5c43', borderRadius: 8, color: '#ffffff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  selectorDropdown: { backgroundColor: '#031f16', borderWidth: 1, borderColor: '#0a5c43', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chipItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#03251a', borderWidth: 1, borderColor: '#0a5c43' },
  chipItemActivo: { backgroundColor: '#16a34a', borderColor: '#4ade80' },
  chipText: { color: '#ffffff', fontSize: 12 },
  itemGuardia: { backgroundColor: '#03251a', padding: 12, borderRadius: 8, marginTop: 10 },
  imagenDiagrama: { width: '100%', height: 260, borderRadius: 8, backgroundColor: '#031f16' },
  cajaSinDiagrama: { height: 140, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#0a5c43', borderStyle: 'dashed', borderRadius: 8 },
  // Modal de Selector de Cargos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#064230', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#0a5c43' },
  modalTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  modalOpcion: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#08533c' },
  modalOpcionActiva: { backgroundColor: '#0a5c43', borderRadius: 6, paddingHorizontal: 8 },
  modalOpcionTexto: { color: '#ffffff', fontSize: 14 },
  modalBtnCerrar: { backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 14 },
});