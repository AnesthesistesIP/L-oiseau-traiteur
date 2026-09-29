import { useState, useEffect, useMemo, useRef } from "react";
import { Bird, Plus, X, Download, Check, Loader2, RotateCcw } from "lucide-react";
import * as api from "./firestoreApi.js";

// ---------- constants ----------
// "recurring: true" = catégorie dont le catalogue complet (desserts, boissons), avec des prix
// fixes, est automatiquement reproposé chaque jour — voir catalogRef plus bas.
const CATEGORIES = [
  { key: "entree", label: "Entrées", singular: "entrée", article: "une", recurring: false },
  { key: "plat", label: "Plats", singular: "plat", article: "un", recurring: false },
  { key: "dessert", label: "Desserts", singular: "dessert", article: "un", recurring: true },
  { key: "boisson", label: "Boissons", singular: "boisson", article: "une", recurring: true },
];
// Sous-catégories fixes de "Plats", chacune avec son propre tarif par défaut (priceKey, réglable
// dans Tarifs). Les 2 "plat du jour" partagent le même tarif par défaut (platJour).
const PLAT_SUBCATS = [
  { key: "viande", label: "Plat du jour — Viande ou Poisson", defaultName: "", priceKey: "platJour" },
  { key: "vegetarien", label: "Plat du jour — Végétarien", defaultName: "", priceKey: "platJour" },
  { key: "buddha", label: "Buddha Bowl", defaultName: "Buddha Bowl", priceKey: "buddha" },
  { key: "salade", label: "Salade", defaultName: "Salade", priceKey: "salade" },
  { key: "sando", label: "Sando", defaultName: "Sando", priceKey: "sando" },
];
function platSubcat(key) {
  return PLAT_SUBCATS.find((s) => s.key === key);
}
// Remise commerciale accordée par le traiteur, par personne, sur la facture du mois.
const REMISE_COMMERCIALE_MENSUELLE = 5;
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
// Une catégorie peut maintenant contenir plusieurs plats choisis (ex: 1 eau + 2 coca).
// Cette fonction ramène toujours un tableau, y compris pour d'anciennes commandes de test
// enregistrées avant ce changement (qui stockaient un seul objet par catégorie).
function selArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}
function blankRow() {
  return { id: genId(), name: "", price: "" };
}
// Répartit les plats dans leurs 5 sous-catégories fixes. Un plat dont le groupe ne correspond à
// aucune sous-catégorie connue (ancien menu enregistré avant cette fonctionnalité) atterrit dans
// "autres", affiché seulement s'il n'est pas vide.
function splitPlatBySubcat(dishes) {
  const buckets = {};
  PLAT_SUBCATS.forEach((s) => (buckets[s.key] = []));
  const autres = [];
  (dishes || []).forEach((d) => {
    if (buckets[d.group]) buckets[d.group].push(d);
    else autres.push(d);
  });
  return { buckets, autres };
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
// Catalogue de départ (utilisé uniquement si rien n'a encore été enregistré dans Firestore) :
// la liste complète des desserts et boissons habituellement proposés, avec leurs prix fixes.
function seedCatalog() {
  const withIds = (arr) => arr.map((d) => ({ id: genId(), ...d, fromCatalog: true }));
  return {
    dessert: withIds([
      { name: "Cake citron", price: 3 },
      { name: "Marbré", price: 2.8 },
      { name: "Cookie kinder", price: 3 },
      { name: "Cookie snickers", price: 3 },
      { name: "Carrot cake", price: 3 },
      { name: "Fromage blanc granola", price: 2.5 },
      { name: "Fromage blanc abricot", price: 2.5 },
      { name: "Brownies", price: 3 },
      { name: "Bounty noir", price: 2.7 },
      { name: "Fromage blanc crème de marrons", price: 2.5 },
      { name: "Bounty lait", price: 2.7 },
      { name: "Flan pâtissier pistache", price: 3.5 },
    ]),
    boisson: withIds([
      { name: "San Pellegrino", price: 2.2 },
      { name: "Volvic citron", price: 2 },
      { name: "Jus de fruit Pago Ace", price: 2.6 },
      { name: "Coca Cola", price: 1.7 },
      { name: "Coca Cola Zero", price: 1.7 },
      { name: "Oasis", price: 1.7 },
      { name: "Schweppes agrumes", price: 1.7 },
      { name: "Pulco citron", price: 1.7 },
      { name: "Ice tea", price: 1.7 },
      { name: "Bière artisanale", price: 4.2 },
    ]),
  };
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

  // traiteur tab
  const [traiteurDate, setTraiteurDate] = useState(tomorrowISO());
  const [traiteurCategories, setTraiteurCategories] = useState(defaultTraiteurCategories());
  const [traiteurStatus, setTraiteurStatus] = useState("");
  // Catalogue fixe des desserts et boissons proposés chaque jour, avec leur prix verrouillé dans
  // le formulaire du menu quotidien. Liste figée dans le code (voir seedCatalog) : pour un
  // dessert/une boisson exceptionnel un jour donné, on l'ajoute simplement ce jour-là avec son
  // propre prix, sans toucher à cette liste fixe.
  const catalogRef = useRef(seedCatalog());
  // Tarif par défaut de chaque sous-catégorie de Plats (utilisé si une ligne n'a pas de prix
  // propre renseigné), + la remise forfaitaire appliquée par ensemble complet plat+dessert+boisson
  // commandé. Entrées, desserts et boissons ont toujours un prix renseigné directement devant la
  // proposition, donc pas besoin d'un tarif par défaut pour ces catégories.
  // Valeurs fixes dans le code — pour les changer, modifier directement ici (plus d'édition possible
  // depuis l'interface).
  const categoryPricesRef = useRef({ platJour: 9, buddha: 9, salade: 7, sando: 7.5, remiseFormule: 0.5 });
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
        if (!data) {
          setMyOrder(null);
          return;
        }
        // normalise : d'anciennes commandes de test pouvaient stocker un seul plat par
        // catégorie plutôt qu'un tableau — selArray() ramène toujours un tableau.
        const normalized = {};
        CATEGORIES.forEach((c) => {
          normalized[c.key] = selArray(data.selections && data.selections[c.key]);
        });
        setMyOrder({ selections: normalized, total: data.total });
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

  // Calcule, pour une commande donnée, combien de fois la formule plat + dessert + boisson
  // s'applique (uniquement sur les plats au tarif par défaut : un plat à prix spécial reste
  // facturé à son propre tarif, en plus de la formule), et l'économie que ça représente.
  // Compte, pour une commande donnée, combien d'ensembles complets "1 plat + 1 dessert + 1
  // boisson" elle contient (peu importe leurs prix respectifs), et applique une remise
  // forfaitaire par ensemble complet — ex: 2 plats + 2 desserts + 2 boissons = 2 ensembles
  // = 2 fois la remise (utile pour une garde avec 2 repas commandés le même jour).
  function computeFormulaInfo(selections) {
    function unitsCount(key) {
      return (selections[key] || []).reduce((s, it) => s + (it.qty || 1), 0);
    }
    const setsCount = Math.min(unitsCount("plat"), unitsCount("dessert"), unitsCount("boisson"));
    const remise = categoryPricesRef.current.remiseFormule || 0;
    const applies = setsCount > 0 && remise > 0;
    return { applies, setsCount, savings: applies ? setsCount * remise : 0 };
  }

  function computeTotal(selections) {
    const rawTotal = CATEGORIES.reduce((s, c) => {
      const arr = selections[c.key] || [];
      return s + arr.reduce((sub, it) => sub + it.price * (it.qty || 1), 0);
    }, 0);
    const { savings } = computeFormulaInfo(selections);
    return rawTotal - savings;
  }

  async function saveSelections(newSelections) {
    const total = computeTotal(newSelections);
    const hasAny = CATEGORIES.some((c) => (newSelections[c.key] || []).length > 0);
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

  // Tarif par défaut applicable à un plat : pour "plat", ça dépend de sa sous-catégorie
  // (platJour, buddha, salade, sando) ; pour les autres catégories, pas de défaut plus précis.
  function defaultPriceFor(catKey, dish) {
    if (catKey === "plat" && dish && dish.group) {
      const subcat = platSubcat(dish.group);
      if (subcat) return categoryPricesRef.current[subcat.priceKey] || 0;
    }
    return categoryPricesRef.current[catKey] || 0;
  }

  // Ajoute ou retire un plat précis dans sa catégorie (plusieurs plats différents peuvent
  // désormais coexister dans une même catégorie, ex: 1 eau + 2 coca).
  async function toggleSelection(catKey, item) {
    if (!selectedDoctor || !selectedOrderDate) return;
    setOrderSyncError("");
    const current = (myOrder && myOrder.selections) || {};
    const arr = current[catKey] || [];
    const exists = arr.some((x) => x.id === item.id);
    // un plat avec un tarif propre garde ce tarif ; sinon on applique le tarif par défaut
    // de sa sous-catégorie (le prix est figé au moment du choix, il ne bougera pas
    // rétroactivement si le tarif change plus tard).
    const price = item.price != null ? item.price : defaultPriceFor(catKey, item);
    const newArr = exists
      ? arr.filter((x) => x.id !== item.id)
      : [...arr, { id: item.id, name: item.name, price, qty: 1 }];
    const newSelections = { ...current, [catKey]: newArr };
    setBusyCat(catKey);
    await saveSelections(newSelections);
    setBusyCat("");
  }

  // Change la quantité d'un plat déjà choisi (indépendamment des autres plats de la même catégorie).
  async function updateItemQty(catKey, itemId, qty) {
    const safeQty = Math.max(1, Math.min(2, qty));
    const current = (myOrder && myOrder.selections) || {};
    const arr = current[catKey] || [];
    const newArr = arr.map((x) => (x.id === itemId ? { ...x, qty: safeQty } : x));
    const newSelections = { ...current, [catKey]: newArr };
    setOrderSyncError("");
    setBusyCat(catKey);
    await saveSelections(newSelections);
    setBusyCat("");
  }

  async function cancelOrder() {
    if (!selectedDoctor || !selectedOrderDate) return;
    setOrderSyncError("");
    setMyOrder(null);
    try {
      await api.deleteOrder(selectedOrderDate, selectedDoctor);
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setOrderSyncError("L'annulation est affichée, mais n'a peut-être pas été enregistrée.");
    }
  }

  // Catégories par défaut pour un jour sans menu enregistré : desserts/boissons repartent du
  // catalogue complet (prix verrouillé), Plats propose les 5 sous-catégories fixes.
  function buildDefaultDayCategories() {
    const next = {};
    CATEGORIES.forEach((c) => {
      if (c.recurring && catalogRef.current[c.key] && catalogRef.current[c.key].length) {
        next[c.key] = catalogRef.current[c.key].map((d) => ({
          id: genId(),
          name: d.name,
          price: d.price != null ? String(d.price) : "",
          fromCatalog: true,
        }));
      } else if (c.key === "plat") {
        next[c.key] = PLAT_SUBCATS.map((s) => ({ id: genId(), name: s.defaultName, price: "", group: s.key }));
      } else {
        next[c.key] = [blankRow()];
      }
    });
    return next;
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
          next[c.key] = arr.length
            ? arr.map((d) => {
                // Pour desserts/boissons, si le nom correspond à un article du catalogue actuel,
                // on recale toujours sur son prix et son verrouillage — même pour un jour déjà
                // enregistré avant une correction du catalogue (plus besoin de cliquer sur
                // "recharger le catalogue" à chaque fois).
                if (c.recurring) {
                  const catalogMatch = (catalogRef.current[c.key] || []).find(
                    (cItem) => cItem.name.trim().toLowerCase() === (d.name || "").trim().toLowerCase()
                  );
                  if (catalogMatch) {
                    return {
                      id: d.id,
                      name: d.name,
                      price: String(catalogMatch.price),
                      fromCatalog: true,
                      group: d.group,
                    };
                  }
                }
                return {
                  id: d.id,
                  name: d.name,
                  price: d.price != null ? String(d.price) : "",
                  fromCatalog: !!d.fromCatalog,
                  group: d.group,
                };
              })
            : [blankRow()];
        });
        setTraiteurCategories(next);
      } else {
        setTraiteurCategories(buildDefaultDayCategories());
      }
    })();
  }, [traiteurDate]);

  function updateDishField(catKey, id, field, value) {
    setTraiteurCategories((prev) => ({
      ...prev,
      [catKey]: prev[catKey].map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    }));
  }
  function addDishRow(catKey, group) {
    setTraiteurCategories((prev) => ({
      ...prev,
      [catKey]: [...prev[catKey], group ? { ...blankRow(), group } : blankRow()],
    }));
  }
  // Rendu d'une ligne de plat, réutilisé pour la liste simple et pour les deux sous-groupes
  // "Plat du jour" / "Autres" de la catégorie Plats.
  // Texte du tarif par défaut à afficher en placeholder (tient compte de la sous-catégorie
  // pour les plats : platJour, buddha, salade ou sando).
  function defaultPriceLabel(cat, d) {
    const priceKey = cat.key === "plat" && d.group && platSubcat(d.group) ? platSubcat(d.group).priceKey : cat.key;
    const val = categoryPricesRef.current[priceKey];
    return val != null ? String(val) : "Prix";
  }
  function renderDishRow(cat, d) {
    return (
      <div className="lf-dishrow" key={d.id}>
        <input
          className="lf-input"
          placeholder={cat.key === "plat" && (d.group === "viande" || d.group === "vegetarien") ? "Détail du plat" : `Nom (${cat.singular})`}
          value={d.name}
          onChange={(e) => updateDishField(cat.key, d.id, "name", e.target.value)}
        />
        <div className="lf-price-field">
          <input
            className={`lf-input lf-input-price${d.fromCatalog ? " lf-input-locked" : ""}`}
            placeholder={defaultPriceLabel(cat, d)}
            inputMode="decimal"
            value={d.price ?? ""}
            onChange={(e) => updateDishField(cat.key, d.id, "price", e.target.value)}
            disabled={!!d.fromCatalog}
            title={
              d.fromCatalog
                ? "Prix fixe (dessert/boisson) — non modifiable"
                : "Laisser vide pour utiliser le tarif par défaut"
            }
          />
          <span className="lf-price-suffix">€</span>
        </div>
        <button
          className="lf-btn lf-btn-text"
          onClick={() => removeDishRow(cat.key, d.id)}
          aria-label={`Supprimer : ${cat.singular}`}
        >
          <X size={16} />
        </button>
      </div>
    );
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
        .map((d) => {
          const name = d.name.trim();
          const priceStr = String(d.price ?? "").trim();
          const row = { id: d.id, name };
          if (d.fromCatalog) row.fromCatalog = true;
          if (d.group) row.group = d.group;
          // Prix laissé vide = ce plat suit le tarif par défaut de sa catégorie.
          // Prix renseigné = ce plat précis a son propre tarif (ex: dessert plus cher, ou un
          // plat issu du catalogue dont le prix est fixe).
          if (priceStr) {
            const parsedPrice = parseFloat(priceStr.replace(",", "."));
            if (!isNaN(parsedPrice) && parsedPrice >= 0) row.price = parsedPrice;
          }
          return row;
        })
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
    // Le catalogue (desserts/boissons) ne change jamais suite à l'enregistrement d'un menu du
    // jour : c'est une liste fixe, indépendante des menus quotidiens.
    setTraiteurStatus("saved");
    loadMenus();
    setTimeout(() => setTraiteurStatus(""), 2000);
  }

  async function deleteMenuFn() {
    if (traiteurDate < todayISO()) return; // sécurité : le bouton est normalement déjà désactivé
    if (!window.confirm(`Supprimer entièrement le menu du ${formatDateLong(traiteurDate)} ? Cette action est irréversible.`)) {
      return;
    }
    setTraiteurStatus("deleting");
    try {
      await api.deleteMenu(traiteurDate);
      setTraiteurCategories(buildDefaultDayCategories());
      setTraiteurStatus("deleted");
      loadMenus();
    } catch (e) {
        console.error("[L'Oiseau Traiteur] erreur:", e);
      setTraiteurStatus("delete-error");
      return;
    }
    setTimeout(() => setTraiteurStatus(""), 2000);
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
        const items = CATEGORIES.flatMap((c) =>
          selArray(selections[c.key]).map((it) => ({
            category: c.key,
            name: it.name,
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1,
          }))
        );
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
        const items = CATEGORIES.flatMap((c) =>
          selArray(selections[c.key]).map((it) => ({
            category: c.key,
            name: it.name,
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1,
          }))
        );
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
    lines.push("Médecin;Entrées;Plats;Desserts;Boissons;Total (EUR);Remise (EUR);Net à payer (EUR)");
    grouped.forEach((g) =>
      lines.push(
        `${escapeCsv(g.doctor)};${g.counts.entree};${g.counts.plat};${g.counts.dessert};${g.counts.boisson};${g.total
          .toFixed(2)
          .replace(".", ",")};-${REMISE_COMMERCIALE_MENSUELLE.toFixed(2).replace(".", ",")};${(g.total - REMISE_COMMERCIALE_MENSUELLE)
          .toFixed(2)
          .replace(".", ",")}`
      )
    );
    const remiseTotal = REMISE_COMMERCIALE_MENSUELLE * grouped.length;
    lines.push(
      `TOTAL;${grandCounts.entree};${grandCounts.plat};${grandCounts.dessert};${grandCounts.boisson};${grandTotal
        .toFixed(2)
        .replace(".", ",")};-${remiseTotal.toFixed(2).replace(".", ",")};${(grandTotal - remiseTotal)
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
  // Un menu dont la date est déjà passée ne peut plus être supprimé (on garde l'historique).
  const isPastMenuDate = traiteurDate < todayISO();
  const orderSummaryText =
    myOrder && myOrder.selections
      ? CATEGORIES.flatMap((c) => selArray(myOrder.selections[c.key]))
          .map((sel) => (sel.qty > 1 ? `${sel.name} ×${sel.qty}` : sel.name))
          .join(" · ")
      : "";
  const formulaInfo = myOrder && myOrder.selections ? computeFormulaInfo(myOrder.selections) : { applies: false, setsCount: 0, savings: 0 };

  // Rendu d'une carte de plat sélectionnable, réutilisé pour les sous-groupes "Plat du jour" /
  // "Autres" de la catégorie Plats et pour les autres catégories.
  function renderDishCard(cat, dish) {
    const entry = ((myOrder && myOrder.selections && myOrder.selections[cat.key]) || []).find((x) => x.id === dish.id);
    const isSelected = !!entry;
    const effectivePrice = dish.price != null ? dish.price : defaultPriceFor(cat.key, dish);
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
        <div className="lf-dish-name">{dish.name}</div>
        <div className="lf-dish-price">{formatEuro(effectivePrice)}</div>
        {isSelected && (
          <div className="lf-dish-stepper" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateItemQty(cat.key, dish.id, entry.qty - 1);
              }}
              disabled={entry.qty <= 1}
              aria-label="Retirer une portion"
            >
              −
            </button>
            <span>{entry.qty}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateItemQty(cat.key, dish.id, entry.qty + 1);
              }}
              disabled={entry.qty >= 2}
              aria-label="Ajouter une portion"
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  }

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
        .lf-btn-danger { background: var(--coral); color: #fff; }
        .lf-btn-danger:hover { background: #8c452f; }
        .lf-btn-danger:disabled { opacity: .5; cursor: not-allowed; }
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
          font-family: 'Cormorant Garamond', serif; font-size: 19px; font-weight: 600; margin: 0;
          color: var(--pine-dark);
        }
        .lf-dish-stepper {
          display: flex; align-items: center; gap: 10px; margin-top: 2px;
        }
        .lf-dish-stepper button {
          width: 24px; height: 24px; border-radius: 999px; border: 1px solid var(--pine);
          background: #fff; color: var(--pine-dark); font-weight: 700; font-size: 15px; line-height: 1;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .lf-dish-stepper button:hover:not(:disabled) { background: var(--pine); color: #fff; }
        .lf-dish-stepper button:disabled { opacity: .35; cursor: not-allowed; }
        .lf-dish-stepper span {
          font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 14px; min-width: 14px; text-align: center;
        }
        .lf-catheader { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .lf-subgroup-label {
          font-family: 'Cormorant Garamond', serif; font-size: 12px; font-weight: 600; color: var(--ink-soft);
          text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 8px;
        }
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
        .lf-formula-note {
          background: var(--blush-light); border: 1px solid var(--blush); border-radius: 10px;
          padding: 9px 13px; font-size: 12.5px; color: var(--ink); margin: 0 0 18px;
        }
        .lf-formula-applied { font-size: 12.5px; color: var(--pine-dark); font-weight: 600; }

        .lf-empty { text-align: center; padding: 34px 20px; color: var(--ink-soft); }
        .lf-empty-title { font-family: 'Cormorant Garamond', serif; font-size: 18px; color: var(--ink); margin: 0 0 6px; font-weight: 600; }

        .lf-dishrow { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
        .lf-dishrow .lf-input:first-child { flex: 1; }
        .lf-input-price { width: 90px; flex: none; }
        .lf-price-field { position: relative; display: inline-flex; flex: none; align-self: flex-start; }
        .lf-price-field input { padding-right: 24px; }
        .lf-price-field .lf-price-suffix {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          font-size: 13px; color: var(--ink-soft); pointer-events: none;
        }
        .lf-input-locked { background: var(--line); color: var(--ink-soft); cursor: not-allowed; }

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
                    <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 0, marginBottom: 12 }}>
                      Menu du {formatDateLong(currentMenu.date)} — plusieurs choix possibles par catégorie
                    </p>
                    {categoryPricesRef.current.remiseFormule > 0 && (
                      <p className="lf-formula-note">
                        💡 Formule plat + dessert + boisson : <strong>-{formatEuro(categoryPricesRef.current.remiseFormule)}</strong>{" "}
                        sur le total dès qu'au moins 1 plat + 1 dessert + 1 boisson sont commandés.
                      </p>
                    )}

                    {activeCategories.map((cat) => {
                      const dishes = currentMenu.categories[cat.key];
                      if (cat.key !== "plat") {
                        return (
                          <div className="lf-catsection" key={cat.key}>
                            <h3>{cat.label}</h3>
                            <div className="lf-dishes">{dishes.map((dish) => renderDishCard(cat, dish))}</div>
                          </div>
                        );
                      }
                      const { buckets, autres } = splitPlatBySubcat(dishes);
                      return (
                        <div className="lf-catsection" key={cat.key}>
                          <h3>{cat.label}</h3>
                          {PLAT_SUBCATS.map(
                            (s) =>
                              buckets[s.key].length > 0 && (
                                <div key={s.key} style={{ marginBottom: 14 }}>
                                  <p className="lf-subgroup-label">{s.label}</p>
                                  <div className="lf-dishes">{buckets[s.key].map((dish) => renderDishCard(cat, dish))}</div>
                                </div>
                              )
                          )}
                          {autres.length > 0 && (
                            <div>
                              <p className="lf-subgroup-label">Autres</p>
                              <div className="lf-dishes">{autres.map((dish) => renderDishCard(cat, dish))}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="lf-ordersummary">
                      <div>
                        {myOrder === undefined ? (
                          <Loader2 className="lf-spin" size={16} />
                        ) : myOrder && orderSummaryText ? (
                          <>
                            <span className="lf-status ok">
                              <Check size={14} /> Commande enregistrée — {orderSummaryText}
                            </span>
                            {formulaInfo.applies && (
                              <>
                                <br />
                                <span className="lf-formula-applied">
                                  Formule appliquée — vous économisez {formatEuro(formulaInfo.savings)}
                                </span>
                              </>
                            )}
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
                        {catalogRef.current[cat.key] && catalogRef.current[cat.key].length ? (
                          <button
                            className="lf-btn lf-btn-text"
                            style={{ padding: "2px 6px" }}
                            onClick={() =>
                              setTraiteurCategories((prev) => ({
                                ...prev,
                                [cat.key]: catalogRef.current[cat.key].map((d) => ({
                                  id: genId(),
                                  name: d.name,
                                  price: d.price != null ? String(d.price) : "",
                                  fromCatalog: true,
                                })),
                              }))
                            }
                            title="Remettre le catalogue complet (annule les suppressions faites aujourd'hui)"
                          >
                            <RotateCcw size={12} /> recharger le catalogue
                          </button>
                        ) : null}
                      </span>
                    )}
                  </div>
                  {cat.key === "plat" ? (
                    <>
                      {(() => {
                        const { buckets, autres } = splitPlatBySubcat(traiteurCategories.plat);
                        return (
                          <>
                            {PLAT_SUBCATS.map((s, i) => (
                              <div key={s.key} style={{ marginTop: i === 0 ? 0 : 18 }}>
                                <p className="lf-subgroup-label">{s.label}</p>
                                {buckets[s.key].map((d) => renderDishRow(cat, d))}
                                <button className="lf-btn lf-btn-ghost" onClick={() => addDishRow(cat.key, s.key)}>
                                  <Plus size={14} /> Ajouter
                                </button>
                              </div>
                            ))}
                            {autres.length > 0 && (
                              <div style={{ marginTop: 18 }}>
                                <p className="lf-subgroup-label">Autres</p>
                                {autres.map((d) => renderDishRow(cat, d))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      {traiteurCategories[cat.key].map((d) => renderDishRow(cat, d))}
                      <button className="lf-btn lf-btn-ghost" onClick={() => addDishRow(cat.key)}>
                        <Plus size={14} /> Ajouter
                      </button>
                    </>
                  )}
                </div>
              ))}

              <div className="lf-row" style={{ marginTop: 6 }}>
                <button
                  className="lf-btn lf-btn-primary"
                  onClick={saveMenu}
                  disabled={traiteurStatus === "saving" || traiteurStatus === "deleting"}
                >
                  {traiteurStatus === "saving" ? <Loader2 className="lf-spin" size={14} /> : null}
                  Enregistrer et publier le menu
                </button>
                <button
                  className="lf-btn lf-btn-danger"
                  onClick={deleteMenuFn}
                  disabled={traiteurStatus === "saving" || traiteurStatus === "deleting" || isPastMenuDate}
                  title={isPastMenuDate ? "Un menu dont la date est passée ne peut plus être supprimé" : undefined}
                >
                  {traiteurStatus === "deleting" ? <Loader2 className="lf-spin" size={14} /> : null}
                  Supprimer le menu
                </button>
                {traiteurStatus === "saved" && (
                  <span className="lf-status ok">
                    <Check size={14} /> Menu publié
                  </span>
                )}
                {traiteurStatus === "deleted" && <span className="lf-status ok">Menu supprimé</span>}
                {traiteurStatus === "error" && (
                  <span className="lf-status err">Ajoutez au moins un plat avec un nom et un prix.</span>
                )}
                {traiteurStatus === "save-error" && (
                  <span className="lf-status err">
                    La sauvegarde a échoué. Vos plats saisis sont conservés — cliquez à nouveau sur "Enregistrer et publier le
                    menu" pour réessayer.
                  </span>
                )}
                {traiteurStatus === "delete-error" && (
                  <span className="lf-status err">La suppression a échoué, réessayez.</span>
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="lf-card">
              <span className="lf-label">Tarifs</span>
              <div className="lf-row" style={{ marginTop: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }} htmlFor="price-platJour">
                    Plat du jour
                  </label>
                  <div className="lf-price-field">
                    <input
                      id="price-platJour"
                      className="lf-input lf-input-locked"
                      style={{ width: 90 }}
                      value={categoryPricesRef.current.platJour}
                      disabled
                    />
                    <span className="lf-price-suffix">€</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }} htmlFor="price-buddha">
                    Buddha Bowl
                  </label>
                  <div className="lf-price-field">
                    <input
                      id="price-buddha"
                      className="lf-input lf-input-locked"
                      style={{ width: 90 }}
                      value={categoryPricesRef.current.buddha}
                      disabled
                    />
                    <span className="lf-price-suffix">€</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }} htmlFor="price-salade">
                    Salade
                  </label>
                  <div className="lf-price-field">
                    <input
                      id="price-salade"
                      className="lf-input lf-input-locked"
                      style={{ width: 90 }}
                      value={categoryPricesRef.current.salade}
                      disabled
                    />
                    <span className="lf-price-suffix">€</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }} htmlFor="price-sando">
                    Sando
                  </label>
                  <div className="lf-price-field">
                    <input
                      id="price-sando"
                      className="lf-input lf-input-locked"
                      style={{ width: 90 }}
                      value={categoryPricesRef.current.sando}
                      disabled
                    />
                    <span className="lf-price-suffix">€</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--ink-soft)" }} htmlFor="price-remiseFormule">
                    Remise formule (plat+dessert+boisson)
                  </label>
                  <div className="lf-price-field">
                    <input
                      id="price-remiseFormule"
                      className="lf-input lf-input-locked"
                      style={{ width: 90 }}
                      value={categoryPricesRef.current.remiseFormule}
                      disabled
                      title="Remise appliquée par ensemble complet plat+dessert+boisson commandé"
                    />
                    <span className="lf-price-suffix">€</span>
                  </div>
                </div>
              </div>
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
                      <th>Remise</th>
                      <th>Net à payer</th>
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
                        <td className="lf-mono" style={{ color: "var(--coral)" }}>
                          -{formatEuro(REMISE_COMMERCIALE_MENSUELLE)}
                        </td>
                        <td className="lf-mono">{formatEuro(g.total - REMISE_COMMERCIALE_MENSUELLE)}</td>
                      </tr>
                    ))}
                    <tr className="lf-total-row">
                      <td>Total</td>
                      <td className="lf-mono">{grandCounts.entree}</td>
                      <td className="lf-mono">{grandCounts.plat}</td>
                      <td className="lf-mono">{grandCounts.dessert}</td>
                      <td className="lf-mono">{grandCounts.boisson}</td>
                      <td className="lf-mono">{formatEuro(grandTotal)}</td>
                      <td className="lf-mono" style={{ color: "var(--coral)" }}>
                        -{formatEuro(REMISE_COMMERCIALE_MENSUELLE * grouped.length)}
                      </td>
                      <td className="lf-mono">{formatEuro(grandTotal - REMISE_COMMERCIALE_MENSUELLE * grouped.length)}</td>
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
