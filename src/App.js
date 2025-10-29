import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from "react";
import {
  ShoppingCart,
  Search,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Bell,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
} from "lucide-react";
import Seo from "./Seo";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

if (process.env.NODE_ENV === "production") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(process.env.REACT_APP_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
async function verifyImageFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = (e) => {
      const arr = new Uint8Array(e.target.result).subarray(0, 4);
      let header = "";
      for (let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16);
      }

      // Check file signatures
      const validHeaders = [
        "ffd8ff", // JPEG
        "89504e47", // PNG
        "47494638", // GIF
        "52494646", // WEBP (starts with RIFF)
      ];

      const isValid = validHeaders.some((validHeader) =>
        header.startsWith(validHeader)
      );
      resolve(isValid);
    };
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
}

const FirebaseService = {
  auth: {
    signInWithEmailAndPassword: async (email, password) => {
      const rateLimitKey = `login_attempts_${email}`;
      const attempts = parseInt(localStorage.getItem(rateLimitKey) || "0");
      const lastAttemptTime = parseInt(
        localStorage.getItem(`${rateLimitKey}_time`) || "0"
      );
      const now = Date.now();

      if (attempts >= 10 && now - lastAttemptTime < 15 * 60 * 1000) {
        throw new Error(
          "Trop de tentatives de connexion. Veuillez réessayer plus tard."
        );
      }

      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        localStorage.removeItem(rateLimitKey);
        localStorage.removeItem(`${rateLimitKey}_time`);
        return result;
      } catch (error) {
        localStorage.setItem(rateLimitKey, (attempts + 1).toString());
        localStorage.setItem(`${rateLimitKey}_time`, now.toString());
        throw error;
      }
    },
    signOut: () => {
      return signOut(auth);
    },
    onAuthStateChanged: (callback) => {
      return onAuthStateChanged(auth, callback);
    },
    getCurrentUser: () => auth.currentUser,
  },
  firestore: {
    collection: (collectionName) => ({
      add: async (data) => {
        const sanitizedData = FirebaseService.sanitizeData(data);
        return await addDoc(collection(db, collectionName), sanitizedData);
      },
      doc: (docId) => ({
        update: async (data) => {
          const sanitizedData = FirebaseService.sanitizeData(data);
          const docRef = doc(db, collectionName, docId);
          return await updateDoc(docRef, sanitizedData);
        },
        delete: async () => {
          const docRef = doc(db, collectionName, docId);
          return await deleteDoc(docRef);
        },
      }),
      onSnapshot: (callback) => {
        const q = query(collection(db, collectionName));
        return onSnapshot(q, callback);
      },
      orderBy: (field = "createdAt", direction = "desc") => ({
        onSnapshot: (callback) => {
          const q = query(
            collection(db, collectionName),
            orderBy(field, direction)
          );
          return onSnapshot(q, callback);
        },
      }),
    }),
  },
  storage: {
    uploadImage: async (file) => {
      try {
        if (!file) {
          throw new Error("Aucun fichier fourni");
        }

        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        const ALLOWED_TYPES = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/gif",
        ];

        if (file.size > MAX_SIZE) {
          throw new Error("La taille du fichier doit être inférieure à 10MB");
        }

        if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
          throw new Error(
            "Format non autorisé. Utilisez: JPG, PNG, WEBP ou GIF"
          );
        }

        const isRealImage = await verifyImageFile(file);
        if (!isRealImage) {
          throw new Error("Le fichier n'est pas une image valide");
        }

        console.log("Téléchargement de l'image vers Cloudinary:", file.name);

        const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
        const uploadPreset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;

        if (!cloudName || !uploadPreset) {
          throw new Error(
            "Configuration Cloudinary manquante. Veuillez vérifier vos variables d'environnement."
          );
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", uploadPreset);
        formData.append("folder", "cosmetics-products");

        formData.append(
          "transformation",
          "q_auto,f_auto,w_2000,h_2000,c_limit"
        );

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Erreur Cloudinary:", errorData);
          throw new Error(
            errorData.error?.message || "Échec du téléchargement"
          );
        }

        const data = await response.json();
        console.log("Téléchargement réussi:", data.secure_url);

        return data.secure_url;
      } catch (error) {
        console.error("Erreur de téléchargement d'image:", error);
        throw new Error(`Échec du téléchargement de l'image: ${error.message}`);
      }
    },
  },
  sanitizeData: (data) => {
    const sanitize = (value) => {
      if (typeof value === "string") {
        return value
          .replace(/[<>]/g, "")
          .replace(/javascript:/gi, "")
          .replace(/on\w+=/gi, "")
          .trim();
      }
      if (Array.isArray(value)) {
        return value.map(sanitize);
      }
      if (typeof value === "object" && value !== null) {
        const sanitized = {};
        for (const key in value) {
          sanitized[key] = sanitize(value[key]);
        }
        return sanitized;
      }
      return value;
    };
    return sanitize(data);
  },
  requestNotificationPermission: async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
    return false;
  },
  sendNotification: (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "🛍️" });
    }
  },
};

