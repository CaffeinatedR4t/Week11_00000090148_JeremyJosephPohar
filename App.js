import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { supabase } from './lib/supabase';
import { decode } from 'base64-arraybuffer';

export default function App() {
  const [facing, setFacing] = useState('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
    })();
  }, []);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted || !locationPermission) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 10 }}>We need your permission to show the camera and get location</Text>
        <TouchableOpacity onPress={async () => {
          await requestPermission();
          const { status } = await Location.requestForegroundPermissionsAsync();
          setLocationPermission(status === 'granted');
        }} style={styles.button}>
          <Text style={styles.text}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photoData = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.5,
        });
        setPhoto(photoData);
      } catch (error) {
        console.error(error);
        Alert.alert('Error', 'Failed to take picture');
      }
    }
  };

  const uploadToSupabase = async () => {
    if (!photo) return;
    setUploading(true);

    try {
      // 1. Get Location
      const location = await Location.getCurrentPositionAsync({});
      const latitude = location.coords.latitude;
      const longitude = location.coords.longitude;

      // 2. Upload Image to Storage
      const fileName = `photo-${Date.now()}.jpg`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from('camera')
        .upload(fileName, decode(photo.base64), {
          contentType: 'image/jpeg',
        });

      if (storageError) throw storageError;

      const { data: publicUrlData } = supabase.storage
        .from('camera')
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;

      // 3. Insert into Database
      const { error: dbError } = await supabase
        .from('photo')
        .insert([
          { latitude: latitude, longitude: longitude, image_url: imageUrl }
        ]);

      if (dbError) throw dbError;

      Alert.alert('Success', 'Photo and location uploaded to Supabase!');
      setPhoto(null); // Reset
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  if (photo) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photo.uri }} style={styles.preview} />
        <View style={styles.previewButtons}>
          <TouchableOpacity style={styles.button} onPress={() => setPhoto(null)} disabled={uploading}>
            <Text style={styles.text}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={uploadToSupabase} disabled={uploading}>
            <Text style={styles.text}>{uploading ? 'Uploading...' : 'Upload'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Text style={styles.text}>Flip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={takePicture}>
            <Text style={styles.text}>Capture</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  button: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
    borderRadius: 10,
  },
  text: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  preview: {
    flex: 1,
    resizeMode: 'contain',
  },
  previewButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: 'black',
  }
});
