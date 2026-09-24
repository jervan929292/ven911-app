import React from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Platform, StatusBar as RNStatusBar } from 'react-native';
import { UserProfile } from '../types';

interface HeaderProps {
  profile: UserProfile;
  onLogout: () => void;
}

export default function Header({ profile, onLogout }: HeaderProps) {
  const esAdmin = profile.rol === 'super_admin' || profile.rol === 'super_usuario';

  return (
    <View style={styles.topHeader}>
      <View style={styles.headerLeft}>
        <Image source={require('../../assets/icon.png')} style={styles.miniLogo} resizeMode="contain" />
        <View>
          <Text style={styles.headerMainText}>CCCT VEN 911 FALCÓN</Text>
          <Text style={styles.headerSubText}>
            {profile.nombre_completo} • {esAdmin ? '⭐ MODO CONTROL' : 'SOPORTE'}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutMini} onPress={onLogout}>
        <Text style={styles.logoutMiniText}>Salir</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
});