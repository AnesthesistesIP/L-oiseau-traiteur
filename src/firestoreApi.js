import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase.js";

// ---------- médecins ----------
export async function getDoctors() {
  const snap = await getDoc(doc(db, "meta", "doctors"));
  return snap.exists() ? snap.data().names || [] : [];
}
export async function saveDoctors(names) {
  await setDoc(doc(db, "meta", "doctors"), { names });
}

// ---------- tarifs par catégorie ----------
export async function getCategoryPrices() {
  const snap = await getDoc(doc(db, "meta", "categoryPrices"));
  return snap.exists() ? snap.data() : { entree: 0, plat: 0, dessert: 0, boisson: 0 };
}
export async function saveCategoryPrices(prices) {
  await setDoc(doc(db, "meta", "categoryPrices"), prices);
}

// ---------- catégories récurrentes (dessert/boisson mémorisés) ----------
export async function getRecurringDefaults() {
  const snap = await getDoc(doc(db, "meta", "recurringDefaults"));
  return snap.exists() ? snap.data() : {};
}
export async function saveRecurringDefaults(defaults) {
  await setDoc(doc(db, "meta", "recurringDefaults"), defaults);
}

// ---------- menus ----------
export async function getMenu(date) {
  const snap = await getDoc(doc(db, "menus", date));
  return snap.exists() ? snap.data() : null;
}
export async function saveMenu(date, categories) {
  await setDoc(doc(db, "menus", date), { categories });
}
// Renvoie tous les menus dont la date (= l'id du document) est >= today, triés.
export async function listUpcomingMenus(todayISO) {
  const snap = await getDocs(collection(db, "menus"));
  const menus = [];
  snap.forEach((d) => {
    if (d.id >= todayISO) menus.push({ date: d.id, categories: d.data().categories || {} });
  });
  menus.sort((a, b) => a.date.localeCompare(b.date));
  return menus;
}

// ---------- commandes ----------
function orderDocId(date, doctor) {
  // Un id de document Firestore ne peut pas contenir de "/", on encode le nom du médecin au cas où.
  return `${date}__${encodeURIComponent(doctor)}`;
}
export async function getOrder(date, doctor) {
  const snap = await getDoc(doc(db, "orders", orderDocId(date, doctor)));
  return snap.exists() ? snap.data() : null;
}
export async function saveOrder(date, doctor, selections, total) {
  await setDoc(doc(db, "orders", orderDocId(date, doctor)), {
    date,
    doctor,
    selections,
    total,
    ts: Date.now(),
  });
}
export async function deleteOrder(date, doctor) {
  await deleteDoc(doc(db, "orders", orderDocId(date, doctor)));
}
export async function listOrdersForDate(date) {
  const q = query(collection(db, "orders"), where("date", "==", date));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((d) => rows.push(d.data()));
  return rows;
}
export async function listOrdersForMonth(monthISO) {
  // monthISO au format "YYYY-MM". Bornes [1er du mois, 1er du mois suivant[.
  const [y, m] = monthISO.split("-").map(Number);
  const start = `${monthISO}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const end = `${nextMonth}-01`;
  const q = query(
    collection(db, "orders"),
    where("date", ">=", start),
    where("date", "<", end)
  );
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((d) => rows.push(d.data()));
  return rows;
}
