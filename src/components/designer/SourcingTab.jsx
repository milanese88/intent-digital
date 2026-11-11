import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Card,
  Pill,
  Eyebrow,
  SidePanel,
  Field,
  EmptyState,
  SegmentedControl
} from '../ui';

// Categories matching specifications
const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'tile', label: 'Tile' },
  { id: 'cabinetry', label: 'Cabinetry' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'decor', label: 'Decor' },
  { id: 'paint', label: 'Paint' },
  { id: 'other', label: 'Other' }
];

const ROOM_TYPE_OPTIONS = [
  { id: 'all', label: 'All Rooms' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'living', label: 'Living Room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'dining', label: 'Dining Room' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'outdoor', label: 'Outdoor / Patio' },
  { id: 'office', label: 'Office / Study' },
  { id: 'laundry', label: 'Laundry' },
  { id: 'other', label: 'Other' }
];

const TRADE_ROLES = [
  'General contractor',
  'Electrician',
  'Plumber',
  'Tile installer',
  'Painter',
  'Cabinet maker',
  'Stone fabricator',
  'Stager',
  'Photographer',
  'Supplier/Showroom',
  'Other'
];

/**
 * Safe Photo Pipeline:
 * In-browser canvas processing to downscale to max 2000px,
 * convert to JPEG (0.88 quality), stripping all EXIF GPS and camera metadata.
 */
function processAndStripProductImage(file) {
  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return Promise.reject(new Error('Image file size exceeds 10 MB limit.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image file.'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        const maxDim = 2000;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve({
          data: dataUrl,
          filename: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
          contentType: 'image/jpeg'
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatPrice(val, unit) {
  if (val == null || val === '') return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  const formatted = '$' + Math.round(num).toLocaleString('en-US');
  return unit ? `${formatted} / ${unit}` : formatted;
}

function getInsuranceStatus(dateStr) {
  if (!dateStr) {
    return { variant: 'neutral', label: 'No insurance on file' };
  }
  const exp = new Date(dateStr);
  const now = new Date();
  // reset hours to midnight for date comparison
  exp.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { variant: 'negative', label: 'Expired' };
  }
  if (diffDays <= 30) {
    return {
      variant: 'warning',
      label: diffDays === 0 ? 'Expires today' : `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`
    };
  }
  return {
    variant: 'positive',
    label: `Valid · Exp ${exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  };
}

/**
 * Inline SVG Heart Icon:
 * Outline when off, filled burgundy when on (no emoji / no text glyph).
 */
function HeartIcon({ filled = false, size = 15, color = 'var(--burgundy)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={filled ? '1.5' : '2'}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export default function SourcingTab({
  currentProject,
  projects = [],
  onProjectUpdated
}) {
  // Sub-tabs: 'products' | 'trades'
  const [subTab, setSubTab] = useState('products');

  // Products state
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState(null);

  // Trades state
  const [trades, setTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [tradesError, setTradesError] = useState(null);

  // Filters & Search for Products
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRoomType, setSelectedRoomType] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Product Drawer State (Add / Edit)
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [drawerName, setDrawerName] = useState('');
  const [drawerCategory, setDrawerCategory] = useState('other');
  const [drawerVendor, setDrawerVendor] = useState('');
  const [drawerSku, setDrawerSku] = useState('');
  const [drawerSpec, setDrawerSpec] = useState('');
  const [drawerFinish, setDrawerFinish] = useState('');
  const [drawerUnitCost, setDrawerUnitCost] = useState('');
  const [drawerUnit, setDrawerUnit] = useState('ea');
  const [drawerLeadTime, setDrawerLeadTime] = useState('');
  const [drawerRoomTypes, setDrawerRoomTypes] = useState([]);
  const [drawerLinkUrl, setDrawerLinkUrl] = useState('');
  const [drawerNotes, setDrawerNotes] = useState('');
  const [drawerImageUrl, setDrawerImageUrl] = useState('');
  const [drawerFavorite, setDrawerFavorite] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productDrawerError, setProductDrawerError] = useState(null);
  const photoInputRef = useRef(null);

  // Trade Drawer State (Add / Edit)
  const [isTradeDrawerOpen, setIsTradeDrawerOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [tradeRole, setTradeRole] = useState(TRADE_ROLES[0]);
  const [tradeCompany, setTradeCompany] = useState('');
  const [tradeContact, setTradeContact] = useState('');
  const [tradePhone, setTradePhone] = useState('');
  const [tradeEmail, setTradeEmail] = useState('');
  const [tradeLicense, setTradeLicense] = useState('');
  const [tradeInsurance, setTradeInsurance] = useState('');
  const [tradeNotes, setTradeNotes] = useState('');
  const [isSavingTrade, setIsSavingTrade] = useState(false);
  const [tradeDrawerError, setTradeDrawerError] = useState(null);

  // "+ TO ROOM" Modal State
  const [toRoomModalProduct, setToRoomModalProduct] = useState(null);
  const [toRoomProjectId, setToRoomProjectId] = useState(currentProject?.id || '');
  const [projectRooms, setProjectRooms] = useState([]);
  const [toRoomId, setToRoomId] = useState('');
  const [toRoomQty, setToRoomQty] = useState(1);
  const [isAddingToRoom, setIsAddingToRoom] = useState(false);
  const [toRoomError, setToRoomError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Load products
  const fetchProducts = async () => {
    setLoadingProducts(true);
    setProductsError(null);
    try {
      const res = await fetch('/api/designer/products');
      if (!res.ok) throw new Error('Failed to load sourcing products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error('fetchProducts error:', err);
      setProductsError(err.message || 'Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  };

  // Load trades
  const fetchTrades = async () => {
    setLoadingTrades(true);
    setTradesError(null);
    try {
      const res = await fetch('/api/designer/trades');
      if (!res.ok) throw new Error('Failed to load trades & vendors');
      const data = await res.json();
      setTrades(data.trades || []);
    } catch (err) {
      console.error('fetchTrades error:', err);
      setTradesError(err.message || 'Failed to load trades & vendors');
    } finally {
      setLoadingTrades(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchTrades();
  }, []);

  // Sync toRoomProjectId with currentProject when currentProject changes
  useEffect(() => {
    if (currentProject?.id) {
      setToRoomProjectId(currentProject.id);
    } else if (projects.length > 0 && !toRoomProjectId) {
      setToRoomProjectId(projects[0].id);
    }
  }, [currentProject, projects]);

  // Load rooms when toRoomProjectId changes
  useEffect(() => {
    if (!toRoomProjectId) {
      setProjectRooms([]);
      setToRoomId('');
      return;
    }
    const loadRooms = async () => {
      try {
        const res = await fetch(`/api/designer/rooms?project_id=${toRoomProjectId}`);
        if (res.ok) {
          const data = await res.json();
          const list = data.rooms || [];
          setProjectRooms(list);
          if (list.length > 0) {
            setToRoomId(list[0].id);
          } else {
            setToRoomId('');
          }
        }
      } catch (err) {
        console.warn('Could not load rooms for project:', err);
      }
    };
    loadRooms();
  }, [toRoomProjectId]);

  // Toast auto-clear
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== 'all') {
        if ((p.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }
      // Room type filter
      if (selectedRoomType !== 'all') {
        const rTypes = Array.isArray(p.room_types) ? p.room_types : [];
        if (!rTypes.some(t => String(t).toLowerCase() === selectedRoomType.toLowerCase())) {
          return false;
        }
      }
      // Favorites toggle
      if (favoritesOnly && !p.favorite) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (p.name || '').toLowerCase();
        const vendor = (p.vendor || '').toLowerCase();
        const finish = (p.finish || '').toLowerCase();
        const notes = (p.notes || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const spec = (p.spec || '').toLowerCase();
        return (
          name.includes(q) ||
          vendor.includes(q) ||
          finish.includes(q) ||
          notes.includes(q) ||
          sku.includes(q) ||
          spec.includes(q)
        );
      }
      return true;
    });
  }, [products, selectedCategory, selectedRoomType, favoritesOnly, searchQuery]);

  // Grouped Trades by Role
  const groupedTrades = useMemo(() => {
    const groups = {};
    TRADE_ROLES.forEach(r => { groups[r] = []; });
    trades.forEach(t => {
      const r = t.role && groups[t.role] ? t.role : 'Other';
      groups[r].push(t);
    });
    return groups;
  }, [trades]);

  // Toggle Favorite
  const handleToggleFavorite = async (e, product) => {
    e.stopPropagation();
    const newFav = !product.favorite;
    // Optimistic update
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, favorite: newFav } : p));

    try {
      const res = await fetch(`/api/designer/products?id=${product.id}&action=toggle_favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: newFav })
      });
      if (!res.ok) throw new Error('Failed to toggle favorite');
      const data = await res.json();
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, favorite: data.product.favorite } : p));
    } catch (err) {
      console.error('Toggle favorite error:', err);
      // Revert on error
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, favorite: !newFav } : p));
    }
  };

  // Open Product Drawer for Create / Edit
  const handleOpenProductDrawer = (product = null) => {
    setProductDrawerError(null);
    if (product) {
      setEditingProduct(product);
      setDrawerName(product.name || '');
      setDrawerCategory(product.category || 'other');
      setDrawerVendor(product.vendor || '');
      setDrawerSku(product.sku || '');
      setDrawerSpec(product.spec || '');
      setDrawerFinish(product.finish || '');
      setDrawerUnitCost(product.unit_cost != null ? String(product.unit_cost) : '');
      setDrawerUnit(product.unit || 'ea');
      setDrawerLeadTime(product.lead_time || '');
      setDrawerRoomTypes(Array.isArray(product.room_types) ? product.room_types : []);
      setDrawerLinkUrl(product.link_url || '');
      setDrawerNotes(product.notes || '');
      setDrawerImageUrl(product.image_url || '');
      setDrawerFavorite(product.favorite === true);
    } else {
      setEditingProduct(null);
      setDrawerName('');
      setDrawerCategory('surfaces');
      setDrawerVendor('');
      setDrawerSku('');
      setDrawerSpec('');
      setDrawerFinish('');
      setDrawerUnitCost('');
      setDrawerUnit('ea');
      setDrawerLeadTime('');
      setDrawerRoomTypes([]);
      setDrawerLinkUrl('');
      setDrawerNotes('');
      setDrawerImageUrl('');
      setDrawerFavorite(false);
    }
    setIsProductDrawerOpen(true);
  };

  // Photo Upload Handler (JPEG, EXIF stripped, max 2000px)
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setProductDrawerError(null);

    try {
      const processed = await processAndStripProductImage(file);

      const res = await fetch('/api/designer/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_image',
          data: processed.data,
          filename: processed.filename,
          contentType: processed.contentType,
          previous_url: drawerImageUrl || null
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to upload photo');
      }

      const uploadData = await res.json();
      setDrawerImageUrl(uploadData.url);
    } catch (err) {
      console.error('Photo upload error:', err);
      setProductDrawerError(err.message || 'Photo upload failed');
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  // Save Product
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!drawerName.trim()) {
      setProductDrawerError('Product name is required');
      return;
    }

    setIsSavingProduct(true);
    setProductDrawerError(null);

    const payload = {
      name: drawerName.trim(),
      category: drawerCategory,
      vendor: drawerVendor.trim() || null,
      sku: drawerSku.trim() || null,
      spec: drawerSpec.trim() || null,
      finish: drawerFinish.trim() || null,
      unit_cost: drawerUnitCost !== '' ? Number(drawerUnitCost.replace(/[$,]/g, '')) : null,
      unit: drawerUnit.trim() || 'ea',
      lead_time: drawerLeadTime.trim() || null,
      room_types: drawerRoomTypes,
      link_url: drawerLinkUrl.trim() || null,
      notes: drawerNotes.trim() || null,
      image_url: drawerImageUrl || null,
      favorite: drawerFavorite
    };

    try {
      let res;
      if (editingProduct?.id) {
        res = await fetch(`/api/designer/products?id=${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/designer/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save product');
      }

      const resData = await res.json();
      const saved = resData.product;

      if (editingProduct?.id) {
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? saved : p));
      } else {
        setProducts(prev => [saved, ...prev]);
      }

      setIsProductDrawerOpen(false);
    } catch (err) {
      console.error('Save product error:', err);
      setProductDrawerError(err.message || 'Failed to save product');
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async () => {
    if (!editingProduct?.id) return;
    const ok = window.confirm(
      `Are you sure you want to delete "${editingProduct.name}"?\nExisting project items will be kept but unlinked from this product.`
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/designer/products?id=${editingProduct.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete product');
      setProducts(prev => prev.filter(p => p.id !== editingProduct.id));
      setIsProductDrawerOpen(false);
    } catch (err) {
      console.error('Delete product error:', err);
      setProductDrawerError(err.message || 'Failed to delete product');
    }
  };

  // Open "+ TO ROOM" Modal
  const handleOpenToRoomModal = (e, product) => {
    e.stopPropagation();
    setToRoomModalProduct(product);
    setToRoomQty(1);
    setToRoomError(null);
    if (currentProject?.id) {
      setToRoomProjectId(currentProject.id);
    }
  };

  // Submit "+ TO ROOM"
  const handleSubmitToRoom = async (e) => {
    e.preventDefault();
    if (!toRoomModalProduct) return;
    if (!toRoomProjectId) {
      setToRoomError('Please choose a project');
      return;
    }

    setIsAddingToRoom(true);
    setToRoomError(null);

    const product = toRoomModalProduct;
    const chosenRoom = projectRooms.find(r => r.id === toRoomId);
    const roomName = chosenRoom ? chosenRoom.name : 'Project';

    const payload = {
      project_id: toRoomProjectId,
      room_id: toRoomId || null,
      product_id: product.id,
      name: product.name,
      category: product.category || 'other',
      vendor: product.vendor || null,
      spec: product.spec || (product.sku ? `SKU: ${product.sku}` : null),
      qty: Number(toRoomQty) || 1,
      unit_cost: product.unit_cost != null ? Number(product.unit_cost) : 0,
      status: 'selected',
      link_url: product.link_url || null
    };

    try {
      const res = await fetch('/api/designer/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to add item to room');
      }

      // Update product items_count in local state
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, items_count: (p.items_count || 0) + 1 } : p));

      if (typeof onProjectUpdated === 'function') {
        onProjectUpdated();
      }

      setToastMessage(`Added "${product.name}" to ${roomName} →`);
      setToRoomModalProduct(null);
    } catch (err) {
      console.error('Add to room error:', err);
      setToRoomError(err.message || 'Failed to add to room');
    } finally {
      setIsAddingToRoom(false);
    }
  };

  // Trade Drawer Open (Create / Edit)
  const handleOpenTradeDrawer = (trade = null) => {
    setTradeDrawerError(null);
    if (trade) {
      setEditingTrade(trade);
      setTradeRole(trade.role || TRADE_ROLES[0]);
      setTradeCompany(trade.company || '');
      setTradeContact(trade.contact_name || '');
      setTradePhone(trade.phone || '');
      setTradeEmail(trade.email || '');
      setTradeLicense(trade.license_no || '');
      setTradeInsurance(trade.insurance_expires ? String(trade.insurance_expires).substring(0, 10) : '');
      setTradeNotes(trade.notes || '');
    } else {
      setEditingTrade(null);
      setTradeRole(TRADE_ROLES[0]);
      setTradeCompany('');
      setTradeContact('');
      setTradePhone('');
      setTradeEmail('');
      setTradeLicense('');
      setTradeInsurance('');
      setTradeNotes('');
    }
    setIsTradeDrawerOpen(true);
  };

  // Save Trade
  const handleSaveTrade = async (e) => {
    e.preventDefault();
    if (!tradeCompany.trim()) {
      setTradeDrawerError('Company or trade name is required');
      return;
    }

    setIsSavingTrade(true);
    setTradeDrawerError(null);

    const payload = {
      role: tradeRole,
      company: tradeCompany.trim(),
      contact_name: tradeContact.trim() || null,
      phone: tradePhone.trim() || null,
      email: tradeEmail.trim() || null,
      license_no: tradeLicense.trim() || null,
      insurance_expires: tradeInsurance || null,
      notes: tradeNotes.trim() || null
    };

    try {
      let res;
      if (editingTrade?.id) {
        res = await fetch(`/api/designer/trades?id=${editingTrade.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/designer/trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save trade');
      }

      const resData = await res.json();
      const saved = resData.trade;

      if (editingTrade?.id) {
        setTrades(prev => prev.map(t => t.id === editingTrade.id ? saved : t));
      } else {
        setTrades(prev => [saved, ...prev]);
      }

      setIsTradeDrawerOpen(false);
    } catch (err) {
      console.error('Save trade error:', err);
      setTradeDrawerError(err.message || 'Failed to save trade');
    } finally {
      setIsSavingTrade(false);
    }
  };

  // Delete Trade
  const handleDeleteTrade = async () => {
    if (!editingTrade?.id) return;
    const ok = window.confirm(
      `Are you sure you want to delete "${editingTrade.company}"?\nAssigned items will be unlinked from this trade.`
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/designer/trades?id=${editingTrade.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete trade');
      setTrades(prev => prev.filter(t => t.id !== editingTrade.id));
      setIsTradeDrawerOpen(false);
    } catch (err) {
      console.error('Delete trade error:', err);
      setTradeDrawerError(err.message || 'Failed to delete trade');
    }
  };

  // Toggle Room Type in Drawer
  const handleToggleRoomTypeChip = (rtId) => {
    setDrawerRoomTypes(prev => {
      if (prev.includes(rtId)) {
        return prev.filter(x => x !== rtId);
      } else {
        return [...prev, rtId];
      }
    });
  };

  return (
    <div>
      <style>{`
        @media (max-width: 640px) {
          .sourcing-products-grid {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
            gap: 12px !important;
          }
          .sourcing-trades-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: 'var(--espresso)',
          color: 'var(--cream)',
          padding: '12px 20px',
          borderRadius: 'var(--radius-pill)',
          boxShadow: 'var(--shadow-floating)',
          zIndex: 10000,
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.02em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP SUB-TABS (Products · Trades & vendors)                             */}
      {/* ========================================================================= */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-16)',
        marginBottom: 'var(--space-24)',
        paddingBottom: 'var(--space-16)',
        borderBottom: '1px solid var(--border)'
      }}>
        <SegmentedControl
          options={[
            { id: 'products', label: `Products (${products.length})` },
            { id: 'trades', label: `Trades & vendors (${trades.length})` }
          ]}
          value={subTab}
          onChange={setSubTab}
          size="md"
        />

        {subTab === 'products' ? (
          <Button
            variant="primary"
            onClick={() => handleOpenProductDrawer()}
          >
            + ADD PRODUCT →
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => handleOpenTradeDrawer()}
          >
            + ADD TRADE OR VENDOR →
          </Button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. SUB-TAB: PRODUCTS                                                      */}
      {/* ========================================================================= */}
      {subTab === 'products' && (
        <div>
          {/* Top Filter Bar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-16)',
            marginBottom: 'var(--space-24)'
          }}>
            {/* Search Box + Room Dropdown + Favorites Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-12)'
            }}>
              {/* Search Box */}
              <div style={{
                position: 'relative',
                flex: '1 1 260px',
                maxWidth: '420px',
                display: 'flex',
                alignItems: 'center'
              }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    left: '14px',
                    color: 'var(--muted)',
                    pointerEvents: 'none'
                  }}
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search name, vendor, finish, SKU, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 14px 8px 36px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    color: 'var(--espresso)',
                    backgroundColor: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-pill)',
                    outline: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--burgundy)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      fontSize: '12px'
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Room Type Filter Dropdown */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)' }}>
                  Room:
                </span>
                <select
                  value={selectedRoomType}
                  onChange={(e) => setSelectedRoomType(e.target.value)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--white)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    color: 'var(--espresso)',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {ROOM_TYPE_OPTIONS.map(rt => (
                    <option key={rt.id} value={rt.id}>{rt.label}</option>
                  ))}
                </select>
              </div>

              {/* Favorites Toggle Button */}
              <button
                type="button"
                onClick={() => setFavoritesOnly(prev => !prev)}
                aria-pressed={favoritesOnly}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-pill)',
                  border: favoritesOnly ? '1px solid var(--burgundy)' : '1px solid var(--border)',
                  backgroundColor: favoritesOnly ? 'var(--burgundy)' : 'var(--white)',
                  color: favoritesOnly ? 'var(--cream)' : 'var(--espresso)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  outline: 'none'
                }}
              >
                <HeartIcon
                  filled={favoritesOnly}
                  size={13}
                  color={favoritesOnly ? 'var(--cream)' : 'var(--burgundy)'}
                />
                <span>Favorites only</span>
              </button>
            </div>

            {/* Category Filter Pills (wrap neatly on phone) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px'
            }}>
              {CATEGORIES.map(cat => {
                const isActive = selectedCategory.toLowerCase() === cat.id.toLowerCase();
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 'var(--radius-pill)',
                      border: isActive ? '1px solid var(--espresso)' : '1px solid var(--border)',
                      backgroundColor: isActive ? 'var(--espresso)' : 'var(--white)',
                      color: isActive ? 'var(--cream)' : 'var(--text-2)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      outline: 'none'
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading / Error States */}
          {loadingProducts && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
              Loading sourcing library...
            </div>
          )}

          {productsError && (
            <div style={{
              padding: '14px 18px',
              backgroundColor: 'var(--negative-bg)',
              color: 'var(--negative)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-20)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px'
            }}>
              {productsError}
            </div>
          )}

          {/* Empty State */}
          {!loadingProducts && products.length === 0 && (
            <EmptyState
              title="Build your go-to library"
              description="Save the finishes, fixtures, and pieces you use again and again across your projects."
              action={
                <Button variant="primary" onClick={() => handleOpenProductDrawer()}>
                  + ADD PRODUCT →
                </Button>
              }
            />
          )}

          {/* No search results empty state */}
          {!loadingProducts && products.length > 0 && filteredProducts.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              backgroundColor: 'var(--sand)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--border)'
            }}>
              <p style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                color: 'var(--espresso)',
                fontWeight: 600,
                marginBottom: '6px'
              }}>
                No products match your current filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedRoomType('all');
                  setFavoritesOnly(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--burgundy)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Reset all filters →
              </button>
            </div>
          )}

          {/* Responsive Card Grid (1-2 cols on mobile, 3-4 on desktop) */}
          {!loadingProducts && filteredProducts.length > 0 && (
            <div
              className="sourcing-products-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 'var(--space-20)'
              }}
            >
              {filteredProducts.map((p) => {
                const formattedPrice = formatPrice(p.unit_cost, p.unit);
                const isFav = p.favorite === true;

                return (
                  <Card
                    key={p.id}
                    onClick={() => handleOpenProductDrawer(p)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      padding: 0,
                      position: 'relative'
                    }}
                  >
                    {/* Photo / Tone Block */}
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      height: '180px',
                      backgroundColor: 'var(--beige)',
                      overflow: 'hidden'
                    }}>
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: 'var(--beige)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--muted)',
                            opacity: 0.6
                          }}>
                            {p.category || 'Product'}
                          </span>
                        </div>
                      )}

                      {/* Favorite Heart Button (inline SVG outline when off, filled burgundy when on) */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(e, p)}
                        aria-pressed={isFav}
                        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        title={isFav ? 'Favorited' : 'Add to favorites'}
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-pill)',
                          backgroundColor: 'rgba(255, 255, 255, 0.94)',
                          border: isFav ? '1.5px solid var(--burgundy)' : '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(30, 21, 9, 0.12)',
                          transition: 'all 0.18s ease',
                          outline: 'none'
                        }}
                      >
                        <HeartIcon filled={isFav} size={15} color="var(--burgundy)" />
                      </button>

                      {/* Category Badge overlay bottom-left */}
                      {p.category && (
                        <div style={{
                          position: 'absolute',
                          bottom: '10px',
                          left: '10px'
                        }}>
                          <Pill variant="neutral" size="sm">
                            {p.category}
                          </Pill>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div style={{
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1
                    }}>
                      {/* Name */}
                      <h3 style={{
                        fontFamily: "var(--font-display), 'Atelier Fleur', 'Playfair Display', Georgia, serif",
                        fontSize: '19px',
                        fontWeight: 500,
                        color: 'var(--espresso)',
                        margin: '0 0 4px 0',
                        lineHeight: 1.25
                      }}>
                        {p.name}
                      </h3>

                      {/* Vendor · Finish */}
                      {(p.vendor || p.finish) && (
                        <div style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          color: 'var(--muted)',
                          marginBottom: '8px'
                        }}>
                          {p.vendor || ''}
                          {p.vendor && p.finish ? ' · ' : ''}
                          {p.finish || ''}
                        </div>
                      )}

                      {/* Price + Unit */}
                      <div style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '15px',
                        fontWeight: 700,
                        color: 'var(--espresso)',
                        marginBottom: '8px'
                      }}>
                        {formattedPrice || <span style={{ opacity: 0.4, fontWeight: 400 }}>Price unlisted</span>}
                      </div>

                      {/* Lead Time & Usage */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        color: 'var(--muted)',
                        marginTop: 'auto',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border)'
                      }}>
                        <span>{p.lead_time ? `Lead: ${p.lead_time}` : 'Lead time: N/A'}</span>
                        <span style={{ fontWeight: 600 }}>
                          Used in {p.items_count || 0} {Number(p.items_count) === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      {/* "+ TO ROOM" Outline Pill Button */}
                      <div style={{ marginTop: '12px' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => handleOpenToRoomModal(e, p)}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          + TO ROOM →
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUB-TAB: TRADES & VENDORS                                              */}
      {/* ========================================================================= */}
      {subTab === 'trades' && (
        <div>
          {loadingTrades && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
              Loading trades & vendors...
            </div>
          )}

          {tradesError && (
            <div style={{
              padding: '14px 18px',
              backgroundColor: 'var(--negative-bg)',
              color: 'var(--negative)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-20)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px'
            }}>
              {tradesError}
            </div>
          )}

          {!loadingTrades && trades.length === 0 && (
            <EmptyState
              title="No trades or vendors yet"
              description="Add your trusted general contractors, electricians, tile installers, and suppliers."
              action={
                <Button variant="primary" onClick={() => handleOpenTradeDrawer()}>
                  + ADD TRADE OR VENDOR →
                </Button>
              }
            />
          )}

          {/* Grouped by Role */}
          {!loadingTrades && trades.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-32)' }}>
              {TRADE_ROLES.map(role => {
                const list = groupedTrades[role] || [];
                if (list.length === 0) return null;

                return (
                  <div key={role}>
                    {/* Role Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: 'var(--space-16)',
                      paddingBottom: '6px',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <Eyebrow>{role}</Eyebrow>
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 600
                      }}>
                        ({list.length})
                      </span>
                    </div>

                    {/* Cards Grid */}
                    <div
                      className="sourcing-trades-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: 'var(--space-16)'
                      }}
                    >
                      {list.map(t => {
                        const insStatus = getInsuranceStatus(t.insurance_expires);

                        return (
                          <Card
                            key={t.id}
                            style={{
                              padding: '20px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px'
                            }}
                          >
                            {/* Card Top: Company & Edit button */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                              <div>
                                <h3 style={{
                                  fontFamily: "var(--font-display), 'Atelier Fleur', 'Playfair Display', Georgia, serif",
                                  fontSize: '20px',
                                  fontWeight: 500,
                                  color: 'var(--espresso)',
                                  margin: '0 0 4px 0',
                                  lineHeight: 1.2
                                }}>
                                  {t.company}
                                </h3>
                                {t.contact_name && (
                                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-2)' }}>
                                    {t.contact_name}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenTradeDrawer(t)}
                                title="Edit trade details"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--muted)',
                                  fontSize: '12px',
                                  padding: '4px',
                                  textDecoration: 'underline'
                                }}
                              >
                                Edit ✎
                              </button>
                            </div>

                            {/* Contact info (Phone / Email) */}
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '12px'
                            }}>
                              {t.phone ? (
                                <a
                                  href={`tel:${t.phone}`}
                                  style={{
                                    color: 'var(--burgundy)',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <span>☎</span>
                                  <span>{t.phone}</span>
                                </a>
                              ) : (
                                <span style={{ color: 'var(--muted)', opacity: 0.6 }}>No phone on file</span>
                              )}

                              {t.email ? (
                                <a
                                  href={`mailto:${t.email}`}
                                  style={{
                                    color: 'var(--burgundy)',
                                    textDecoration: 'underline',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {t.email}
                                </a>
                              ) : (
                                <span style={{ color: 'var(--muted)', opacity: 0.6 }}>No email on file</span>
                              )}
                            </div>

                            {/* License & DBPR Verify Link */}
                            <div style={{
                              padding: '8px 12px',
                              backgroundColor: 'var(--sand)',
                              borderRadius: 'var(--radius-sm)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '6px'
                            }}>
                              <span style={{ fontWeight: 600, color: 'var(--espresso)' }}>
                                {t.license_no ? `Lic: ${t.license_no}` : 'No license #'}
                              </span>

                              <a
                                href="https://www.myfloridalicense.com/wl11.asp"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: 'var(--burgundy)',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  textDecoration: 'underline'
                                }}
                              >
                                Verify license ↗
                              </a>
                            </div>

                            {/* Insurance Status Pill */}
                            <div>
                              <Pill variant={insStatus.variant} size="sm">
                                {insStatus.label}
                              </Pill>
                            </div>

                            {/* Notes */}
                            {t.notes && (
                              <div style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: '12px',
                                color: 'var(--muted)',
                                fontStyle: 'italic',
                                lineHeight: 1.4
                              }}>
                                “{t.notes}”
                              </div>
                            )}

                            {/* Footer: Assigned to N items */}
                            <div style={{
                              marginTop: 'auto',
                              paddingTop: '8px',
                              borderTop: '1px solid var(--border)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '11px',
                              color: 'var(--muted)',
                              fontWeight: 600
                            }}>
                              Assigned to {t.items_count || 0} {Number(t.items_count) === 1 ? 'item' : 'items'}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PRODUCT SIDEPANEL FORM (Create / Edit)                                 */}
      {/* ========================================================================= */}
      <SidePanel
        isOpen={isProductDrawerOpen}
        onClose={() => !isSavingProduct && setIsProductDrawerOpen(false)}
        eyebrow="SOURCING LIBRARY"
        title={editingProduct ? 'Edit product' : 'Add product to library'}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            {editingProduct ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeleteProduct}
                disabled={isSavingProduct}
                style={{ color: 'var(--negative)' }}
              >
                Delete
              </Button>
            ) : <span />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="secondary"
                onClick={() => setIsProductDrawerOpen(false)}
                disabled={isSavingProduct}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveProduct}
                disabled={isSavingProduct}
              >
                {isSavingProduct ? 'Saving...' : (editingProduct ? 'Save Changes →' : 'Add Product →')}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {productDrawerError && (
            <div style={{
              padding: '12px 14px',
              backgroundColor: 'var(--negative-bg)',
              color: 'var(--negative)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)'
            }}>
              {productDrawerError}
            </div>
          )}

          {/* Product Name */}
          <Field
            label="Product Name"
            required
            value={drawerName}
            onChange={(e) => setDrawerName(e.target.value)}
            placeholder="e.g. Cle Tile Zellige 4x4, Kohler Purist Faucet"
          />

          {/* Category */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Category
            </label>
            <select
              value={drawerCategory}
              onChange={(e) => setDrawerCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px'
              }}
            >
              {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Vendor: free text or pick from trades list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)' }}>
                Vendor / Supplier
              </label>
              {trades.length > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  or pick from trades
                </span>
              )}
            </div>

            {trades.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setDrawerVendor(e.target.value);
                  }
                }}
                defaultValue=""
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--sand)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  outline: 'none'
                }}
              >
                <option value="">Quick pick from my trades & vendors...</option>
                {trades.map(t => (
                  <option key={t.id} value={t.company}>{t.company} ({t.role || 'Vendor'})</option>
                ))}
              </select>
            )}

            <input
              type="text"
              value={drawerVendor}
              onChange={(e) => setDrawerVendor(e.target.value)}
              placeholder="e.g. Ann Sacks, Floor & Decor, CB2, Visual Comfort"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          {/* SKU & Finish */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field
              label="SKU / Model #"
              value={drawerSku}
              onChange={(e) => setDrawerSku(e.target.value)}
              placeholder="e.g. KL-7798-BN"
            />
            <Field
              label="Finish / Color"
              value={drawerFinish}
              onChange={(e) => setDrawerFinish(e.target.value)}
              placeholder="e.g. Brushed Brass, Matte Black"
            />
          </div>

          {/* Specification / Dimensions */}
          <Field
            label="Specification / Dimensions"
            value={drawerSpec}
            onChange={(e) => setDrawerSpec(e.target.value)}
            placeholder="e.g. 7-inch wide engineered oak, 4000K 60W"
          />

          {/* Unit Cost ($) & Unit (ea, sf, lf) */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Field
              label="Unit Cost ($)"
              value={drawerUnitCost}
              onChange={(e) => setDrawerUnitCost(e.target.value)}
              placeholder="e.g. 68.50"
            />
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
                Unit
              </label>
              <input
                type="text"
                value={drawerUnit}
                onChange={(e) => setDrawerUnit(e.target.value)}
                placeholder="ea, sf, lf, set"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--white)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {/* Lead Time */}
          <Field
            label="Lead Time"
            value={drawerLeadTime}
            onChange={(e) => setDrawerLeadTime(e.target.value)}
            placeholder="e.g. In stock, 2–3 weeks, 8–10 weeks"
          />

          {/* Room Types (Multi-select chips) */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Room Types (Suitable for)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {ROOM_TYPE_OPTIONS.filter(r => r.id !== 'all').map(rt => {
                const isSelected = drawerRoomTypes.includes(rt.id);
                return (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => handleToggleRoomTypeChip(rt.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-pill)',
                      border: isSelected ? '1px solid var(--burgundy)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? 'var(--burgundy)' : 'var(--white)',
                      color: isSelected ? 'var(--cream)' : 'var(--espresso)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isSelected ? `✓ ${rt.label}` : rt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Link (Plain URL only) */}
          <div>
            <Field
              label="Product URL (Stored as plain link only)"
              type="url"
              value={drawerLinkUrl}
              onChange={(e) => setDrawerLinkUrl(e.target.value)}
              placeholder="https://..."
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              No scraping or copying from retailer sites — stored as a plain reference URL.
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Notes & Trade Tips
            </label>
            <textarea
              rows={3}
              value={drawerNotes}
              onChange={(e) => setDrawerNotes(e.target.value)}
              placeholder="e.g. Requires special grout, order 15% overage for herringbone pattern..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Photo Upload (Safe photo pipeline: JPEG max 2000px, EXIF stripped, random path) */}
          <div style={{
            padding: '16px',
            backgroundColor: 'var(--sand)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--border)'
          }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '8px' }}>
              Product Photo (Safe Pipeline)
            </label>

            {drawerImageUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <img
                  src={drawerImageUrl}
                  alt="Product preview"
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: 'var(--radius-sm)',
                    objectFit: 'cover',
                    border: '1px solid var(--border)'
                  }}
                />
                <div>
                  <button
                    type="button"
                    onClick={() => setDrawerImageUrl('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--negative)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    Remove Photo
                  </button>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                    Photo optimized & metadata stripped.
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                >
                  {isUploadingPhoto ? 'Processing & uploading...' : '+ Upload Photo →'}
                </Button>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                  Max 10 MB. In-browser canvas strips camera & GPS metadata.
                </div>
              </div>
            )}
          </div>
        </form>
      </SidePanel>

      {/* ========================================================================= */}
      {/* 5. "+ TO ROOM" MODAL DIALOG                                              */}
      {/* ========================================================================= */}
      {toRoomModalProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(30, 21, 9, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--white)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-floating)',
            maxWidth: '440px',
            width: '100%',
            padding: '28px',
            border: '1px solid var(--border)'
          }}>
            <Eyebrow>ADD TO PROJECT ROOM</Eyebrow>
            <h3 style={{
              fontFamily: "var(--font-display), 'Atelier Fleur', 'Playfair Display', Georgia, serif",
              fontSize: '22px',
              fontWeight: 400,
              color: 'var(--espresso)',
              margin: '6px 0 16px 0',
              lineHeight: 1.2
            }}>
              {toRoomModalProduct.name}
            </h3>

            {toRoomError && (
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'var(--negative-bg)',
                color: 'var(--negative)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                marginBottom: '14px'
              }}>
                {toRoomError}
              </div>
            )}

            <form onSubmit={handleSubmitToRoom} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Project Select */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
                  Project
                </label>
                <select
                  value={toRoomProjectId}
                  onChange={(e) => setToRoomProjectId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--white)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px'
                  }}
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Room Select */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
                  Room
                </label>
                {projectRooms.length > 0 ? (
                  <select
                    value={toRoomId}
                    onChange={(e) => setToRoomId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--white)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px'
                    }}
                  >
                    {projectRooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    padding: '8px 12px',
                    backgroundColor: 'var(--sand)',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    No rooms in this project yet (will attach to project base)
                  </div>
                )}
              </div>

              {/* Quantity */}
              <Field
                label="Quantity"
                type="number"
                min="1"
                value={toRoomQty}
                onChange={(e) => setToRoomQty(e.target.value)}
              />

              {/* Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setToRoomModalProduct(null)}
                  disabled={isAddingToRoom}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isAddingToRoom}
                >
                  {isAddingToRoom ? 'Adding...' : 'Add to Room →'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. TRADE SIDEPANEL FORM (Create / Edit)                                   */}
      {/* ========================================================================= */}
      <SidePanel
        isOpen={isTradeDrawerOpen}
        onClose={() => !isSavingTrade && setIsTradeDrawerOpen(false)}
        eyebrow="TRADES & VENDORS"
        title={editingTrade ? 'Edit trade contact' : 'Add trade or vendor'}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            {editingTrade ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeleteTrade}
                disabled={isSavingTrade}
                style={{ color: 'var(--negative)' }}
              >
                Delete
              </Button>
            ) : <span />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="secondary"
                onClick={() => setIsTradeDrawerOpen(false)}
                disabled={isSavingTrade}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveTrade}
                disabled={isSavingTrade}
              >
                {isSavingTrade ? 'Saving...' : (editingTrade ? 'Save Changes →' : 'Add Contact →')}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveTrade} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tradeDrawerError && (
            <div style={{
              padding: '12px 14px',
              backgroundColor: 'var(--negative-bg)',
              color: 'var(--negative)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)'
            }}>
              {tradeDrawerError}
            </div>
          )}

          {/* Role */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Role / Specialty
            </label>
            <select
              value={tradeRole}
              onChange={(e) => setTradeRole(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px'
              }}
            >
              {TRADE_ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Company Name */}
          <Field
            label="Company Name"
            required
            value={tradeCompany}
            onChange={(e) => setTradeCompany(e.target.value)}
            placeholder="e.g. Apex Tile & Stone, Coastal Electric Inc"
          />

          {/* Contact Person Name */}
          <Field
            label="Contact Person Name"
            value={tradeContact}
            onChange={(e) => setTradeContact(e.target.value)}
            placeholder="e.g. Marco Rossi, Sarah Jenkins"
          />

          {/* Phone & Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field
              label="Phone Number"
              type="tel"
              value={tradePhone}
              onChange={(e) => setTradePhone(e.target.value)}
              placeholder="(305) 555-0199"
            />
            <Field
              label="Email"
              type="email"
              value={tradeEmail}
              onChange={(e) => setTradeEmail(e.target.value)}
              placeholder="contact@company.com"
            />
          </div>

          {/* License # */}
          <div>
            <Field
              label="License Number"
              value={tradeLicense}
              onChange={(e) => setTradeLicense(e.target.value)}
              placeholder="e.g. CGC1529810, EC13008920"
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              <a
                href="https://www.myfloridalicense.com/wl11.asp"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--burgundy)', textDecoration: 'underline' }}
              >
                Look up license on Florida DBPR ↗
              </a>
            </div>
          </div>

          {/* Insurance Expiration */}
          <Field
            label="Insurance Expiration Date"
            type="date"
            value={tradeInsurance}
            onChange={(e) => setTradeInsurance(e.target.value)}
          />

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Notes
            </label>
            <textarea
              rows={3}
              value={tradeNotes}
              onChange={(e) => setTradeNotes(e.target.value)}
              placeholder="e.g. Reliable, specializes in large format porcelain, 2 weeks notice needed..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>
        </form>
      </SidePanel>
    </div>
  );
}
