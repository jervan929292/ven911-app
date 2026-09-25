import React, { useState, useEffect, Component, ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, SafeAreaView, ActivityIndicator, Text, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

// Carga segura de Audio
let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {
  Audio = null;
}

import { supabase } from './lib/supabase';
import { UserProfile, GuardShift, Novedad, ShiftChange, Manual } from './src/types';

import Header from './src/components/Header';
import TabBar from './src/components/TabBar';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import NovedadesScreen from './src/screens/NovedadesScreen';
import GuardiasScreen from './src/screens/GuardiasScreen';
import ChatScreen from './src/screens/ChatScreen';
import ManualesScreen from './src/screens/ManualesScreen';

// ==========================================
// ESCUDO ANTICAÍDAS (Protección global)
// ==========================================
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#04271c', padding: 20, justifyContent: 'center' }}>
          <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            ⚠️ Error detectado:
          </Text>
          <ScrollView style={{ maxHeight: 300, backgroundColor: '#063829', padding: 12, borderRadius: 8 }}>
            <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: 'monospace' }}>
              {String(this.state.error?.message || this.state.error)}
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'novedades' | 'guardias' | 'chat' | 'manuales'>('dashboard');
  const [hasBiometrics, setHasBiometrics] = useState<boolean>(false);

  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [guardShifts, setGuardShifts] = useState<GuardShift[]>([]);
  const [novedadesList, setNovedadesList] = useState<Novedad[]>([]);
  const [shiftChanges, setShiftChanges] = useState<ShiftChange[]>([]);
  const [manuals, setManuals] = useState<Manual[]>([]);

  useEffect(() => {
    initApp();
  }, []);

  // ==========================================
  // SOLICITUD GENERAL DE TODOS LOS PERMISOS
  // ==========================================
  const initApp = async () => {
    try {
      // 1. Permiso de Ubicación / GPS (Geocerca y Asistencia)
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch (err) {
        console.log('Error permiso ubicación:', err);
      }

      // 2. Permiso de Micrófono (Notas de Voz en Chat)
      try {
        if (Audio && Audio.requestPermissionsAsync) {
          await Audio.requestPermissionsAsync();
        }
      } catch (err) {
        console.log('Error permiso micrófono:', err);
      }

      // 3. Permiso de Cámara (Fotos de Guardia)
      try {
        await ImagePicker.requestCameraPermissionsAsync();
      } catch (err) {
        console.log('Error permiso cámara:', err);
      }

      // 4. Permiso de Galería y Archivos
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch (err) {
        console.log('Error permiso archivos/galería:', err);
      }

      // 5. Permiso y Verificación de Biometría / Huella
      let compatible = false;
      let enrolled = false;
      try {
        compatible = await LocalAuthentication.hasHardwareAsync();
        enrolled = await LocalAuthentication.isEnrolledAsync();
      } catch (authErr) {
        console.log('Error huella/biometría:', authErr);
      }
      setHasBiometrics(compatible && enrolled);

      // 6. Cargar sesión de usuario si ya estaba iniciada
      const saved = await AsyncStorage.getItem('ven911_user_session');
      const bioActive = await AsyncStorage.getItem('ven911_biometrics_active');

      if (saved) {
        const parsed = JSON.parse(saved);
        if (compatible && enrolled && bioActive === 'true') {
          promptBiometricLogin(parsed);
        } else {
          setProfile(parsed);
        }
      }
    } catch (e) {
      console.log('Error general en inicialización:', e);
    } finally {
      setLoading(false);
    }
  };

  const promptBiometricLogin = async (userFallback?: UserProfile) => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Acceso Biométrico CCCT VEN 911',
        cancelLabel: 'Cancelar',
      });
      if (res.success) {
        if (userFallback) setProfile(userFallback);
        else {
          const saved = await AsyncStorage.getItem('ven911_user_session');
          if (saved) setProfile(JSON.parse(saved));
        }
      }
    } catch (e) {
      console.log('Fallo huella:', e);
    }
  };

  useEffect(() => {
    if (profile) {
      loadAllData();
      const channel = supabase
        .channel('app_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchProfiles())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'novedades' }, () => fetchNovedades())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'guard_shifts' }, () => fetchGuards())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_changes' }, () => fetchChanges())
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile?.id]);

  const loadAllData = async () => {
    await Promise.all([fetchProfiles(), fetchGuards(), fetchNovedades(), fetchChanges(), fetchManuals()]);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('nombre_completo', { ascending: true });
    if (data) setAllProfiles(data as UserProfile[]);
  };

  const fetchGuards = async () => {
    const { data } = await supabase.from('guard_shifts').select('*').order('fecha', { ascending: true });
    if (data) setGuardShifts(data as GuardShift[]);
  };

  const fetchNovedades = async () => {
    const { data } = await supabase.from('novedades').select('*').order('created_at', { ascending: false });
    if (data) setNovedadesList(data as Novedad[]);
  };

  const fetchChanges = async () => {
    const { data } = await supabase.from('shift_changes').select('*').order('created_at', { ascending: false });
    if (data) setShiftChanges(data as ShiftChange[]);
  };

  const fetchManuals = async () => {
    const { data } = await supabase.from('manuals').select('*').order('created_at', { ascending: false });
    if (data) setManuals(data as Manual[]);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('ven911_user_session');
    await AsyncStorage.removeItem('ven911_biometrics_active');
    setProfile(null);
  };

  const handleTogglePresencia = async () => {
    if (!profile) return;
    const nuevo = profile.estado_presencia === 'activo' ? 'ausente' : 'activo';
    const { error } = await supabase.from('profiles').update({ estado_presencia: nuevo }).eq('id', profile.id);
    if (!error) {
      const updated = { ...profile, estado_presencia: nuevo };
      setProfile(updated as UserProfile);
      AsyncStorage.setItem('ven911_user_session', JSON.stringify(updated));
      fetchProfiles();
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {!profile ? (
          <LoginScreen
            hasBiometrics={hasBiometrics}
            onLoginSuccess={(p) => setProfile(p)}
            onBiometricLogin={() => promptBiometricLogin()}
          />
        ) : (
          <>
            <Header profile={profile} onLogout={handleLogout} />

            <View style={{ flex: 1 }}>
              {currentTab === 'dashboard' && (
                <DashboardScreen
                  profile={profile}
                  allProfiles={allProfiles}
                  guardShifts={guardShifts}
                  onTogglePresencia={handleTogglePresencia}
                  onRefreshData={loadAllData}
                  onGoToNovedades={() => setCurrentTab('novedades')}
                  onGoToGuardias={() => setCurrentTab('guardias')}
                />
              )}

              {currentTab === 'novedades' && (
                <NovedadesScreen
                  profile={profile}
                  novedadesList={novedadesList}
                  onNovedadSaved={fetchNovedades}
                />
              )}

              {currentTab === 'guardias' && (
                <GuardiasScreen
                  profile={profile}
                  allProfiles={allProfiles}
                  shiftChanges={shiftChanges}
                  onRefreshGuardias={fetchChanges}
                />
              )}

              {currentTab === 'chat' && <ChatScreen profile={profile} />}

              {currentTab === 'manuales' && (
                <ManualesScreen profile={profile} manuals={manuals} onManualAdded={fetchManuals} />
              )}
            </View>

            <TabBar currentTab={currentTab} onSelectTab={(t) => setCurrentTab(t)} />
          </>
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04271c' },
  center: { flex: 1, backgroundColor: '#04271c', justifyContent: 'center', alignItems: 'center' },
});