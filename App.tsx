import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  FlatList,
  StatusBar as RNStatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './lib/supabase';

interface UserProfile {
  id: string;
  nombre_completo: string;
  cargo: string;
  rol: 'super_admin' | 'super_usuario' | 'usuario';
  estado_presencia: 'activo' | 'ausente';
  ubicacion: string;
  codigo_operador: string;
  cedula: string;
}

interface Novedad {
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

interface ChatMessage {
  id: string;
  sender_id: string;
  mensaje: string;
  created_at: string;
  profiles?: {
    nombre_completo: string;
  };
}

interface ShiftChange {
  id: string;
  solicitante_id: string;
  suplente_id: string;
  motivo: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
}

interface Manual {
  id: string;
  titulo: string;
  pdf_url: string;
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'novedades' | 'guardias' | 'chat' | 'manuales'>('dashboard');

  // Login por Código y Cédula
  const [codigoOperador, setCodigoOperador] = useState<string>('');
  const [cedulaClave, setCedulaClave] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Todo el personal para el monitor del Admin
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);

  // Libro de Novedades
  const [novedadesList, setNovedadesList] = useState<Novedad[]>([]);
  const [informeText, setInformeText] = useState<string>('Siendo la fecha y hora antes mencionadas, se realiza verificación de la aplicación cuadrantes de paz desarrollada para el control de minutas. La misma está operativa, de igual forma se verifica el estado de la conexión a Internet.');
  const [soporteGuardiaText, setSoporteGuardiaText] = useState<string>('Ing. Alfredo Iparraguirre / Ing. Angel Gonzalez');
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [savingNovedad, setSavingNovedad] = useState<boolean>(false);

  // Chat Grupal
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');

  // Guardias y Manuales
  const [shiftChanges, setShiftChanges] = useState<ShiftChange[]>([]);
  const [motivoCambio, setMotivoCambio] = useState<string>('');
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [newManualTitle, setNewManualTitle] = useState<string>('');
  const [newManualUrl, setNewManualUrl] = useState<string>('');

