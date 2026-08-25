import { useState, useEffect, useMemo, useRef } from "react";
import { Bird, Plus, X, Download, Check, Loader2, RotateCcw } from "lucide-react";
import * as api from "./firestoreApi.js";

// ---------- constants ----------
// "recurring: true" = catégorie qui change peu d'un jour à l'autre (desserts, boissons) :
// elle est mémorisée automatiquement d'un jour sur l'autre pour éviter de la ressaisir.
const CATEGORIES = [
  { key: "entree", label: "Entrées", singular: "entrée", article: "une", recurring: false },
  { key: "plat", label: "Plats", singular: "plat", article: "un", recurring: false },
  { key: "dessert", label: "Desserts", singular: "dessert", article: "un", recurring: true },
  { key: "boisson", label: "Boissons", singular: "boisson", article: "une", recurring: true },
];
function categoryLabel(key) {
  return (CATEGORIES.find((c) => c.key === key) || {}).label || key;
}
function categorySingular(key) {
  const c = CATEGORIES.find((c) => c.key === key);
  return c ? c.singular : key;
}
function emptyCategories() {
  return { entree: [], plat: [], dessert: [], boisson: [] };
}
function blankRow() {
  return { id: genId(), name: "" };
}
function defaultTraiteurCategories() {
  return { entree: [blankRow()], plat: [blankRow()], dessert: [blankRow()], boisson: [blankRow()] };
}