const AppContext = createContext();

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};

const CATEGORIES = [
  "Complément Alimentaire",
  "Pack Complément Alimentaire",
  "Cosmétique Bio et Naturel",
  "Pack Cosmétique",
  "Outils de travail",
  "Make up",
  "Parfums",
  "Home",
];

const INITIAL_PRODUCTS = [
  {
    id: "1",
    name: "Sérum Vitamine C",
    price: 2500,
    category: "Cosmétique Bio et Naturel",
    description:
      "Sérum éclaircissant à la vitamine C pure, idéal pour un teint unifié et lumineux.",
    image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400",
  },
  {
    id: "2",
    name: "Complément Collagène",
    price: 3200,
    category: "Complément Alimentaire",
    description: "Collagène marin hydrolysé pour une peau ferme et jeune.",
    image: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400",
  },
  {
    id: "3",
    name: "Huile d'Argan Bio",
    price: 1800,
    category: "Cosmétique Bio et Naturel",
    description:
      "Huile d'argan 100% pure et bio, nourrissante pour cheveux et peau.",
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=400",
  },
  {
    id: "4",
    name: "Pack Anti-Âge Complet",
    price: 8500,
    category: "Pack Cosmétique",
    description:
      "Pack complet avec sérum, crème de jour, crème de nuit et contour des yeux.",
    image: "https://images.unsplash.com/photo-1571875257727-256c39da42af?w=400",
  },
  {
    id: "5",
    name: "Palette Maquillage Pro",
    price: 4200,
    category: "Make up",
    description:
      "Palette professionnelle avec 12 teintes naturelles et shimmer.",
    image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400",
  },
  {
    id: "6",
    name: "Parfum Oriental Luxe",
    price: 6800,
    category: "Parfums",
    description: "Parfum oriental aux notes de oud, ambre et musc.",
    image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400",
  },
];

const CAROUSEL_IMAGES = [
  "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200",
  "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200",
  "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=1200",
];

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === "success"
      ? "bg-green-500"
      : type === "error"
      ? "bg-red-500"
      : "bg-blue-500";

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-slide-in">
      <div
        className={`${bgColor} text-white px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3 min-w-[300px]`}
      >
        {type === "success" && <CheckCircle size={24} />}
        {type === "error" && <XCircle size={24} />}
        {type === "info" && <Bell size={24} />}
        <div className="flex-1">
          <p className="font-medium">{message}</p>
        </div>
        <button onClick={onClose} className="hover:bg-white/20 rounded p-1">
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

