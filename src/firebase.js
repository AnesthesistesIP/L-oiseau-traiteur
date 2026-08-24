import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Ces valeurs viennent de la console Firebase (Paramètres du projet > Vos applications > Config).
// Elles ne sont PAS secrètes : ce sont des identifiants publics côté client, la vraie protection
// des données se fait via les règles de sécurité Firestore (voir firestore.rules).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