// ---------- helpers ----------
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function currentMonthISO() {
  return todayISO().slice(0, 7);
}
function genId() {
  return Math.random().toString(36).slice(2, 9);
}
function formatEuro(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
}
function formatDateLong(iso) {
  const d = new Date(iso + "T00:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatDateShort(iso) {
  const d = new Date(iso + "T00:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return s.replace(".", "");
}
function escapeCsv(s) {
  const str = String(s ?? "");
  if (/[;"\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

export default function LOiseauTraiteur() {
  const [tab, setTab] = useState("commander");
  // Erreur réseau/Firestore générique, affichée brièvement en cas de souci de connexion.
  const [globalError, setGlobalError] = useState("");

  // doctors
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [newDoctorInput, setNewDoctorInput] = useState("");
  const [doctorError, setDoctorError] = useState("");

  // menus / ordering
  const [menus, setMenus] = useState([]); // [{date, categories}]
  const [menusLoading, setMenusLoading] = useState(true);
  const [selectedOrderDate, setSelectedOrderDate] = useState("");
  const [myOrder, setMyOrder] = useState(null); // undefined = loading, null = none, {selections,total}
  const [busyCat, setBusyCat] = useState("");
  const [orderSyncError, setOrderSyncError] = useState("");
  // quantité choisie par catégorie (1 par défaut), utilisée au moment de sélectionner un plat
  const [categoryQty, setCategoryQty] = useState({ entree: 1, plat: 1, dessert: 1, boisson: 1 });

  // traiteur tab
  const [traiteurDate, setTraiteurDate] = useState(tomorrowISO());
  const [traiteurCategories, setTraiteurCategories] = useState(defaultTraiteurCategories());
  const [traiteurStatus, setTraiteurStatus] = useState("");
  // dernières valeurs connues des catégories "récurrentes" (dessert, boisson), reprises automatiquement
  // sur les nouveaux jours. La ref évite les soucis de fermeture obsolète dans l'effet de changement de date.
  const recurringDefaultsRef = useRef({});
  // tarifs par catégorie (identiques pour tous les plats d'une même catégorie)
  const categoryPricesRef = useRef({ entree: 0, plat: 0, dessert: 0, boisson: 0 });
  const [categoryPriceInputs, setCategoryPriceInputs] = useState({ entree: "", plat: "", dessert: "", boisson: "" });
  const [priceStatus, setPriceStatus] = useState("");
  // vue "commandes reçues" pour le traiteur, indépendante du jour dont on édite le menu
  const [ordersViewDate, setOrdersViewDate] = useState("");
  const [dayOrders, setDayOrders] = useState([]);
  const [dayOrdersLoading, setDayOrdersLoading] = useState(false);

  // résumé tab
  const [summaryMonth, setSummaryMonth] = useState(currentMonthISO());
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryRows, setSummaryRows] = useState([]); // [{date, doctor, items:[{category,name,price}], total}]

  // ---------- initial loads ----------
  useEffect(() => {
    (async () => {
      try {
        const names = await api.getDoctors();
        setDoctors(names);
      } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
        setGlobalError("Impossible de charger la liste des médecins. Vérifiez votre connexion.");
      }
      setDoctorsLoaded(true);
    })();
    (async () => {
      try {
        recurringDefaultsRef.current = await api.getRecurringDefaults();
      } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
        recurringDefaultsRef.current = {};
      }
    })();
    (async () => {
      try {
        const next = await api.getCategoryPrices();
        categoryPricesRef.current = next;
        setCategoryPriceInputs({
          entree: String(next.entree ?? ""),
          plat: String(next.plat ?? ""),
          dessert: String(next.dessert ?? ""),
          boisson: String(next.boisson ?? ""),
        });
      } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
        /* garde les valeurs par défaut */
      }
    })();
    loadMenus();
  }, []);

  async function loadMenus() {
    setMenusLoading(true);
    try {
      const filtered = (await api.listUpcomingMenus(todayISO())).filter((m) =>
        CATEGORIES.some((c) => (m.categories[c.key] || []).length > 0)
      );
      setMenus(filtered);
      setSelectedOrderDate((prev) => {
        if (prev && filtered.some((m) => m.date === prev)) return prev;
        return filtered.length ? filtered[0].date : "";
      });
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setMenus([]);
      setGlobalError("Impossible de charger les menus. Vérifiez votre connexion.");
    }
    setMenusLoading(false);
  }

  // ---------- doctor management ----------
  async function addDoctor() {
    const name = newDoctorInput.trim();
    if (!name) return;
    setDoctorError("");
    const alreadyExists = doctors.includes(name);
    const updated = alreadyExists ? doctors : [...doctors, name].sort((a, b) => a.localeCompare(b, "fr"));
    // on affiche tout de suite, la sauvegarde partagée se fait ensuite
    setDoctors(updated);
    setSelectedDoctor(name);
    setShowAddDoctor(false);
    setNewDoctorInput("");
    if (!alreadyExists) {
      try {
        await api.saveDoctors(updated);
      } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
        setDoctorError(
          "Votre nom est affiché, mais la sauvegarde a échoué : il risque de disparaître si la page se recharge. Réessayez."
        );
      }
    }
  }

  // ---------- order loading ----------
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!selectedDoctor || !selectedOrderDate) {
        setMyOrder(null);
        return;
      }
      setMyOrder(undefined);
      try {
        const data = await api.getOrder(selectedOrderDate, selectedDoctor);
        if (cancelled) return;
        const order = data ? { selections: data.selections, total: data.total } : null;
        setMyOrder(order);
        // reprend les quantités déjà enregistrées (ou 1 par défaut) dans les sélecteurs
        const nextQty = { entree: 1, plat: 1, dessert: 1, boisson: 1 };
        if (order && order.selections) {
          CATEGORIES.forEach((c) => {
            if (order.selections[c.key] && order.selections[c.key].qty) {
              nextQty[c.key] = order.selections[c.key].qty;
            }
          });
        }
        setCategoryQty(nextQty);
      } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
        if (!cancelled) setMyOrder(null);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedDoctor, selectedOrderDate]);

  function computeTotal(selections) {
    return CATEGORIES.reduce((s, c) => {
      const sel = selections[c.key];
      return s + (sel ? sel.price * (sel.qty || 1) : 0);
    }, 0);
  }

  async function saveSelections(newSelections) {
    const total = computeTotal(newSelections);
    const hasAny = CATEGORIES.some((c) => newSelections[c.key]);
    // affichage immédiat, la sauvegarde se fait ensuite
    setMyOrder(hasAny ? { selections: newSelections, total } : null);
    try {
      if (!hasAny) {
        await api.deleteOrder(selectedOrderDate, selectedDoctor);
      } else {
        await api.saveOrder(selectedOrderDate, selectedDoctor, newSelections, total);
      }
    } catch (e) {
      console.error("[L'Oiseau Traiteur] erreur:", e);
      setOrderSyncError("Votre choix est affiché, mais la sauvegarde a peut-être échoué. Réessayez si besoin.");
    }
  }

  async function toggleSelection(catKey, item) {
    if (!selectedDoctor || !selectedOrderDate) return;
    setOrderSyncError("");
    const current = (myOrder && myOrder.selections) || {};
    const isSame = current[catKey] && current[catKey].id === item.id;
    const price = categoryPricesRef.current[catKey] || 0;
    const qty = categoryQty[catKey] || 1;
    const newSelections = {
      ...current,
      [catKey]: isSame ? null : { id: item.id, name: item.name, price, qty },
    };
    setBusyCat(catKey);
    await saveSelections(newSelections);
    setBusyCat("");
  }

  // Change la quantité pour une catégorie : met à jour le sélecteur, et si un plat est déjà
  // choisi dans cette catégorie, répercute aussitôt la nouvelle quantité sur la commande.
  async function updateQty(catKey, qty) {
    setCategoryQty((prev) => ({ ...prev, [catKey]: qty }));
    const current = (myOrder && myOrder.selections) || {};
    if (!current[catKey]) return; // rien de sélectionné dans cette catégorie, rien à mettre à jour
    setOrderSyncError("");
    const newSelections = { ...current, [catKey]: { ...current[catKey], qty } };
    setBusyCat(catKey);
    await saveSelections(newSelections);
    setBusyCat("");
  }

  async function cancelOrder() {
    if (!selectedDoctor || !selectedOrderDate) return;
    setOrderSyncError("");
    setMyOrder(null);
    setCategoryQty({ entree: 1, plat: 1, dessert: 1, boisson: 1 });
    try {
      await api.deleteOrder(selectedOrderDate, selectedDoctor);
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setOrderSyncError("L'annulation est affichée, mais n'a peut-être pas été enregistrée.");
    }
  }

  // ---------- traiteur tab ----------
  useEffect(() => {
    (async () => {
      setTraiteurStatus("");
      let menuData = null;
      try {
        menuData = await api.getMenu(traiteurDate);
      } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
        /* pas de menu existant ou erreur réseau : on repart d'un formulaire vide */
      }
      if (menuData) {
        const cats = { ...emptyCategories(), ...(menuData.categories || {}) };
        const next = {};
        CATEGORIES.forEach((c) => {
          const arr = cats[c.key] || [];
          next[c.key] = arr.length ? arr.map((d) => ({ id: d.id, name: d.name })) : [blankRow()];
        });
        setTraiteurCategories(next);
      } else {
        const defaults = recurringDefaultsRef.current || {};
        const next = {};
        CATEGORIES.forEach((c) => {
          if (c.recurring && defaults[c.key] && defaults[c.key].length) {
            next[c.key] = defaults[c.key].map((d) => ({ id: genId(), name: d.name }));
          } else {
            next[c.key] = [blankRow()];
          }
        });
        setTraiteurCategories(next);
      }
    })();
  }, [traiteurDate]);

  function updateDishField(catKey, id, field, value) {
    setTraiteurCategories((prev) => ({
      ...prev,
      [catKey]: prev[catKey].map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    }));
  }
  function addDishRow(catKey) {
    setTraiteurCategories((prev) => ({ ...prev, [catKey]: [...prev[catKey], blankRow()] }));
  }
  function removeDishRow(catKey, id) {
    setTraiteurCategories((prev) => ({
      ...prev,
      [catKey]: prev[catKey].length > 1 ? prev[catKey].filter((d) => d.id !== id) : prev[catKey],
    }));
  }

  async function saveMenu() {
    const cleaned = {};
    let totalItems = 0;
    CATEGORIES.forEach((c) => {
      const rows = traiteurCategories[c.key]
        .map((d) => ({ id: d.id, name: d.name.trim() }))
        .filter((d) => d.name);
      cleaned[c.key] = rows;
      totalItems += rows.length;
    });
    if (totalItems === 0) {
      setTraiteurStatus("error");
      return;
    }
    setTraiteurStatus("saving");
    try {
      await api.saveMenu(traiteurDate, cleaned);
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      // on ne recharge pas les menus et on ne touche pas au formulaire : vos plats saisis restent
      // affichés pour que vous puissiez cliquer à nouveau sur "Enregistrer" sans tout retaper.
      setTraiteurStatus("save-error");
      return;
    }
    // mémorise les catégories récurrentes (dessert, boisson) pour préremplir les prochains jours
    const nextDefaults = { ...recurringDefaultsRef.current };
    CATEGORIES.forEach((c) => {
      if (c.recurring && cleaned[c.key] && cleaned[c.key].length) {
        nextDefaults[c.key] = cleaned[c.key];
      }
    });
    recurringDefaultsRef.current = nextDefaults;
    api.saveRecurringDefaults(nextDefaults).catch(() => {});
    setTraiteurStatus("saved");
    loadMenus();
    setTimeout(() => setTraiteurStatus(""), 2000);
  }

  function updatePriceField(catKey, value) {
    setCategoryPriceInputs((prev) => ({ ...prev, [catKey]: value }));
  }

  async function savePrices() {
    const cleaned = {};
    let valid = true;
    CATEGORIES.forEach((c) => {
      const n = parseFloat(String(categoryPriceInputs[c.key]).replace(",", "."));
      if (isNaN(n) || n < 0) valid = false;
      cleaned[c.key] = isNaN(n) ? 0 : n;
    });
    if (!valid) {
      setPriceStatus("error");
      return;
    }
    setPriceStatus("saving");
    categoryPricesRef.current = cleaned;
    try {
      await api.saveCategoryPrices(cleaned);
      setPriceStatus("saved");
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setPriceStatus("save-error");
    }
    setTimeout(() => setPriceStatus(""), 2000);
  }

  // ---------- commandes du jour (vue traiteur) ----------
  // Par défaut, on se cale sur le jour du prochain menu publié (là où il y a le plus de chances
  // qu'il y ait déjà des commandes), plutôt que sur "aujourd'hui" qui peut ne rien contenir.
  useEffect(() => {
    if (!menusLoading && !ordersViewDate) {
      setOrdersViewDate(menus.length ? menus[0].date : todayISO());
    }
  }, [menusLoading, menus, ordersViewDate]);

  useEffect(() => {
    if (tab === "traiteur" && ordersViewDate) loadDayOrders(ordersViewDate);
  }, [tab, ordersViewDate]);

  async function loadDayOrders(date) {
    setDayOrdersLoading(true);
    try {
      const raw = await api.listOrdersForDate(date);
      const rows = raw.map((parsed) => {
        const selections = parsed.selections || {};
        const items = CATEGORIES.filter((c) => selections[c.key]).map((c) => ({
          category: c.key,
          name: selections[c.key].name,
          price: Number(selections[c.key].price) || 0,
          qty: Number(selections[c.key].qty) || 1,
        }));
        return { doctor: parsed.doctor, items, total: Number(parsed.total) || 0 };
      });
      setDayOrders(rows.sort((a, b) => a.doctor.localeCompare(b.doctor, "fr")));
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setDayOrders([]);
    }
    setDayOrdersLoading(false);
  }

  const dayAggregated = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((c) => (map[c.key] = new Map()));
    dayOrders.forEach((o) => {
      o.items.forEach((it) => {
        const m = map[it.category];
        m.set(it.name, (m.get(it.name) || 0) + it.qty);
      });
    });
    return map;
  }, [dayOrders]);

  const dayTotal = useMemo(() => dayOrders.reduce((s, o) => s + o.total, 0), [dayOrders]);

  // ---------- résumé tab ----------
  useEffect(() => {
    if (tab === "resume") loadSummary(summaryMonth);
  }, [tab, summaryMonth]);

  async function loadSummary(month) {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const raw = await api.listOrdersForMonth(month);
      const rows = raw.map((parsed) => {
        const selections = parsed.selections || {};
        const items = CATEGORIES.filter((c) => selections[c.key]).map((c) => ({
          category: c.key,
          name: selections[c.key].name,
          price: Number(selections[c.key].price) || 0,
          qty: Number(selections[c.key].qty) || 1,
        }));
        return { date: parsed.date, doctor: parsed.doctor, items, total: Number(parsed.total) || 0 };
      });
      setSummaryRows(rows);
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setSummaryError("Impossible de charger le résumé pour ce mois.");
      setSummaryRows([]);
    }
    setSummaryLoading(false);
  }

  const grouped = useMemo(() => {
    const map = new Map();
    summaryRows.forEach((r) => {
      if (!map.has(r.doctor)) {
        map.set(r.doctor, { doctor: r.doctor, counts: { entree: 0, plat: 0, dessert: 0, boisson: 0 }, total: 0 });
      }
      const g = map.get(r.doctor);
      g.total += r.total;
      r.items.forEach((it) => {
        g.counts[it.category] = (g.counts[it.category] || 0) + (it.qty || 1);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.doctor.localeCompare(b.doctor, "fr"));
  }, [summaryRows]);

  const grandTotal = useMemo(() => grouped.reduce((s, g) => s + g.total, 0), [grouped]);
  const grandCounts = useMemo(() => {
    const totals = { entree: 0, plat: 0, dessert: 0, boisson: 0 };
    grouped.forEach((g) => CATEGORIES.forEach((c) => (totals[c.key] += g.counts[c.key] || 0)));
    return totals;
  }, [grouped]);

  function describeItems(items) {
    return items
      .map((it) => {
        const s = categorySingular(it.category);
        const label = `${s.charAt(0).toUpperCase()}${s.slice(1)}: ${it.name}`;
        return it.qty > 1 ? `${label} ×${it.qty}` : label;
      })
      .join(" / ");
  }

  function exportCSV() {
    const lines = [];
    lines.push("Médecin;Entrées;Plats;Desserts;Boissons;Total (EUR)");
    grouped.forEach((g) =>
      lines.push(
        `${escapeCsv(g.doctor)};${g.counts.entree};${g.counts.plat};${g.counts.dessert};${g.counts.boisson};${g.total
          .toFixed(2)
          .replace(".", ",")}`
      )
    );
    lines.push(
      `TOTAL;${grandCounts.entree};${grandCounts.plat};${grandCounts.dessert};${grandCounts.boisson};${grandTotal
        .toFixed(2)
        .replace(".", ",")}`
    );
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-repas-${summaryMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const currentMenu = menus.find((m) => m.date === selectedOrderDate);
  const activeCategories = currentMenu ? CATEGORIES.filter((c) => (currentMenu.categories[c.key] || []).length > 0) : [];
  const orderTotal = myOrder && myOrder.total ? myOrder.total : 0;
  const orderSummaryText =
    myOrder && myOrder.selections
      ? CATEGORIES.filter((c) => myOrder.selections[c.key])
          .map((c) => {
            const sel = myOrder.selections[c.key];
            return sel.qty > 1 ? `${sel.name} ×${sel.qty}` : sel.name;
          })
          .join(" · ")
      : "";

  return (
    <div className="lf-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        .lf-root {
          --paper: #F7F4EA;
          --card: #FFFFFF;
          --ink: #2A2A20;
          --ink-soft: #746E5C;
          --pine: #2E5C52;
          --pine-dark: #1E3F38;
          --pine-light: #DCEAE6;
          --blush: #E8A9B4;
          --blush-light: #F7DEE3;
          --coral: #AD5A3E;
          --coral-light: #F2E1D9;
          --line: #E2DECE;
          font-family: 'Inter', sans-serif;
          background: var(--paper);
          color: var(--ink);
          min-height: 100%;
          padding: 28px 18px 60px;
          box-sizing: border-box;
        }
        .lf-root * { box-sizing: border-box; }
        .lf-wrap { max-width: 880px; margin: 0 auto; }

        .lf-header { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
        .lf-logo {
          width: 48px; height: 48px; border-radius: 999px; background: #fff; border: 2px solid var(--pine);
          color: var(--pine); display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lf-header h1 {
          font-family: 'Cormorant Garamond', serif; font-weight: 700; font-size: 32px; margin: 0;
          letter-spacing: -0.01em;
        }
        .lf-sub { margin: 2px 0 0; color: var(--ink-soft); font-size: 13.5px; }

        .lf-banner {
          background: var(--blush-light); border: 1px solid var(--blush); color: var(--ink);
          border-radius: 12px; padding: 12px 16px; font-size: 13px; line-height: 1.5; margin-bottom: 18px;
        }

        .lf-tabs { display: flex; gap: 6px; margin-bottom: 22px; border-bottom: 1px solid var(--line); }
        .lf-tab {
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; color: var(--ink-soft);
          background: none; border: none; padding: 10px 14px; cursor: pointer;
          border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s, border-color .15s;
        }
        .lf-tab:hover { color: var(--pine-dark); }
        .lf-tab.active { color: var(--pine-dark); border-bottom-color: var(--pine); }
        .lf-tab:focus-visible { outline: 2px solid var(--pine); outline-offset: 2px; border-radius: 4px; }

        .lf-card {
          background: var(--card); border: 1px solid var(--line); border-radius: 16px;
          padding: 22px; margin-bottom: 16px;
        }
        .lf-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .lf-label { font-size: 13px; font-weight: 600; color: var(--ink-soft); margin-bottom: 8px; display: block; }

        .lf-select, .lf-input {
          font-family: 'Inter', sans-serif; font-size: 14px; color: var(--ink);
          border: 1px solid var(--line); border-radius: 9px; padding: 9px 12px;
          background: var(--paper); outline: none; transition: border-color .15s;
        }
        .lf-select:focus, .lf-input:focus { border-color: var(--pine); }

        .lf-btn {
          font-family: 'Inter', sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer;
          border-radius: 9px; padding: 9px 15px; border: 1px solid transparent;
          display: inline-flex; align-items: center; gap: 6px; transition: background .15s, border-color .15s, opacity .15s;
        }
        .lf-btn:focus-visible { outline: 2px solid var(--pine); outline-offset: 2px; }
        .lf-btn-primary { background: var(--pine); color: #fff; }
        .lf-btn-primary:hover { background: var(--pine-dark); }
        .lf-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .lf-btn-ghost { background: transparent; color: var(--pine-dark); border-color: var(--line); }
        .lf-btn-ghost:hover { background: var(--pine-light); }
        .lf-btn-text { background: none; color: var(--ink-soft); padding: 6px 8px; }
        .lf-btn-text:hover { color: var(--coral); }

        .lf-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
        .lf-pill {
          font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer;
          border: 1px solid var(--line); background: var(--card); color: var(--ink-soft);
          border-radius: 999px; padding: 8px 14px; transition: background .15s, color .15s, border-color .15s;
        }
        .lf-pill.active { background: var(--pine); border-color: var(--pine); color: #fff; }
        .lf-pill:hover:not(.active) { border-color: var(--pine); color: var(--pine-dark); }

        .lf-catsection { margin-bottom: 20px; }
        .lf-catsection h3 {
          font-family: 'Cormorant Garamond', serif; font-size: 15px; font-weight: 600; margin: 0;
          color: var(--pine-dark);
        }
        .lf-catprice { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-soft); font-weight: 500; }
        .lf-catheader-order { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
        .lf-catheader-order h3 { margin: 0; }
        .lf-qty-picker { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); font-weight: 600; }
        .lf-qty-picker select {
          font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; color: var(--ink);
          border: 1px solid var(--line); border-radius: 7px; padding: 3px 6px; background: var(--paper);
        }
        .lf-dish-qty-badge { color: var(--pine); font-weight: 700; }
        .lf-catheader { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .lf-recurring-hint {
          font-size: 11.5px; color: var(--ink-soft); background: var(--blush-light);
          padding: 3px 8px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;
        }
        .lf-dishes { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .lf-dish {
          border: 1.5px solid var(--line); border-radius: 13px; padding: 14px; cursor: pointer;
          background: var(--card); transition: border-color .15s, background .15s, transform .1s;
          position: relative;
        }
        .lf-dish:hover { border-color: var(--pine); transform: translateY(-1px); }
        .lf-dish.selected { border-color: var(--pine); background: var(--pine-light); }
        .lf-dish-name { font-weight: 600; font-size: 14px; margin-bottom: 6px; line-height: 1.3; padding-right: 20px; }
        .lf-dish-price { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--ink-soft); }
        .lf-dish-check {
          position: absolute; top: 12px; right: 12px; width: 20px; height: 20px; border-radius: 999px;
          background: var(--pine); color: #fff; display: flex; align-items: center; justify-content: center;
        }

        .lf-ordersummary {
          border-top: 1px solid var(--line); margin-top: 4px; padding-top: 16px;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
        }
        .lf-ordersummary-text { font-size: 13.5px; }
        .lf-ordersummary-total { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 16px; color: var(--pine-dark); }

        .lf-empty { text-align: center; padding: 34px 20px; color: var(--ink-soft); }
        .lf-empty-title { font-family: 'Cormorant Garamond', serif; font-size: 18px; color: var(--ink); margin: 0 0 6px; font-weight: 600; }

        .lf-dishrow { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
        .lf-dishrow .lf-input:first-child { flex: 1; }

        .lf-status { font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
        .lf-status.ok { color: var(--pine-dark); }
        .lf-status.err { color: var(--coral); }

        .lf-spin { animation: lf-spin 0.8s linear infinite; }
        @keyframes lf-spin { to { transform: rotate(360deg); } }

        .lf-menupreview h3 { font-family: 'Cormorant Garamond', serif; font-size: 15px; margin: 0 0 12px; }
        .lf-preview-item { padding: 10px 0; border-bottom: 1px dashed var(--line); font-size: 13.5px; }
        .lf-preview-item:last-child { border-bottom: none; }
        .lf-preview-date { font-weight: 600; display: block; margin-bottom: 3px; }
        .lf-preview-cats { color: var(--ink-soft); font-size: 12.5px; }

        table.lf-table { width: 100%; border-collapse: collapse; }
        .lf-table th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--ink-soft); padding: 8px 10px; border-bottom: 1px solid var(--line); }
        .lf-table td { padding: 11px 10px; border-bottom: 1px solid var(--line); font-size: 14px; }
        .lf-table tr.lf-total-row td { font-weight: 700; border-bottom: none; border-top: 2px solid var(--ink); }
        .lf-doctor-row { cursor: pointer; }
        .lf-doctor-row:hover { background: var(--paper); }
        .lf-mono { font-family: 'IBM Plex Mono', monospace; }
        .lf-detail-row td { background: var(--paper); font-size: 13px; color: var(--ink-soft); }

        @media (prefers-reduced-motion: reduce) {
          .lf-root * { transition: none !important; animation: none !important; }
        }
      `}</style>

      <div className="lf-wrap">
        <div className="lf-header">
          <div className="lf-logo">
            <Bird size={22} />
          </div>
          <div>
            <h1>L'Oiseau Traiteur</h1>
            <p className="lf-sub">Équipe d'anesthésie — commande du déjeuner &amp; résumé de facturation</p>
          </div>
        </div>

        {globalError && (
          <div className="lf-banner">
            {globalError} Vérifiez votre connexion internet et rechargez la page.
          </div>
        )}

        <div className="lf-tabs">
          <button className={`lf-tab ${tab === "commander" ? "active" : ""}`} onClick={() => setTab("commander")}>
            Commander
          </button>
          <button className={`lf-tab ${tab === "traiteur" ? "active" : ""}`} onClick={() => setTab("traiteur")}>
            Menu du traiteur
          </button>
          <button className={`lf-tab ${tab === "resume" ? "active" : ""}`} onClick={() => setTab("resume")}>
            Résumé mensuel
          </button>
        </div>

        {/* ---------------- COMMANDER ---------------- */}
        {tab === "commander" && (
          <div>
            <div className="lf-card">
              <span className="lf-label">Vous êtes</span>
              <div className="lf-row">
                <select className="lf-select" value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
                  <option value="">— Choisir votre nom —</option>
                  {doctors.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {!showAddDoctor ? (
                  <button className="lf-btn lf-btn-ghost" onClick={() => setShowAddDoctor(true)}>
                    <Plus size={14} /> Ajouter mon nom
                  </button>
                ) : (
                  <>
                    <input
                      className="lf-input"
                      placeholder="Dr Nom Prénom"
                      value={newDoctorInput}
                      onChange={(e) => setNewDoctorInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addDoctor()}
                      autoFocus
                    />
                    <button className="lf-btn lf-btn-primary" onClick={addDoctor}>
                      Ajouter
                    </button>
                    <button className="lf-btn lf-btn-text" onClick={() => setShowAddDoctor(false)}>
                      Annuler
                    </button>
                  </>
                )}
              </div>
              {doctorsLoaded && doctors.length === 0 && !showAddDoctor && (
                <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>
                  Personne n'est encore enregistré — ajoutez votre nom pour commencer.
                </p>
              )}
              {doctorError && (
                <p style={{ fontSize: 13, color: "var(--coral)", marginTop: 10, marginBottom: 0 }}>{doctorError}</p>
              )}
            </div>

            {!selectedDoctor ? (
              <div className="lf-card lf-empty">
                <p className="lf-empty-title">Sélectionnez votre nom</p>
                <p style={{ margin: 0 }}>pour voir les menus proposés et passer votre commande.</p>
              </div>
            ) : menusLoading ? (
              <div className="lf-card lf-empty">
                <Loader2 className="lf-spin" size={20} />
              </div>
            ) : menus.length === 0 ? (
              <div className="lf-card lf-empty">
                <p className="lf-empty-title">Aucun menu proposé pour le moment</p>
                <p style={{ margin: 0 }}>Le traiteur n'a pas encore publié de menu pour les prochains jours.</p>
              </div>
            ) : (
              <div className="lf-card">
                <div className="lf-pills">
                  {menus.map((m) => (
                    <button
                      key={m.date}
                      className={`lf-pill ${selectedOrderDate === m.date ? "active" : ""}`}
                      onClick={() => setSelectedOrderDate(m.date)}
                    >
                      {formatDateShort(m.date)}
                    </button>
                  ))}
                </div>

                {currentMenu && (
                  <>
                    <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 0, marginBottom: 18 }}>
                      Menu du {formatDateLong(currentMenu.date)} — un choix possible par catégorie
                    </p>

                    {activeCategories.map((cat) => (
                      <div className="lf-catsection" key={cat.key}>
                        <div className="lf-catheader-order">
                          <h3>
                            {cat.label} <span className="lf-catprice">{formatEuro(categoryPricesRef.current[cat.key])}</span>
                          </h3>
                          <label className="lf-qty-picker">
                            Quantité
                            <select
                              value={categoryQty[cat.key]}
                              onChange={(e) => updateQty(cat.key, Number(e.target.value))}
                            >
                              {[1, 2, 3, 4].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="lf-dishes">
                          {currentMenu.categories[cat.key].map((dish) => {
                            const isSelected =
                              myOrder && myOrder.selections && myOrder.selections[cat.key] && myOrder.selections[cat.key].id === dish.id;
                            return (
                              <div
                                key={dish.id}
                                className={`lf-dish ${isSelected ? "selected" : ""}`}
                                onClick={() => toggleSelection(cat.key, dish)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && toggleSelection(cat.key, dish)}
                              >
                                {isSelected && (
                                  <span className="lf-dish-check">
                                    <Check size={13} />
                                  </span>
                                )}
                                <div className="lf-dish-name" style={{ marginBottom: 0 }}>
                                  {dish.name}
                                  {isSelected && myOrder.selections[cat.key].qty > 1 && (
                                    <span className="lf-dish-qty-badge"> ×{myOrder.selections[cat.key].qty}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div className="lf-ordersummary">
                      <div>
                        {myOrder === undefined ? (
                          <Loader2 className="lf-spin" size={16} />
                        ) : myOrder && orderSummaryText ? (
                          <>
                            <span className="lf-status ok">
                              <Check size={14} /> Commande enregistrée — {orderSummaryText}
                            </span>
                            <br />
                            <button className="lf-btn lf-btn-text" onClick={cancelOrder} style={{ paddingLeft: 0, marginTop: 4 }}>
                              Annuler toute la commande
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                            Aucune commande — cliquez sur un plat par catégorie pour choisir.
                          </span>
                        )}
                      </div>
                      <div className="lf-ordersummary-total">{formatEuro(orderTotal)}</div>
                    </div>
                    {orderSyncError && (
                      <p style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 10, marginBottom: 0 }}>{orderSyncError}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------------- TRAITEUR ---------------- */}
        {tab === "traiteur" && (
          <div>
            <div className="lf-card">
              <div className="lf-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <span className="lf-label">Commandes reçues pour le</span>
                  <input
                    type="date"
                    className="lf-input"
                    value={ordersViewDate}
                    onChange={(e) => setOrdersViewDate(e.target.value)}
                  />
                </div>
                {dayOrders.length > 0 && <div className="lf-ordersummary-total">{formatEuro(dayTotal)}</div>}
              </div>

              {menus.length > 0 && (
                <div className="lf-pills" style={{ marginBottom: 16 }}>
                  {menus.map((m) => (
                    <button
                      key={m.date}
                      className={`lf-pill ${ordersViewDate === m.date ? "active" : ""}`}
                      onClick={() => setOrdersViewDate(m.date)}
                    >
                      {formatDateShort(m.date)}
                    </button>
                  ))}
                </div>
              )}

              {dayOrdersLoading ? (
                <Loader2 className="lf-spin" size={18} />
              ) : dayOrders.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
                  Aucune commande enregistrée pour le {ordersViewDate ? formatDateLong(ordersViewDate) : "..."} pour le
                  moment.
                </p>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    {CATEGORIES.filter((c) => dayAggregated[c.key].size > 0).map((c) => (
                      <div key={c.key} style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pine-dark)", textTransform: "uppercase", letterSpacing: ".03em" }}>
                          {c.label}
                        </span>
                        <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 2 }}>
                          {Array.from(dayAggregated[c.key].entries())
                            .map(([name, count]) => `${count} × ${name}`)
                            .join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                    {dayOrders.map((o, i) => (
                      <div key={i} className="lf-preview-item">
                        <span className="lf-preview-date">{o.doctor}</span>
                        <span className="lf-preview-cats">
                          {describeItems(o.items)} — {formatEuro(o.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10, marginBottom: 0 }}>
                    {dayOrders.length} commande{dayOrders.length > 1 ? "s" : ""} au total.
                  </p>
                </>
              )}
            </div>

            <div className="lf-card">
              <span className="lf-label">Date du repas</span>
              <input
                type="date"
                className="lf-input"
                value={traiteurDate}
                onChange={(e) => setTraiteurDate(e.target.value)}
                style={{ marginBottom: 18 }}
              />

              {CATEGORIES.map((cat) => (
                <div className="lf-catsection" key={cat.key}>
                  <div className="lf-catheader">
                    <h3>{cat.label}</h3>
                    {cat.recurring && (
                      <span className="lf-recurring-hint">
                        Repris automatiquement du dernier menu
                        {recurringDefaultsRef.current[cat.key] && recurringDefaultsRef.current[cat.key].length ? (
                          <button
                            className="lf-btn lf-btn-text"
                            style={{ padding: "2px 6px" }}
                            onClick={() =>
                              setTraiteurCategories((prev) => ({
                                ...prev,
                                [cat.key]: recurringDefaultsRef.current[cat.key].map((d) => ({
                                  id: genId(),
                                  name: d.name,
                                })),
                              }))
                            }
                            title="Recharger les valeurs habituelles"
                          >
                            <RotateCcw size={12} /> recharger
                          </button>
                        ) : null}
                      </span>
                    )}
                  </div>
                  {traiteurCategories[cat.key].map((d) => (
                    <div className="lf-dishrow" key={d.id}>
                      <input
                        className="lf-input"
                        placeholder={`Nom (${cat.singular})`}
                        value={d.name}
                        onChange={(e) => updateDishField(cat.key, d.id, "name", e.target.value)}
                      />
                      <button
                        className="lf-btn lf-btn-text"
                        onClick={() => removeDishRow(cat.key, d.id)}
                        aria-label={`Supprimer : ${cat.singular}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button className="lf-btn lf-btn-ghost" onClick={() => addDishRow(cat.key)}>
                    <Plus size={14} /> Ajouter {cat.article} {cat.singular}
                  </button>
                </div>
              ))}

              <div className="lf-row" style={{ marginTop: 6 }}>
                <button className="lf-btn lf-btn-primary" onClick={saveMenu} disabled={traiteurStatus === "saving"}>
                  {traiteurStatus === "saving" ? <Loader2 className="lf-spin" size={14} /> : null}
                  Enregistrer le menu
                </button>
                {traiteurStatus === "saved" && (
                  <span className="lf-status ok">
                    <Check size={14} /> Menu publié
                  </span>
                )}
                {traiteurStatus === "error" && (
                  <span className="lf-status err">Ajoutez au moins un plat avec un nom et un prix.</span>
                )}
                {traiteurStatus === "save-error" && (
                  <span className="lf-status err">
                    La sauvegarde a échoué. Vos plats saisis sont conservés — cliquez à nouveau sur "Enregistrer le menu" pour
                    réessayer.
                  </span>
                )}
              </div>
            </div>

            {menus.length > 0 && (
              <div className="lf-card">
                <div className="lf-menupreview">
                  <h3>Menus déjà publiés</h3>
                  {menus.map((m) => (
                    <div key={m.date} className="lf-preview-item">
                      <span className="lf-preview-date">{formatDateLong(m.date)}</span>
                      <span className="lf-preview-cats">
                        {CATEGORIES.filter((c) => (m.categories[c.key] || []).length > 0)
                          .map((c) => `${c.label} (${m.categories[c.key].length})`)
                          .join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="lf-card">
              <span className="lf-label">Tarifs par catégorie</span>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 0, marginBottom: 14 }}>
                Identiques pour tous les plats d'une même catégorie, et mémorisés une fois pour toutes — pas besoin de les
                ressaisir chaque jour, seulement si les prix changent.
              </p>
              <div className="lf-row">
                {CATEGORIES.map((c) => (
                  <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, color: "var(--ink-soft)" }} htmlFor={`price-${c.key}`}>
                      {c.label}
                    </label>
                    <input
                      id={`price-${c.key}`}
                      className="lf-input"
                      style={{ width: 90 }}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={categoryPriceInputs[c.key]}
                      onChange={(e) => updatePriceField(c.key, e.target.value)}
                    />
                  </div>
                ))}
                <button
                  className="lf-btn lf-btn-primary"
                  onClick={savePrices}
                  disabled={priceStatus === "saving"}
                  style={{ alignSelf: "flex-end" }}
                >
                  {priceStatus === "saving" ? <Loader2 className="lf-spin" size={14} /> : null}
                  Enregistrer les tarifs
                </button>
              </div>
              {priceStatus === "saved" && (
                <p className="lf-status ok" style={{ marginTop: 10, marginBottom: 0 }}>
                  <Check size={14} /> Tarifs enregistrés
                </p>
              )}
              {priceStatus === "error" && (
                <p className="lf-status err" style={{ marginTop: 10, marginBottom: 0 }}>
                  Indiquez un prix valide (0 ou plus) pour chaque catégorie.
                </p>
              )}
              {priceStatus === "save-error" && (
                <p className="lf-status err" style={{ marginTop: 10, marginBottom: 0 }}>
                  La sauvegarde a échoué, réessayez.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---------------- RÉSUMÉ ---------------- */}
        {tab === "resume" && (
          <div>
            <div className="lf-card">
              <div className="lf-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <span className="lf-label">Mois</span>
                  <input
                    type="month"
                    className="lf-input"
                    value={summaryMonth}
                    onChange={(e) => setSummaryMonth(e.target.value)}
                  />
                </div>
                <button className="lf-btn lf-btn-primary" onClick={exportCSV} disabled={summaryRows.length === 0}>
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>

            <div className="lf-card">
              {summaryLoading ? (
                <div className="lf-empty">
                  <Loader2 className="lf-spin" size={20} />
                </div>
              ) : summaryError ? (
                <div className="lf-empty">
                  <p style={{ margin: 0, color: "var(--coral)" }}>{summaryError}</p>
                </div>
              ) : grouped.length === 0 ? (
                <div className="lf-empty">
                  <p className="lf-empty-title">Aucune commande ce mois-ci</p>
                  <p style={{ margin: 0 }}>Rien à facturer pour la période sélectionnée.</p>
                </div>
              ) : (
                <table className="lf-table">
                  <thead>
                    <tr>
                      <th>Médecin</th>
                      <th>Entrées</th>
                      <th>Plats</th>
                      <th>Desserts</th>
                      <th>Boissons</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g) => (
                      <tr key={g.doctor}>
                        <td>{g.doctor}</td>
                        <td className="lf-mono">{g.counts.entree || 0}</td>
                        <td className="lf-mono">{g.counts.plat || 0}</td>
                        <td className="lf-mono">{g.counts.dessert || 0}</td>
                        <td className="lf-mono">{g.counts.boisson || 0}</td>
                        <td className="lf-mono">{formatEuro(g.total)}</td>
                      </tr>
                    ))}
                    <tr className="lf-total-row">
                      <td>Total</td>
                      <td className="lf-mono">{grandCounts.entree}</td>
                      <td className="lf-mono">{grandCounts.plat}</td>
                      <td className="lf-mono">{grandCounts.dessert}</td>
                      <td className="lf-mono">{grandCounts.boisson}</td>
                      <td className="lf-mono">{formatEuro(grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