function CosmeticsApp() {
  const [currentPage, setCurrentPage] = useState("home");
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const refreshProducts = useCallback(async () => {
    try {
      const q = query(collection(db, "products"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        price: parseFloat(d.data().price || 0),
      }));
      setProducts(list);
    } catch (err) {
      console.error("refreshProducts error:", err);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const checkAdminRoute = () => {
      const hash = window.location.hash;
      const adminPath = process.env.REACT_APP_ADMIN_SECRET_PATH || "admin";
      if (hash === `#${adminPath}`) {
        setCurrentPage("admin-login");
      }
    };

    checkAdminRoute();
    window.addEventListener("hashchange", checkAdminRoute);

    return () => window.removeEventListener("hashchange", checkAdminRoute);
  }, []);

  useEffect(() => {
    refreshProducts().catch((err) => {
      console.error("Failed initial fetch, using defaults:", err);
      setProducts(INITIAL_PRODUCTS);
    });

    const unsubscribe = FirebaseService.firestore
      .collection("products")
      .orderBy("updatedAt", "desc")
      .onSnapshot(
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            price: parseFloat(d.data().price || 0),
          }));
          setProducts(list);
        },
        (err) => console.error("Products realtime error:", err)
      );

    return () => unsubscribe();
  }, [refreshProducts]);

  useEffect(() => {
    const unsubscribe = FirebaseService.auth.onAuthStateChanged((user) => {
      setIsAdmin(!!user);
    });
    return unsubscribe;
  }, []);

  const addToCart = (product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, quantity }];
    });
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, quantity } : item))
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const viewProduct = (product) => {
    setSelectedProduct(product);
    setCurrentPage("product-detail");
  };

  const contextValue = {
    currentPage,
    setCurrentPage,
    cart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    products,
    selectedProduct,
    viewProduct,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    mobileMenuOpen,
    setMobileMenuOpen,
    isAdmin,
    setIsAdmin,
    refreshProducts,
    showToast,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-pink-50">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        {isAdmin ? (
          <AdminDashboard />
        ) : (
          <>
            <Header />
            <main className="pb-16">
              {currentPage === "home" && <HomePage />}
              {currentPage === "products" && <ProductsPage />}
              {currentPage === "product-detail" && <ProductDetailPage />}
              {currentPage === "cart" && <CartPage />}
              {currentPage === "catalogue" && <CataloguePage />}
              {currentPage === "admin-login" && <AdminLogin />}
            </main>
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}

function Header() {
  const { setCurrentPage, cart, mobileMenuOpen, setMobileMenuOpen } = useApp();

  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="bg-gradient-to-r from-pink-500 to-purple-600 text-white sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center">
          <button
            onClick={() => setCurrentPage("home")}
            className="flex items-center space-x-2 mr-8"
          >
            <img
              src={`${process.env.PUBLIC_URL}/favicon-removebg.png`}
              alt="Velvet Axiom Logo"
              className="w-10 h-10 sm:w-10 sm:h-10 object-contain"
            />
            <span className="text-lg sm:text-2xl font-bold truncate max-w-[120px] sm:max-w-none">
              Velvet Axiom
            </span>
          </button>

          <nav className="hidden md:flex space-x-8 flex-1 justify-center">
            <NavLink onClick={() => setCurrentPage("home")}>Accueil</NavLink>
            <NavLink onClick={() => setCurrentPage("products")}>
              Produits
            </NavLink>
            <NavLink onClick={() => setCurrentPage("catalogue")}>
              Catalogue
            </NavLink>
          </nav>

          <div className="flex items-center space-x-2 sm:space-x-4 ml-auto">
            <button
              onClick={() => setCurrentPage("cart")}
              className="relative p-2 hover:bg-white/20 rounded-full transition"
            >
              <ShoppingCart size={20} />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItemsCount}
                </span>
              )}
            </button>

            <button
              className="md:hidden p-2 hover:bg-white/20 rounded-full transition"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="md:hidden mt-4 space-y-2 pb-2">
            <MobileNavLink
              onClick={() => {
                setCurrentPage("home");
                setMobileMenuOpen(false);
              }}
            >
              Accueil
            </MobileNavLink>
            <MobileNavLink
              onClick={() => {
                setCurrentPage("products");
                setMobileMenuOpen(false);
              }}
            >
              Produits
            </MobileNavLink>
            <MobileNavLink
              onClick={() => {
                setCurrentPage("catalogue");
                setMobileMenuOpen(false);
              }}
            >
              Catalogue
            </MobileNavLink>
          </nav>
        )}
      </div>
    </header>
  );
}

function NavLink({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="hover:text-pink-200 transition text-sm sm:text-base"
    >
      {children}
    </button>
  );
}

function MobileNavLink({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left px-4 py-2 hover:bg-white/10 rounded transition"
    >
      {children}
    </button>
  );
}

