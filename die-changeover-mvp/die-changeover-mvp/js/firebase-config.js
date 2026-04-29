import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";




const firebaseConfig = {
  apiKey: "AIzaSyDr6kZb8z8gYrZT5-3LZ_xiYCnDfODKHEw",
  authDomain: "die-changeover-board.firebaseapp.com",
  projectId: "die-changeover-board",
  storageBucket: "die-changeover-board.firebasestorage.app",
  messagingSenderId: "511859053795",
  appId: "1:511859053795:web:4c6dc720495a932d5f61d6"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

console.log("🔥 Firebase Connected");
