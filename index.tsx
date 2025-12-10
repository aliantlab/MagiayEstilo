import React, { useState, useMemo, useEffect } from "react";
import { createRoot } from "react-dom/client";

// --- Types ---

type Gender = "niño" | "niña" | "unisex";
type UnitStatus = "available" | "sold";

interface StockUnit {
  id: string;
  status: UnitStatus;
}

interface ProductSize {
  size: string;
  units: StockUnit[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  gender: Gender;
  imageUrl: string;
  price?: string;
  sizes: ProductSize[];
}

// --- Configuration ---

// ID de la hoja de cálculo (el archivo entero)
const SHEET_ID = "1Tf8ob7GSg8AytO-JdOL7HKCQYRaCu56-NrTaYsXkYak";
// ID de la pestaña "Inventario" (visto en tu URL como gid=1156577664)
const SHEET_GID = "1156577664";
// Clave local para el administrador
const ADMIN_PASSWORD = "admin2025";

// --- Mock Data (Fallback) ---

const INITIAL_PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Cargando inventario...",
    description: "Conectando con Google Sheets...",
    gender: "unisex",
    imageUrl: "",
    sizes: []
  }
];

// --- Helpers ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// --- GVIZ Parser Logic ---

const parseGvizData = (jsonData: any): Product[] => {
  const rows = jsonData.table?.rows || [];

  return rows.map((row: any): Product | null => {
    const c = row.c;
    // Safety check: ensure we have columns
    if (!c || c.length < 2) return null;

    // Helper to get value safely from GVIZ cell
    // GVIZ cells can be null if empty, or contain {v: value, f: formatted}
    const getVal = (idx: number): string => {
      if (!c[idx]) return "";
      return c[idx]?.v !== null ? String(c[idx]?.v) : "";
    };

    // Mapping based on your columns A-G:
    // Index 0: ID
    // Index 1: Nombre
    // Index 2: Descripcion
    // Index 3: Genero
    // Index 4: URL
    // Index 5: Talla
    // Index 6: Stock

    const rawId = getVal(0);
    const rawName = getVal(1);
    const rawDesc = getVal(2);
    const rawGender = getVal(3);
    const rawUrl = getVal(4);
    const rawSizes = getVal(5);
    const rawStock = getVal(6);
    
    // Skip rows where name is empty or looks like header
    // We check if "NOMBRE PRODUCTO" is in the name column to identify the header row
    if (!rawName || rawName.toUpperCase().includes("NOMBRE PRODUCTO")) return null;

    const stockQty = parseFloat(rawStock) || 0; // Parse float in case it comes as "1.0"
    
    // Split sizes by comma or slash
    const sizeList = String(rawSizes).split(/[,/]/).map(s => s.trim()).filter(s => s);

    const sizes: ProductSize[] = sizeList.map(sizeName => {
        const units: StockUnit[] = Array(Math.floor(stockQty)).fill(null).map(() => ({
          id: generateId(),
          status: 'available'
        }));
        return { size: sizeName, units };
    });

    return {
      id: rawId || generateId(),
      name: rawName,
      description: rawDesc,
      gender: (rawGender.toLowerCase() as Gender) || "unisex",
      imageUrl: rawUrl,
      price: "", // Price column not currently used
      sizes: sizes
    };
  }).filter((p): p is Product => p !== null);
};

// --- Main Component ---

