import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Media } from '../../types';
import { buildProfileScopedKey } from '../../lib/profileStorage';

type Listener = () => void;

class MyListStore {
  private items: Media[] = [];
  private ids: Set<number> = new Set();
  private listeners: Set<Listener> = new Set();
  private profileId: string | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getSnapshot = () => this.ids;
  getItems = () => this.items;

  has = (id: number) => this.ids.has(id);

  async init(profileId: string | null) {
    this.profileId = profileId;
    if (!profileId) {
      this.items = [];
      this.ids = new Set();
      this.notify();
      return;
    }

    const key = buildProfileScopedKey('myList', profileId);
    try {
      const stored = await AsyncStorage.getItem(key);
      const parsed: Media[] = stored ? JSON.parse(stored) : [];
      this.items = Array.isArray(parsed) ? parsed : [];
      this.ids = new Set(this.items.map((m) => m.id).filter((id): id is number => id != null));
      this.notify();
    } catch (e) {
      console.warn('[MyListStore] Failed to load', e);
      this.items = [];
      this.ids = new Set();
      this.notify();
    }
  }

  toggle = async (item: Media) => {
    if (!item?.id) return;
    const exists = this.ids.has(item.id);
    
    if (exists) {
      this.items = this.items.filter((m) => m.id !== item.id);
      this.ids.delete(item.id);
    } else {
      this.items = [...this.items, item];
      this.ids.add(item.id);
    }
    
    // Create new Set to trigger useSyncExternalStore update
    this.ids = new Set(this.ids);
    this.notify();

    if (this.profileId) {
      const key = buildProfileScopedKey('myList', this.profileId);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(this.items));
      } catch (e) {
        console.warn('[MyListStore] Failed to save', e);
      }
    }
  };
}

export const myListStore = new MyListStore();

export function useMyList(id?: number) {
  const ids = useSyncExternalStore(myListStore.subscribe, myListStore.getSnapshot);
  const toggle = useCallback((item: Media) => myListStore.toggle(item), []);
  
  if (id !== undefined) {
    return { isInList: ids.has(id), toggle };
  }
  
  return { ids, toggle, items: myListStore.getItems() };
}