function HomePage() {
  const { products, viewProduct } = useApp();
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
  };

  const prevSlide = () => {
    setCurrentSlide(
      (prev) => (prev - 1 + CAROUSEL_IMAGES.length) % CAROUSEL_IMAGES.length
    );
  };

  useEffect(() => {
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, []);

  const featuredProducts = products.slice(0, 4);
  const seoUrl = `${process.env.PUBLIC_URL}/`;
  return (
    <>
      <Seo title="Accueil" url={seoUrl} />
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="relative h-48 sm:h-64 md:h-96 rounded-lg overflow-hidden mb-6 sm:mb-12">
          <img
            src={CAROUSEL_IMAGES[currentSlide]}
            alt="Carousel"
            className="w-full h-full object-contain"
          />
          <button
            onClick={prevSlide}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 p-1 sm:p-2 rounded-full hover:bg-white transition"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 p-1 sm:p-2 rounded-full hover:bg-white transition"
          >
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
            {CAROUSEL_IMAGES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`w-2 h-2 rounded-full transition ${
                  idx === currentSlide ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>

        <h2 className="text-xl sm:text-3xl font-bold text-gray-800 mb-4 sm:mb-6 text-center">
          Produits en Vedette
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {featuredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => viewProduct(product)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function ProductsPage() {
  const {
    products,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    viewProduct,
  } = useApp();
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-4 sm:mb-8 text-center">
        Nos Produits
      </h1>

      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Rechercher un produit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm sm:text-base"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory("")}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm transition ${
              !selectedCategory
                ? "bg-pink-500 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            Tous
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm transition ${
                selectedCategory === category
                  ? "bg-pink-500 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <p className="text-center text-gray-500 py-8">Aucun produit trouvé</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => viewProduct(product)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-md hover:shadow-xl transition cursor-pointer overflow-hidden"
    >
      <img
        src={product.image}
        alt={product.name}
        className="w-full h-36 sm:h-48 object-cover"
      />
      <div className="p-3 sm:p-4">
        <h3 className="font-semibold text-gray-800 mb-1 sm:mb-2 text-sm sm:text-base line-clamp-2">
          {product.name}
        </h3>
        <p className="text-xs text-gray-500 mb-2">{product.category}</p>
        <div className="flex items-center gap-2">
          <p className="text-pink-600 font-bold text-sm sm:text-lg">
            {product.price} DA
          </p>
          {product.oldPrice && (
            <p className="text-gray-500 text-xs sm:text-sm line-through">
              {product.oldPrice} DA
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductDetailPage() {
  const { selectedProduct, addToCart, setCurrentPage, showToast } = useApp();
  const [quantity, setQuantity] = useState(1);

  if (!selectedProduct) {
    setCurrentPage("products");
    return null;
  }

  const handleAddToCart = () => {
    addToCart(selectedProduct, quantity);
    showToast("Produit ajouté au panier !");
  };

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <button
        onClick={() => setCurrentPage("products")}
        className="text-pink-600 hover:text-pink-700 mb-4 text-sm sm:text-base"
      >
        ← Retour aux produits
      </button>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          <img
            src={selectedProduct.image}
            alt={selectedProduct.name}
            className="w-full h-64 sm:h-96 object-cover"
          />

          <div className="p-4 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2 sm:mb-4">
              {selectedProduct.name}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4">
              {selectedProduct.category}
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-pink-600 mb-4 sm:mb-6">
              {selectedProduct.price} DA
            </p>
            <p className="text-sm sm:text-base text-gray-700 mb-6 sm:mb-8">
              {selectedProduct.description}
            </p>

            <div className="flex items-center space-x-4 mb-6">
              <label className="text-sm sm:text-base text-gray-700">
                Quantité:
              </label>
              <div className="flex items-center border border-gray-300 rounded">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-1 hover:bg-gray-100"
                >
                  -
                </button>
                <span className="px-4 py-1 border-x">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3 py-1 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={handleAddToCart}
              className="w-full bg-pink-500 text-white py-2 sm:py-3 rounded-lg hover:bg-pink-600 transition text-sm sm:text-base"
            >
              Ajouter au Panier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartPage() {
  const {
    cart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    setCurrentPage,
  } = useApp();
  const [showCheckout, setShowCheckout] = useState(false);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <ShoppingCart size={64} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Votre panier est vide
        </h2>
        <button
          onClick={() => setCurrentPage("products")}
          className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition"
        >
          Continuer vos achats
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-4 sm:mb-8">
        Votre Panier
      </h1>

      {!showCheckout ? (
        <>
          <div className="bg-white rounded-lg shadow-lg p-3 sm:p-6 mb-6">
            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center border-b py-3 sm:py-4 last:border-b-0"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded mr-3 sm:mr-4"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 text-sm sm:text-base truncate">
                    {item.name}
                  </h3>
                  <p className="text-pink-600 font-bold text-sm sm:text-base">
                    {item.price} DA
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() =>
                      updateCartQuantity(item.id, item.quantity - 1)
                    }
                    className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center text-sm sm:text-base"
                  >
                    -
                  </button>
                  <span className="w-6 sm:w-8 text-center text-sm sm:text-base">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateCartQuantity(item.id, item.quantity + 1)
                    }
                    className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-200 rounded hover:bg-gray-300 flex items-center justify-center text-sm sm:text-base"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="ml-2 text-red-500 hover:text-red-700 text-sm sm:text-base"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <span className="text-lg sm:text-xl font-bold text-gray-800">
                Total:
              </span>
              <span className="text-xl sm:text-2xl font-bold text-pink-600">
                {total} DA
              </span>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full bg-pink-500 text-white py-2 sm:py-3 rounded-lg hover:bg-pink-600 transition mb-3 text-sm sm:text-base"
            >
              Passer la Commande
            </button>
            <button
              onClick={clearCart}
              className="w-full bg-gray-200 text-gray-700 py-2 sm:py-3 rounded-lg hover:bg-gray-300 transition text-sm sm:text-base"
            >
              Vider le Panier
            </button>
          </div>
        </>
      ) : (
        <CheckoutForm total={total} onBack={() => setShowCheckout(false)} />
      )}
    </div>
  );
}

function CheckoutForm({ total, onBack }) {
  const { cart, clearCart, setCurrentPage, showToast } = useApp();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Le nom est requis";
    } else if (formData.name.trim().length < 3) {
      newErrors.name = "Le nom doit contenir au moins 3 caractères";
    }

    const phoneRegex = /^(0)(5|6|7)[0-9]{8}$/;
    if (!formData.phone.trim()) {
      newErrors.phone = "Le numéro de téléphone est requis";
    } else if (!phoneRegex.test(formData.phone.replace(/\s/g, ""))) {
      newErrors.phone = "Numéro de téléphone invalide (ex: 0551234567)";
    }

    if (!formData.address.trim()) {
      newErrors.address = "L'adresse est requise";
    } else if (formData.address.trim().length < 10) {
      newErrors.address = "L'adresse doit contenir au moins 10 caractères";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const orderData = {
        customerName: formData.name,
        customerPhone: formData.phone,
        customerAddress: formData.address,
        items: cart,
        total: total,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await FirebaseService.firestore.collection("orders").add(orderData);

      FirebaseService.sendNotification(
        "Nouvelle Commande!",
        `Commande de ${formData.name} - ${total} DA`
      );

      showToast("Commande enregistrée — en attente de confirmation");
      clearCart();
      setCurrentPage("home");
    } catch (error) {
      showToast("Erreur lors de la commande. Veuillez réessayer.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 sm:p-8">
      <button
        onClick={onBack}
        className="text-pink-600 hover:text-pink-700 mb-4 text-sm sm:text-base"
      >
        ← Retour au panier
      </button>

      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">
        Informations de Livraison
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nom Complet *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
              errors.name ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="Entrez votre nom complet"
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Numéro de Téléphone *
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
              errors.phone ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="0551234567"
          />
          {errors.phone && (
            <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Adresse Complète *
          </label>
          <textarea
            name="address"
            value={formData.address}
            onChange={handleChange}
            rows="3"
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
              errors.address ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="Adresse, Ville, Wilaya"
          />
          {errors.address && (
            <p className="text-red-500 text-sm mt-1">{errors.address}</p>
          )}
        </div>

        <div className="border-t pt-4 mt-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-lg font-bold text-gray-800">
              Total à Payer:
            </span>
            <span className="text-2xl font-bold text-pink-600">{total} DA</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Frais de livraison non inclus — ils seront confirmés selon votre
            adresse de livraison.
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-pink-500 text-white py-3 rounded-lg hover:bg-pink-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Traitement..." : "Confirmer la Commande"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CataloguePage() {
  const { showToast } = useApp();
  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <h1 className="text-2xl sm:text-4xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">
        Notre Catalogue
      </h1>

      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6 sm:p-8">
        <div className="text-center">
          <Download size={64} className="mx-auto text-pink-500 mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">
            Télécharger Notre Catalogue Complet
          </h2>
          <p className="text-gray-600 mb-6">
            Découvrez tous nos produits cosmétiques et compléments alimentaires
            dans notre catalogue PDF.
          </p>
          <a
            href={`${process.env.PUBLIC_URL}/documents/catalogue.pdf`}
            download="Catalogue_Cosmetiques_DZ.pdf"
            className="bg-pink-500 text-white px-6 py-3 rounded-lg hover:bg-pink-600 transition inline-flex items-center space-x-2"
            onClick={() =>
              showToast("Le téléchargement du catalogue a commencé...")
            }
          >
            <Download size={20} />
            <span>Télécharger le Catalogue (PDF)</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function AdminLogin() {
  const { setIsAdmin } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await FirebaseService.auth.signInWithEmailAndPassword(
        email,
        password
      );

      const idTokenResult = await result.user.getIdTokenResult();
      if (!idTokenResult.claims.admin) {
        await FirebaseService.auth.signOut();
        throw new Error("Accès non autorisé");
      }

      await FirebaseService.requestNotificationPermission();
      setIsAdmin(true);
    } catch (err) {
      setError("Email ou mot de passe incorrect");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100 px-4">
      <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Administration
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Connectez-vous pour gérer votre boutique
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="admin@cosmetiques.dz"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent pr-10"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-pink-500 text-white py-3 rounded-lg hover:bg-pink-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? "Connexion..." : "Se Connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { setIsAdmin, refreshProducts } = useApp();
  const [activeTab, setActiveTab] = useState("orders");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const unsubscribe = FirebaseService.firestore
      .collection("orders")
      .orderBy("createdAt", "desc")
      .onSnapshot((snapshot) => {
        const ordersList = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            items: Array.isArray(data.items) ? data.items : [],
            status: data.status || "confirmed",
            createdAt: data.createdAt || new Date().toISOString(),
          };
        });
        setOrders(ordersList);
      });

    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await FirebaseService.auth.signOut();
    setIsAdmin(false);
    localStorage.clear();
    sessionStorage.clear();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl sm:text-2xl font-bold">Administration</h1>
          <button
            onClick={handleLogout}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition text-sm sm:text-base"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 py-6">
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b overflow-x-auto">
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-4 sm:px-6 py-3 text-sm sm:text-base font-medium whitespace-nowrap ${
                activeTab === "orders"
                  ? "border-b-2 border-pink-500 text-pink-600"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Commandes
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`px-4 sm:px-6 py-3 text-sm sm:text-base font-medium whitespace-nowrap ${
                activeTab === "products"
                  ? "border-b-2 border-pink-500 text-pink-600"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Produits
            </button>
          </div>
        </div>

        {activeTab === "orders" && <OrdersManagement orders={orders} />}
        {activeTab === "products" && (
          <ProductsManagement refreshProducts={refreshProducts} />
        )}
      </div>
    </div>
  );
}

function OrdersManagement({ orders }) {
  const { showToast } = useApp();
  const [statusFilter, setStatusFilter] = useState("all");

  const deleteOrder = async (orderId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette commande ?")) {
      try {
        await FirebaseService.firestore
          .collection("orders")
          .doc(orderId)
          .delete();
        showToast("Commande supprimée avec succès!");
      } catch (error) {
        showToast("Erreur lors de la suppression de la commande", "error");
      }
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await FirebaseService.firestore
        .collection("orders")
        .doc(orderId)
        .update({ status: newStatus });
      showToast("Statut mis à jour avec succès!");
    } catch (error) {
      showToast("Erreur lors de la mise à jour du statut", "error");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "confirmed":
        return "bg-blue-100 text-blue-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "canceled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return <Clock size={16} />;
      case "confirmed":
        return <Clock size={16} />;
      case "delivered":
        return <CheckCircle size={16} />;
      case "canceled":
        return <XCircle size={16} />;
      default:
        return <Package size={16} />;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "pending":
        return "En attente";
      case "confirmed":
        return "Confirmée";
      case "delivered":
        return "Livrée";
      case "canceled":
        return "Annulée";
      default:
        return status;
    }
  };

  const filteredOrders =
    statusFilter === "all"
      ? orders
      : orders.filter((order) => order.status === statusFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          Commandes ({filteredOrders.length})
        </h2>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-4 pr-10 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
          >
            <option value="all">🔄 Tous les statuts</option>
            <option value="pending">⏳ En attente</option>
            <option value="confirmed">✅ Confirmée</option>
            <option value="delivered">🚚 Livrée</option>
            <option value="canceled">❌ Annulée</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Package size={64} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Aucune commande pour le moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-lg shadow-md p-4 sm:p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="mb-3 sm:mb-0">
                  <h3 className="font-bold text-gray-800 text-sm sm:text-base">
                    {order.customerName}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {order.customerPhone}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {order.customerAddress}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(
                      order.status
                    )}`}
                  >
                    {getStatusIcon(order.status)}
                    <span className="capitalize">
                      {getStatusLabel(order.status)}
                    </span>
                  </span>
                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                    title="Supprimer la commande"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="border-t pt-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Produits:
                </p>
                {(order.items || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between text-xs sm:text-sm text-gray-600 mb-1"
                  >
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <span>{item.price * item.quantity} DA</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-pink-600 mt-2 text-sm sm:text-base">
                  <span>Total:</span>
                  <span>{order.total} DA</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateOrderStatus(order.id, "confirmed")}
                  className="flex-1 sm:flex-none bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-600 transition text-xs sm:text-sm"
                >
                  Confirmé
                </button>
                <button
                  onClick={() => updateOrderStatus(order.id, "delivered")}
                  className="flex-1 sm:flex-none bg-green-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-green-600 transition text-xs sm:text-sm"
                >
                  Livré
                </button>
                <button
                  onClick={() => updateOrderStatus(order.id, "canceled")}
                  className="flex-1 sm:flex-none bg-red-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-red-600 transition text-xs sm:text-sm"
                >
                  Annulé
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductsManagement() {
  const { products, refreshProducts, showToast } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const deleteProduct = async (productId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce produit?"))
      return;

    try {
      await FirebaseService.firestore
        .collection("products")
        .doc(productId)
        .delete();
      showToast("Produit supprimé avec succès!");
    } catch (error) {
      console.error("Error deleting product:", error);
      showToast("Erreur lors de la suppression du produit", "error");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          Produits ({products.length})
        </h2>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingProduct(null);
          }}
          className="bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600 transition flex items-center space-x-2 text-sm sm:text-base"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Ajouter Produit</span>
          <span className="sm:hidden">Ajouter</span>
        </button>
      </div>

      {showAddForm && (
        <ProductForm
          product={editingProduct}
          onClose={() => {
            setShowAddForm(false);
            setEditingProduct(null);
          }}
          onSave={() => {
            refreshProducts();
          }}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white rounded-lg shadow-md overflow-hidden"
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-40 sm:h-48 object-cover"
            />
            <div className="p-4">
              <h3 className="font-bold text-gray-800 mb-1 text-sm sm:text-base line-clamp-2">
                {product.name}
              </h3>
              <p className="text-xs text-gray-600 mb-2">{product.category}</p>
              <p className="text-pink-600 font-bold mb-3 text-sm sm:text-base">
                {product.price} DA
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setEditingProduct(product);
                    setShowAddForm(true);
                  }}
                  className="flex-1 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 transition flex items-center justify-center space-x-1 text-xs sm:text-sm"
                >
                  <Edit size={16} />
                  <span>Modifier</span>
                </button>
                <button
                  onClick={() => deleteProduct(product.id)}
                  className="flex-1 bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600 transition flex items-center justify-center space-x-1 text-xs sm:text-sm"
                >
                  <Trash2 size={16} />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductForm({ product, onClose, onSave }) {
  const { showToast } = useApp();
  const [formData, setFormData] = useState({
    name: product?.name || "",
    price: product?.price || "",
    oldPrice: product?.oldPrice || "",
    category: product?.category || CATEGORIES[0],
    description: product?.description || "",
    image: product?.image || "",
    imageFile: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Veuillez sélectionner une image valide", "error");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("L'image ne doit pas dépasser 10MB", "error");
      e.target.value = "";
      return;
    }

    console.log(
      "Image sélectionnée:",
      file.name,
      "Taille:",
      (file.size / 1024).toFixed(2),
      "KB"
    );
    setFormData((prev) => ({ ...prev, imageFile: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const timestamp = new Date().toISOString();
      let imageUrl = formData.image;

      if (formData.imageFile) {
        console.log("Début du téléchargement de l'image...");
        setUploadProgress(true);

        try {
          imageUrl = await FirebaseService.storage.uploadImage(
            formData.imageFile
          );
          console.log("Image téléchargée avec succès:", imageUrl);
          setUploadProgress(false);
        } catch (error) {
          console.error("Erreur lors du téléchargement:", error);
          showToast(
            error.message || "Erreur lors du téléchargement de l'image",
            "error"
          );
          setIsSubmitting(false);
          setUploadProgress(false);
          return;
        }
      }

      if (!imageUrl) {
        showToast("Veuillez sélectionner une image", "error");
        setIsSubmitting(false);
        return;
      }

      const productData = {
        name: formData.name,
        price: parseFloat(formData.price),
        oldPrice: formData.oldPrice ? parseFloat(formData.oldPrice) : null,
        category: formData.category,
        description: formData.description,
        image: imageUrl,
        updatedAt: timestamp,
      };

      if (product) {
        await FirebaseService.firestore
          .collection("products")
          .doc(product.id)
          .update({
            ...productData,
            lastModified: timestamp,
          });
        showToast("Produit modifié avec succès!");
      } else {
        await FirebaseService.firestore.collection("products").add({
          ...productData,
          createdAt: timestamp,
          lastModified: timestamp,
        });
        showToast("Produit ajouté avec succès!");
      }

      onSave();
      onClose();
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
      showToast(
        error.message || "Erreur lors de l'enregistrement du produit",
        "error"
      );
    } finally {
      setIsSubmitting(false);
      setUploadProgress(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
              {product ? "Modifier le Produit" : "Ajouter un Produit"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du Produit *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prix Actuel (DA) *
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                required
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ancien Prix (DA)
              </label>
              <input
                type="number"
                value={formData.oldPrice}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, oldPrice: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                min="0"
                step="0.01"
                placeholder="Laisser vide s'il n'y a pas de remise"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Catégorie *
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, category: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                required
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows="4"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image du Produit {!product && "*"}
              </label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
                />
                {uploadProgress && (
                  <p className="text-sm text-blue-600">
                    Téléchargement en cours...
                  </p>
                )}
                {formData.image && (
                  <div className="flex items-center space-x-2">
                    <div className="w-20 h-20 min-h-[60px] max-h-[120px] bg-gray-100 border border-gray-300 rounded flex items-start justify-center overflow-hidden">
                      <img
                        src={formData.image}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        style={{ objectPosition: "top left" }}
                      />
                    </div>
                    <span className="text-sm text-gray-600">
                      Image actuelle
                    </span>
                  </div>
                )}
                {formData.imageFile && (
                  <p className="text-sm text-green-600">
                    Nouvelle image sélectionnée: {formData.imageFile.name}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Max 10MB. Formats acceptés: JPG, PNG, WEBP
              </p>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting || uploadProgress}
                className="flex-1 bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting
                  ? uploadProgress
                    ? "Téléchargement..."
                    : "Enregistrement..."
                  : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CosmeticsApp;
