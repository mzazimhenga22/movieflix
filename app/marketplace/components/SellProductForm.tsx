import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, Alert, TouchableOpacity, Image, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { uploadFileToSupabase, createMarketplaceListing, ProductCategory, ProductType } from '../api';
import { formatKsh } from '../../../lib/money';

export default function SellProductFormScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>(ProductCategory.MERCHANDISE); // Default
  const [selectedProductType, setSelectedProductType] = useState<ProductType>(ProductType.PHYSICAL); // Default

  const pickImage = async () => {
    // Request media library permissions
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setUploading(true);
      try {
        const fileName = `product_images/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const publicUrl = await uploadFileToSupabase(uri, fileName);
        setImageUrl(publicUrl);
        Alert.alert('Upload Successful', 'Image uploaded to Supabase!');
      } catch (error: any) {
        console.error('Error uploading image:', error);
        Alert.alert('Upload Failed', error.message || 'Could not upload image.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSubmit = async () => {
    if (!name || !description || !price || !imageUrl) {
      Alert.alert('Missing Info', 'Please fill all fields and upload an image.');
      return;
    }
    
    // Placeholder for sellerId - in a real app, this would come from an authenticated user
    const sellerId = 'placeholderUserId123'; 
    const sellerName = 'Anonymous Seller'; // Placeholder

    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid price greater than zero.');
      return;
    }

    const categoryKey = (() => {
      switch (selectedCategory) {
        case ProductCategory.DIGITAL_GOODS:
          return 'digital';
        case ProductCategory.FILM_SERVICES:
          return 'services';
        case ProductCategory.ADVERTISING:
          return 'promos';
        case ProductCategory.EVENTS:
          return 'events';
        case ProductCategory.LIFESTYLE:
          return 'lifestyle';
        default:
          return 'merch';
      }
    })();

    setUploading(true); // Use the same uploading state for form submission
    try {
      await createMarketplaceListing({
        name,
        description,
        price: priceValue,
        categoryKey,
        categoryLabel: selectedCategory,
        productType: selectedProductType,
        fallbackImageUrl: imageUrl,
        seller: { id: sellerId, name: sellerName, contact: null, avatar: null, profileId: null },
      });
      Alert.alert('Product Listed!', 'Your product has been successfully listed.');
      // Clear form
      setName('');
      setDescription('');
      setPrice('');
      setImageUrl(null);
      setSelectedCategory(ProductCategory.MERCHANDISE); // Reset to default
      setSelectedProductType(ProductType.PHYSICAL); // Reset to default
    } catch (error: any) {
      console.error('Error adding product:', error);
      Alert.alert('Listing Failed', error.message || 'Could not list product.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.header}>List Your Product</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Product Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Rare Movie Prop"
            placeholderTextColor="#888"
            value={name}
            onChangeText={setName}
            editable={!uploading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your product in detail..."
            placeholderTextColor="#888"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            editable={!uploading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Price (KSh)</Text>
          <TextInput
            style={styles.input}
            placeholder={`e.g., ${formatKsh(2500)}`}
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
            editable={!uploading}
          />
        </View>

        {/* Category Selection (Placeholder TextInputs) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category</Text>
          <TextInput
            style={styles.input}
            placeholder={`e.g., ${ProductCategory.MERCHANDISE}`}
            placeholderTextColor="#888"
            value={selectedCategory}
            onChangeText={(text) => setSelectedCategory(text as ProductCategory)}
            editable={!uploading}
          />
        </View>

        {/* Product Type Selection (Placeholder TextInputs) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Product Type</Text>
          <TextInput
            style={styles.input}
            placeholder={`e.g., ${ProductType.PHYSICAL}`}
            placeholderTextColor="#888"
            value={selectedProductType}
            onChangeText={(text) => setSelectedProductType(text as ProductType)}
            editable={!uploading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Product Image/Video</Text>
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color="#E50914" />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.pickedImage} />
            ) : (
              <Ionicons name="camera-outline" size={40} color="#888" />
            )}
            <Text style={styles.imagePickerText}>
              {uploading ? 'Uploading...' : imageUrl ? 'Change Image' : 'Select Image'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.submitButton}>
          <Button title="List Product" onPress={handleSubmit} color="#E50914" disabled={uploading} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollViewContent: {
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 30,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#FFF',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  imagePicker: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  imagePickerText: {
    color: '#888',
    marginTop: 10,
    fontSize: 16,
  },
  pickedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    borderRadius: 8,
  },
  submitButton: {
    marginTop: 30,
  },
});
