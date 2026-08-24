import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

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
// On utilise "firestore/lite" plutôt que "firestore" : cette version fonctionne par simples
// requêtes HTTP classiques (une par lecture/écriture), sans connexion permanente ni tentative
// de synchronisation en temps réel. Notre appli n'a jamais besoin de mises à jour "live"
// automatiques (on recharge manuellement), donc rien n'est perdu — et ça évite le mécanisme de
// connexion streaming qui semblait être à l'origine des erreurs "client is offline".
export const db = getFirestore(app);