const App = () => {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<string | null>(null);
  const [view, setView] = useState<"catalog" | "admin">("catalog");
  const [showDebug, setShowDebug] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const fetchSheet = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Google Visualization API Endpoint (Returns JSON)
      // Added &gid= to target the specific tab seen in screenshot
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;
      
      let jsonText = '';
      
      // Strategy: AllOrigins (Primary)
      try {
          // Add timestamp to prevent caching
          const noCacheUrl = `${gvizUrl}&_=${new Date().getTime()}`;
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(noCacheUrl)}`;
          
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error('AllOrigins Error');
          const data = await response.json();
          if (data.contents) {
              jsonText = data.contents;
          } else {
              throw new Error('No content');
          }
      } catch (err1) {
          console.warn('Primary proxy failed, trying backup...', err1);
          // Strategy: CorsProxy (Backup)
          try {
              const noCacheUrl = `${gvizUrl}&_=${new Date().getTime()}`;
              const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(noCacheUrl)}`;
              const response = await fetch(proxyUrl);
              if (!response.ok) throw new Error('CorsProxy Error');
              jsonText = await response.text();
          } catch (err2) {
               console.error('All proxies failed', err2);
               throw new Error("No se pudo conectar. Verifica que la hoja esté compartida como 'Cualquiera con el enlace puede ver'.");
          }
      }
      
      setDebugData(jsonText.substring(0, 500) + "..."); // Preview for debug

      // Clean GVIZ response: /*O_o*/ google.visualization.Query.setResponse({...});
      const jsonStart = jsonText.indexOf("google.visualization.Query.setResponse(");
      
      if (jsonStart !== -1) {
          const cleanJson = jsonText.substring(jsonStart + 39, jsonText.lastIndexOf(")"));
          const parsed = JSON.parse(cleanJson);
          
          const sheetProducts = parseGvizData(parsed);
          
          if (sheetProducts.length > 0) {
            setProducts(sheetProducts);
            setError(null);
          } else {
             console.log("Parsed JSON Table:", parsed);
             setError("Conexión exitosa a la pestaña 'Inventario', pero no se encontraron filas de productos. Revisa que haya datos debajo de los encabezados.");
          }
      } else {
          setError("Respuesta inesperada de Google. Verifica permisos de la hoja.");
      }

    } catch (err) {
      console.error(err);
      setError("Error de conexión. " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheet();
  }, []);

  // --- Read Only Actions ---

  const addProduct = (product: Product) => {
    alert("Acción no permitida: Agrega productos directamente en tu Google Sheet.");
  };
  
  const editProduct = (product: Product) => {
    alert("Acción no permitida: Edita tu Google Sheet para cambiar detalles.");
  };
  
  const deleteProduct = (id: string) => {
    alert("Acción no permitida: Borra la fila en tu Google Sheet.");
  };
  
  const resetData = () => {
    fetchSheet();
  };
  
  const updateProductStock = (productId: string, sizeIndex: number, unitId: string, newStatus: UnitStatus) => {
     // Local visual update only
     setProducts(products.map(p => {
      if (p.id !== productId) return p;
      const newSizes = [...p.sizes];
      const newUnits = newSizes[sizeIndex].units.map(u => u.id === unitId ? { ...u, status: newStatus } : u);
      newSizes[sizeIndex] = { ...newSizes[sizeIndex], units: newUnits };
      return { ...p, sizes: newSizes };
    }));
  };

  const addSizeToProduct = () => {};
  const updateSizeName = () => {};
  const deleteSize = () => {};
  const addUnitToSize = () => {};

  const handleAdminAuth = (password: string) => {
    if (password === ADMIN_PASSWORD) {
      setView("admin");
      setShowAuthModal(false);
    } else {
      alert("Contraseña incorrecta. Intenta de nuevo.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Announcement Bar - Only visible on Error */}
      {error && (
        <div className="bg-red-500 text-white text-[10px] md:text-xs py-2 text-center tracking-[0.2em] uppercase font-medium">
          {`¡Error! ${error}`}
        </div>
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-40 glass-panel border-b border-white/40 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          
          {/* Logo */}
          <div 
            onClick={() => setView('catalog')}
            className="cursor-pointer group flex flex-col items-center justify-center"
          >
            <span className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-brand-dark group-hover:text-brand-gold transition-colors">
              PEQUEÑOS
            </span>
            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-gray-500">Boutique</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (view === 'catalog') {
                  setShowAuthModal(true);
                } else {
                  setView('catalog');
                }
              }}
              className="text-xs uppercase tracking-widest font-bold text-gray-500 hover:text-brand-dark transition-colors border-b border-transparent hover:border-brand-dark pb-0.5"
            >
              {view === 'catalog' ? 'Admin' : 'Tienda'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main View Switcher */}
      <main className="flex-grow relative">
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center backdrop-blur-sm">
             <div className="flex flex-col items-center">
                <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-dark mb-4"></i>
                <p className="text-sm font-serif text-gray-600">Descargando inventario...</p>
             </div>
          </div>
        )}

        {/* Auth Modal */}
        {showAuthModal && (
          <AuthModal 
            onClose={() => setShowAuthModal(false)} 
            onSubmit={handleAdminAuth} 
          />
        )}
        
        {view === 'catalog' ? (
          <CatalogView products={products} />
        ) : (
          <>
            <AdminView 
              products={products} 
              actions={{ addProduct, editProduct, deleteProduct, updateProductStock, addSizeToProduct, addUnitToSize, updateSizeName, deleteSize, resetData }}
              isReadOnly={true}
            />
            {/* Debugger Button */}
            <div className="max-w-6xl mx-auto px-6 pb-12">
               <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-gray-400 underline">
                 {showDebug ? 'Ocultar Datos Crudos' : 'Ver Datos Crudos (Debug)'}
               </button>
               {showDebug && (
                 <div className="mt-4 p-4 bg-gray-100 rounded text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap border border-gray-300 break-all">
                    <p className="font-bold text-gray-700 mb-2">Respuesta Parcial (Primeros 500 chars):</p>
                    {debugData || "No hay datos recibidos aún."}
                 </div>
               )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-20 py-16 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 text-center md:text-left">
          <div>
            <h4 className="font-serif text-xl mb-4">Pequeños Boutique</h4>
            <div className="max-w-xs mx-auto md:mx-0">
               <span className="inline-block bg-brand-gold/10 text-brand-dark font-bold uppercase tracking-wider text-[10px] mb-3 px-2 py-1 border border-brand-gold/30 rounded-sm">
                 <i className="fa-solid fa-certificate text-brand-gold mr-1"></i> Ropa Importada & Original
               </span>
               <p className="text-gray-500 text-sm leading-relaxed">
                 Exclusiva selección de moda infantil 100% original. Calidad internacional garantizada para tus pequeños.
               </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="font-serif text-lg mb-2">Contacto</h4>
            <a href="https://wa.me/573012419467" className="text-gray-600 hover:text-brand-gold transition-colors text-sm">
              <i className="fa-brands fa-whatsapp mr-2"></i> +57 301 2419467
            </a>
            <span className="text-gray-400 text-sm">Bogotá, Colombia</span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-center text-xs text-gray-400 uppercase tracking-widest">
          © 2025 Pequeños Boutique.
        </div>
      </footer>
    </div>
  );
};

const AuthModal = ({ onClose, onSubmit }: { onClose: () => void, onSubmit: (pass: string) => void }) => {
  const [password, setPassword] = useState("");
  return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
          <div className="relative bg-white w-full max-w-sm p-8 rounded shadow-2xl animate-slide-up">
              <h3 className="font-serif text-xl text-brand-dark mb-2">Acceso Restringido</h3>
              <p className="text-xs text-gray-500 mb-6">Ingresa la clave de administrador para continuar.</p>
              
              <input 
                  type="text" 
                  className="w-full bg-gray-50 border border-gray-200 rounded py-3 px-4 mb-6 text-center text-lg tracking-widest text-gray-800 placeholder-gray-300 outline-none focus:border-brand-dark focus:bg-white focus:ring-1 focus:ring-brand-dark/20 transition-all"
                  placeholder="CLAVE"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSubmit(password)}
                  autoFocus
              />
              
              <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 py-3 text-xs uppercase tracking-widest text-gray-400 hover:text-gray-600 font-medium">Cancelar</button>
                  <button onClick={() => onSubmit(password)} className="flex-1 bg-brand-dark text-white py-3 text-xs uppercase tracking-widest font-bold hover:bg-gray-800 shadow-lg transition-transform active:scale-95">Entrar</button>
              </div>
          </div>
      </div>
  )
}

