import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Button, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { getProductById, Product } from '../api';
import { formatKsh } from '../../../lib/money';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const [product, setProduct] = React.useState<Product | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchProduct = async () => {
      if (!id || typeof id !== 'string') {
        setLoading(false);
        return;
      }
      try {
        const fetchedProduct = await getProductById(id);
        setProduct(fetchedProduct);
      } catch (error: any) {
        console.error('Error fetching product details:', error);
        Alert.alert('Error', 'Failed to load product details.');
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const handleBuyNow = () => {
    if (!product) return;
    Alert.alert('Purchase', `You are about to buy ${product.name} for ${formatKsh(product.price)}. Confirm?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Buy', onPress: () => Alert.alert('Success', 'Product purchased!') }
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E50914" />
        <Text style={styles.loadingText}>Loading Product...</Text>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Product not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
        <View style={styles.detailsContainer}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productPrice}>{formatKsh(product.price)}</Text>
          <Text style={styles.productDescription}>{product.description}</Text>
          <Text style={styles.sellerInfo}>Seller: {product.sellerName}</Text>
          {product.sellerContact && <Text style={styles.sellerInfo}>Contact: {product.sellerContact}</Text>}
          <View style={styles.buyButton}>
            <Button title="Buy Now" onPress={handleBuyNow} color="#E50914" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#E50914',
    marginTop: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  productImage: {
    width: '100%',
    height: 300,
    resizeMode: 'cover',
  },
  detailsContainer: {
    padding: 15,
  },
  productName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 10,
  },
  productPrice: {
    fontSize: 20,
    color: '#E50914',
    fontWeight: '700',
    marginBottom: 15,
  },
  productDescription: {
    fontSize: 16,
    color: '#E0E0E0',
    lineHeight: 24,
    marginBottom: 20,
  },
  sellerInfo: {
    fontSize: 14,
    color: '#B0B0B0',
    marginBottom: 5,
  },
  buyButton: {
    marginTop: 20,
  },
});
