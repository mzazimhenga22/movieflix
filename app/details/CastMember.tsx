import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { CastMember } from '../../types';

interface Props {
  member: CastMember;
}

const CastMemberCard: React.FC<Props> = ({ member }) => {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: `https://image.tmdb.org/t/p/w200${member.profile_path}` }}
        style={styles.image}
      />
      <Text style={styles.name} numberOfLines={2}>{member.name}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 15,
    width: 80,
    alignItems: 'center',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333',
  },
  name: {
    color: 'white',
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
  },
});

export default CastMemberCard;
