import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { UserProfile, ShiftChange } from '../types';

interface GuardiasScreenProps {
  profile: UserProfile;
  allProfiles: UserProfile[];
  shiftChanges: ShiftChange[];
  onRefreshGuardias: () => void;
}

export default function GuardiasScreen({
  profile,
  allProfiles,
  shiftChanges,
  onRefreshGuardias,
}: GuardiasScreenProps) {
  const esAdmin = profile.rol === 'super_admin' || profile.rol === 'super_usuario';

  // Buscador tipo Google
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suplenteSeleccionado, setSuplenteSeleccionado] = useState<UserProfile | null>(null);

  // Formulario
  const [motivo, setMotivo] = useState<string>('');
  const [fechaGuardia, setFechaGuardia] = useState<string>(new Date().toISOString().split('T')[0]);
  const [enviando, setEnviando] = useState<boolean>(false);

  // Filtro de compañeros por Nombre o Cédula (excluyendo al usuario actual)
  const companerosFiltrados = allProfiles.filter((p) => {
    if (p.id === profile.id) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return false;
    const coincideNombre = p.nombre_completo.toLowerCase().includes(q);
    const coincideCedula = (p.cedula || '').includes(q);
    return coincideNombre || coincideCedula;
  });

  // 1. Enviar Solicitud al Compañero (Paso 1)
  const handleSolicitar = async () => {
    if (!suplenteSeleccionado) {
      Alert.alert('Compañero Requerido', 'Busca y selecciona al compañero que cubrirá tu guardia.');
      return;
    }
    if (!motivo.trim()) {
      Alert.alert('Motivo Requerido', 'Escribe el motivo del cambio de guardia.');
      return;
    }

    setEnviando(true);

    const { error } = await supabase.from('shift_changes').insert([
      {
        solicitante_id: profile.id,
        solicitante_nombre: profile.nombre_completo,
        solicitante_cedula: profile.cedula,
        suplente_id: suplenteSeleccionado.id,
        suplente_nombre: suplenteSeleccionado.nombre_completo,
        suplente_cedula: suplenteSeleccionado.cedula,
        fecha_guardia: fechaGuardia,
        motivo: motivo.trim(),
        estado: 'pendiente_suplente', // Inicia esperando aceptación del compañero
      },
    ]);

    setEnviando(false);

    if (!error) {
      Alert.alert(
        'Solicitud Enviada',
        `Petición enviada a ${suplenteSeleccionado.nombre_completo}.\nDebe aceptarla antes de que el Admin pueda autorizarla.`
      );
      setMotivo('');
      setSearchQuery('');
      setSuplenteSeleccionado(null);
      onRefreshGuardias();
    } else {
      Alert.alert('Error', error.message);
    }
  };

  // 2. Respuesta del Compañero / Suplente (Aceptar o Rechazar)
  const handleRespuestaSuplente = async (id: string, acepto: boolean) => {
    const nuevoEstado = acepto ? 'esperando_admin' : 'rechazado_suplente';

    const { error } = await supabase
      .from('shift_changes')
      .update({ estado: nuevoEstado })
      .eq('id', id);

    if (!error) {
      if (acepto) {
        Alert.alert('Guardia Aceptada', 'Has aceptado cubrir la guardia. Ahora pasa a revisión del Administrador para su aprobación final.');
      } else {
        Alert.alert('Guardia Rechazada', 'Has rechazado la solicitud. El cambio queda cancelado.');
      }
      onRefreshGuardias();
    }
  };

  // 3. Decisión Final del Administrador (Aprobar o Rechazar)
  const handleDecisionAdmin = async (id: string, aprobo: boolean) => {
    const nuevoEstado = aprobo ? 'aprobado_admin' : 'rechazado_admin';

    const { error } = await supabase
      .from('shift_changes')
      .update({
        estado: nuevoEstado,
        revisado_por: profile.id,
      })
      .eq('id', id);

    if (!error) {
      Alert.alert('Decisión Registrada', `Cambio de guardia ${aprobo ? 'APROBADO DEFINITIVAMENTE' : 'DENEGADO'}.`);
      onRefreshGuardias();
    }
  };

  // Solicitudes dirigidas a mí pendientes por responder
  const solicitudesParaMi = shiftChanges.filter(
    (sc) => sc.suplente_id === profile.id && sc.estado === 'pendiente_suplente'
  );

  // Solicitudes aceptadas por el suplente en espera de aprobación del admin
  const pendientesDeAdmin = shiftChanges.filter((sc) => sc.estado === 'esperando_admin');

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* ============================================================ */}
      {/* ALERTA 1: SOLICITUDES RECIBIDAS (EL COMPAÑERO DEBE ACEPTAR) */}
      {/* ============================================================ */}
      {solicitudesParaMi.length > 0 && (
        <View style={[styles.card, { borderColor: '#f59e0b', borderWidth: 2 }]}>
          <Text style={[styles.sectionTitle, { color: '#facc15' }]}>
            🔔 Solicitudes de Guardia para Ti ({solicitudesParaMi.length})
          </Text>
          <Text style={styles.cardDesc}>
            Un compañero te ha solicitado cubrir su guardia. Decide si puedes cubrirlo:
          </Text>

          {solicitudesParaMi.map((sc) => (
            <View key={sc.id} style={styles.alertaCard}>
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>
                👤 Solicitante: {sc.solicitante_nombre} (C.I. {sc.solicitante_cedula})
              </Text>
              <Text style={{ color: '#67e8f9', marginTop: 4 }}>
                📅 Fecha de Guardia: {sc.fecha_guardia}
              </Text>
              <Text style={{ color: '#e2e8f0', marginTop: 4, fontStyle: 'italic' }}>
                Motivo: "{sc.motivo}"
              </Text>

              <View style={styles.btnRowDual}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
                  onPress={() => handleRespuestaSuplente(sc.id, true)}
                >
                  <Text style={styles.btnSmText}>✅ Aceptar Turno</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                  onPress={() => handleRespuestaSuplente(sc.id, false)}
                >
                  <Text style={styles.btnSmText}>❌ Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ============================================================ */}
      {/* ALERTA 2: BANDEJA DE AUTORIZACIÓN FINAL DEL ADMIN */}
      {/* ============================================================ */}
      {esAdmin && pendientesDeAdmin.length > 0 && (
        <View style={[styles.card, { borderColor: '#38bdf8', borderWidth: 2 }]}>
          <Text style={[styles.sectionTitle, { color: '#38bdf8' }]}>
            ⭐ Autorización Final de Cambios ({pendientesDeAdmin.length})
          </Text>
          <Text style={styles.cardDesc}>
            El compañero ya aceptó. Se requiere tu firma final para que tenga efecto:
          </Text>

          {pendientesDeAdmin.map((sc) => (
            <View key={sc.id} style={styles.alertaCard}>
              <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>
                🔄 {sc.solicitante_nombre} ➔ {sc.suplente_nombre}
              </Text>
              <Text style={{ color: '#4ade80', fontSize: 12, marginTop: 2 }}>
                ✅ {sc.suplente_nombre} ya aceptó cubrir esta guardia
              </Text>
              <Text style={{ color: '#a7f3d0', fontSize: 12, marginTop: 4 }}>
                Fecha: {sc.fecha_guardia} • Motivo: {sc.motivo}
              </Text>

              <View style={styles.btnRowDual}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
                  onPress={() => handleDecisionAdmin(sc.id, true)}
                >
                  <Text style={styles.btnSmText}>👑 Aprobar Cambio</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                  onPress={() => handleDecisionAdmin(sc.id, false)}
                >
                  <Text style={styles.btnSmText}>❌ Denegar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ============================================================ */}
      {/* FORMULARIO: SOLICITAR CAMBIO CON BUSCADOR TIPO GOOGLE */}
      {/* ============================================================ */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📝 Solicitar Cambio de Guardia</Text>
        <Text style={styles.cardDesc}>
          Busca al compañero por nombre o cédula para pedirle el relevo:
        </Text>

        {/* BUSCADOR TIPO GOOGLE */}
        <Text style={styles.label}>Buscar Compañero (Nombre o Cédula)</Text>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Escribe: Jerinson, 22600509, Luisana..."
            placeholderTextColor="#6ee7b7"
            value={searchQuery}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              if (suplenteSeleccionado) setSuplenteSeleccionado(null);
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* LISTA DE RESULTADOS TIPO GOOGLE */}
        {companerosFiltrados.length > 0 && !suplenteSeleccionado && (
          <View style={styles.resultsBox}>
            {companerosFiltrados.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.resultItem}
                onPress={() => {
                  setSuplenteSeleccionado(item);
                  setSearchQuery(item.nombre_completo);
                }}
              >
                <View>
                  <Text style={styles.resultName}>{item.nombre_completo}</Text>
                  <Text style={styles.resultDetails}>
                    C.I: {item.cedula || 'N/A'} • Cod: {item.codigo_operador || 'N/A'} • {item.cargo}
                  </Text>
                </View>
                <Text style={styles.selectArrow}>➔</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* COMPAÑERO SELECCIONADO */}
        {suplenteSeleccionado && (
          <View style={styles.selectedPill}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedLabel}>Compañero que cubrirá tu guardia:</Text>
              <Text style={styles.selectedValue}>
                👤 {suplenteSeleccionado.nombre_completo} (C.I. {suplenteSeleccionado.cedula})
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setSuplenteSeleccionado(null);
                setSearchQuery('');
              }}
            >
              <Text style={styles.removeSelected}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Fecha de la Guardia a Cambiar</Text>
        <TextInput
          style={styles.input}
          value={fechaGuardia}
          onChangeText={setFechaGuardia}
          placeholder="AAAA-MM-DD"
          placeholderTextColor="#6ee7b7"
        />

        <Text style={styles.label}>Motivo del Relevo</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Compromiso médico / cambio por guardia de fin de semana"
          placeholderTextColor="#6ee7b7"
          value={motivo}
          onChangeText={setMotivo}
        />

        <TouchableOpacity
          style={[styles.primaryButton, enviando && { opacity: 0.6 }]}
          onPress={handleSolicitar}
          disabled={enviando}
        >
          <Text style={styles.buttonText}>
            {enviando ? 'Enviando...' : 'ENVIAR SOLICITUD AL COMPAÑERO'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ============================================================ */}
      {/* HISTORIAL GENERAL DE SOLICITUDES Y ESTADOS */}
      {/* ============================================================ */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Historial de Solicitudes ({shiftChanges.length})</Text>

        {shiftChanges.length === 0 ? (
          <Text style={{ color: '#86efac', fontStyle: 'italic', marginVertical: 8 }}>
            No hay solicitudes de relevo registradas.
          </Text>
        ) : (
          shiftChanges.map((sc) => {
            let badgeBg = '#f59e0b';
            let badgeText = 'ESPERANDO COMPAÑERO';

            if (sc.estado === 'esperando_admin') {
              badgeBg = '#0284c7';
              badgeText = 'COMPAÑERO ACEPTÓ (FALTA ADMIN)';
            } else if (sc.estado === 'aprobado_admin') {
              badgeBg = '#16a34a';
              badgeText = 'APROBADO DEFINITIVO';
            } else if (sc.estado === 'rechazado_suplente') {
              badgeBg = '#dc2626';
              badgeText = 'RECHAZADO POR COMPAÑERO';
            } else if (sc.estado === 'rechazado_admin') {
              badgeBg = '#b91c1c';
              badgeText = 'DENEGADO POR ADMIN';
            }

            return (
              <View key={sc.id} style={styles.shiftCard}>
                <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>
                  {sc.solicitante_nombre} ➔ {sc.suplente_nombre}
                </Text>
                <Text style={{ color: '#a7f3d0', fontSize: 12, marginTop: 2 }}>
                  Fecha: {sc.fecha_guardia || 'N/A'} • Motivo: {sc.motivo}
                </Text>

                <View style={[styles.badgeEstado, { backgroundColor: badgeBg }]}>
                  <Text style={styles.badgeEstadoText}>{badgeText}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContent: { padding: 16, paddingBottom: 110, backgroundColor: '#04271c' },
  card: {
    backgroundColor: '#064230',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0a5c43',
    marginBottom: 16,
  },
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  cardDesc: { color: '#d1fae5', fontSize: 13, marginBottom: 14 },
  label: { color: '#e2e8f0', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#031f16',
    borderWidth: 1,
    borderColor: '#0a5c43',
    borderRadius: 8,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#031f16',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: '#ffffff', fontSize: 14 },
  clearIcon: { color: '#ef4444', fontSize: 16, paddingHorizontal: 6 },
  resultsBox: {
    backgroundColor: '#031f16',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a5c43',
    marginTop: 6,
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#08533c',
  },
  resultName: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  resultDetails: { color: '#a7f3d0', fontSize: 11, marginTop: 2 },
  selectArrow: { color: '#4ade80', fontSize: 16, fontWeight: 'bold' },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#03251a',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    padding: 10,
    marginTop: 10,
  },
  selectedLabel: { color: '#a7f3d0', fontSize: 11 },
  selectedValue: { color: '#ffffff', fontWeight: 'bold', fontSize: 13, marginTop: 2 },
  removeSelected: { color: '#ef4444', fontSize: 16, padding: 6 },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  alertaCard: {
    backgroundColor: '#03251a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#0a5c43',
  },
  btnRowDual: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnSmText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  shiftCard: {
    backgroundColor: '#03251a',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#08533c',
  },
  badgeEstado: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  badgeEstadoText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
});