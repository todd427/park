import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'park_user_id';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useUserId(): string {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    (async () => {
      let id = await AsyncStorage.getItem(KEY);
      if (!id) {
        id = generateId();
        await AsyncStorage.setItem(KEY, id);
      }
      setUserId(id);
    })();
  }, []);

  return userId;
}
