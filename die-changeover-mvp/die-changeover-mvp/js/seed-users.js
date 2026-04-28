import { db } from './firebase-config.js';
import { collection, setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const users = [
  {
    id: 'u1',
    name: 'Bab S.',
    role: 'dieSetter',
    isActive: true
  },
  {
    id: 'u2',
    name: 'Sully T.',
    role: 'supervisor',
    isActive: true
  },
  {
    id: 'admin1',
    name: 'IT Admin',
    role: 'admin',
    isActive: true
  }
];

async function seedUsers() {
  try {
    for (const user of users) {
      await setDoc(doc(collection(db, 'users'), user.id), {
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: new Date().toISOString()
      });
    }

    console.log('🔥 Users seeded successfully');
  } catch (error) {
    console.error('❌ Failed to seed users:', error);
  }
}

seedUsers();
