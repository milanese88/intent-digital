import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Card,
  Eyebrow,
  SidePanel,
  Field,
  EmptyState
} from '../ui';

const CATEGORIES = [
  { id: 'materials', label: 'Materials' },
  { id: 'labor', label: 'Labor' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'decor', label: 'Decor' },
  { id: 'paint', label: 'Paint' },
  { id: 'design_fee', label: 'Design fee' },
  { id: 'other', label: 'Other' }
];

const STATUS_OPTIONS = [
  { id: 'planned', label: 'Planned', variant: 'neutral' },
  { id: 'ordered', label: 'Ordered', variant: 'warning' },
  { id: 'delivered', label: 'Delivered', variant: 'info' },
  { id: 'installed', label: 'Installed', variant: 'positive' },
  { id: 'cancelled', label: 'Cancelled', variant: 'negative' }
];

function formatCurrency(val) {
  if (val == null || isNaN(val)) return '$0';
  return '$' + Math.round(Number(val)).toLocaleString('en-US');
}

function formatDate(dateStr) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Safe Invoice Processing Pipeline:
 * - 10 MB limit enforcement.
 * - PDFs accepted only as application/pdf (read directly as base64).
 * - Images resized to max 2000px, converted to JPEG (0.88 quality),
 *   and stripped of all EXIF/GPS/device metadata via HTML5 Canvas.
 */
function processAndStripInvoiceFile(file) {
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB limit
  if (file.size > MAX_BYTES) {
    return Promise.reject(new Error('Invoice file size exceeds 10 MB limit.'));
  }

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read PDF file.'));
      reader.onload = () => {
        resolve({
          data: reader.result,
          filename: file.name,
          contentType: 'application/pdf'
        });
      };
      reader.readAsDataURL(file);
    });
  }

  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isImage) {
    return Promise.reject(new Error('Unsupported file type. Invoices must be PDF or image files (JPG, PNG, WebP).'));
  }

  // Process image: resize to max 2000px, convert to JPEG, strip metadata via canvas
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

