import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { UserProfile, Novedad } from '../types';

interface NovedadesScreenProps {
  profile: UserProfile;
  novedadesList: Novedad[];
  onNovedadSaved: () => void;
}

export default function NovedadesScreen({ profile, novedadesList, onNovedadSaved }: NovedadesScreenProps) {
  const [informeText, setInformeText] = useState<string>('Siendo la fecha y hora antes mencionadas, se realiza verificación de la aplicación cuadrantes de paz desarrollada para el control de minutas. La misma está operativa, de igual forma se verifica el estado de la conexión a Internet.');
  const [soporteGuardiaText, setSoporteGuardiaText] = useState<string>('Ing. Alfredo Iparraguirre / Ing. Angel Gonzalez');
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [savingNovedad, setSavingNovedad] = useState<boolean>(false);

  const pickImage = async (num: 1 | 2) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso Requerido', 'Se requiere acceso a la galería para adjuntar fotos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
    if (!res.canceled && res.assets && res.assets[0]) {
      if (num === 1) setImage1(res.assets[0].uri);
      if (num === 2) setImage2(res.assets[0].uri);
    }
  };

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
        registrado_por: profile.id,
      },
    ]);

    setSavingNovedad(false);

    if (!error) {
      Alert.alert('Éxito', 'Novedad registrada y transmitida correctamente.');
      setImage1(null);
      setImage2(null);
      onNovedadSaved();
    } else {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cargar Minuta Oficial</Text>
        <View style={styles.letterheadBox}>
          <Text style={styles.letterheadText}>🇻🇪 CCCT VEN 911 FALCON DEPARTAMENTO DE TECNOLOGÍA</Text>
        </View>

        <Text style={styles.label}>Soporte(s) de Guardia</Text>
        <TextInput style={styles.input} value={soporteGuardiaText} onChangeText={setSoporteGuardiaText} />

        <Text style={styles.label}>Informe</Text>
        <TextInput style={[styles.input, { height: 90, textAlignVertical: 'top' }]} multiline value={informeText} onChangeText={setInformeText} />

        <Text style={styles.label}>Insertar Dos Imágenes (Obligatorio)</Text>
        <View style={styles.photoRow}>
          <TouchableOpacity style={styles.photoPicker} onPress={() => pickImage(1)}>
            {image1 ? <Image source={{ uri: image1 }} style={styles.photoPreview} /> : <Text style={styles.photoPickerText}>+ Foto 1</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoPicker} onPress={() => pickImage(2)}>
            {image2 ? <Image source={{ uri: image2 }} style={styles.photoPreview} /> : <Text style={styles.photoPickerText}>+ Foto 2</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleGuardarNovedad} disabled={savingNovedad}>
          <Text style={styles.buttonText}>{savingNovedad ? 'Enviando...' : 'TRANSMITIR NOVEDAD'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { marginHorizontal: 16, marginTop: 10, color: '#86efac' }]}>
        Minutas Registradas ({novedadesList.length})
      </Text>

      {novedadesList.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.minutaHeader}>{item.membrete}</Text>
          <Text style={styles.minutaDate}>Fecha: {item.fecha} | Hora: {item.hora} Hrs</Text>
          <Text style={styles.minutaBody}>{item.informe}</Text>
          <Text style={styles.minutaGuards}>Soportes: {item.soporte_guardia}</Text>
          <View style={styles.photoRow}>
            {item.imagen_url_1 && <Image source={{ uri: item.imagen_url_1 }} style={styles.photoThumb} />}
            {item.imagen_url_2 && <Image source={{ uri: item.imagen_url_2 }} style={styles.photoThumb} />}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContent: { padding: 16, paddingBottom: 110 },
  card: { backgroundColor: '#064230', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#0a5c43', marginBottom: 16 },
  sectionTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  letterheadBox: { backgroundColor: '#03251a', padding: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#22c55e', marginBottom: 14 },
  letterheadText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  label: { color: '#e2e8f0', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#031f16', borderWidth: 1, borderColor: '#0a5c43', borderRadius: 8, color: '#ffffff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  photoRow: { flexDirection: 'row', gap: 12, marginVertical: 12 },
  photoPicker: { flex: 1, height: 110, backgroundColor: '#031f16', borderWidth: 1, borderColor: '#0a5c43', borderStyle: 'dashed', borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoPickerText: { color: '#4ade80', fontWeight: 'bold', fontSize: 13 },
  photoPreview: { width: '100%', height: '100%' },
  photoThumb: { flex: 1, height: 100, borderRadius: 8, backgroundColor: '#031f16' },
  primaryButton: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  minutaHeader: { color: '#67e8f9', fontWeight: 'bold', fontSize: 12, marginBottom: 4 },
  minutaDate: { color: '#a7f3d0', fontSize: 11, marginBottom: 8 },
  minutaBody: { color: '#ffffff', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  minutaGuards: { color: '#4ade80', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
});