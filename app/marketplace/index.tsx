import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Product as APIProduct, getProducts } from './api';
import ProductCard from './components/ProductCard';

export default function MarketplaceScreen() {
  const router = useRouter();
  const [products, setProducts] = React.useState<APIProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeCategory, setActiveCategory] = React.useState('merch');
  const [fabExpanded, setFabExpanded] = React.useState(false);

  const categories = [
    { key: 'merch', label: '🎬 Movies & Fan Merch' },
    { key: 'digital', label: '🎨 Digital Creatives' },
    { key: 'services', label: '🎥 Film Services' },
    { key: 'promos', label: '📣 Promotions & Ads' },
    { key: 'events', label: '🎟️ Events & Experiences' },
    { key: 'lifestyle', label: '🛍️ Lifestyle' },
  ];

  React.useEffect(() => {
    const fetchProducts = async () => {
      try {
        const fetchedProducts = await getProducts();
        setProducts(fetchedProducts);
      } catch (error: any) {
        console.error('Error fetching products:', error);
        Alert.alert('Error', 'Failed to load products. Please try again later.');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E50914" />
        <Text style={styles.loadingText}>Loading Marketplace...</Text>
      </SafeAreaView>
    );
  }

  // Filter out products without an id and narrow types for TS
  const validProducts = products.filter((p): p is APIProduct & { id: string } => !!p.id);

  // Group products by category (assume product.category exists)
  const grouped = categories.reduce((acc, cat) => {
    acc[cat.key] = validProducts.filter(p => p.category === cat.key);
    return acc;
  }, {} as Record<string, APIProduct[]>);

  // Featured products (first 3 in active category)
  const featured = grouped[activeCategory]?.slice(0, 3) || [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Floating orb gradients for depth */}
      <View style={styles.bgOrbPrimary} />
      <View style={styles.bgOrbSecondary} />
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Glassy header hero */}
        <View style={styles.headerWrap}>
          <View style={styles.headerBar}>
            <View style={styles.titleRow}>
              <View style={styles.accentDot} />
              <View>
                <Text style={styles.headerEyebrow}>Marketplace</Text>
                <Text style={styles.headerText}>Fan Collectibles & Creators</Text>
              </View>
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/profile')}>
                <View style={styles.iconBg}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Me</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerMetaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>{validProducts.length} items</Text>
            </View>
            <View style={[styles.metaPill, styles.metaPillSoft]}>
              <Text style={styles.metaText}>{categories.length} categories</Text>
            </View>
            <View style={[styles.metaPill, styles.metaPillOutline]}>
              <Text style={styles.metaText}>Safe & Moderated</Text>
            </View>
          </View>
        </View>

        {/* Category Chips */}
        <View style={styles.tabsRow}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.tab, activeCategory === cat.key && styles.tabActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={[styles.tabText, activeCategory === cat.key && styles.tabTextActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Featured Section */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>Featured</Text>
          <View style={styles.productsGrid}>
            {featured.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onPress={() => router.push((`/marketplace/${product.id}`) as any)}
                featured
              />
            ))}
          </View>
        </View>

        {/* Category Section */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeader}>{categories.find(c => c.key === activeCategory)?.label}</Text>
          <View style={styles.productsGrid}>
            {grouped[activeCategory]?.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onPress={() => router.push((`/marketplace/${product.id}`) as any)}
              />
            ))}
            {grouped[activeCategory]?.length === 0 && (
              <Text style={styles.emptyText}>No products yet in this category.</Text>
            )}
          </View>
        </View>

        {/* Marketplace Rules & Safety */}
        <View style={styles.rulesSection}>
          <Text style={styles.rulesHeader}>Marketplace Rules & Safety</Text>
          <Text style={styles.rulesText}>❌ No pirated movies/series, streaming account sharing, adult/drugs/weapons, scams, or fake giveaways. Only fan-made/original designs allowed. Sellers must prove rights for studio logos. All listings are moderated.</Text>
        </View>
      </ScrollView>

      {/* Main FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setFabExpanded(!fabExpanded)}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 24 }}>+</Text>
      </TouchableOpacity>
      {/* Sub FABs (example actions) */}
      {fabExpanded && (
        <>
          <TouchableOpacity
            style={[styles.subFab, { bottom: 220 }]}
            onPress={() => router.push('/marketplace/sell')}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sell</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subFab, { bottom: 280 }]}
            onPress={() => router.push('/marketplace/promote')}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Promote</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
      bgOrbPrimary: {
        position: 'absolute',
        width: 320,
        height: 320,
        borderRadius: 160,
        top: -40,
        left: -60,
        opacity: 0.5,
        backgroundColor: 'rgba(229,9,20,0.18)',
      },
      bgOrbSecondary: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        bottom: -80,
        right: -40,
        opacity: 0.35,
        backgroundColor: 'rgba(95,132,255,0.14)',
      },
      headerWrap: {
        marginHorizontal: 12,
        marginTop: 60,
        marginBottom: 6,
        borderRadius: 18,
        overflow: 'hidden',
      },
      headerBar: {
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
      },
      titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
      accentDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#e50914',
        shadowColor: '#e50914',
        shadowOpacity: 0.6,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      headerEyebrow: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        letterSpacing: 0.6,
      },
      headerText: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 0.3,
      },
      headerIcons: {
        flexDirection: 'row',
        alignItems: 'center',
      },
      iconBtn: {
        marginLeft: 8,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        shadowColor: '#e50914',
        shadowOpacity: 0.28,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      iconBg: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: '#e50914',
      },
      headerMetaRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 6,
        paddingVertical: 10,
      },
      metaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
      },
      metaPillSoft: {
        backgroundColor: 'rgba(255,255,255,0.08)',
      },
      metaPillOutline: {
        backgroundColor: 'rgba(255,255,255,0.05)',
      },
      metaText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
      },
      tabText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
      },
      tabTextActive: {
        color: '#fff',
      },
      sectionBlock: {
        marginBottom: 16,
        paddingVertical: 2,
        paddingHorizontal: 2,
      },
      fab: {
        position: 'absolute',
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
        right: 18,
        bottom: 120,
        backgroundColor: '#e50914',
        borderRadius: 36,
        borderWidth: 0,
        borderColor: 'transparent',
        elevation: 12,
        shadowColor: '#e50914',
        shadowOpacity: 0.36,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      subFab: {
        position: 'absolute',
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
        right: 18,
        backgroundColor: '#e50914',
        borderRadius: 32,
        elevation: 10,
        shadowColor: '#e50914',
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
    tabsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: 12,
      flexWrap: 'wrap',
      gap: 8,
    },
    tab: {
      color: '#fff',
      backgroundColor: '#222',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      marginHorizontal: 4,
      fontWeight: '600',
      fontSize: 14,
      overflow: 'hidden',
    },
    tabActive: {
      backgroundColor: '#E50914',
      color: '#fff',
      shadowColor: '#E50914',
      shadowOpacity: 0.3,
      shadowRadius: 6,
    },
    featuredSection: {
      marginBottom: 18,
      padding: 8,
      backgroundColor: 'rgba(229,9,20,0.08)',
      borderRadius: 16,
    },
    sectionHeader: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#E50914',
      marginBottom: 8,
      marginTop: 4,
    },
    categorySection: {
      marginBottom: 24,
    },
    emptyText: {
      color: '#999',
      fontSize: 16,
      textAlign: 'center',
      marginVertical: 24,
    },
    rulesSection: {
      marginTop: 24,
      padding: 12,
      backgroundColor: '#111',
      borderRadius: 12,
    },
    rulesHeader: {
      color: '#E50914',
      fontWeight: 'bold',
      fontSize: 16,
      marginBottom: 6,
    },
    rulesText: {
      color: '#fff',
      fontSize: 13,
      lineHeight: 18,
    },
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
    padding: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
});