// --- Catalog Section ---

const CatalogView = ({ products }: { products: Product[] }) => {
  const [filter, setFilter] = useState<Gender | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const gMatch = filter === 'all' || p.gender.toLowerCase() === filter || p.gender.toLowerCase() === 'unisex';
      const sMatch = p.name.toLowerCase().includes(search.toLowerCase());
      return gMatch && sMatch;
    });
  }, [products, filter, search]);

  return (
    <>
      {/* Hero Header */}
      <header className="relative w-full h-[50vh] md:h-[70vh] flex items-center justify-center overflow-hidden mb-12 group bg-gray-200">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1560506179-019eb417a268?auto=format&fit=crop&q=80&w=1920" 
            alt="Hero Banner" 
            className="w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'; // Hide if broken
            }}
          />
          <div className="absolute inset-0 bg-black/30"></div>
        </div>
        <div className="relative z-10 text-center text-white px-4 animate-slide-up flex flex-col items-center">
          
          {/* Badges de Importación */}
          <div className="mb-6 flex flex-col md:flex-row items-center gap-3">
             <div className="bg-brand-gold text-brand-dark px-4 py-1.5 text-[10px] md:text-xs font-bold uppercase tracking-widest rounded-sm shadow-lg border border-yellow-400 backdrop-blur-sm">
                <i className="fa-solid fa-star mr-1.5"></i> 100% Original
             </div>
             <div className="bg-black/40 backdrop-blur-md text-white px-4 py-1.5 text-[10px] md:text-xs font-bold uppercase tracking-widest rounded-sm border border-white/30">
                <i className="fa-solid fa-plane-arrival mr-1.5"></i> Ropa Importada
             </div>
          </div>

          <h1 className="font-serif text-5xl md:text-7xl mb-6 drop-shadow-xl">Magia & Estilo</h1>
          <button 
            onClick={() => document.getElementById('shop-grid')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-3 border border-white text-white hover:bg-white hover:text-brand-dark transition-all duration-300 uppercase text-xs tracking-widest font-bold backdrop-blur-sm shadow-lg"
          >
            Ver Colección
          </button>
        </div>
      </header>

      {/* Filters & Search */}
      <div id="shop-grid" className="max-w-7xl mx-auto px-6 mb-10 sticky top-20 z-30 pointer-events-none">
        <div className="glass-panel rounded-full p-2 flex flex-col md:flex-row justify-between items-center pointer-events-auto shadow-sm">
          {/* Gender Filter */}
          <div className="flex p-1 gap-1">
            {['all', 'niña', 'niño'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-6 py-2 rounded-full text-xs uppercase tracking-wider transition-all duration-300 ${
                  filter === f 
                    ? 'bg-brand-dark text-white shadow-md font-bold' 
                    : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                }`}
              >
                {f === 'all' ? 'Todo' : f}
              </button>
            ))}
          </div>
          
          {/* Search */}
          <div className="relative w-full md:w-64 mt-2 md:mt-0 px-2 md:px-0">
            <input 
              type="text" 
              placeholder="Buscar prendas..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-b border-gray-300 focus:border-brand-dark py-2 pl-2 pr-8 text-sm outline-none transition-colors"
            />
            <i className="fa-solid fa-magnifying-glass absolute right-2 top-2.5 text-gray-400 text-xs"></i>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
          ))}
        </div>
        
        {filtered.length === 0 && (
          <div className="text-center py-32 opacity-50">
            <p className="font-serif text-2xl mb-2">No encontramos coincidencias</p>
            <p className="text-sm">Intenta ajustar tus filtros de búsqueda.</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedProduct && (
        <DetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </>
  );
};

const ProductCard: React.FC<{ product: Product; onClick: () => void }> = ({ product, onClick }) => {
  const isNew = Math.random() > 0.5; // Mock logic for "New" badge

  return (
    <div 
      className="group cursor-pointer flex flex-col animate-fade-in"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-gray-100 mb-4">
        {product.imageUrl ? (
            <img 
            src={product.imageUrl} 
            alt={product.name} 
            className="w-full h-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-105"
            />
        ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                <i className="fa-regular fa-image text-3xl"></i>
            </div>
        )}
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300"></div>
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
           {isNew && <span className="bg-white/90 backdrop-blur text-[10px] font-bold px-2 py-1 uppercase tracking-widest text-brand-dark">Nuevo</span>}
        </div>

        {/* Action Button (Desktop) */}
        <div className="absolute bottom-0 inset-x-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 hidden md:block">
           <button className="w-full bg-white text-brand-dark py-3 text-xs font-bold uppercase tracking-widest hover:bg-brand-dark hover:text-white transition-colors shadow-lg">
             Vista Rápida
           </button>
        </div>
      </div>

      <div className="text-center group-hover:opacity-80 transition-opacity">
        <h3 className="font-serif text-lg text-gray-900 leading-snug mb-1">{product.name}</h3>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{product.gender}</p>
        <div className="flex justify-center gap-2 items-center border-b border-gray-300 pb-0.5 inline-block mx-auto w-max">
           {product.price && <span className="text-sm font-bold text-brand-dark">${product.price}</span>}
           <span className="text-xs font-medium text-gray-500">Ver Detalles</span>
        </div>
      </div>
    </div>
  );
};

const DetailModal = ({ product, onClose }: { product: Product, onClose: () => void }) => {
  const [size, setSize] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; }
  }, []);

  const handleWhatsApp = () => {
    if (!size) return;
    const msg = `Hola, me interesa *${product.name}* en talla *${size}*. ¿Podrían darme más información?`;
    window.open(`https://wa.me/573012419467?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-brand-cream w-full max-w-5xl rounded-sm shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 hover:bg-white hover:shadow-md transition-all">
          <i className="fa-solid fa-xmark text-lg"></i>
        </button>

        {/* Image */}
        <div className="w-full md:w-1/2 bg-gray-100 relative h-64 md:h-auto">
          {product.imageUrl ? (
              <img src={product.imageUrl} className="w-full h-full object-cover" alt={product.name} />
          ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                  <span className="text-xs uppercase tracking-widest">Sin Imagen</span>
              </div>
          )}
        </div>

        {/* Info */}
        <div className="w-full md:w-1/2 p-8 md:p-12 overflow-y-auto bg-white flex flex-col justify-center">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">{product.gender} Collection</span>
          <div className="flex justify-between items-start mb-2">
             <h2 className="font-serif text-3xl md:text-4xl text-brand-dark leading-tight">{product.name}</h2>
             {product.price && <span className="text-2xl font-serif text-brand-dark font-bold">${product.price}</span>}
          </div>
          
          <p className="text-gray-600 font-light leading-relaxed mb-8 text-sm md:text-base border-l-2 border-brand-gold pl-4">
            {product.description}
          </p>

          <div className="mb-8">
            <div className="flex justify-between items-baseline mb-4">
              <span className="text-xs font-bold uppercase tracking-wider">Selecciona Talla</span>
              <span className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Stock en tiempo real
              </span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              {product.sizes.map(s => {
                const stock = s.units.filter(u => u.status === 'available').length;
                const isOut = stock === 0;
                const isActive = size === s.size;

                return (
                  <button
                    key={s.size}
                    disabled={isOut}
                    onClick={() => setSize(s.size)}
                    className={`
                      min-w-[3.5rem] h-12 border flex items-center justify-center text-sm transition-all
                      ${isOut 
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed decoration-slice line-through' 
                        : isActive
                          ? 'border-brand-dark bg-brand-dark text-white shadow-lg scale-105'
                          : 'border-gray-200 text-gray-600 hover:border-brand-dark hover:text-brand-dark'
                      }
                    `}
                  >
                    {s.size}
                  </button>
                )
              })}
            </div>
            {product.sizes.length === 0 && <p className="text-xs text-red-400 mt-2 italic">Agotado o no disponible.</p>}
          </div>

          <button
            disabled={!size}
            onClick={handleWhatsApp}
            className={`
              w-full py-4 uppercase text-xs font-bold tracking-[0.2em] transition-all flex items-center justify-center gap-2
              ${size 
                ? 'bg-[#25D366] text-white hover:bg-[#20ba5c] hover:shadow-xl hover:shadow-green-200 shadow-green-100 shadow-lg' 
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            <i className="fa-brands fa-whatsapp text-lg"></i>
            {size ? 'Solicitar Precio y Compra' : 'Selecciona una talla'}
          </button>
          
          <p className="mt-4 text-[10px] text-center text-gray-400 uppercase tracking-wide">
            Respuesta inmediata • Pagos seguros
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Admin Section ---

const AdminView = ({ products, actions, isReadOnly }: { products: Product[], actions: any, isReadOnly?: boolean }) => {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Fallback for when an image fails to load
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.onerror = null; // Prevent loop
    e.currentTarget.src = ""; // Clear src to show container or alt
    e.currentTarget.classList.add("hidden"); // Hide the broken image element
    e.currentTarget.parentElement?.classList.add("bg-gray-200", "flex", "items-center", "justify-center"); // Style parent
    const icon = document.createElement("i");
    icon.className = "fa-regular fa-image text-gray-400 text-xl";
    e.currentTarget.parentElement?.appendChild(icon);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
      {/* Banner de Modo Lectura */}
      {isReadOnly && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex items-start gap-3">
              <i className="fa-solid fa-cloud text-blue-500 mt-1"></i>
              <div>
                  <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wide">Conectado a Google Sheets</h4>
                  <p className="text-xs text-blue-600 mt-1">
                      Estás viendo los datos directamente de tu hoja de cálculo.
                  </p>
                  <div className="mt-2 text-[10px] text-blue-400 font-mono bg-white p-2 rounded border border-blue-100">
                      Columnas requeridas: A:ID | B:Nombre | C:Desc | D:Genero | E:UrlImagen | F:Tallas | G:Stock
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-end mb-10 border-b border-gray-200 pb-6">
        <div>
          <h2 className="font-serif text-3xl text-brand-dark mb-1">Inventario</h2>
          <p className="text-sm text-gray-500">Visualización de datos en la nube.</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          <button 
            onClick={actions.resetData}
            className="text-gray-500 px-4 py-3 text-xs uppercase tracking-widest font-bold hover:text-brand-dark transition-all flex items-center gap-2"
          >
            <i className="fa-solid fa-rotate"></i> Recargar Datos
          </button>
          <button 
            onClick={() => actions.addProduct({} as any)}
            className={`px-6 py-3 text-xs uppercase tracking-widest font-bold transition-all flex items-center gap-2 ${isReadOnly ? 'bg-gray-300 text-white cursor-not-allowed' : 'bg-brand-dark text-white hover:bg-gray-800'}`}
          >
            <i className="fa-solid fa-plus"></i> Nuevo Producto
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {products.map((p) => (
          <div key={p.id} className="bg-white p-6 shadow-sm border border-gray-200 rounded-xl hover:shadow-lg transition-all duration-300 flex flex-col md:flex-row gap-6 items-start">
            <div className="w-24 h-32 rounded-lg bg-gray-100 shadow-sm flex-shrink-0 overflow-hidden relative">
               {p.imageUrl ? (
                   <img 
                   src={p.imageUrl} 
                   className="w-full h-full object-cover" 
                   alt="" 
                   onError={handleImageError}
                 />
               ) : (
                   <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fa-solid fa-image"></i></div>
               )}
            </div>
            
            <div className="flex-grow w-full">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-serif text-xl font-bold text-gray-900">{p.name}</h3>
                  <span className="text-xs uppercase text-gray-400 tracking-wider font-medium">{p.gender} • Ref: {p.id}</span>
                  {p.price && <div className="text-sm font-bold text-brand-dark mt-1">${p.price}</div>}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => actions.editProduct(p)} 
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:text-brand-dark hover:bg-gray-200 transition-colors"
                    title="Ver detalles"
                  >
                    <i className={`fa-solid ${isReadOnly ? 'fa-eye' : 'fa-pen-to-square'}`}></i>
                  </button>
                  <button onClick={() => actions.deleteProduct(p.id)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <i className="fa-regular fa-trash-can"></i>
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="flex flex-wrap gap-4 items-start">
                  {p.sizes.map((s, sIdx) => (
                    <div key={`${p.id}-${sIdx}`} className="bg-white px-4 py-3 rounded-lg border border-gray-100 shadow-sm min-w-[140px] group">
                      <div className="flex justify-between items-center mb-3 border-b border-dashed border-gray-200 pb-2 relative">
                        <div className="flex items-center gap-2">
                           <span className="font-bold text-sm text-gray-800">Talla {s.size}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-1.5">
                        {s.units.length === 0 && <span className="text-[10px] text-gray-400 italic">Sin stock</span>}
                        {s.units.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => actions.updateProductStock(p.id, sIdx, u.id, u.status === 'available' ? 'sold' : 'available')}
                            className={`w-3 h-3 rounded-full border transition-all ${
                              u.status === 'available' 
                                ? 'bg-green-400 border-green-500' 
                                : 'bg-red-400 border-red-500 opacity-30'
                            }`}
                            title="Estado local (no se guarda en sheet)"
                          />
                        ))}
                      </div>
                      <div className="mt-2 text-[10px] text-gray-400 text-right font-medium">
                        {s.units.filter(x => x.status === 'available').length} / {s.units.length} Disp.
                      </div>
                    </div>
                  ))}
                  {p.sizes.length === 0 && <span className="text-xs text-gray-400 italic">Sin tallas definidas en el Sheet</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}