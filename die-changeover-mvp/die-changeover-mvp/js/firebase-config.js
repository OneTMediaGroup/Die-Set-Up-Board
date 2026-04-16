// Add your Firebase config here when you are ready.
// This file is intentionally safe for GitHub starter use.

// Firebase SDK (CDN version)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

// Your config
const firebaseConfig = {
  apiKey: "AIzaSyDr6kZb8z8gYrZT5-3LZ_xiYCnDfODKHEw",
  authDomain: "die-changeover-board.firebaseapp.com",
  projectId: "die-changeover-board",
  storageBucket: "die-changeover-board.firebasestorage.app",
  messagingSenderId: "511859053795",
  appId: "1:511859053795:web:4c6dc720495a932d5f61d6"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

console.log("🔥 Firebase Connected");
