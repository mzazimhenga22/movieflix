import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { CastMember } from '../../types';
import CastMemberCard from './CastMember';

interface Props {
  cast: CastMember[];
}

const CastList: React.FC<Props> = ({ cast }) => {
  if (!cast || cast.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meet the Cast</Text>
      <FlatList
        data={cast}
        renderItem={({ item }) => <CastMemberCard member={item} />}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 15 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 25,
  },
  title: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    paddingHorizontal: 15,
  },
});

export default CastList;
