import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';

interface TabBarProps {
  currentTab: 'dashboard' | 'novedades' | 'guardias' | 'chat' | 'manuales';
  onSelectTab: (tab: 'dashboard' | 'novedades' | 'guardias' | 'chat' | 'manuales') => void;
}

export default function TabBar({ currentTab, onSelectTab }: TabBarProps) {
  const tabs = [
    { key: 'dashboard', label: 'Horario', icon: '🏠' },
    { key: 'novedades', label: 'Novedades', icon: '📋' },
    { key: 'guardias', label: 'Guardias', icon: '⏰' },
    { key: 'chat', label: 'Chat', icon: '💬' },
    { key: 'manuales', label: 'Manuales', icon: '📚' },
  ] as const;

  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => {
        const active = currentTab === t.key;
        return (
          <TouchableOpacity key={t.key} style={styles.tabBtn} onPress={() => onSelectTab(t.key)}>
            <Text style={[styles.tabIcon, active && styles.tabActive]}>{t.icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#031f16',
    borderTopWidth: 1,
    borderColor: '#065f46',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 32 : 16,
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