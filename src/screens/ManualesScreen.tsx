import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';
import { UserProfile, Manual } from '../types';

interface ManualesScreenProps {
  profile: UserProfile;
  manuals: Manual[];
  onManualAdded: () => void;
}

export default function ManualesScreen({ profile, manuals, onManualAdded }: ManualesScreenProps) {
  const esAdmin = profile.rol === 'super_admin' || profile.rol === 'super_usuario';

  const [titulo, setTitulo] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; uri: string; size?: number } | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // 1. Seleccionar archivo .PDF desde la memoria del teléfono
  const handleSelectPDF = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        setSelectedFile({
          name: file.name,
          uri: file.uri,
          size: file.size,
        });

        // Sugerir el nombre del archivo como título si el campo está vacío
        if (!titulo.trim()) {
          const nombreLimpio = file.name.replace(/\.pdf$/i, '');
          setTitulo(nombreLimpio);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo seleccionar el archivo: ' + e.message);
    }
  };

  // 2. Subir el archivo PDF a Supabase Storage y registrarlo en la tabla
  const handleSubirManual = async () => {
    if (!titulo.trim()) {
      Alert.alert('Título Requerido', 'Por favor ingresa un título para el manual.');
      return;
    }
    if (!selectedFile) {
      Alert.alert('Archivo Requerido', 'Selecciona un archivo PDF desde tu teléfono.');
      return;
    }

    setUploading(true);

    try {
      // Convertir el archivo local a Blob para enviarlo a Supabase
      const response = await fetch(selectedFile.uri);
      const blob = await response.blob();

      // Generar nombre único para el archivo
      const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `manual_${Date.now()}_${cleanName}`;

      // A. Subir al Bucket de Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('manuales-pdf')
        .upload(storagePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        throw new Error('Fallo al subir archivo al servidor: ' + uploadError.message);
      }

      // B. Obtener URL Pública del archivo
      const { data: urlData } = supabase.storage
        .from('manuales-pdf')
        .getPublicUrl(storagePath);

      const pdfUrl = urlData.publicUrl;

      // C. Guardar el registro en la tabla manuals
      const { error: dbError } = await supabase.from('manuals').insert([
        {
          titulo: titulo.trim(),
          pdf_url: pdfUrl,
          subido_por: profile.id,
        },
      ]);

      if (dbError) {
        throw new Error('Fallo al registrar en base de datos: ' + dbError.message);
      }

      Alert.alert('Manual Publicado', `El manual "${titulo}" está listo para descarga.`);
      setTitulo('');
      setSelectedFile(null);
      onManualAdded();
    } catch (err: any) {
      Alert.alert('Error de Carga', err.message);
    } finally {
      setUploading(false);
    }
  };

  // 3. Abrir o descargar el PDF en el visor del teléfono
  const handleOpenPDF = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'No hay una aplicación para abrir este PDF.');
      }
    } catch {
      // Intento directo si falla la verificación previa
      await Linking.openURL(url);
    }
  };

  // 4. Eliminar manual (solo administradores)
  const handleEliminarManual = async (id: string, tituloManual: string) => {
    Alert.alert(
      'Confirmar Eliminación',
      `¿Deseas eliminar el manual "${tituloManual}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('manuals').delete().eq('id', id);
            if (!error) {
              onManualAdded();
            } else {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* SECCIÓN ADMIN: SUBIDA DE ARCHIVO PDF FÍSICO */}
      {esAdmin && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📄 Cargar Nuevo Manual Técnico (PDF)</Text>
          <Text style={styles.cardDesc}>
            Selecciona un archivo PDF físico de tu teléfono para almacenarlo en el servidor:
          </Text>

          <Text style={styles.label}>Título del Manual</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Manual Configuración Asterisk VEN 911"
            placeholderTextColor="#6ee7b7"
            value={titulo}
            onChangeText={setTitulo}
          />

          <Text style={styles.label}>Archivo PDF</Text>
          <TouchableOpacity style={styles.filePickerBtn} onPress={handleSelectPDF}>
            <Text style={styles.filePickerIcon}>📂</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.filePickerText}>
                {selectedFile ? selectedFile.name : 'Toca para seleccionar archivo .PDF'}
              </Text>
              {selectedFile?.size ? (
                <Text style={styles.fileSizeText}>
                  Tamaño: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, uploading && { opacity: 0.6 }]}
            onPress={handleSubirManual}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>☁️ SUBIR MANUAL A SUPABASE</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* LISTADO DE MANUALES DISPONIBLES PARA TODO EL PERSONAL */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📚 Biblioteca de Manuales Operativos ({manuals.length})</Text>
        <Text style={styles.cardDesc}>
          Documentación técnica y guías disponibles para descarga o lectura:
        </Text>

        {manuals.length === 0 ? (
          <Text style={{ color: '#86efac', fontStyle: 'italic', marginVertical: 10 }}>
            No hay manuales cargados en la biblioteca.
          </Text>
        ) : (
          manuals.map((m) => (
            <View key={m.id} style={styles.manualCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.pdfIconCircle}>
                  <Text style={{ fontSize: 20 }}>📑</Text>
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.manualTitle}>{m.titulo}</Text>
                  <Text style={styles.manualFormat}>Formato: Documento PDF</Text>
                </View>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.openPdfBtn}
                  onPress={() => handleOpenPDF(m.pdf_url)}
                >
                  <Text style={styles.openPdfText}>📥 Abrir PDF</Text>
                </TouchableOpacity>

                {esAdmin && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleEliminarManual(m.id, m.titulo)}
                  >
                    <Text style={styles.deleteText}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    padding: 16,
    paddingBottom: 110,
    backgroundColor: '#04271c',
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
    marginBottom: 6,
  },
  cardDesc: {
    color: '#d1fae5',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
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
  filePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#031f16',
    borderWidth: 1,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 14,
    marginVertical: 6,
  },
  filePickerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  filePickerText: {
    color: '#4ade80',
    fontWeight: 'bold',
    fontSize: 13,
  },
  fileSizeText: {
    color: '#a7f3d0',
    fontSize: 11,
    marginTop: 2,
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
  manualCard: {
    backgroundColor: '#03251a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#08533c',
  },
  pdfIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#064230',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  manualTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  manualFormat: {
    color: '#a7f3d0',
    fontSize: 11,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  openPdfBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  openPdfText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteBtn: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteText: {
    fontSize: 12,
  },
});