import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../types';

// =======================================================
// CARGA PROTEGIDA DE AUDIO (Evita la pantalla roja de error)
// =======================================================
let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch (err) {
  Audio = null;
  console.log('Módulo de audio no cargado aún:', err);
}

interface MensajeChat {
  id: string;
  user_id: string;
  nombre: string;
  rol: string;
  texto?: string;
  archivo_url?: string;
  archivo_nombre?: string;
  tipo_archivo?: 'texto' | 'imagen' | 'audio' | 'documento';
  created_at: string;
}

interface ChatScreenProps {
  profile: UserProfile;
}

export default function ChatScreen({ profile }: ChatScreenProps) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState<string>('');
  const [subiendoArchivo, setSubiendoArchivo] = useState<boolean>(false);

  // Estados de Audio / Grabación
  const [grabacion, setGrabacion] = useState<any>(null);
  const [grabando, setGrabando] = useState<boolean>(false);
  const [sonidoReproduciendo, setSonidoReproduciendo] = useState<any>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    cargarMensajes();

    // Tiempo real con Supabase
    const canal = supabase
      .channel('chat_sala_tecnica')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_mensajes' },
        (payload) => {
          setMensajes((prev) => [...prev, payload.new as MensajeChat]);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
      if (sonidoReproduciendo) {
        sonidoReproduciendo.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const cargarMensajes = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_mensajes')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(60);

      if (!error && data) {
        setMensajes(data as MensajeChat[]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 200);
      }
    } catch (err) {
      console.log('Error de red al cargar mensajes');
    }
  };

  // ==========================================
  // 1. SUBIR ARCHIVO A SUPABASE STORAGE
  // ==========================================
  const subirArchivoStorage = async (uri: string, nombreArchivo: string, mimeType: string) => {
    const ext = nombreArchivo.split('.').pop() || 'bin';
    const ruta = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const res = await fetch(uri);
    const blob = await res.blob();

    const { error: uploadError } = await supabase.storage
      .from('chat-archivos')
      .upload(ruta, blob, { contentType: mimeType });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('chat-archivos').getPublicUrl(ruta);
    return data.publicUrl;
  };

  // ==========================================
  // 2. ENVIAR TEXTO O REACCIÓN
  // ==========================================
  const enviarMensajeTexto = async (textoAEnviar?: string) => {
    const texto = (textoAEnviar ?? nuevoTexto).trim();
    if (!texto) return;

    setNuevoTexto('');
    try {
      await supabase.from('chat_mensajes').insert([
        {
          user_id: profile.id,
          nombre: profile.nombre_completo,
          rol: profile.rol,
          texto: texto,
          tipo_archivo: 'texto',
        },
      ]);
    } catch (error) {
      Alert.alert('Sin Conexión', 'Verifica tu conexión a internet.');
    }
  };

  // ==========================================
  // 3. GRABACIÓN DE NOTAS DE VOZ
  // ==========================================
  const iniciarGrabacion = async () => {
    if (!Audio) {
      Alert.alert(
        'Módulo no listo',
        'En la terminal de VS Code presiona Ctrl+C e inicia con: npx expo start -c'
      );
      return;
    }

    try {
      const permiso = await Audio.requestPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Permiso Denegado', 'Se requiere acceso al micrófono para grabar notas de voz.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setGrabacion(recording);
      setGrabando(true);
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo iniciar la grabación.');
    }
  };

  const detenerYEnviarAudio = async () => {
    if (!grabacion) return;
    setGrabando(false);
    setSubiendoArchivo(true);

    try {
      await grabacion.stopAndUnloadAsync();
      const uri = grabacion.getURI();
      setGrabacion(null);

      if (uri) {
        const publicUrl = await subirArchivoStorage(uri, 'audio.m4a', 'audio/m4a');

        await supabase.from('chat_mensajes').insert([
          {
            user_id: profile.id,
            nombre: profile.nombre_completo,
            rol: profile.rol,
            archivo_url: publicUrl,
            archivo_nombre: 'Nota de Voz',
            tipo_archivo: 'audio',
          },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo enviar la nota de voz.');
    } finally {
      setSubiendoArchivo(false);
    }
  };

  const reproducirAudio = async (url: string) => {
    if (!Audio) return;
    try {
      if (sonidoReproduciendo) {
        await sonidoReproduciendo.stopAsync();
        await sonidoReproduciendo.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      setSonidoReproduciendo(sound);
      await sound.playAsync();
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo reproducir el audio.');
    }
  };

  // ==========================================
  // 4. ARCHIVOS PESADOS (ISO, ZIP, PDF, APK, ETC.)
  // ==========================================
  const seleccionarArchivo = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        setSubiendoArchivo(true);

        const publicUrl = await subirArchivoStorage(
          file.uri,
          file.name,
          file.mimeType || 'application/octet-stream'
        );

        await supabase.from('chat_mensajes').insert([
          {
            user_id: profile.id,
            nombre: profile.nombre_completo,
            rol: profile.rol,
            archivo_url: publicUrl,
            archivo_nombre: file.name,
            tipo_archivo: 'documento',
          },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error al Subir', err.message || 'Error al procesar el archivo.');
    } finally {
      setSubiendoArchivo(false);
    }
  };

  // ==========================================
  // 5. SELECCIONAR IMAGEN
  // ==========================================
  const seleccionarImagen = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!res.canceled && res.assets && res.assets[0]) {
      const asset = res.assets[0];
      setSubiendoArchivo(true);
      try {
        const publicUrl = await subirArchivoStorage(asset.uri, 'imagen.jpg', 'image/jpeg');
        await supabase.from('chat_mensajes').insert([
          {
            user_id: profile.id,
            nombre: profile.nombre_completo,
            rol: profile.rol,
            archivo_url: publicUrl,
            archivo_nombre: 'Foto de Guardia',
            tipo_archivo: 'imagen',
          },
        ]);
      } catch (err: any) {
        Alert.alert('Error', 'No se pudo subir la foto.');
      } finally {
        setSubiendoArchivo(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Cabecera del Chat */}
      <View style={styles.header}>
        <View style={styles.avatarIcon}><Text style={{ fontSize: 18 }}>📡</Text></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerTitle}>Sala Técnica VEN 911</Text>
          <Text style={styles.headerSub}>Canal de Comunicaciones de Guardia</Text>
        </View>
      </View>

      {/* Indicador de Subida */}
      {subiendoArchivo && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.uploadingText}>Subiendo archivo...</Text>
        </View>
      )}

      {/* Lista de Mensajes */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatScroll}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
      >
        {mensajes.map((m) => {
          const esMio = m.user_id === profile.id;
          const hora = m.created_at
            ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';

          return (
            <View
              key={m.id}
              style={[styles.messageBubble, esMio ? styles.bubbleMio : styles.bubbleOtro]}
            >
              {!esMio && <Text style={styles.senderName}>{m.nombre}</Text>}

              {/* Texto */}
              {m.tipo_archivo === 'texto' && (
                <Text style={styles.messageText}>{m.texto}</Text>
              )}

              {/* Nota de Voz */}
              {m.tipo_archivo === 'audio' && (
                <TouchableOpacity
                  style={styles.audioPlayerBtn}
                  onPress={() => m.archivo_url && reproducirAudio(m.archivo_url)}
                >
                  <Text style={styles.audioIcon}>▶️</Text>
                  <Text style={styles.audioText}>Nota de Voz (Tocar para oír)</Text>
                </TouchableOpacity>
              )}

              {/* Documento / Archivo Pesado */}
              {m.tipo_archivo === 'documento' && (
                <TouchableOpacity
                  style={styles.fileCard}
                  onPress={() => m.archivo_url && Linking.openURL(m.archivo_url)}
                >
                  <Text style={styles.fileIcon}>📦</Text>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {m.archivo_nombre || 'Descargar Archivo'}
                    </Text>
                    <Text style={styles.fileAction}>Toca para descargar</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Imagen */}
              {m.tipo_archivo === 'imagen' && (
                <TouchableOpacity onPress={() => m.archivo_url && Linking.openURL(m.archivo_url)}>
                  <Text style={{ color: '#67e8f9', textDecorationLine: 'underline', marginVertical: 4 }}>
                    🖼️ Ver Imagen Adjunta
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.timestamp}>{hora}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Botones de Reacción */}
      <View style={styles.reactionsRow}>
        {['👍', '🚨', '⚠️', '✅', '🛠️', '📡', '📞'].map((emoji) => (
          <TouchableOpacity
            key={emoji}
            style={styles.reactionBtn}
            onPress={() => enviarMensajeTexto(emoji)}
          >
            <Text style={{ fontSize: 16 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Barra de Entrada */}
      <View style={styles.inputBar}>
        {/* Cámara */}
        <TouchableOpacity style={styles.iconActionBtn} onPress={seleccionarImagen}>
          <Text style={{ fontSize: 18 }}>📷</Text>
        </TouchableOpacity>

        {/* Clip de Archivos */}
        <TouchableOpacity style={styles.iconActionBtn} onPress={seleccionarArchivo}>
          <Text style={{ fontSize: 18 }}>📎</Text>
        </TouchableOpacity>

        {/* Entrada de Texto */}
        <TextInput
          style={styles.textInput}
          placeholder="Escribe un mensaje al equipo..."
          placeholderTextColor="#4b7362"
          value={nuevoTexto}
          onChangeText={setNuevoTexto}
        />

        {/* Botón Enviar o Micrófono */}
        {nuevoTexto.trim().length > 0 ? (
          <TouchableOpacity
            style={styles.sendButton}
            onPress={() => enviarMensajeTexto()}
          >
            <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>➤</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.micButton, grabando && styles.micButtonActive]}
            onPressIn={iniciarGrabacion}
            onPressOut={detenerYEnviarAudio}
          >
            <Text style={{ fontSize: 18 }}>{grabando ? '⏹️' : '🎙️'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04271c' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#064230',
    borderBottomWidth: 1,
    borderBottomColor: '#0a5c43',
  },
  avatarIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#03251a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  headerSub: { color: '#a7f3d0', fontSize: 11, marginTop: 1 },
  uploadingBar: {
    flexDirection: 'row',
    backgroundColor: '#065f46',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadingText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  chatScroll: { flex: 1 },
  messageBubble: {
    maxWidth: '82%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  bubbleMio: {
    alignSelf: 'flex-end',
    backgroundColor: '#0e6245',
    borderBottomRightRadius: 2,
  },
  bubbleOtro: {
    alignSelf: 'flex-start',
    backgroundColor: '#063829',
    borderBottomLeftRadius: 2,
  },
  senderName: { color: '#4ade80', fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  messageText: { color: '#ffffff', fontSize: 14 },
  timestamp: { color: '#86efac', fontSize: 9, alignSelf: 'flex-end', marginTop: 4 },
  audioPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#04271c',
    padding: 8,
    borderRadius: 8,
    marginVertical: 4,
  },
  audioIcon: { fontSize: 16, marginRight: 6 },
  audioText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#04271c',
    padding: 8,
    borderRadius: 8,
    marginVertical: 4,
  },
  fileIcon: { fontSize: 20 },
  fileName: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  fileAction: { color: '#38bdf8', fontSize: 10, marginTop: 2 },
  reactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    backgroundColor: '#05291d',
    borderTopWidth: 1,
    borderTopColor: '#0a5c43',
  },
  reactionBtn: { padding: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#031f16',
    borderTopWidth: 1,
    borderTopColor: '#0a5c43',
    gap: 8,
  },
  iconActionBtn: { padding: 6 },
  textInput: {
    flex: 1,
    backgroundColor: '#05291d',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#0a5c43',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#064230',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: {
    backgroundColor: '#dc2626',
  },
});