export default function BudgetTab({
  project,
  onProjectUpdated,
  setActiveDashboardTab
}) {
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [roomFilter, setRoomFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Table Sorting
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('asc');

  // Inline edit state
  const [editingTargetBudget, setEditingTargetBudget] = useState(false);
  const [targetBudgetValue, setTargetBudgetValue] = useState('');
  const [editingContingency, setEditingContingency] = useState(false);
  const [contingencyValue, setContingencyValue] = useState('');
  const [savedCell, setSavedCell] = useState(null); // { id, field }
  const saveTimeoutRef = useRef(null);

  // SidePanel Item Form
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [drawerRoomId, setDrawerRoomId] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [drawerCategory, setDrawerCategory] = useState('materials');
  const [drawerSpec, setDrawerSpec] = useState('');
  const [drawerVendor, setDrawerVendor] = useState('');
  const [drawerQty, setDrawerQty] = useState('1');
  const [drawerUnitCost, setDrawerUnitCost] = useState('0');
  const [drawerStatus, setDrawerStatus] = useState('planned');
  const [drawerPaid, setDrawerPaid] = useState('0');
  const [drawerDueDate, setDrawerDueDate] = useState('');
  const [drawerNotes, setDrawerNotes] = useState('');
  const [drawerLinkUrl, setDrawerLinkUrl] = useState('');
  const [drawerInvoiceUrl, setDrawerInvoiceUrl] = useState('');
  const [drawerTradeId, setDrawerTradeId] = useState('');
  const [trades, setTrades] = useState([]);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [drawerError, setDrawerError] = useState(null);
  const fileInputRef = useRef(null);

  // Send to Underwrite Confirmation Dialog
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isSendingUnderwrite, setIsSendingUnderwrite] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState('');
  const [sendError, setSendError] = useState(null);

  // Fetch Items & Rooms
  const fetchBudgetDetails = async () => {
    if (!project?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, roomsRes, tradesRes] = await Promise.all([
        fetch(`/api/designer/items?project_id=${project.id}`),
        fetch(`/api/designer/rooms?project_id=${project.id}`),
        fetch('/api/designer/trades')
      ]);

      if (!itemsRes.ok) {
        throw new Error('Failed to load design items');
      }
      const itemsData = await itemsRes.json();
      setItems(itemsData.items || []);

      if (roomsRes.ok) {
        const roomsData = await roomsRes.json();
        setRooms(roomsData.rooms || []);
      }

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        setTrades(tradesData.trades || []);
      }
    } catch (err) {
      console.error('Error fetching budget data:', err);
      setError(err.message || 'Error loading budget data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgetDetails();
  }, [project?.id]);

  // Flash subtle "Saved" feedback
  const triggerSavedFeedback = (id, field) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSavedCell({ id, field });
    saveTimeoutRef.current = setTimeout(() => {
      setSavedCell(null);
    }, 1800);
  };

  // Calculations
  const targetBudget = Number(project?.target_budget) || 0;
  const contingencyPct = project?.contingency_pct != null ? Number(project.contingency_pct) : 10;

  const estimatedTotal = useMemo(() => {
    return items.reduce((acc, it) => {
      const q = Number(it.qty) || 1;
      const c = Number(it.unit_cost) || 0;
      return acc + (Number(it.total) || q * c);
    }, 0);
  }, [items]);

  const contingencyAmount = Math.round(estimatedTotal * (contingencyPct / 100));
  const totalWithContingency = estimatedTotal + contingencyAmount;

  const committedTotal = useMemo(() => {
    return items
      .filter(it => ['ordered', 'delivered', 'installed'].includes((it.status || '').toLowerCase()))
      .reduce((acc, it) => {
        const q = Number(it.qty) || 1;
        const c = Number(it.unit_cost) || 0;
        return acc + (Number(it.total) || q * c);
      }, 0);
  }, [items]);

  const paidTotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.paid) || 0), 0);
  }, [items]);

  // Stacked progress bar math against target
  const progressBase = targetBudget > 0 ? targetBudget : Math.max(totalWithContingency, 1);
  const paidPct = Math.min(100, Math.max(0, (paidTotal / progressBase) * 100));
  const committedNotPaid = Math.max(0, committedTotal - paidTotal);
  const committedNotPaidPct = Math.min(100 - paidPct, Math.max(0, (committedNotPaid / progressBase) * 100));
  const estimatedNotCommitted = Math.max(0, totalWithContingency - committedTotal);
  const estimatedNotCommittedPct = Math.min(100 - paidPct - committedNotPaidPct, Math.max(0, (estimatedNotCommitted / progressBase) * 100));

  const isOverTarget = targetBudget > 0 && totalWithContingency > targetBudget;
  const overTargetAmount = isOverTarget ? totalWithContingency - targetBudget : 0;

  // By Room aggregation
  const roomTotals = useMemo(() => {
    const map = {};
    rooms.forEach(r => {
      map[r.id] = { id: r.id, name: r.name, total: 0 };
    });
    map['unassigned'] = { id: 'unassigned', name: 'General / Unassigned', total: 0 };

    items.forEach(it => {
      const q = Number(it.qty) || 1;
      const c = Number(it.unit_cost) || 0;
      const itemCost = Number(it.total) || q * c;
      if (it.room_id && map[it.room_id]) {
        map[it.room_id].total += itemCost;
      } else {
        map['unassigned'].total += itemCost;
      }
    });

    const list = rooms.map(r => map[r.id]);
    if (map['unassigned'].total > 0) {
      list.push(map['unassigned']);
    }
    return list;
  }, [rooms, items]);

  const maxRoomTotal = useMemo(() => {
    return Math.max(...roomTotals.map(r => r.total), 1);
  }, [roomTotals]);

  // By Category aggregation
  const categoryTotals = useMemo(() => {
    const map = {};
    CATEGORIES.forEach(c => {
      map[c.id] = { ...c, total: 0 };
    });

    items.forEach(it => {
      const rawCat = (it.category || 'other').toLowerCase().trim();
      const matched = CATEGORIES.find(c => c.id === rawCat || c.label.toLowerCase() === rawCat);
      const catKey = matched ? matched.id : 'other';
      const q = Number(it.qty) || 1;
      const c = Number(it.unit_cost) || 0;
      const cost = Number(it.total) || q * c;
      if (map[catKey]) {
        map[catKey].total += cost;
      } else {
        map['other'].total += cost;
      }
    });

    return CATEGORIES.map(c => map[c.id]);
  }, [items]);

  // Labor vs Materials split
  const laborAmount = categoryTotals.find(c => c.id === 'labor')?.total || 0;
  const materialsAmount = categoryTotals.find(c => c.id === 'materials')?.total || 0;
  const combinedLaborMaterials = laborAmount + materialsAmount;
  const laborPctOfCombined = combinedLaborMaterials > 0 ? Math.round((laborAmount / combinedLaborMaterials) * 100) : 50;
  const materialsPctOfCombined = 100 - laborPctOfCombined;

  // Filtered & Sorted items for Table
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      if (roomFilter !== 'all') {
        if (roomFilter === 'unassigned') {
          if (it.room_id) return false;
        } else if (it.room_id !== roomFilter) {
          return false;
        }
      }
      if (categoryFilter !== 'all') {
        const rawCat = (it.category || 'other').toLowerCase().trim();
        const matched = CATEGORIES.find(c => c.id === rawCat || c.label.toLowerCase() === rawCat);
        const catKey = matched ? matched.id : 'other';
        if (catKey !== categoryFilter) return false;
      }
      if (statusFilter !== 'all') {
        if ((it.status || 'planned').toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const roomName = rooms.find(r => r.id === it.room_id)?.name || 'General';
        const matchName = (it.name || '').toLowerCase().includes(q);
        const matchVendor = (it.vendor || '').toLowerCase().includes(q);
        const matchSpec = (it.spec || '').toLowerCase().includes(q);
        const matchRoom = roomName.toLowerCase().includes(q);
        if (!matchName && !matchVendor && !matchSpec && !matchRoom) return false;
      }
      return true;
    }).sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'name':
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          break;
        case 'room':
          valA = (rooms.find(r => r.id === a.room_id)?.name || '').toLowerCase();
          valB = (rooms.find(r => r.id === b.room_id)?.name || '').toLowerCase();
          break;
        case 'category':
          valA = (a.category || '').toLowerCase();
          valB = (b.category || '').toLowerCase();
          break;
        case 'vendor':
          valA = (a.vendor || '').toLowerCase();
          valB = (b.vendor || '').toLowerCase();
          break;
        case 'qty':
          valA = Number(a.qty) || 0;
          valB = Number(b.qty) || 0;
          break;
        case 'unit_cost':
          valA = Number(a.unit_cost) || 0;
          valB = Number(b.unit_cost) || 0;
          break;
        case 'total':
          valA = Number(a.total) || ((Number(a.qty) || 1) * (Number(a.unit_cost) || 0));
          valB = Number(b.total) || ((Number(b.qty) || 1) * (Number(b.unit_cost) || 0));
          break;
        case 'status':
          valA = (a.status || '').toLowerCase();
          valB = (b.status || '').toLowerCase();
          break;
        case 'paid':
          valA = Number(a.paid) || 0;
          valB = Number(b.paid) || 0;
          break;
        case 'due_date':
          valA = a.due_date || '9999-99-99';
          valB = b.due_date || '9999-99-99';
          break;
        default:
          valA = a.created_at || '';
          valB = b.created_at || '';
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, rooms, roomFilter, categoryFilter, statusFilter, searchQuery, sortField, sortDirection]);

  // Inline update item cell
  const handleUpdateItemCell = async (item, field, rawValue) => {
    let payload = { id: item.id };
    if (field === 'qty') {
      const q = Number(rawValue);
      if (isNaN(q) || q < 1) return;
      payload.qty = q;
      payload.total = q * Number(item.unit_cost || 0);
    } else if (field === 'unit_cost') {
      const c = Number(String(rawValue).replace(/[$,]/g, ''));
      if (isNaN(c) || c < 0) return;
      payload.unit_cost = c;
      payload.total = (Number(item.qty) || 1) * c;
    } else if (field === 'status') {
      payload.status = rawValue;
    } else if (field === 'paid') {
      const p = Number(String(rawValue).replace(/[$,]/g, ''));
      if (isNaN(p) || p < 0) return;
      payload.paid = p;
    } else if (field === 'due_date') {
      payload.due_date = rawValue || null;
    }

    // Optimistic local update
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, ...payload } : it));
    triggerSavedFeedback(item.id, field);

    try {
      const res = await fetch(`/api/designer/items?id=${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error('Failed to update line item');
      }
      const data = await res.json();
      if (data?.item) {
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, ...data.item } : it));
      }
    } catch (err) {
      console.error('Error saving item cell:', err);
      // Revert if error
      fetchBudgetDetails();
    }
  };

  // Inline update Target Budget
  const handleSaveTargetBudget = async () => {
    setEditingTargetBudget(false);
    const cleaned = targetBudgetValue.replace(/[$,]/g, '').trim();
    const newBudget = cleaned === '' ? null : Number(cleaned);
    if (newBudget !== null && (isNaN(newBudget) || newBudget < 0)) return;

    try {
      const res = await fetch(`/api/designer/projects?id=${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_budget: newBudget })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.project && onProjectUpdated) {
          onProjectUpdated(data.project);
        }
      }
    } catch (err) {
      console.error('Failed to update target budget:', err);
    }
  };

  // Inline update Contingency %
  const handleSaveContingency = async () => {
    setEditingContingency(false);
    const cleaned = contingencyValue.replace(/[%,]/g, '').trim();
    const newPct = cleaned === '' ? 10 : Number(cleaned);
    if (isNaN(newPct) || newPct < 0) return;

    try {
      const res = await fetch(`/api/designer/projects?id=${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contingency_pct: newPct })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.project && onProjectUpdated) {
          onProjectUpdated(data.project);
        }
      }
    } catch (err) {
      console.error('Failed to update contingency pct:', err);
    }
  };

  // Open Drawer (Add or Edit)
  const handleOpenItemDrawer = (item = null) => {
    setEditingItem(item);
    setDrawerError(null);
    if (item) {
      setDrawerRoomId(item.room_id || '');
      setDrawerName(item.name || '');
      setDrawerCategory(item.category || 'materials');
      setDrawerSpec(item.spec || '');
      setDrawerVendor(item.vendor || '');
      setDrawerQty(String(item.qty || 1));
      setDrawerUnitCost(String(item.unit_cost || 0));
      setDrawerStatus(item.status || 'planned');
      setDrawerPaid(String(item.paid || 0));
      setDrawerDueDate(item.due_date ? String(item.due_date).substring(0, 10) : '');
      setDrawerNotes(item.notes || '');
      setDrawerLinkUrl(item.link_url || '');
      setDrawerInvoiceUrl(item.invoice_url || '');
      setDrawerTradeId(item.trade_id || '');
    } else {
      setDrawerRoomId(roomFilter !== 'all' && roomFilter !== 'unassigned' ? roomFilter : (rooms[0]?.id || ''));
      setDrawerName('');
      setDrawerCategory('materials');
      setDrawerSpec('');
      setDrawerVendor('');
      setDrawerTradeId('');
      setDrawerQty('1');
      setDrawerUnitCost('0');
      setDrawerStatus('planned');
      setDrawerPaid('0');
      setDrawerDueDate('');
      setDrawerNotes('');
      setDrawerLinkUrl('');
      setDrawerInvoiceUrl('');
    }
    setIsItemDrawerOpen(true);
  };

  // Safe Invoice Upload Handler (PDF or Image, 10MB limit, metadata stripped)
  const handleInvoiceFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingInvoice(true);
    setDrawerError(null);

    try {
      const processed = await processAndStripInvoiceFile(file);

      const res = await fetch('/api/designer/upload-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: processed.data,
          filename: processed.filename,
          contentType: processed.contentType,
          item_id: editingItem?.id || null,
          previous_url: drawerInvoiceUrl || null
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to upload invoice');
      }

      const uploadData = await res.json();
      setDrawerInvoiceUrl(uploadData.url);
    } catch (err) {
      console.error('Invoice upload failed:', err);
      setDrawerError(err.message || 'Invoice upload failed');
    } finally {
      setIsUploadingInvoice(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Safe Invoice Remove Handler (deletes Blob from storage)
  const handleRemoveInvoice = async () => {
    if (!drawerInvoiceUrl) return;
    const oldUrl = drawerInvoiceUrl;
    setDrawerInvoiceUrl('');

    if (oldUrl.includes('public.blob.vercel-storage.com')) {
      try {
        await fetch('/api/designer/upload-invoice', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: oldUrl,
            item_id: editingItem?.id || null
          })
        });
      } catch (delErr) {
        console.warn('Failed to delete invoice blob:', delErr);
      }
    }
  };

  // Save Item Drawer
  const handleSaveDrawerItem = async (e) => {
    e.preventDefault();
    if (!drawerName.trim()) {
      setDrawerError('Item name is required');
      return;
    }

    setIsSavingItem(true);
    setDrawerError(null);

    const payload = {
      project_id: project.id,
      room_id: drawerRoomId || null,
      name: drawerName.trim(),
      category: drawerCategory,
      spec: drawerSpec.trim() || null,
      vendor: drawerVendor.trim() || null,
      qty: Number(drawerQty) || 1,
      unit_cost: Number(drawerUnitCost.replace(/[$,]/g, '')) || 0,
      status: drawerStatus,
      paid: Number(drawerPaid.replace(/[$,]/g, '')) || 0,
      due_date: drawerDueDate || null,
      notes: drawerNotes.trim() || null,
      link_url: drawerLinkUrl.trim() || null,
      invoice_url: drawerInvoiceUrl || null,
      trade_id: drawerTradeId || null
    };

    try {
      let res;
      if (editingItem?.id) {
        res = await fetch(`/api/designer/items?id=${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/designer/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save item');
      }

      const resData = await res.json();
      if (editingItem?.id) {
        setItems(prev => prev.map(it => it.id === editingItem.id ? resData.item : it));
      } else {
        setItems(prev => [...prev, resData.item]);
      }
      setIsItemDrawerOpen(false);
    } catch (err) {
      console.error('Error saving item:', err);
      setDrawerError(err.message || 'Error saving item');
    } finally {
      setIsSavingItem(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async () => {
    if (!editingItem?.id) return;
    if (!window.confirm(`Are you sure you want to delete "${editingItem.name}"?`)) return;

    try {
      const res = await fetch(`/api/designer/items?id=${editingItem.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete item');
      setItems(prev => prev.filter(it => it.id !== editingItem.id));
      setIsItemDrawerOpen(false);
    } catch (err) {
      console.error('Error deleting item:', err);
      setDrawerError(err.message || 'Error deleting item');
    }
  };

  // Send to Underwrite Action
  const handleSendToUnderwrite = async () => {
    if (!project?.investor_property_id) return;
    setIsSendingUnderwrite(true);
    setSendError(null);
    setSendSuccessMsg('');

    try {
      const res = await fetch('/api/investor/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.investor_property_id,
          rehab_budget: totalWithContingency,
          rehab_budget_source: 'designer_hub',
          rehab_budget_updated_at: new Date().toISOString()
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update property rehab budget');
      }

      const updatedProp = await res.json();
      setSendSuccessMsg(`Rehab budget updated to ${formatCurrency(totalWithContingency)} in Investor Studio.`);
      
      // Update local project object
      if (onProjectUpdated) {
        onProjectUpdated({
          ...project,
          investor_property_rehab_budget: totalWithContingency,
          investor_property_rehab_budget_source: 'designer_hub',
          investor_property_rehab_budget_updated_at: updatedProp.rehab_budget_updated_at || new Date().toISOString()
        });
      }

      setTimeout(() => {
        setIsSendModalOpen(false);
        setSendSuccessMsg('');
      }, 1500);
    } catch (err) {
      console.error('Error sending to underwrite:', err);
      setSendError(err.message || 'Error sending rehab budget to Underwrite');
    } finally {
      setIsSendingUnderwrite(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Item',
      'Room',
      'Category',
      'Vendor',
      'Qty',
      'Unit Cost',
      'Total',
      'Status',
      'Paid',
      'Due Date',
      'Notes',
      'Invoice URL'
    ];

    const rows = filteredItems.map(it => {
      const roomName = rooms.find(r => r.id === it.room_id)?.name || 'General';
      const catLabel = CATEGORIES.find(c => c.id === it.category)?.label || it.category || 'Other';
      const q = Number(it.qty) || 1;
      const c = Number(it.unit_cost) || 0;
      const t = Number(it.total) || q * c;

      return [
        `"${(it.name || '').replace(/"/g, '""')}"`,
        `"${roomName.replace(/"/g, '""')}"`,
        `"${catLabel.replace(/"/g, '""')}"`,
        `"${(it.vendor || '').replace(/"/g, '""')}"`,
        q,
        c,
        t,
        `"${(it.status || 'planned').replace(/"/g, '""')}"`,
        Number(it.paid) || 0,
        `"${(it.due_date || '').replace(/"/g, '""')}"`,
        `"${(it.notes || '').replace(/"/g, '""')}"`,
        `"${(it.invoice_url || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const cleanProjName = (project.name || 'Project').replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('download', `${cleanProjName}_Budget_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger Print
  const handlePrintBudget = () => {
    window.print();
  };

  return (
    <div className="budget-costs-container" style={{ padding: '0 0 60px 0' }}>
      {/* Inline Print Stylesheet */}
      <style>{`
        @media print {
          nav, header, aside, .designer-hub-header, .no-print {
            display: none !important;
          }
          body, #root, main, .budget-costs-container {
            background: #FFFFFF !important;
            color: #1E1509 !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .print-header {
            display: block !important;
            margin-bottom: 24px !important;
            padding-bottom: 16px !important;
            border-bottom: 2px solid #1E1509 !important;
          }
          .print-table {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
            margin-top: 16px !important;
          }
          .print-table th, .print-table td {
            border-bottom: 1px solid #E0D9D1 !important;
            padding: 8px 6px !important;
            font-size: 11px !important;
            text-align: left !important;
          }
          .two-column-layout {
            display: block !important;
          }
          .left-column-print {
            display: block !important;
            margin-bottom: 24px !important;
          }
          .right-column-table {
            display: block !important;
          }
        }
        @media screen and (max-width: 900px) {
          .two-column-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Print-Only Header */}
      <div className="print-header" style={{ display: 'none' }}>
        <h1 style={{ fontFamily: 'var(--font-display, serif)', fontSize: '28px', margin: '0 0 6px 0', color: 'var(--espresso)' }}>
          {project?.name}
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', margin: '0 0 12px 0', color: 'var(--text-2)' }}>
          Budget & Costs Report · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <div style={{ display: 'flex', gap: '24px', fontSize: '12px', borderTop: '1px solid #ddd', paddingTop: '10px' }}>
          <div>Target Budget: <strong>{formatCurrency(targetBudget)}</strong></div>
          <div>Estimated Total: <strong>{formatCurrency(estimatedTotal)}</strong></div>
          <div>Contingency ({contingencyPct}%): <strong>{formatCurrency(contingencyAmount)}</strong></div>
          <div>Total with Contingency: <strong>{formatCurrency(totalWithContingency)}</strong></div>
          <div>Paid to Date: <strong>{formatCurrency(paidTotal)}</strong></div>
        </div>
      </div>

      {/* Error Banner if API error occurs */}
      {error && (
        <div style={{
          padding: '16px 20px',
          backgroundColor: 'var(--negative-bg, #F5E6E3)',
          border: '1px solid var(--negative, #8A2A1E)',
          borderRadius: 'var(--radius-sm, 8px)',
          color: 'var(--negative, #8A2A1E)',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          marginBottom: '24px'
        }}>
          {error}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SUMMARY STRIP (White card, 4 big serif numbers + progress bar)         */}
      {/* ========================================================================= */}
      <Card style={{ padding: '28px 32px', marginBottom: '32px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '24px',
          alignItems: 'flex-start',
          marginBottom: '28px'
        }}>
          {/* STAT 1: TARGET BUDGET */}
          <div>
            <Eyebrow style={{ marginBottom: '6px' }}>Target Budget</Eyebrow>
            {editingTargetBudget ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontFamily: 'var(--font-display, serif)', fontSize: '24px', color: 'var(--espresso)' }}>$</span>
                <input
                  type="text"
                  autoFocus
                  value={targetBudgetValue}
                  onChange={(e) => setTargetBudgetValue(e.target.value)}
                  onBlur={handleSaveTargetBudget}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTargetBudget(); if (e.key === 'Escape') setEditingTargetBudget(false); }}
                  style={{
                    fontFamily: 'var(--font-display, serif)',
                    fontSize: '28px',
                    fontWeight: 600,
                    width: '140px',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    padding: '2px 8px',
                    color: 'var(--espresso)',
                    background: 'var(--white)'
                  }}
                />
              </div>
            ) : (
              <div
                onClick={() => {
                  setTargetBudgetValue(targetBudget > 0 ? String(targetBudget) : '');
                  setEditingTargetBudget(true);
                }}
                style={{
                  fontFamily: 'var(--font-display, serif)',
                  fontSize: '34px',
                  fontWeight: 600,
                  color: 'var(--espresso)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '8px'
                }}
                title="Click to edit target budget"
              >
                <span>{targetBudget > 0 ? formatCurrency(targetBudget) : '$0'}</span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-sans)', color: 'var(--muted)', fontWeight: 400 }}>✎</span>
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Base allocation
            </div>
          </div>

          {/* STAT 2: ESTIMATED + CONTINGENCY = TOTAL */}
          <div>
            <Eyebrow style={{ marginBottom: '6px' }}>Total with Contingency</Eyebrow>
            <div style={{
              fontFamily: 'var(--font-display, serif)',
              fontSize: '34px',
              fontWeight: 600,
              color: isOverTarget ? 'var(--negative, #8A2A1E)' : 'var(--espresso)'
            }}>
              {formatCurrency(totalWithContingency)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>Est. {formatCurrency(estimatedTotal)} +</span>
              {editingContingency ? (
                <input
                  type="text"
                  autoFocus
                  value={contingencyValue}
                  onChange={(e) => setContingencyValue(e.target.value)}
                  onBlur={handleSaveContingency}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveContingency(); if (e.key === 'Escape') setEditingContingency(false); }}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    width: '38px',
                    padding: '1px 3px',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}
                />
              ) : (
                <span
                  onClick={() => {
                    setContingencyValue(String(contingencyPct));
                    setEditingContingency(true);
                  }}
                  style={{
                    cursor: 'pointer',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    color: 'var(--burgundy)'
                  }}
                  title="Click to edit contingency %"
                >
                  {contingencyPct}%
                </span>
              )}
              <span>contingency</span>
            </div>
          </div>

          {/* STAT 3: COMMITTED */}
          <div>
            <Eyebrow style={{ marginBottom: '6px' }}>Committed</Eyebrow>
            <div style={{
              fontFamily: 'var(--font-display, serif)',
              fontSize: '34px',
              fontWeight: 600,
              color: 'var(--burgundy)'
            }}>
              {formatCurrency(committedTotal)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Ordered, delivered, or installed
            </div>
          </div>

          {/* STAT 4: PAID */}
          <div>
            <Eyebrow style={{ marginBottom: '6px' }}>Paid</Eyebrow>
            <div style={{
              fontFamily: 'var(--font-display, serif)',
              fontSize: '34px',
              fontWeight: 600,
              color: 'var(--espresso)'
            }}>
              {formatCurrency(paidTotal)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Disbursed to vendors
            </div>
          </div>
        </div>

        {/* STACKED PROGRESS BAR */}
        <div style={{ marginTop: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--text-2)' }}>
              Budget Execution ({Math.round(paidPct)}% paid of {targetBudget > 0 ? 'target' : 'estimated'})
            </span>
            {isOverTarget && (
              <span style={{
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                color: 'var(--negative, #8A2A1E)',
                backgroundColor: 'var(--negative-bg, #F5E6E3)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)'
              }}>
                Over target by {formatCurrency(overTargetAmount)}
              </span>
            )}
          </div>

          {/* Bar track */}
          <div style={{
            height: '14px',
            backgroundColor: 'var(--sand, #F7F3EE)',
            borderRadius: '999px',
            overflow: 'hidden',
            display: 'flex',
            width: '100%',
            border: '1px solid var(--border)'
          }}>
            {/* Paid segment (Espresso) */}
            <div
              style={{
                width: `${paidPct}%`,
                backgroundColor: 'var(--espresso, #1E1509)',
                transition: 'width 0.3s ease'
              }}
              title={`Paid: ${formatCurrency(paidTotal)}`}
            />
            {/* Committed not yet paid segment (Burgundy) */}
            <div
              style={{
                width: `${committedNotPaidPct}%`,
                backgroundColor: 'var(--burgundy, #41101B)',
                transition: 'width 0.3s ease'
              }}
              title={`Committed not paid: ${formatCurrency(committedNotPaid)}`}
            />
            {/* Estimated not yet committed segment (Beige) */}
            <div
              style={{
                width: `${estimatedNotCommittedPct}%`,
                backgroundColor: '#D8CFBC',
                transition: 'width 0.3s ease'
              }}
              title={`Estimated uncommitted: ${formatCurrency(estimatedNotCommitted)}`}
            />
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '20px',
            marginTop: '12px',
            fontSize: '11.5px',
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--espresso, #1E1509)' }} />
              <span>Paid: <strong>{formatCurrency(paidTotal)}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--burgundy, #41101B)' }} />
              <span>Committed not yet paid: <strong>{formatCurrency(committedNotPaid)}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#D8CFBC' }} />
              <span>Estimated uncommitted: <strong>{formatCurrency(estimatedNotCommitted)}</strong></span>
            </div>
          </div>
        </div>

        {/* SEND TO UNDERWRITE STRIP (Only when linked to an investor property) */}
        {project?.investor_property_id && (
          <div style={{
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button
                variant="primary"
                onClick={() => setIsSendModalOpen(true)}
              >
                Send to Underwrite →
              </Button>
              <div style={{ fontSize: '12px', fontFamily: 'var(--font-sans)', color: 'var(--text-2)' }}>
                {project.investor_property_rehab_budget != null ? (
                  <>
                    <span>Last sent to Underwrite: <strong>{formatCurrency(project.investor_property_rehab_budget)}</strong> on {formatDate(project.investor_property_rehab_budget_updated_at)}</span>
                    {Math.round(totalWithContingency) !== Math.round(Number(project.investor_property_rehab_budget)) && (
                      <span style={{ color: 'var(--warning)', fontWeight: 500, marginLeft: '8px' }}>
                        (Budget changed since sent: {formatCurrency(totalWithContingency)} vs {formatCurrency(project.investor_property_rehab_budget)})
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>
                    Linked to {project.investor_property_address || 'Investor Studio property'}. Not yet sent to Underwrite.
                  </span>
                )}
              </div>
            </div>

            {setActiveDashboardTab && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'investor');
                    url.searchParams.set('property', project.investor_property_id);
                    window.history.pushState({}, '', url.toString());
                  }
                  setActiveDashboardTab('investor');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--burgundy)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                Open in Investor Studio →
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* 2. TWO COLUMNS LAYOUT: LEFT NARROW + RIGHT WIDE TABLE                    */}
      {/* ========================================================================= */}
      <div className="two-column-layout" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 300px) 1fr',
        gap: '28px',
        alignItems: 'start'
      }}>
        {/* ======================================================================= */}
        {/* LEFT COLUMN: BY ROOM + BY CATEGORY + LABOR VS MATERIALS               */}
        {/* ======================================================================= */}
        <div className="left-column-print" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* CARD: BY ROOM */}
          <Card style={{ padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <Eyebrow>By Room</Eyebrow>
              {roomFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setRoomFilter('all')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '11px',
                    color: 'var(--burgundy)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Clear filter
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {roomTotals.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '6px 0' }}>
                  No rooms created yet.
                </div>
              ) : (
                roomTotals.map(r => {
                const isSelected = roomFilter === r.id;
                const barWidth = Math.max(4, Math.round((r.total / maxRoomTotal) * 100));
                return (
                  <div
                    key={r.id}
                    onClick={() => setRoomFilter(isSelected ? 'all' : r.id)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? 'var(--sand, #F7F3EE)' : 'transparent',
                      border: isSelected ? '1px solid var(--border-strong)' : '1px solid transparent',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Click to filter table by ${r.name}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontFamily: 'var(--font-sans)',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? 'var(--burgundy)' : 'var(--espresso)'
                      }}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: '13px', fontFamily: 'var(--font-display, serif)', fontWeight: 600, color: 'var(--espresso)' }}>
                        {formatCurrency(r.total)}
                      </span>
                    </div>

                    {/* Thin bar */}
                    <div style={{ height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        backgroundColor: isSelected ? 'var(--burgundy)' : 'var(--espresso)',
                        borderRadius: '2px'
                      }} />
                    </div>
                  </div>
                );
              }))}
            </div>
          </Card>

          {/* CARD: BY CATEGORY */}
          <Card style={{ padding: '22px' }}>
            <Eyebrow style={{ marginBottom: '14px' }}>By Category</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categoryTotals.map(c => {
                const pct = estimatedTotal > 0 ? Math.round((c.total / estimatedTotal) * 100) : 0;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--espresso)',
                      padding: '3px 0',
                      borderBottom: '1px solid rgba(30, 21, 9, 0.05)'
                    }}
                  >
                    <span style={{ color: 'var(--text-2)' }}>{c.label}</span>
                    <span style={{ fontWeight: 500 }}>
                      {formatCurrency(c.total)} <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: '4px' }}>({pct}%)</span>
                    </span>
                  </div>
                );
              })}

              {/* Contingency Line */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                color: 'var(--burgundy)',
                paddingTop: '8px',
                marginTop: '4px',
                borderTop: '1px dashed var(--border-strong)'
              }}>
                <span>Contingency ({contingencyPct}%)</span>
                <span>{formatCurrency(contingencyAmount)}</span>
              </div>
            </div>

            {/* LABOR VS MATERIALS SPLIT */}
            <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '6px'
              }}>
                <span style={{ color: 'var(--burgundy)' }}>Labor ({laborPctOfCombined}%)</span>
                <span style={{ color: 'var(--espresso)' }}>Materials ({materialsPctOfCombined}%)</span>
              </div>

              {/* Two-segment split bar */}
              <div style={{
                height: '8px',
                backgroundColor: 'var(--sand)',
                borderRadius: '999px',
                overflow: 'hidden',
                display: 'flex',
                width: '100%',
                border: '1px solid var(--border)'
              }}>
                <div
                  style={{
                    width: `${laborPctOfCombined}%`,
                    backgroundColor: 'var(--burgundy)',
                    transition: 'width 0.3s ease'
                  }}
                  title={`Labor: ${formatCurrency(laborAmount)}`}
                />
                <div
                  style={{
                    width: `${materialsPctOfCombined}%`,
                    backgroundColor: 'var(--espresso)',
                    transition: 'width 0.3s ease'
                  }}
                  title={`Materials: ${formatCurrency(materialsAmount)}`}
                />
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '6px',
                fontSize: '11px',
                color: 'var(--muted)'
              }}>
                <span>{formatCurrency(laborAmount)}</span>
                <span>{formatCurrency(materialsAmount)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ======================================================================= */}
        {/* RIGHT COLUMN: LINE ITEMS TABLE WITH FILTERS, SEARCH, CSV & PRINT        */}
        {/* ======================================================================= */}
        <div className="right-column-table" style={{ minWidth: 0 }}>
          <Card style={{ padding: '24px' }}>
            {/* Header controls strip (no-print) */}
            <div className="no-print" style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              marginBottom: '20px'
            }}>
              {/* Search & Select Filters */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
                {/* Search input */}
                <input
                  type="text"
                  placeholder="Search items, vendor, room..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--white)',
                    color: 'var(--espresso)',
                    width: '210px',
                    outline: 'none'
                  }}
                />

                {/* Room Filter Select */}
                <select
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--white)',
                    color: 'var(--espresso)',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Rooms</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                  {items.some(i => !i.room_id) && (
                    <option value="unassigned">General / Unassigned</option>
                  )}
                </select>

                {/* Category Filter Select */}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--white)',
                    color: 'var(--espresso)',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>

                {/* Status Filter Select */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--white)',
                    color: 'var(--espresso)',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Statuses</option>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Action Buttons: Export CSV, Print, Add Item */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportCSV}
                  title="Export filtered items as CSV"
                >
                  Export CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePrintBudget}
                  title="Print clean budget report"
                >
                  Print budget
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenItemDrawer(null)}
                >
                  + ADD ITEM →
                </Button>
              </div>
            </div>

            {/* Saved Toast indicator */}
            {savedCell && (
              <div style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                backgroundColor: 'var(--espresso)',
                color: 'var(--cream)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                boxShadow: 'var(--shadow-floating)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ color: '#88D49E' }}>✓</span> Saved
              </div>
            )}

            {/* Empty state when zero items */}
            {items.length === 0 ? (
              <EmptyState
                title="No costs yet"
                description="No costs yet — add selections in Design studio or add a line item here."
                action={
                  <Button variant="primary" onClick={() => handleOpenItemDrawer(null)}>
                    + ADD LINE ITEM →
                  </Button>
                }
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                title="No matching items"
                description="Try clearing your filters or changing your search term."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRoomFilter('all');
                      setCategoryFilter('all');
                      setStatusFilter('all');
                      setSearchQuery('');
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            ) : (
              /* LINE ITEMS TABLE (Horizontal scroll on phone) */
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left' }}>
                      <th
                        onClick={() => { setSortField('name'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', whiteSpace: 'nowrap' }}
                      >
                        Item {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('room'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', whiteSpace: 'nowrap' }}
                      >
                        Room {sortField === 'room' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('category'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', whiteSpace: 'nowrap' }}
                      >
                        Category {sortField === 'category' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('vendor'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', whiteSpace: 'nowrap' }}
                      >
                        Vendor {sortField === 'vendor' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('qty'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', textAlign: 'right', whiteSpace: 'nowrap' }}
                      >
                        Qty {sortField === 'qty' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('unit_cost'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', textAlign: 'right', whiteSpace: 'nowrap' }}
                      >
                        Unit Cost {sortField === 'unit_cost' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('total'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', textAlign: 'right', whiteSpace: 'nowrap' }}
                      >
                        Total {sortField === 'total' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('status'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', textAlign: 'center', whiteSpace: 'nowrap' }}
                      >
                        Status {sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('paid'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', textAlign: 'right', whiteSpace: 'nowrap' }}
                      >
                        Paid {sortField === 'paid' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th
                        onClick={() => { setSortField('due_date'); setSortDirection(p => p === 'asc' ? 'desc' : 'asc'); }}
                        style={{ padding: '10px 8px', cursor: 'pointer', fontWeight: 600, color: 'var(--espresso)', whiteSpace: 'nowrap' }}
                      >
                        Due Date {sortField === 'due_date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th className="no-print" style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--espresso)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        Invoice
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(it => {
                      const roomName = rooms.find(r => r.id === it.room_id)?.name || 'General';
                      const q = Number(it.qty) || 1;
                      const c = Number(it.unit_cost) || 0;
                      const t = Number(it.total) || q * c;
                      const p = Number(it.paid) || 0;
                      const statusObj = STATUS_OPTIONS.find(s => s.id === (it.status || 'planned').toLowerCase()) || STATUS_OPTIONS[0];

                      return (
                        <tr
                          key={it.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            transition: 'background-color 0.15s ease'
                          }}
                        >
                          {/* Item Name (click opens drawer) */}
                          <td style={{ padding: '10px 8px', maxWidth: '200px' }}>
                            <div
                              onClick={() => handleOpenItemDrawer(it)}
                              style={{
                                cursor: 'pointer',
                                fontWeight: 600,
                                color: 'var(--espresso)',
                                textDecoration: 'none'
                              }}
                              className="item-name-hover"
                              title="Click to view/edit item details"
                            >
                              {it.name}
                            </div>
                            {it.spec && (
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {it.spec}
                              </div>
                            )}
                          </td>

                          {/* Room */}
                          <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--sand)',
                              color: 'var(--espresso)',
                              fontWeight: 500
                            }}>
                              {roomName}
                            </span>
                          </td>

                          {/* Category */}
                          <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', textTransform: 'capitalize', color: 'var(--text-2)' }}>
                            {CATEGORIES.find(c => c.id === it.category)?.label || it.category || 'Other'}
                          </td>

                          {/* Vendor */}
                          <td style={{ padding: '10px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                            {it.vendor || '—'}
                          </td>

                          {/* Qty (Inline editable) */}
                          <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <input
                              type="number"
                              min="1"
                              defaultValue={q}
                              onBlur={(e) => handleUpdateItemCell(it, 'qty', e.target.value)}
                              style={{
                                width: '48px',
                                textAlign: 'right',
                                padding: '3px 4px',
                                border: '1px solid transparent',
                                borderRadius: '4px',
                                background: 'transparent',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                color: 'inherit'
                              }}
                              onFocus={(e) => { e.target.style.background = 'var(--white)'; e.target.style.borderColor = 'var(--border-strong)'; }}
                              onBlurCapture={(e) => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'transparent'; }}
                            />
                          </td>

                          {/* Unit Cost (Inline editable) */}
                          <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <input
                              type="text"
                              defaultValue={formatCurrency(c)}
                              onBlur={(e) => handleUpdateItemCell(it, 'unit_cost', e.target.value)}
                              style={{
                                width: '75px',
                                textAlign: 'right',
                                padding: '3px 4px',
                                border: '1px solid transparent',
                                borderRadius: '4px',
                                background: 'transparent',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                color: 'inherit'
                              }}
                              onFocus={(e) => {
                                e.target.value = String(c);
                                e.target.style.background = 'var(--white)';
                                e.target.style.borderColor = 'var(--border-strong)';
                              }}
                              onBlurCapture={(e) => {
                                e.target.value = formatCurrency(Number(e.target.value.replace(/[$,]/g, '')) || 0);
                                e.target.style.background = 'transparent';
                                e.target.style.borderColor = 'transparent';
                              }}
                            />
                          </td>

                          {/* Total Cost */}
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--espresso)', whiteSpace: 'nowrap' }}>
                            {formatCurrency(t)}
                          </td>

                          {/* Status (Inline editable select) */}
                          <td style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <select
                              value={(it.status || 'planned').toLowerCase()}
                              onChange={(e) => handleUpdateItemCell(it, 'status', e.target.value)}
                              style={{
                                fontSize: '11px',
                                padding: '3px 6px',
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                backgroundColor: statusObj.variant === 'positive' ? 'var(--positive-bg)' :
                                  statusObj.variant === 'warning' ? 'var(--warning-bg)' :
                                  statusObj.variant === 'info' ? 'var(--info-bg)' :
                                  statusObj.variant === 'negative' ? 'var(--negative-bg)' : 'var(--beige)',
                                color: statusObj.variant === 'positive' ? 'var(--positive)' :
                                  statusObj.variant === 'warning' ? 'var(--warning)' :
                                  statusObj.variant === 'info' ? 'var(--info)' :
                                  statusObj.variant === 'negative' ? 'var(--negative)' : 'var(--espresso)',
                                fontWeight: 600
                              }}
                            >
                              {STATUS_OPTIONS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                              ))}
                            </select>
                          </td>

                          {/* Paid (Inline editable) */}
                          <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <input
                              type="text"
                              defaultValue={formatCurrency(p)}
                              onBlur={(e) => handleUpdateItemCell(it, 'paid', e.target.value)}
                              style={{
                                width: '75px',
                                textAlign: 'right',
                                padding: '3px 4px',
                                border: '1px solid transparent',
                                borderRadius: '4px',
                                background: 'transparent',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                color: p > 0 ? 'var(--positive)' : 'inherit',
                                fontWeight: p > 0 ? 600 : 400
                              }}
                              onFocus={(e) => {
                                e.target.value = String(p);
                                e.target.style.background = 'var(--white)';
                                e.target.style.borderColor = 'var(--border-strong)';
                              }}
                              onBlurCapture={(e) => {
                                e.target.value = formatCurrency(Number(e.target.value.replace(/[$,]/g, '')) || 0);
                                e.target.style.background = 'transparent';
                                e.target.style.borderColor = 'transparent';
                              }}
                            />
                          </td>

                          {/* Due Date (Inline editable) */}
                          <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                            <input
                              type="date"
                              defaultValue={it.due_date ? String(it.due_date).substring(0, 10) : ''}
                              onChange={(e) => handleUpdateItemCell(it, 'due_date', e.target.value)}
                              style={{
                                border: '1px solid transparent',
                                borderRadius: '4px',
                                background: 'transparent',
                                fontFamily: 'inherit',
                                fontSize: '11px',
                                color: 'var(--text-2)',
                                cursor: 'pointer'
                              }}
                              onFocus={(e) => { e.target.style.background = 'var(--white)'; e.target.style.borderColor = 'var(--border-strong)'; }}
                              onBlur={(e) => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'transparent'; }}
                            />
                          </td>

                          {/* Invoice Badge / Action */}
                          <td className="no-print" style={{ padding: '10px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {it.invoice_url ? (
                              <a
                                href={it.invoice_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '11px',
                                  padding: '3px 8px',
                                  borderRadius: 'var(--radius-pill)',
                                  backgroundColor: 'var(--beige)',
                                  color: 'var(--burgundy)',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                                title="View attached invoice"
                              >
                                View ↗
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenItemDrawer(it)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  fontSize: '11px',
                                  color: 'var(--muted)',
                                  cursor: 'pointer',
                                  padding: '2px 6px',
                                  textDecoration: 'underline'
                                }}
                                title="Attach invoice"
                              >
                                + Add
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Totals Bottom Row */}
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--espresso)', fontWeight: 600, color: 'var(--espresso)', backgroundColor: 'var(--sand)' }}>
                      <td colSpan={4} style={{ padding: '12px 8px' }}>
                        Totals ({filteredItems.length} items)
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        {filteredItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0)}
                      </td>
                      <td style={{ padding: '12px 8px' }}></td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px', fontFamily: 'var(--font-display, serif)' }}>
                        {formatCurrency(filteredItems.reduce((acc, it) => acc + (Number(it.total) || ((Number(it.qty) || 1) * (Number(it.unit_cost) || 0))), 0))}
                      </td>
                      <td style={{ padding: '12px 8px' }}></td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '14px', fontFamily: 'var(--font-display, serif)', color: 'var(--positive)' }}>
                        {formatCurrency(filteredItems.reduce((acc, it) => acc + (Number(it.paid) || 0), 0))}
                      </td>
                      <td colSpan={2} style={{ padding: '12px 8px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SIDE PANEL: FULL ITEM DRAWER (ADD / EDIT)                              */}
      {/* ========================================================================= */}
      <SidePanel
        isOpen={isItemDrawerOpen}
        onClose={() => setIsItemDrawerOpen(false)}
        title={editingItem ? 'Edit Line Item' : 'New Line Item'}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            {editingItem ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeleteItem}
                style={{ color: 'var(--negative)', borderColor: 'var(--negative-bg)' }}
              >
                Delete Item
              </Button>
            ) : <div />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => setIsItemDrawerOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveDrawerItem} disabled={isSavingItem}>
                {isSavingItem ? 'Saving...' : (editingItem ? 'Save Item →' : 'Add Item →')}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveDrawerItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {drawerError && (
            <div style={{
              backgroundColor: 'var(--negative-bg)',
              color: 'var(--negative)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12px'
            }}>
              {drawerError}
            </div>
          )}

          {/* Item Name */}
          <Field
            label="Item Name *"
            value={drawerName}
            onChange={(e) => setDrawerName(e.target.value)}
            placeholder="e.g. White Oak Flooring, Pendant Light"
            required
          />

          {/* Room Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Room
            </label>
            <select
              value={drawerRoomId}
              onChange={(e) => setDrawerRoomId(e.target.value)}
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
              <option value="">General / Unassigned</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

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
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Specification / Dimensions */}
          <Field
            label="Specification / Model / Dimensions"
            value={drawerSpec}
            onChange={(e) => setDrawerSpec(e.target.value)}
            placeholder="e.g. 7-inch wide planks, Brushed Brass, 60W LED"
          />

          {/* Trade / Vendor (select from Trades or free text) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)' }}>
                Trade / Vendor
              </label>
              {trades.length > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  from Sourcing Library
                </span>
              )}
            </div>

            {trades.length > 0 && (
              <select
                value={drawerTradeId}
                onChange={(e) => {
                  const selId = e.target.value;
                  setDrawerTradeId(selId);
                  const matched = trades.find(t => t.id === selId);
                  if (matched) {
                    setDrawerVendor(matched.company);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--sand)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  marginBottom: '8px',
                  color: 'var(--espresso)',
                  outline: 'none'
                }}
              >
                <option value="">Select a trade / vendor...</option>
                {trades.map(t => (
                  <option key={t.id} value={t.id}>{t.company} ({t.role || 'Vendor'})</option>
                ))}
              </select>
            )}

            <Field
              label="Vendor / Supplier Name"
              value={drawerVendor}
              onChange={(e) => {
                setDrawerVendor(e.target.value);
                if (drawerTradeId && !trades.some(t => t.id === drawerTradeId && t.company === e.target.value)) {
                  setDrawerTradeId('');
                }
              }}
              placeholder="e.g. Ferguson, Floor & Decor, CB2"
            />
          </div>

          {/* Qty & Unit Cost row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Field
              label="Quantity"
              type="number"
              min="1"
              value={drawerQty}
              onChange={(e) => setDrawerQty(e.target.value)}
            />
            <Field
              label="Unit Cost ($)"
              value={drawerUnitCost}
              onChange={(e) => setDrawerUnitCost(e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Calculated Total Readout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            backgroundColor: 'var(--sand)',
            borderRadius: 'var(--radius-input)',
            fontSize: '13px'
          }}>
            <span style={{ fontWeight: 500, color: 'var(--text-2)' }}>Calculated Total:</span>
            <span style={{ fontFamily: 'var(--font-display, serif)', fontSize: '18px', fontWeight: 600, color: 'var(--espresso)' }}>
              {formatCurrency((Number(drawerQty) || 1) * (Number(drawerUnitCost.replace(/[$,]/g, '')) || 0))}
            </span>
          </div>

          {/* Status */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Status
            </label>
            <select
              value={drawerStatus}
              onChange={(e) => setDrawerStatus(e.target.value)}
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
              {STATUS_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Paid & Due Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Field
              label="Paid Amount ($)"
              value={drawerPaid}
              onChange={(e) => setDrawerPaid(e.target.value)}
              placeholder="0"
            />
            <Field
              label="Due Date"
              type="date"
              value={drawerDueDate}
              onChange={(e) => setDrawerDueDate(e.target.value)}
            />
          </div>

          {/* Product link URL */}
          <Field
            label="Product Link URL"
            value={drawerLinkUrl}
            onChange={(e) => setDrawerLinkUrl(e.target.value)}
            placeholder="https://..."
          />

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Notes
            </label>
            <textarea
              rows={3}
              value={drawerNotes}
              onChange={(e) => setDrawerNotes(e.target.value)}
              placeholder="Lead times, contractor instructions, payment terms..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* INVOICE UPLOAD (PDF or Image via safe Blob pipeline) */}
          <div style={{
            padding: '14px',
            borderRadius: 'var(--radius-input)',
            border: '1px dashed var(--border-strong)',
            backgroundColor: 'var(--sand)'
          }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Invoice / Receipt (PDF or Image)
            </label>

            {drawerInvoiceUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '6px' }}>
                <a
                  href={drawerInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--burgundy)',
                    fontWeight: 600,
                    fontSize: '12px',
                    textDecoration: 'underline',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Attached Invoice ↗
                </a>
                <button
                  type="button"
                  onClick={handleRemoveInvoice}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--negative)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={handleInvoiceFileChange}
                  style={{ display: 'none' }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingInvoice}
                >
                  {isUploadingInvoice ? 'Uploading invoice...' : '+ Upload Invoice (PDF / Image) →'}
                </Button>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                  Max 10 MB. PDFs or images (metadata stripped). Stored securely with randomized paths.
                </div>
              </div>
            )}
          </div>
        </form>
      </SidePanel>

      {/* ========================================================================= */}
      {/* 4. SEND TO UNDERWRITE CONFIRMATION MODAL                                   */}
      {/* ========================================================================= */}
      {isSendModalOpen && (
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
          padding: '16px'
        }}>
          <Card style={{ maxWidth: '480px', width: '100%', padding: '28px' }}>
            <h3 style={{ fontFamily: 'var(--font-display, serif)', fontSize: '22px', margin: '0 0 12px 0', color: 'var(--espresso)' }}>
              Send Rehab Budget to Investor Studio
            </h3>

            {sendError && (
              <div style={{
                backgroundColor: 'var(--negative-bg)',
                color: 'var(--negative)',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                marginBottom: '12px'
              }}>
                {sendError}
              </div>
            )}

            {sendSuccessMsg ? (
              <div style={{
                backgroundColor: 'var(--positive-bg)',
                color: 'var(--positive)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                textAlign: 'center'
              }}>
                ✓ {sendSuccessMsg}
              </div>
            ) : (
              <>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-2)', margin: '0 0 20px 0' }}>
                  Set the rehab budget for <strong>{project.investor_property_address || 'linked property'}</strong> to <strong>{formatCurrency(totalWithContingency)}</strong> (estimated {formatCurrency(estimatedTotal)} + {contingencyPct}% contingency)?
                </p>
                <div style={{
                  fontSize: '12px',
                  backgroundColor: 'var(--sand)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  color: 'var(--espresso)'
                }}>
                  Current rehab budget: <strong>{project.investor_property_rehab_budget ? formatCurrency(project.investor_property_rehab_budget) : '$0'}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                  <Button variant="secondary" onClick={() => setIsSendModalOpen(false)} disabled={isSendingUnderwrite}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSendToUnderwrite} disabled={isSendingUnderwrite}>
                    {isSendingUnderwrite ? 'Updating...' : 'Set Rehab Budget →'}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