  // Formulario Admin para agregar personal
  const [newStaffCode, setNewStaffCode] = useState<string>('');
  const [newStaffCedula, setNewStaffCedula] = useState<string>('');
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffCargo, setNewStaffCargo] = useState<string>('Soporte Técnico');
  const [creatingStaff, setCreatingStaff] = useState<boolean>(false);

  // 1. Restaurar sesión guardada
  useEffect(() => {
    checkSavedSession();
  }, []);

  const checkSavedSession = async () => {
    try {
      const saved = await AsyncStorage.getItem('ven911_user_session');
      if (saved) {
        setProfile(JSON.parse(saved));
      }
    } catch (e) {
      console.log('Error restaurando sesión:', e);
    } finally {
      setLoading(false);
    }
  };

  // 2. Escucha de cambios en tiempo real
  useEffect(() => {
    if (profile) {
      loadInitialData();

      const realChannel = supabase
        .channel('app_realtime_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'group_chat_messages' },
          () => fetchChatMessages()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            fetchAllProfiles();
            refreshCurrentProfile();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shift_changes' },
          () => fetchShiftChanges()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'novedades' },
          () => fetchNovedades()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(realChannel);
      };
    }
  }, [profile?.id]);

  const loadInitialData = async () => {
    await Promise.all([
      fetchAllProfiles(),
      fetchNovedades(),
      fetchChatMessages(),
      fetchShiftChanges(),
      fetchManuals(),
    ]);
  };

  const refreshCurrentProfile = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profile.id)
      .maybeSingle();

    if (data) {
      setProfile(data as UserProfile);
      AsyncStorage.setItem('ven911_user_session', JSON.stringify(data));
    }
  };

  const fetchAllProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('nombre_completo', { ascending: true });
    if (data) setAllProfiles(data as UserProfile[]);
  };

  const fetchNovedades = async () => {
    const { data } = await supabase
      .from('novedades')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setNovedadesList(data as Novedad[]);
  };

  const fetchChatMessages = async () => {
    const { data } = await supabase
      .from('group_chat_messages')
      .select('id, sender_id, mensaje, created_at, profiles(nombre_completo)')
      .order('created_at', { ascending: true })
      .limit(50);
    if (data) setMessages(data as any);
  };

  const fetchShiftChanges = async () => {
    const { data } = await supabase.from('shift_changes').select('*').order('created_at', { ascending: false });
    if (data) setShiftChanges(data as ShiftChange[]);
  };

  const fetchManuals = async () => {
    const { data } = await supabase.from('manuals').select('*').order('created_at', { ascending: false });
    if (data) setManuals(data as Manual[]);
  };

  // Login directo por código y cédula
  const handleLogin = async () => {
    const cleanCode = codigoOperador.trim();
    const cleanCedula = cedulaClave.trim();

    if (!cleanCode || cleanCode.length !== 4) {
      Alert.alert('Código Requerido', 'Ingresa el código de 4 dígitos (Ej: 0911).');
      return;
    }
    if (!cleanCedula) {
      Alert.alert('Clave Requerida', 'Ingresa tu número de cédula.');
      return;
    }

    setAuthLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('codigo_operador', cleanCode)
        .eq('cedula', cleanCedula)
        .maybeSingle();

      setAuthLoading(false);

      if (error) {
        Alert.alert('Error de Conexión', error.message);
        return;
      }

      if (!data) {
        Alert.alert(
          'Acceso Denegado',
          `No se encontró el operador.\nCódigo: "${cleanCode}"\nCédula: "${cleanCedula}"`
        );
        return;
      }

      setProfile(data as UserProfile);
      await AsyncStorage.setItem('ven911_user_session', JSON.stringify(data));
    } catch (err: any) {
      setAuthLoading(false);
      Alert.alert('Error', err.message || 'Error de conexión.');
    }
  };

  // Cerrar Sesión
  const handleLogout = async () => {
    await AsyncStorage.removeItem('ven911_user_session');
    setProfile(null);
    setCodigoOperador('');
    setCedulaClave('');
  };

  // Alternar Estado Activo / Ausente
  const togglePresencia = async () => {
    if (!profile) return;
    const nuevoEstado = profile.estado_presencia === 'activo' ? 'ausente' : 'activo';

    const { error } = await supabase
      .from('profiles')
      .update({ estado_presencia: nuevoEstado })
      .eq('id', profile.id);

    if (!error) {
      const updated = { ...profile, estado_presencia: nuevoEstado };
      setProfile(updated);
      await AsyncStorage.setItem('ven911_user_session', JSON.stringify(updated));
      fetchAllProfiles();
    } else {
      Alert.alert('Error', 'No se pudo actualizar el estado.');
    }
  };

  // Adjuntar imágenes
  const pickImage = async (num: 1 | 2) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso Requerido', 'Se requiere acceso a la galería para adjuntar fotos.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!res.canceled && res.assets && res.assets[0]) {
      if (num === 1) setImage1(res.assets[0].uri);
      if (num === 2) setImage2(res.assets[0].uri);
    }
  };

  // Guardar Minuta con 2 Fotos
  const handleGuardarNovedad = async () => {
    if (!informeText.trim() || !soporteGuardiaText.trim()) {
      Alert.alert('Error', 'Completa el informe y el soporte de guardia.');
      return;
    }
    if (!image1 || !image2) {
      Alert.alert('Fotos Obligatorias', 'Debes adjuntar exactamente 2 fotografías para guardar la actividad.');
      return;
    }

    setSavingNovedad(true);
    const now = new Date();
    const fechaStr = now.toISOString().split('T')[0];
    const horaStr = now.toTimeString().split(' ')[0].substring(0, 5);

    const { error } = await supabase.from('novedades').insert([
      {
        membrete: '🇻🇪 CCCT VEN 911 FALCON DEPARTAMENTO DE TECNOLOGÍA',
        fecha: fechaStr,
        hora: horaStr,
        informe: informeText.trim(),
        soporte_guardia: soporteGuardiaText.trim(),
        imagen_url_1: image1,
        imagen_url_2: image2,
        registrado_por: profile?.id,
      },
    ]);

    setSavingNovedad(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Éxito', 'Novedad registrada y transmitida correctamente.');
      setImage1(null);
      setImage2(null);
      fetchNovedades();
      setCurrentTab('novedades');
    }
  };

  // Enviar mensaje en el chat
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !profile) return;
    const txt = newMessage.trim();
    setNewMessage('');

    await supabase.from('group_chat_messages').insert([
      {
        sender_id: profile.id,
        mensaje: txt,
      },
    ]);
  };

  // Solicitar Cambio de Guardia (Soporte)
  const handleSolicitarCambio = async () => {
    if (!motivoCambio.trim() || !profile) {
      Alert.alert('Error', 'Ingresa el motivo del cambio de guardia.');
      return;
    }

    const { error } = await supabase.from('shift_changes').insert([
      {
        solicitante_id: profile.id,
        suplente_id: profile.id,
        shift_id: '00000000-0000-0000-0000-000000000000',
        motivo: motivoCambio.trim(),
        estado: 'pendiente',
      },
    ]);

    if (!error) {
      Alert.alert('Solicitud Enviada', 'La petición fue enviada para la aprobación del Super Usuario.');
      setMotivoCambio('');
      fetchShiftChanges();
    } else {
      Alert.alert('Error', error.message);
    }
  };

  // Aprobar / Rechazar Guardia (Admin)
  const handleRespuestaGuardia = async (id: string, nuevoEstado: 'aprobado' | 'rechazado') => {
    const { error } = await supabase
      .from('shift_changes')
      .update({ estado: nuevoEstado, revisado_por: profile?.id })
      .eq('id', id);

    if (!error) {
      Alert.alert('Guardia', `Solicitud ${nuevoEstado} exitosamente.`);
      fetchShiftChanges();
    }
  };

  // Registrar Nuevo Personal (Super Usuario / Admin)
  const handleCrearOperador = async () => {
    const code = newStaffCode.trim();
    const ced = newStaffCedula.replace(/[^0-9]/g, '');

    if (code.length !== 4) {
      Alert.alert('Código Requerido', 'El código de operador debe tener 4 dígitos.');
      return;
    }
    if (!ced || !newStaffName.trim()) {
      Alert.alert('Campos Requeridos', 'Ingresa la cédula y el nombre del operador.');
      return;
    }

    setCreatingStaff(true);

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

    if (error) {
      Alert.alert('Error al Registrar', error.message);
    } else {
      Alert.alert(
        'Operador Registrado',
        `Personal creado exitosamente.\nCódigo: ${code}\nClave (Cédula): ${ced}`
      );
      setNewStaffCode('');
      setNewStaffCedula('');
      setNewStaffName('');
      fetchAllProfiles();
    }
  };

  // Publicar manual técnico
  const handleCrearManual = async () => {
    if (!newManualTitle.trim() || !newManualUrl.trim() || !profile) {
      Alert.alert('Error', 'Completa el título y el enlace PDF.');
      return;
    }

    const { error } = await supabase.from('manuals').insert([
      {
        titulo: newManualTitle.trim(),
        pdf_url: newManualUrl.trim(),
        subido_por: profile.id,
      },
    ]);

    if (!error) {
      Alert.alert('Éxito', 'Manual técnico agregado.');
      setNewManualTitle('');
      setNewManualUrl('');
      fetchManuals();
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // PANTALLA: LOGIN
  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.authScroll}>
            <View style={styles.authHeader}>
              <Image source={require('./assets/icon.png')} style={styles.authLogo} resizeMode="contain" />
              <Text style={styles.flagTitle}>🇻🇪 CCCT VEN 911</Text>
              <Text style={styles.techSubtitle}>DEPARTAMENTO DE TECNOLOGÍA</Text>
              <Text style={styles.systemTitle}>Control Operativo de Guardia</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Usuario (Código de 4 Dígitos)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 0911"
                placeholderTextColor="#6ee7b7"
                value={codigoOperador}
                onChangeText={setCodigoOperador}
                keyboardType="numeric"
                maxLength={4}
              />

              <Text style={styles.label}>Clave (Cédula de Identidad)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 22600509"
                placeholderTextColor="#6ee7b7"
                value={cedulaClave}
                onChangeText={setCedulaClave}
                secureTextEntry
                keyboardType="numeric"
              />

              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={authLoading}>
                {authLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Verificación estricta de administrador
  const esAdmin = profile?.rol === 'super_admin' || profile?.rol === 'super_usuario';
  const activosCount = allProfiles.filter((p) => p.estado_presencia === 'activo').length;
  const ausentesCount = allProfiles.filter((p) => p.estado_presencia === 'ausente').length;
  const pendientesGuardia = shiftChanges.filter((sc) => sc.estado === 'pendiente').length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ENCABEZADO SUPERIOR CON MARGEN DE SEGURIDAD */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <Image source={require('./assets/icon.png')} style={styles.miniLogo} resizeMode="contain" />
          <View>
            <Text style={styles.headerMainText}>CCCT VEN 911 FALCÓN</Text>
            <Text style={styles.headerSubText}>
              {profile?.nombre_completo} • {esAdmin ? '⭐ MODO CONTROL' : 'SOPORTE TÉCNICO'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutMini} onPress={handleLogout}>
          <Text style={styles.logoutMiniText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* CONTENIDO PRINCIPAL */}
      <View style={{ flex: 1 }}>
        {/* ============================================================ */}
        {/* PESTAÑA: HORARIO / DASHBOARD */}
        {/* ============================================================ */}
        {currentTab === 'dashboard' && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            {/* 1. VISTA EXCLUSIVA PARA SUPER ADMIN Y SUPER USUARIO */}
            {esAdmin ? (
              <>
                {/* MÉTRICAS DE CONTROL GENERAL */}
                <View style={styles.metricsRow}>
                  <View style={[styles.metricBox, { borderColor: '#22c55e' }]}>
                    <Text style={[styles.metricNumber, { color: '#22c55e' }]}>{activosCount}</Text>
                    <Text style={styles.metricLabel}>Activos en Turno</Text>
                  </View>

                  <View style={[styles.metricBox, { borderColor: '#ef4444' }]}>
                    <Text style={[styles.metricNumber, { color: '#ef4444' }]}>{ausentesCount}</Text>
                    <Text style={styles.metricLabel}>Ausentes</Text>
                  </View>

                  <View style={[styles.metricBox, { borderColor: '#f59e0b' }]}>
                    <Text style={[styles.metricNumber, { color: '#f59e0b' }]}>{pendientesGuardia}</Text>
                    <Text style={styles.metricLabel}>Cambios Pendientes</Text>
                  </View>
                </View>

                {/* MONITOR EN VIVO DE TODO EL PERSONAL */}
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Monitor de Personal en Guardia</Text>
                  <Text style={styles.cardDesc}>Disponibilidad operativa en vivo:</Text>

                  {allProfiles.map((p) => {
                    const isActivo = p.estado_presencia === 'activo';
                    return (
                      <View key={p.id} style={styles.staffItem}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <View style={[styles.dotIndicator, { backgroundColor: isActivo ? '#22c55e' : '#ef4444' }]} />
                          <View>
                            <Text style={styles.staffName}>{p.nombre_completo}</Text>
                            <Text style={styles.staffRole}>
                              {p.codigo_operador ? `Cod: ${p.codigo_operador} • ` : ''}
                              {p.cargo} • {p.ubicacion || 'Sede Coro'}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.badgePill, { backgroundColor: isActivo ? '#064e3b' : '#450a0a' }]}>
                          <Text style={{ color: isActivo ? '#4ade80' : '#f87171', fontSize: 11, fontWeight: 'bold' }}>
                            {isActivo ? 'ACTIVO' : 'AUSENTE'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* REGISTRO DE NUEVO PERSONAL (SOLO ADMINS) */}
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>+ Registrar Nuevo Personal</Text>
                  <Text style={styles.cardDesc}>Crea el acceso asignando Código de 4 dígitos y Cédula:</Text>

                  <Text style={styles.label}>Código de Operador (4 dígitos)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 1003"
                    placeholderTextColor="#6ee7b7"
                    value={newStaffCode}
                    onChangeText={setNewStaffCode}
                    keyboardType="numeric"
                    maxLength={4}
                  />

                  <Text style={styles.label}>Cédula de Identidad</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 28456123"
                    placeholderTextColor="#6ee7b7"
                    value={newStaffCedula}
                    onChangeText={setNewStaffCedula}
                    keyboardType="numeric"
                  />

                  <Text style={styles.label}>Nombre Completo</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: Ing. Pedro Pérez"
                    placeholderTextColor="#6ee7b7"
                    value={newStaffName}
                    onChangeText={setNewStaffName}
                  />

                  <Text style={styles.label}>Cargo</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Soporte Técnico"
                    placeholderTextColor="#6ee7b7"
                    value={newStaffCargo}
                    onChangeText={setNewStaffCargo}
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, creatingStaff && { opacity: 0.6 }]}
                    onPress={handleCrearOperador}
                    disabled={creatingStaff}
                  >
                    {creatingStaff ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>GUARDAR OPERADOR</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* 2. VISTA EXCLUSIVA PARA EL USUARIO NORMAL (SOPORTE) */
              <>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Mi Estado de Guardia</Text>
                  <Text style={styles.cardDesc}>Presiona para marcar tu entrada o salida en el turno:</Text>

                  <TouchableOpacity
                    style={[
                      styles.presenceButton,
                      profile?.estado_presencia === 'activo' ? styles.presenceActive : styles.presenceInactive,
                    ]}
                    onPress={togglePresencia}
                  >
                    <View
                      style={[
                        styles.statusIndicatorDot,
                        { backgroundColor: profile?.estado_presencia === 'activo' ? '#22c55e' : '#ef4444' },
                      ]}
                    />
                    <Text style={styles.presenceButtonText}>
                      {profile?.estado_presencia === 'activo'
                        ? 'SOPORTE ACTIVO (EN GUARDIA)'
                        : 'SOPORTE AUSENTE (TOCA AQUÍ)'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Datos Operativos del Operador</Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Operador:</Text>
                    <Text style={styles.infoValue}>{profile?.nombre_completo}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Código de Acceso:</Text>
                    <Text style={styles.infoValue}>{profile?.codigo_operador || 'Sin código'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Ubicación:</Text>
                    <Text style={styles.infoValue}>{profile?.ubicacion || 'CCCT VEN 911 Coro'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Minutas Enviadas:</Text>
                    <Text style={styles.infoValue}>
                      {novedadesList.filter((n) => n.registrado_por === profile?.id).length} reportes
                    </Text>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
                  <TouchableOpacity
                    style={[styles.primaryButton, { marginTop: 6 }]}
                    onPress={() => setCurrentTab('novedades')}
                  >
                    <Text style={styles.buttonText}>📝 Cargar Minuta Oficial (2 Fotos)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: '#0284c7', marginTop: 10 }]}
                    onPress={() => setCurrentTab('guardias')}
                  >
                    <Text style={styles.buttonText}>⏰ Pedir Cambio de Guardia</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* SECCIÓN COMÚN: SALA DE DATOS */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Leyenda de Conexión de Redes</Text>
              <Text style={styles.cardDesc}>
                🔌 Espacio para el diagrama y leyenda de redes de la sala de datos (en espera por Alejo).
              </Text>
            </View>
          </ScrollView>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA: LIBRO DE NOVEDADES */}
        {/* ============================================================ */}
        {currentTab === 'novedades' && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Cargar Minuta Oficial</Text>

              <View style={styles.letterheadBox}>
                <Text style={styles.letterheadText}>🇻🇪 CCCT VEN 911 FALCON DEPARTAMENTO DE TECNOLOGÍA</Text>
              </View>

              <Text style={styles.label}>Soporte(s) de Guardia</Text>
              <TextInput
                style={styles.input}
                value={soporteGuardiaText}
                onChangeText={setSoporteGuardiaText}
              />

              <Text style={styles.label}>Informe</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                multiline
                value={informeText}
                onChangeText={setInformeText}
              />

              <Text style={styles.label}>Insertar Dos Imágenes (Obligatorio)</Text>
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.photoPicker} onPress={() => pickImage(1)}>
                  {image1 ? (
                    <Image source={{ uri: image1 }} style={styles.photoPreview} />
                  ) : (
                    <Text style={styles.photoPickerText}>+ Foto 1</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.photoPicker} onPress={() => pickImage(2)}>
                  {image2 ? (
                    <Image source={{ uri: image2 }} style={styles.photoPreview} />
                  ) : (
                    <Text style={styles.photoPickerText}>+ Foto 2</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, savingNovedad && { opacity: 0.6 }]}
                onPress={handleGuardarNovedad}
                disabled={savingNovedad}
              >
                {savingNovedad ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>TRANSMITIR NOVEDAD</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { marginHorizontal: 16, marginTop: 10, color: '#86efac' }]}>
              Minutas Registradas ({novedadesList.length})
            </Text>

            {novedadesList.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.minutaHeader}>{item.membrete}</Text>
                <Text style={styles.minutaDate}>
                  Fecha: {item.fecha} | Hora: {item.hora} Hrs
                </Text>
                <Text style={styles.minutaBody}>{item.informe}</Text>
                <Text style={styles.minutaGuards}>Soportes: {item.soporte_guardia}</Text>

                <View style={styles.photoRow}>
                  {item.imagen_url_1 && <Image source={{ uri: item.imagen_url_1 }} style={styles.photoThumb} />}
                  {item.imagen_url_2 && <Image source={{ uri: item.imagen_url_2 }} style={styles.photoThumb} />}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA: GUARDIAS Y CAMBIOS */}
        {/* ============================================================ */}
        {currentTab === 'guardias' && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            {!esAdmin && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Solicitar Cambio de Guardia</Text>
                <Text style={styles.label}>Motivo del relevo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Guardia médica con Ing. Angel Gonzalez"
                  placeholderTextColor="#6ee7b7"
                  value={motivoCambio}
                  onChangeText={setMotivoCambio}
                />
                <TouchableOpacity style={styles.primaryButton} onPress={handleSolicitarCambio}>
                  <Text style={styles.buttonText}>ENVIAR AL SUPER USUARIO</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Solicitudes de Cambio de Guardia</Text>
              {shiftChanges.length === 0 ? (
                <Text style={{ color: '#86efac', fontStyle: 'italic', marginTop: 8 }}>
                  No hay solicitudes registradas actualmente.
                </Text>
              ) : (
                shiftChanges.map((sc) => (
                  <View key={sc.id} style={styles.shiftCard}>
                    <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>Motivo: {sc.motivo}</Text>
                    <Text style={{ color: sc.estado === 'aprobado' ? '#4ade80' : sc.estado === 'rechazado' ? '#f87171' : '#facc15', marginTop: 4 }}>
                      Estado: {sc.estado.toUpperCase()}
                    </Text>

                    {esAdmin && sc.estado === 'pendiente' && (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}
                          onPress={() => handleRespuestaGuardia(sc.id, 'aprobado')}
                        >
                          <Text style={styles.btnSmText}>Aceptar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                          onPress={() => handleRespuestaGuardia(sc.id, 'rechazado')}
                        >
                          <Text style={styles.btnSmText}>Rechazar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA: CHAT GRUPAL */}
        {/* ============================================================ */}
        {currentTab === 'chat' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
              renderItem={({ item }) => {
                const isMe = item.sender_id === profile?.id;
                return (
                  <View style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}>
                    {!isMe && (
                      <Text style={styles.chatSender}>{item.profiles?.nombre_completo || 'Operador'}</Text>
                    )}
                    <Text style={styles.chatMessageText}>{item.mensaje}</Text>
                  </View>
                );
              }}
            />

            <View style={styles.chatInputBar}>
              <TextInput
                style={styles.chatInput}
                placeholder="Escribe al equipo de tecnología..."
                placeholderTextColor="#6ee7b7"
                value={newMessage}
                onChangeText={setNewMessage}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendMessage}>
                <Text style={styles.chatSendText}>➤</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA: MANUALES */}
        {/* ============================================================ */}
        {currentTab === 'manuales' && (
          <ScrollView contentContainerStyle={styles.tabContent}>
            {esAdmin && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Subir Manual Técnico (Admin)</Text>
                <Text style={styles.label}>Título del Manual</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Manual Configuración Servidor Issabel"
                  placeholderTextColor="#6ee7b7"
                  value={newManualTitle}
                  onChangeText={setNewManualTitle}
                />
                <Text style={styles.label}>Enlace PDF</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://.../manual.pdf"
                  placeholderTextColor="#6ee7b7"
                  value={newManualUrl}
                  onChangeText={setNewManualUrl}
                />
                <TouchableOpacity style={styles.primaryButton} onPress={handleCrearManual}>
                  <Text style={styles.buttonText}>AGREGAR MANUAL</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Manuales y Guías Operativas</Text>
              {manuals.length === 0 ? (
                <Text style={{ color: '#86efac', fontStyle: 'italic', marginTop: 10 }}>
                  No hay manuales cargados aún.
                </Text>
              ) : (
                manuals.map((m) => (
                  <View key={m.id} style={styles.manualItem}>
                    <Text style={styles.manualTitle}>📄 {m.titulo}</Text>
                    <Text style={styles.manualUrl} numberOfLines={1}>{m.pdf_url}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ============================================================ */}
      {/* BARRA INFERIOR DE PESTAÑAS (ELEVADA Y PROTEGIDA DE BOTONES) */}
      {/* ============================================================ */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('dashboard')}>
          <Text style={[styles.tabIcon, currentTab === 'dashboard' && styles.tabActive]}>🏠</Text>
          <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.tabActive]}>Horario</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('novedades')}>
          <Text style={[styles.tabIcon, currentTab === 'novedades' && styles.tabActive]}>📋</Text>
          <Text style={[styles.tabLabel, currentTab === 'novedades' && styles.tabActive]}>Novedades</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('guardias')}>
          <Text style={[styles.tabIcon, currentTab === 'guardias' && styles.tabActive]}>⏰</Text>
          <Text style={[styles.tabLabel, currentTab === 'guardias' && styles.tabActive]}>Guardias</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('chat')}>
          <Text style={[styles.tabIcon, currentTab === 'chat' && styles.tabActive]}>💬</Text>
          <Text style={[styles.tabLabel, currentTab === 'chat' && styles.tabActive]}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('manuales')}>
          <Text style={[styles.tabIcon, currentTab === 'manuales' && styles.tabActive]}>📚</Text>
          <Text style={[styles.tabLabel, currentTab === 'manuales' && styles.tabActive]}>Manuales</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#04271c',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#04271c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  authLogo: {
    width: 130,
    height: 130,
    marginBottom: 12,
  },
  flagTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  techSubtitle: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  systemTitle: {
    color: '#a7f3d0',
    fontSize: 14,
    marginTop: 4,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) + 8 : 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#065f46',
    backgroundColor: '#031f16',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  miniLogo: {
    width: 36,
    height: 36,
    marginRight: 10,
  },
  headerMainText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  headerSubText: {
    color: '#4ade80',
    fontSize: 11,
    marginTop: 1,
  },
  logoutMini: {
    backgroundColor: '#b91c1c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  logoutMiniText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabContent: {
    padding: 16,
    paddingBottom: 110, // Espacio para que el scroll nunca quede tapado por la barra inferior
  },
  card: {
    backgroundColor: '#064230',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0a5c43',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardDesc: {
    color: '#d1fae5',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#03251a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  metricLabel: {
    color: '#a7f3d0',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  staffItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#08533c',
  },
  dotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  staffName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  staffRole: {
    color: '#a7f3d0',
    fontSize: 11,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  presenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  presenceActive: {
    backgroundColor: '#065f46',
    borderColor: '#22c55e',
  },
  presenceInactive: {
    backgroundColor: '#7f1d1d',
    borderColor: '#ef4444',
  },
  statusIndicatorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 10,
  },
  presenceButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#08533c',
  },
  infoLabel: {
    color: '#a7f3d0',
    fontSize: 13,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  letterheadBox: {
    backgroundColor: '#03251a',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
    marginBottom: 14,
  },
  letterheadText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  label: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
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
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 12,
  },
  photoPicker: {
    flex: 1,
    height: 110,
    backgroundColor: '#031f16',
    borderWidth: 1,
    borderColor: '#0a5c43',
    borderStyle: 'dashed',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  photoPickerText: {
    color: '#4ade80',
    fontWeight: 'bold',
    fontSize: 13,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoThumb: {
    flex: 1,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#031f16',
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  minutaHeader: {
    color: '#67e8f9',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
  },
  minutaDate: {
    color: '#a7f3d0',
    fontSize: 11,
    marginBottom: 8,
  },
  minutaBody: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
  },
  minutaGuards: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  shiftCard: {
    backgroundColor: '#03251a',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnSmText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  chatBubble: {
    padding: 12,
    borderRadius: 12,
    marginVertical: 4,
    maxWidth: '80%',
  },
  chatBubbleMe: {
    backgroundColor: '#15803d',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  chatBubbleOther: {
    backgroundColor: '#064e3b',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  chatSender: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  chatMessageText: {
    color: '#ffffff',
    fontSize: 14,
  },
  chatInputBar: {
    flexDirection: 'row',
    padding: 10,
    paddingBottom: Platform.OS === 'android' ? 24 : 10,
    backgroundColor: '#031f16',
    borderTopWidth: 1,
    borderColor: '#065f46',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#04271c',
    color: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#0a5c43',
  },
  chatSendBtn: {
    backgroundColor: '#16a34a',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatSendText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  manualItem: {
    backgroundColor: '#03251a',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  manualTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  manualUrl: {
    color: '#67e8f9',
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#031f16',
    borderTopWidth: 1,
    borderColor: '#065f46',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 32 : 16, // Eleva los botones por encima de los botones del teléfono
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 18,
    color: '#6ee7b7',
  },
  tabLabel: {
    fontSize: 11,
    color: '#6ee7b7',
    marginTop: 2,
  },
  tabActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});