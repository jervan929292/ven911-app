import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../types';

interface LoginScreenProps {
  hasBiometrics: boolean;
  onLoginSuccess: (profile: UserProfile) => void;
  onBiometricLogin: () => void;
}

export default function LoginScreen({ hasBiometrics, onLoginSuccess, onBiometricLogin }: LoginScreenProps) {
  const [codigoOperador, setCodigoOperador] = useState<string>('');
  const [cedulaClave, setCedulaClave] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

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
        Alert.alert('Error de Base de Datos', error.message);
        return;
      }

      if (!data) {
        Alert.alert('Acceso Denegado', `Código o cédula incorrectos.`);
        return;
      }

      await AsyncStorage.setItem('ven911_user_session', JSON.stringify(data));
      await AsyncStorage.setItem('ven911_biometrics_active', 'true');
      onLoginSuccess(data as UserProfile);
    } catch (err: any) {
      setAuthLoading(false);
      Alert.alert('Error', err.message || 'Error de conexión.');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#04271c' }}>
      <ScrollView contentContainerStyle={styles.authScroll}>
        <View style={styles.authHeader}>
          <Image source={require('../../assets/icon.png')} style={styles.authLogo} resizeMode="contain" />
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

          {hasBiometrics && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#065f46', marginTop: 12, borderWidth: 1, borderColor: '#22c55e' }]}
              onPress={onBiometricLogin}
            >
              <Text style={[styles.buttonText, { color: '#4ade80' }]}>🖐️ INGRESAR CON HUELLA</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    width: 120,
    height: 120,
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
  card: {
    backgroundColor: '#064230',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#0a5c43',
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
  },
});