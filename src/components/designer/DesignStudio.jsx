import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  Card,
  Eyebrow,
  SegmentedControl,
  EmptyState,
  SidePanel,
  Field
} from '../ui';
import PinterestPinEmbed from './PinterestPinEmbed.jsx';
import { parsePinterestPinUrl, buildPinterestWidgets } from '../../utils/pinterest.js';

const ROOM_TYPES = [
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'living', label: 'Living Room' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'dining', label: 'Dining Room' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'outdoor', label: 'Outdoor / Patio' },
  { value: 'office', label: 'Office / Study' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'other', label: 'Other' }
];

const STUDIO_VIEW_OPTIONS = [
  { id: 'mood', label: 'Mood board' },
  { id: 'before_after', label: 'Before / after' },
  { id: 'plan', label: 'Floor plan' },
  { id: 'render', label: 'Renders' }
];

/**
 * Resizes an image file to max 2000px on the longest side using an HTML5 canvas.
 * Canvas re-encoding naturally strips all EXIF GPS and camera metadata.
 */
async function processAndStripImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        resolve({
          data: reader.result,
          filename: file.name,
          contentType: file.type || 'image/jpeg'
        });
      };
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

function formatCurrencyK(val) {
  const num = Number(val) || 0;
  if (num === 0) return '$0';
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1)}M`;
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(num);
}

export default function DesignStudio({ project, onProjectUpdated }) {
  const projectId = project?.id;

  // Rooms state
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomsError, setRoomsError] = useState(null);

  // Active view inside room board
  const [studioView, setStudioView] = useState('mood');

  // Room images state
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Room dropdown menu state
  const [activeRoomMenuId, setActiveRoomMenuId] = useState(null);
  const roomMenuRef = useRef(null);

  // Add room modal
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('kitchen');
  const [newRoomStyle, setNewRoomStyle] = useState('');
  const [addRoomSaving, setAddRoomSaving] = useState(false);

  // Rename room modal
  const [editingRoom, setEditingRoom] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [renameType, setRenameType] = useState('');
  const [renameStyle, setRenameStyle] = useState('');

  // Inline editing on board card
  const [inlineEditingName, setInlineEditingName] = useState(false);
  const [inlineNameVal, setInlineNameVal] = useState('');
  const [inlineEditingStyle, setInlineEditingStyle] = useState(false);
  const [inlineStyleVal, setInlineStyleVal] = useState('');

  // Tile image menu & caption editing
  const [activeImageMenuId, setActiveImageMenuId] = useState(null);
  const [editingCaptionId, setEditingCaptionId] = useState(null);
  const [captionInputVal, setCaptionInputVal] = useState('');

  // Drag and drop reordering state
  const [draggedImgId, setDraggedImgId] = useState(null);

  // Comparison slider for Before / After
  const [sliderPos, setSliderPos] = useState(50);
  const [beforeAfterMode, setBeforeAfterMode] = useState('slider'); // 'slider' | 'side_by_side'

  // Lightbox / Modal viewer for full images
  const [lightboxImage, setLightboxImage] = useState(null);

  // Trades & Room Item Drawer State (Stage 4)
  const [trades, setTrades] = useState([]);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('materials');
  const [itemTradeId, setItemTradeId] = useState('');
  const [itemVendor, setItemVendor] = useState('');
  const [itemSpec, setItemSpec] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemUnitCost, setItemUnitCost] = useState('0');
  const [itemStatus, setItemStatus] = useState('selected');
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [itemDrawerError, setItemDrawerError] = useState(null);
  const [itemSuccessToast, setItemSuccessToast] = useState(null);

  // Room pins from Pinterest
  const [roomPins, setRoomPins] = useState([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [isAddPinOpen, setIsAddPinOpen] = useState(false);
  const [pinUrlInput, setPinUrlInput] = useState('');
  const [pinNoteInput, setPinNoteInput] = useState('');
  const [pinFormError, setPinFormError] = useState(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  // File input refs
  const moodFileInputRef = useRef(null);
  const beforeFileInputRef = useRef(null);
  const afterFileInputRef = useRef(null);
  const planFileInputRef = useRef(null);
  const renderFileInputRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (roomMenuRef.current && !roomMenuRef.current.contains(e.target)) {
        setActiveRoomMenuId(null);
      }
      if (!e.target.closest('[data-image-menu]')) {
        setActiveImageMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch rooms for current project
  const fetchRooms = async () => {
    if (!projectId) return;
    setLoadingRooms(true);
    setRoomsError(null);
    try {
      const res = await fetch(`/api/designer/rooms?project_id=${projectId}`);
      if (!res.ok) {
        throw new Error(`Failed to load rooms (HTTP ${res.status})`);
      }
      const data = await res.json();
      const list = data.rooms || [];
      setRooms(list);

      // Auto-select room
      setSelectedRoomId(prev => {
        if (prev && list.some(r => r.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (err) {
      console.error('fetchRooms error:', err);
      setRoomsError(err.message || 'Failed to load rooms');
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [projectId]);

  // Load trades for item trade/vendor selector
  useEffect(() => {
    fetch('/api/designer/trades')
      .then(r => r.ok && r.json())
      .then(d => {
        if (d?.trades) setTrades(d.trades);
      })
      .catch(e => console.warn('Could not load trades in DesignStudio:', e));
  }, []);

  // Toast timer
  useEffect(() => {
    if (!itemSuccessToast) return;
    const t = setTimeout(() => setItemSuccessToast(null), 3500);
    return () => clearTimeout(t);
  }, [itemSuccessToast]);

  const handleOpenNewItem = () => {
    setItemName('');
    setItemCategory('materials');
    setItemTradeId('');
    setItemVendor('');
    setItemSpec('');
    setItemQty('1');
    setItemUnitCost('0');
    setItemStatus('selected');
    setItemDrawerError(null);
    setIsItemDrawerOpen(true);
  };

  const handleSaveRoomItem = async (e) => {
    e.preventDefault();
    if (!itemName.trim()) {
      setItemDrawerError('Item name is required');
      return;
    }

    setIsSavingItem(true);
    setItemDrawerError(null);

    const payload = {
      project_id: projectId,
      room_id: currentRoom?.id || null,
      name: itemName.trim(),
      category: itemCategory,
      vendor: itemVendor.trim() || null,
      trade_id: itemTradeId || null,
      spec: itemSpec.trim() || null,
      qty: Number(itemQty) || 1,
      unit_cost: Number(String(itemUnitCost).replace(/[$,]/g, '')) || 0,
      status: itemStatus
    };

    try {
      const res = await fetch('/api/designer/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save item');
      }

      if (typeof onProjectUpdated === 'function') {
        onProjectUpdated();
      }

      setItemSuccessToast(`Added "${itemName.trim()}" to ${currentRoom?.name || 'Room'} ✓`);
      setIsItemDrawerOpen(false);
    } catch (err) {
      console.error('Error saving room item:', err);
      setItemDrawerError(err.message || 'Error saving room item');
    } finally {
      setIsSavingItem(false);
    }
  };

  // Selected room object
  const currentRoom = rooms.find(r => r.id === selectedRoomId) || rooms[0] || null;

  // Sync inline edit states when room changes
  useEffect(() => {
    if (currentRoom) {
      setInlineNameVal(currentRoom.name || '');
      setInlineStyleVal(currentRoom.style || '');
    }
    setInlineEditingName(false);
    setInlineEditingStyle(false);
  }, [currentRoom?.id]);

  // Fetch images for selected room
  const fetchImages = async () => {
    if (!selectedRoomId) {
      setImages([]);
      return;
    }
    setLoadingImages(true);
    try {
      const res = await fetch(`/api/designer/room-images?room_id=${selectedRoomId}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch (err) {
      console.warn('fetchImages error:', err);
    } finally {
      setLoadingImages(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [selectedRoomId]);

  // Fetch pins for selected room
  const fetchRoomPins = async () => {
    if (!selectedRoomId) {
      setRoomPins([]);
      return;
    }
    setLoadingPins(true);
    try {
      const res = await fetch(`/api/designer/room-pins?room_id=${selectedRoomId}`);
      if (res.ok) {
        const data = await res.json();
        setRoomPins(data.pins || []);
      }
    } catch (err) {
      console.warn('fetchRoomPins error:', err);
    } finally {
      setLoadingPins(false);
    }
  };

  useEffect(() => {
    fetchRoomPins();
  }, [selectedRoomId]);

  useEffect(() => {
    if (roomPins.length > 0) {
      buildPinterestWidgets();
    }
  }, [roomPins]);

  const handleSaveRoomPin = async (e) => {
    e?.preventDefault();
    if (!selectedRoomId) return;

    const trimmed = pinUrlInput.trim();
    const parsed = parsePinterestPinUrl(trimmed);
    if (!parsed || !parsed.valid) {
      setPinFormError('Please enter a valid Pinterest pin URL (e.g. pinterest.com/pin/<id>/ or pin.it short link).');
      return;
    }

    try {
      setIsSavingPin(true);
      setPinFormError(null);
      const res = await fetch('/api/designer/room-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: selectedRoomId,
          pin_url: parsed.pin_url,
          note: pinNoteInput.trim() || null
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save pin');
      }

      const data = await res.json();
      setRoomPins(prev => [...prev, data.pin]);
      setPinUrlInput('');
      setPinNoteInput('');
      setIsAddPinOpen(false);
      buildPinterestWidgets();
    } catch (err) {
      setPinFormError(err.message || 'Error saving pin');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleDeletePin = async (pin) => {
    if (!window.confirm('Remove this Pinterest pin from the mood board?')) return;
    try {
      const res = await fetch(`/api/designer/room-pins?id=${pin.id}`, { method: 'DELETE' });
      if (res.ok) {
        setRoomPins(prev => prev.filter(p => p.id !== pin.id));
      }
    } catch (err) {
      console.error('Failed to remove pin:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Room Actions: Add Room
  // ---------------------------------------------------------------------------
  const handleOpenAddRoom = () => {
    setNewRoomName('');
    setNewRoomType('kitchen');
    setNewRoomStyle(project?.style || '');
    setIsAddRoomOpen(true);
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setAddRoomSaving(true);
    try {
      const res = await fetch('/api/designer/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: newRoomName.trim(),
          room_type: newRoomType,
          style: newRoomStyle.trim() || null
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to create room');
      }

      const data = await res.json();
      setIsAddRoomOpen(false);
      await fetchRooms();
      if (data.room?.id) {
        setSelectedRoomId(data.room.id);
      }
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      alert(`Error creating room: ${err.message}`);
    } finally {
      setAddRoomSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Room Actions: Rename / Update Room
  // ---------------------------------------------------------------------------
  const handleOpenRenameRoom = (room, e) => {
    if (e) e.stopPropagation();
    setEditingRoom(room);
    setRenameName(room.name || '');
    setRenameType(room.room_type || 'other');
    setRenameStyle(room.style || '');
    setActiveRoomMenuId(null);
  };

  const handleSaveRenameRoom = async (e) => {
    e.preventDefault();
    if (!editingRoom || !renameName.trim()) return;

    try {
      const res = await fetch(`/api/designer/rooms?id=${editingRoom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: renameName.trim(),
          room_type: renameType,
          style: renameStyle.trim() || null
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to rename room');
      }

      setEditingRoom(null);
      await fetchRooms();
    } catch (err) {
      alert(`Error updating room: ${err.message}`);
    }
  };

  // Inline save room name
  const handleSaveInlineName = async () => {
    if (!currentRoom || !inlineNameVal.trim() || inlineNameVal.trim() === currentRoom.name) {
      setInlineEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/designer/rooms?id=${currentRoom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inlineNameVal.trim() })
      });
      if (res.ok) {
        await fetchRooms();
      }
    } catch (err) {
      console.warn('Inline save name error:', err);
    } finally {
      setInlineEditingName(false);
    }
  };

  // Inline save room style
  const handleSaveInlineStyle = async () => {
    if (!currentRoom) {
      setInlineEditingStyle(false);
      return;
    }
    try {
      const res = await fetch(`/api/designer/rooms?id=${currentRoom.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: inlineStyleVal.trim() || null })
      });
      if (res.ok) {
        await fetchRooms();
      }
    } catch (err) {
      console.warn('Inline save style error:', err);
    } finally {
      setInlineEditingStyle(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Room Actions: Move / Reorder Room
  // ---------------------------------------------------------------------------
  const handleMoveRoom = async (room, direction, e) => {
    if (e) e.stopPropagation();
    setActiveRoomMenuId(null);
    const index = rooms.findIndex(r => r.id === room.id);
    if (index === -1) return;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rooms.length) return;

    const newRooms = [...rooms];
    const [moved] = newRooms.splice(index, 1);
    newRooms.splice(targetIndex, 0, moved);

    setRooms(newRooms);

    try {
      await fetch('/api/designer/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          room_ids: newRooms.map(r => r.id)
        })
      });
    } catch (err) {
      console.warn('Reorder rooms error:', err);
      fetchRooms();
    }
  };

  // ---------------------------------------------------------------------------
  // Room Actions: Delete Room
  // ---------------------------------------------------------------------------
  const handleDeleteRoom = async (room, e) => {
    if (e) e.stopPropagation();
    setActiveRoomMenuId(null);
    const confirmed = window.confirm(`Delete "${room.name}" and all its photos, floor plans, and renders?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/designer/rooms?id=${room.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to delete room');
      }

      if (selectedRoomId === room.id) {
        setSelectedRoomId(null);
      }
      await fetchRooms();
      if (onProjectUpdated) onProjectUpdated();
    } catch (err) {
      alert(`Error deleting room: ${err.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Photo Pipeline: Safe Upload via Canvas & Vercel Blob
  // ---------------------------------------------------------------------------
  const handleUploadImageFiles = async (files, kind = 'mood') => {
    if (!selectedRoomId || !files || files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`"${file.name}" exceeds the 10 MB limit and was skipped.`);
          continue;
        }

        const processed = await processAndStripImage(file);
        const res = await fetch('/api/designer/room-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: selectedRoomId,
            kind,
            filename: processed.filename,
            contentType: processed.contentType,
            data: processed.data,
            size: 'small'
          })
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.error || 'Failed to upload photo');
        }
      }

      await fetchImages();
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Photo Actions: Change Size, Edit Caption, Reorder, Delete
  // ---------------------------------------------------------------------------
  const handleChangeImageSize = async (img, newSize, e) => {
    if (e) e.stopPropagation();
    setActiveImageMenuId(null);

    setImages(prev => prev.map(i => i.id === img.id ? { ...i, size: newSize } : i));

    try {
      await fetch('/api/designer/room-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: img.id, size: newSize })
      });
    } catch (err) {
      console.warn('Update image size error:', err);
      fetchImages();
    }
  };

  const handleSaveCaption = async (imgId) => {
    const cleanCap = captionInputVal.trim();
    setImages(prev => prev.map(i => i.id === imgId ? { ...i, caption: cleanCap || null } : i));
    setEditingCaptionId(null);

    try {
      await fetch('/api/designer/room-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: imgId, caption: cleanCap || null })
      });
    } catch (err) {
      console.warn('Save caption error:', err);
      fetchImages();
    }
  };

  const handleMoveImage = async (img, direction, e) => {
    if (e) e.stopPropagation();
    setActiveImageMenuId(null);
    const kindImages = images.filter(i => i.kind === img.kind);
    const index = kindImages.findIndex(i => i.id === img.id);
    if (index === -1) return;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= kindImages.length) return;

    const newKindImages = [...kindImages];
    const [moved] = newKindImages.splice(index, 1);
    newKindImages.splice(targetIndex, 0, moved);

    // Update locally
    const remaining = images.filter(i => i.kind !== img.kind);
    setImages([...remaining, ...newKindImages]);

    // Persist sort_order for each
    try {
      for (let idx = 0; idx < newKindImages.length; idx++) {
        await fetch('/api/designer/room-images', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: newKindImages[idx].id, sort_order: idx })
        });
      }
    } catch (err) {
      console.warn('Move image error:', err);
      fetchImages();
    }
  };

  const handleDeleteImage = async (img, e) => {
    if (e) e.stopPropagation();
    setActiveImageMenuId(null);
    const confirmed = window.confirm('Delete this photo? This will also remove the image file.');
    if (!confirmed) return;

    setImages(prev => prev.filter(i => i.id !== img.id));

    try {
      const res = await fetch(`/api/designer/room-images?id=${img.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error('Failed to delete image');
      }
    } catch (err) {
      alert(`Error deleting image: ${err.message}`);
      fetchImages();
    }
  };

  // ---------------------------------------------------------------------------
  // Drag & Drop reorder on desktop
  // ---------------------------------------------------------------------------
  const handleDragStart = (e, imgId) => {
    e.dataTransfer.setData('text/plain', imgId);
    setDraggedImgId(imgId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetImgId) => {
    e.preventDefault();
    if (!draggedImgId || draggedImgId === targetImgId) return;

    const moodImgs = images.filter(i => i.kind === 'mood');
    const sourceIdx = moodImgs.findIndex(i => i.id === draggedImgId);
    const targetIdx = moodImgs.findIndex(i => i.id === targetImgId);

    if (sourceIdx === -1 || targetIdx === -1) return;

    const newMood = [...moodImgs];
    const [moved] = newMood.splice(sourceIdx, 1);
    newMood.splice(targetIdx, 0, moved);

    const otherImgs = images.filter(i => i.kind !== 'mood');
    setImages([...newMood, ...otherImgs]);
    setDraggedImgId(null);

    // Save order
    try {
      for (let idx = 0; idx < newMood.length; idx++) {
        await fetch('/api/designer/room-images', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: newMood[idx].id, sort_order: idx })
        });
      }
    } catch (err) {
      console.warn('Drag drop order error:', err);
      fetchImages();
    }
  };

  // Filter images by kind
  const moodImages = images.filter(i => i.kind === 'mood');
  const beforeImages = images.filter(i => i.kind === 'before');
  const afterImages = images.filter(i => i.kind === 'after');
  const planImages = images.filter(i => i.kind === 'plan');
  const renderImages = images.filter(i => i.kind === 'render');

  return (
    <div style={{ width: '100%', paddingBottom: 'var(--space-64)' }}>
      {roomsError && (
        <div style={{
          padding: '12px 18px',
          backgroundColor: 'var(--negative-bg)',
          border: '1px solid var(--negative)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--negative)',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          marginBottom: 'var(--space-16)'
        }}>
          {roomsError}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. ROOM BAR — Pill chips for project rooms                            */}
      {/* ===================================================================== */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-8)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-24)',
        paddingBottom: 'var(--space-12)',
        borderBottom: '1px solid var(--border)'
      }}>
        {rooms.map(room => {
          const isSelected = currentRoom && room.id === currentRoom.id;
          const totalCost = room.total_item_cost || 0;
          const isMenuOpen = activeRoomMenuId === room.id;

          return (
            <div
              key={room.id}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-pill)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  letterSpacing: '0.02em',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--espresso)' : '1px solid var(--border)',
                  backgroundColor: isSelected ? 'var(--espresso)' : '#ffffff',
                  color: isSelected ? 'var(--on-dark)' : 'var(--espresso)',
                  boxShadow: isSelected ? '0 2px 8px rgba(30, 21, 9, 0.18)' : '0 1px 3px rgba(30, 21, 9, 0.04)',
                  transition: 'all 0.18s ease',
                  userSelect: 'none'
                }}
              >
                <span>{room.name}</span>
                <span style={{
                  fontSize: '11px',
                  opacity: isSelected ? 0.8 : 0.65,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: isSelected ? 'rgba(250, 248, 245, 0.15)' : 'var(--beige)',
                  color: isSelected ? 'var(--on-dark)' : 'var(--muted)'
                }}>
                  {formatCurrencyK(totalCost)}
                </span>

                {/* 3-dots trigger inside selected or hovered chip */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveRoomMenuId(isMenuOpen ? null : room.id);
                  }}
                  title="Room options"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    marginLeft: '2px',
                    fontSize: '12px',
                    opacity: isSelected ? 0.75 : 0.5,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = isSelected ? '0.75' : '0.5'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </span>
              </button>

              {/* Room Dropdown Menu */}
              {isMenuOpen && (
                <div
                  ref={roomMenuRef}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-floating)',
                    padding: '6px 0',
                    zIndex: 200,
                    minWidth: '160px'
                  }}
                >
                  <div
                    onClick={(e) => handleOpenRenameRoom(room, e)}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--espresso)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    Rename room
                  </div>

                  <div
                    onClick={(e) => handleMoveRoom(room, 'left', e)}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--espresso)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    ← Move left
                  </div>

                  <div
                    onClick={(e) => handleMoveRoom(room, 'right', e)}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--espresso)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    Move right →
                  </div>

                  <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />

                  <div
                    onClick={(e) => handleDeleteRoom(room, e)}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--negative)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--negative-bg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    Delete room
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* "+ ADD ROOM" pill button */}
        <button
          type="button"
          onClick={handleOpenAddRoom}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 16px',
            borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'var(--burgundy)',
            backgroundColor: 'transparent',
            border: '1.5px dashed var(--burgundy)',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--beige)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span>+ ADD ROOM</span>
        </button>
      </div>

      {/* When no rooms exist */}
      {rooms.length === 0 && !loadingRooms && (
        <EmptyState
          title="No rooms created yet"
          description="Create your first room (like Kitchen or Primary Bath) to start assembling mood boards, floor plans, and finishes."
          action={
            <Button variant="primary" onClick={handleOpenAddRoom}>
              + ADD YOUR FIRST ROOM →
            </Button>
          }
        />
      )}

      {/* ===================================================================== */}
      {/* 3. LEFT, WIDE — The Room Board Card (White Card)                      */}
      {/* ===================================================================== */}
      {currentRoom && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-24)' }}>
          <Card style={{ padding: 'var(--space-32)' }}>
            {/* Top Room Board Header: Room Name + Style Line & SegmentedControl */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-20)',
              marginBottom: 'var(--space-28)',
              paddingBottom: 'var(--space-20)',
              borderBottom: '1px solid var(--border)'
            }}>
              {/* Room name & style line (editable inline) */}
              <div style={{ flex: 1, minWidth: '260px' }}>
                {inlineEditingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="text"
                      value={inlineNameVal}
                      onChange={(e) => setInlineNameVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveInlineName();
                        if (e.key === 'Escape') setInlineEditingName(false);
                      }}
                      autoFocus
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '26px',
                        color: 'var(--espresso)',
                        padding: '4px 10px',
                        border: '1.5px solid var(--burgundy)',
                        borderRadius: 'var(--radius-sm)',
                        outline: 'none',
                        backgroundColor: '#ffffff'
                      }}
                    />
                    <Button variant="primary" size="sm" onClick={handleSaveInlineName}>
                      Save
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setInlineEditingName(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => setInlineEditingName(true)}
                    title="Click to rename room"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      marginBottom: '4px'
                    }}
                  >
                    <h2 style={{
                      fontFamily: "var(--font-display), 'Atelier Fleur', 'Playfair Display', Georgia, serif",
                      fontSize: '28px',
                      fontWeight: 400,
                      color: 'var(--espresso)',
                      margin: 0,
                      lineHeight: 1.15
                    }}>
                      {currentRoom.name}
                    </h2>
                    <span style={{ fontSize: '13px', color: 'var(--muted)', opacity: 0.6 }}>✎</span>
                  </div>
                )}

                {/* Style line (editable inline) */}
                <div>
                  {inlineEditingStyle ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="text"
                        value={inlineStyleVal}
                        onChange={(e) => setInlineStyleVal(e.target.value)}
                        placeholder="e.g. Warm Minimalist · Japandi"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveInlineStyle();
                          if (e.key === 'Escape') setInlineEditingStyle(false);
                        }}
                        autoFocus
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '13px',
                          color: 'var(--espresso)',
                          padding: '4px 8px',
                          border: '1px solid var(--burgundy)',
                          borderRadius: 'var(--radius-sm)',
                          outline: 'none',
                          minWidth: '220px'
                        }}
                      />
                      <Button variant="primary" size="sm" onClick={handleSaveInlineStyle}>
                        Save
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setInlineEditingStyle(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => setInlineEditingStyle(true)}
                      title="Click to edit room style"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        color: 'var(--muted)'
                      }}
                    >
                      <span>
                        {currentRoom.style || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>Add room style...</span>}
                      </span>
                      <span style={{ fontSize: '11px', opacity: 0.5 }}>✎</span>
                    </div>
                  )}
                </div>
              </div>

              {/* SegmentedControl & + Add Item button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <SegmentedControl
                    options={STUDIO_VIEW_OPTIONS}
                    value={studioView}
                    onChange={setStudioView}
                    size="md"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenNewItem}
                >
                  + Add Item →
                </Button>
              </div>
            </div>

            {/* Image loading indicator */}
            {loadingImages && (
              <div style={{
                padding: '8px 16px',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--muted)',
                marginBottom: 'var(--space-12)'
              }}>
                Loading photos...
              </div>
            )}

            {/* Upload indicator */}
            {uploading && (
              <div style={{
                padding: '10px 16px',
                backgroundColor: 'var(--beige)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-16)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--espresso)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>Uploading and optimizing image (JPEG max 2000px, EXIF stripped)...</span>
              </div>
            )}

            {uploadError && (
              <div style={{
                padding: '10px 16px',
                backgroundColor: 'var(--negative-bg)',
                border: '1px solid var(--negative)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-16)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--negative)'
              }}>
                {uploadError}
              </div>
            )}

            {/* =============================================================== */}
            {/* VIEW 1: MOOD BOARD                                              */}
            {/* 4-column grid, 120px rows; small (1x1), wide (2x1), large (2x2) */}
            {/* =============================================================== */}
            {studioView === 'mood' && (
              <div>
                {moodImages.length === 0 && roomPins.length === 0 ? (
                  <EmptyState
                    title="Mood board is empty"
                    description="Curate textures, materials, lighting, palettes, and furniture inspirations for this room. Drop images or add inspiration from Pinterest."
                    action={
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <input
                          type="file"
                          ref={moodFileInputRef}
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          style={{ display: 'none' }}
                          onChange={(e) => handleUploadImageFiles(e.target.files, 'mood')}
                        />
                        <Button
                          variant="secondary"
                          onClick={() => moodFileInputRef.current?.click()}
                        >
                          + BROWSE PHOTOS →
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => setIsAddPinOpen(true)}
                        >
                          + ADD FROM PINTEREST →
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <div>
                    {/* Mood Board Action Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em'
                        }}>
                          {moodImages.length + roomPins.length} {moodImages.length + roomPins.length === 1 ? 'Inspiration' : 'Inspirations'}
                        </span>
                        {roomPins.length > 0 && (
                          <span style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: '11px',
                            color: 'var(--burgundy)',
                            backgroundColor: 'rgba(65, 16, 27, 0.06)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            fontWeight: 600
                          }}>
                            {roomPins.length} Pinterest {roomPins.length === 1 ? 'pin' : 'pins'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => moodFileInputRef.current?.click()}
                        >
                          + Upload Photo →
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setIsAddPinOpen(true)}
                        >
                          + Add from Pinterest →
                        </Button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                        gridAutoRows: '120px',
                        gap: '16px'
                      }}
                    >
                    {moodImages.map((img) => {
                      const size = img.size || 'small';
                      const colSpan = size === 'wide' || size === 'large' ? 2 : 1;
                      const rowSpan = size === 'large' ? 2 : 1;
                      const isMenuOpen = activeImageMenuId === img.id;
                      const isEditingCaption = editingCaptionId === img.id;

                      return (
                        <div
                          key={img.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, img.id)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, img.id)}
                          style={{
                            gridColumn: `span ${colSpan}`,
                            gridRow: `span ${rowSpan}`,
                            position: 'relative',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            backgroundColor: 'var(--beige)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 2px 8px rgba(30, 21, 9, 0.06)',
                            cursor: 'grab',
                            transition: 'box-shadow 0.2s ease, transform 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 6px 18px rgba(30, 21, 9, 0.12)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(30, 21, 9, 0.06)';
                            e.currentTarget.style.transform = 'none';
                          }}
                        >
                          <img
                            src={img.blob_url}
                            alt={img.caption || 'Mood board item'}
                            onClick={() => setLightboxImage(img)}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block'
                            }}
                          />

                          {/* Top Right Action Menu */}
                          <div
                            data-image-menu
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              zIndex: 10
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveImageMenuId(isMenuOpen ? null : img.id);
                              }}
                              title="Tile options"
                              aria-label="Tile options"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(30, 21, 9, 0.72)',
                                backdropFilter: 'blur(4px)',
                                color: '#ffffff',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2"/>
                                <circle cx="12" cy="12" r="2"/>
                                <circle cx="12" cy="19" r="2"/>
                              </svg>
                            </button>

                            {/* Tile Dropdown Menu */}
                            {isMenuOpen && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '34px',
                                  right: 0,
                                  backgroundColor: '#ffffff',
                                  border: '1px solid var(--border-strong)',
                                  borderRadius: 'var(--radius-sm)',
                                  boxShadow: 'var(--shadow-floating)',
                                  padding: '6px 0',
                                  zIndex: 50,
                                  minWidth: '150px'
                                }}
                              >
                                <div style={{
                                  padding: '4px 12px',
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-sans)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  color: 'var(--muted)',
                                  opacity: 0.7
                                }}>
                                  Tile Size
                                </div>
                                <div
                                  onClick={(e) => handleChangeImageSize(img, 'small', e)}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: size === 'small' ? 'var(--burgundy)' : 'var(--espresso)',
                                    fontWeight: size === 'small' ? 600 : 400,
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Small (1×1)
                                </div>
                                <div
                                  onClick={(e) => handleChangeImageSize(img, 'wide', e)}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: size === 'wide' ? 'var(--burgundy)' : 'var(--espresso)',
                                    fontWeight: size === 'wide' ? 600 : 400,
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Wide (2×1)
                                </div>
                                <div
                                  onClick={(e) => handleChangeImageSize(img, 'large', e)}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: size === 'large' ? 'var(--burgundy)' : 'var(--espresso)',
                                    fontWeight: size === 'large' ? 600 : 400,
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Large (2×2)
                                </div>

                                <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />

                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveImageMenuId(null);
                                    setCaptionInputVal(img.caption || '');
                                    setEditingCaptionId(img.id);
                                  }}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--espresso)',
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Edit caption
                                </div>

                                <div
                                  onClick={(e) => handleMoveImage(img, 'left', e)}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--espresso)',
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  ← Move earlier
                                </div>

                                <div
                                  onClick={(e) => handleMoveImage(img, 'right', e)}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--espresso)',
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--beige)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Move later →
                                </div>

                                <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />

                                <div
                                  onClick={(e) => handleDeleteImage(img, e)}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-sans)',
                                    color: 'var(--negative)',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--negative-bg)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Delete photo
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Bottom-left Caption Pill */}
                          <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '8px',
                            maxWidth: 'calc(100% - 16px)',
                            zIndex: 5
                          }}>
                            {isEditingCaption ? (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: 'flex',
                                  gap: '4px',
                                  backgroundColor: '#ffffff',
                                  padding: '3px 6px',
                                  borderRadius: 'var(--radius-pill)',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                }}
                              >
                                <input
                                  type="text"
                                  value={captionInputVal}
                                  onChange={(e) => setCaptionInputVal(e.target.value)}
                                  placeholder="Caption..."
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveCaption(img.id);
                                    if (e.key === 'Escape') setEditingCaptionId(null);
                                  }}
                                  autoFocus
                                  style={{
                                    fontFamily: 'var(--font-sans)',
                                    fontSize: '11px',
                                    border: 'none',
                                    outline: 'none',
                                    width: '100px',
                                    color: 'var(--espresso)'
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCaption(img.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--burgundy)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  OK
                                </button>
                              </div>
                            ) : (
                              img.caption ? (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCaptionInputVal(img.caption || '');
                                    setEditingCaptionId(img.id);
                                  }}
                                  title="Click to edit caption"
                                  style={{
                                    backgroundColor: 'rgba(30, 21, 9, 0.72)',
                                    backdropFilter: 'blur(4px)',
                                    color: 'var(--cream)',
                                    padding: '3px 10px',
                                    borderRadius: 'var(--radius-pill)',
                                    fontFamily: 'var(--font-sans)',
                                    fontSize: '11px',
                                    lineHeight: 1.2,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {img.caption}
                                </div>
                              ) : null
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Pinterest Pins */}
                    {roomPins.map((pin) => (
                      <PinterestPinEmbed
                        key={pin.id}
                        pin={pin}
                        onDelete={handleDeletePin}
                      />
                    ))}

                    {/* Drop Zone at the end */}
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files?.length) {
                          handleUploadImageFiles(e.dataTransfer.files, 'mood');
                        }
                      }}
                      onClick={() => moodFileInputRef.current?.click()}
                      style={{
                        minHeight: '120px',
                        border: '2px dashed var(--border-strong)',
                        borderRadius: '12px',
                        backgroundColor: 'var(--beige)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        gap: '6px',
                        transition: 'border-color 0.2s ease, background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--burgundy)';
                        e.currentTarget.style.backgroundColor = 'rgba(65, 16, 27, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                        e.currentTarget.style.backgroundColor = 'var(--beige)';
                      }}
                    >
                      <input
                        type="file"
                        ref={moodFileInputRef}
                        multiple
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        style={{ display: 'none' }}
                        onChange={(e) => handleUploadImageFiles(e.target.files, 'mood')}
                      />
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--burgundy)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        color: 'var(--espresso)'
                      }}>
                        Drop images or browse
                      </span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>or</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsAddPinOpen(true);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--burgundy)',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline'
                          }}
                        >
                          add from Pinterest →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

            {/* =============================================================== */}
            {/* VIEW 2: BEFORE / AFTER                                          */}
            {/* Pairs side by side or comparison slider (input type=range)      */}
            {/* =============================================================== */}
            {studioView === 'before_after' && (
              <div>
                {/* Upload action bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: 'var(--space-20)',
                  padding: '12px 18px',
                  backgroundColor: 'var(--beige)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="file"
                      ref={beforeFileInputRef}
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      style={{ display: 'none' }}
                      onChange={(e) => handleUploadImageFiles(e.target.files, 'before')}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => beforeFileInputRef.current?.click()}
                    >
                      + ADD BEFORE PHOTO →
                    </Button>

                    <input
                      type="file"
                      ref={afterFileInputRef}
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      style={{ display: 'none' }}
                      onChange={(e) => handleUploadImageFiles(e.target.files, 'after')}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => afterFileInputRef.current?.click()}
                    >
                      + ADD AFTER PHOTO →
                    </Button>
                  </div>

                  {/* Mode toggle if pairs exist */}
                  {beforeImages.length > 0 && afterImages.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        View:
                      </span>
                      <button
                        type="button"
                        onClick={() => setBeforeAfterMode('slider')}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 'var(--radius-pill)',
                          border: beforeAfterMode === 'slider' ? '1px solid var(--espresso)' : '1px solid var(--border)',
                          backgroundColor: beforeAfterMode === 'slider' ? 'var(--espresso)' : '#ffffff',
                          color: beforeAfterMode === 'slider' ? 'var(--on-dark)' : 'var(--espresso)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Interactive Slider
                      </button>
                      <button
                        type="button"
                        onClick={() => setBeforeAfterMode('side_by_side')}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 'var(--radius-pill)',
                          border: beforeAfterMode === 'side_by_side' ? '1px solid var(--espresso)' : '1px solid var(--border)',
                          backgroundColor: beforeAfterMode === 'side_by_side' ? 'var(--espresso)' : '#ffffff',
                          color: beforeAfterMode === 'side_by_side' ? 'var(--on-dark)' : 'var(--espresso)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Side by side
                      </button>
                    </div>
                  )}
                </div>

                {beforeImages.length === 0 && afterImages.length === 0 ? (
                  <EmptyState
                    title="No Before / After photos yet"
                    description="Upload original 'Before' condition photos and finished 'After' photos to document transformation progress."
                    action={
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <Button variant="primary" onClick={() => beforeFileInputRef.current?.click()}>
                          + ADD BEFORE PHOTO →
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <div>
                    {/* Interactive Comparison Slider Mode */}
                    {beforeImages.length > 0 && afterImages.length > 0 && beforeAfterMode === 'slider' ? (
                      <div style={{ marginBottom: 'var(--space-32)' }}>
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          height: '420px',
                          borderRadius: '16px',
                          overflow: 'hidden',
                          backgroundColor: 'var(--espresso)',
                          boxShadow: 'var(--shadow-card)',
                          userSelect: 'none'
                        }}>
                          {/* Bottom Layer: Before Image */}
                          <img
                            src={beforeImages[0].blob_url}
                            alt="Before condition"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: '16px',
                            left: '16px',
                            backgroundColor: 'rgba(30, 21, 9, 0.75)',
                            backdropFilter: 'blur(4px)',
                            color: 'var(--cream)',
                            padding: '4px 12px',
                            borderRadius: 'var(--radius-pill)',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase'
                          }}>
                            BEFORE
                          </div>

                          {/* Top Layer: After Image with Clip Path */}
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              clipPath: `inset(0 0 0 ${sliderPos}%)`,
                              overflow: 'hidden'
                            }}
                          >
                            <img
                              src={afterImages[0].blob_url}
                              alt="After renovation"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                            />
                            <div style={{
                              position: 'absolute',
                              bottom: '16px',
                              right: '16px',
                              backgroundColor: 'var(--burgundy)',
                              color: 'var(--cream)',
                              padding: '4px 12px',
                              borderRadius: 'var(--radius-pill)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '11px',
                              fontWeight: 600,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                            }}>
                              AFTER
                            </div>
                          </div>

                          {/* Divider Line & Handle */}
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: `${sliderPos}%`,
                              width: '2px',
                              backgroundColor: '#ffffff',
                              boxShadow: '0 0 8px rgba(0,0,0,0.5)',
                              pointerEvents: 'none',
                              zIndex: 10
                            }}
                          >
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              backgroundColor: '#ffffff',
                              border: '2px solid var(--burgundy)',
                              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--burgundy)',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              userSelect: 'none'
                            }}>
                              &harr;
                            </div>
                          </div>

                          {/* Native Range Input for accessibility & mobile touch */}
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={sliderPos}
                            onChange={(e) => setSliderPos(Number(e.target.value))}
                            aria-label="Comparison slider between before and after"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'ew-resize',
                              zIndex: 20,
                              margin: 0
                            }}
                          />
                        </div>

                        <div style={{
                          marginTop: '8px',
                          display: 'flex',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '11px',
                          color: 'var(--muted)'
                        }}>
                          Drag slider horizontally to compare before and after
                        </div>
                      </div>
                    ) : null}

                    {/* Side by side pairs */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 'var(--space-24)'
                    }}>
                      {/* Before Column */}
                      <div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 'var(--space-12)'
                        }}>
                          <Eyebrow>BEFORE ({beforeImages.length})</Eyebrow>
                          <button
                            type="button"
                            onClick={() => beforeFileInputRef.current?.click()}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--burgundy)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            + Add →
                          </button>
                        </div>
                        <div style={{ display: 'grid', gap: '16px' }}>
                          {beforeImages.map(img => (
                            <div
                              key={img.id}
                              style={{
                                borderRadius: '12px',
                                overflow: 'hidden',
                                backgroundColor: 'var(--beige)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              <img
                                src={img.blob_url}
                                alt={img.caption || 'Before photo'}
                                onClick={() => setLightboxImage(img)}
                                style={{
                                  width: '100%',
                                  height: '200px',
                                  objectFit: 'cover',
                                  cursor: 'pointer'
                                }}
                              />
                              <div style={{
                                padding: '8px 12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
                                  {img.caption || 'Before condition'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteImage(img, e)}
                                  style={{ background: 'none', border: 'none', color: 'var(--negative)', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* After Column */}
                      <div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 'var(--space-12)'
                        }}>
                          <Eyebrow>AFTER ({afterImages.length})</Eyebrow>
                          <button
                            type="button"
                            onClick={() => afterFileInputRef.current?.click()}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--burgundy)',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            + Add →
                          </button>
                        </div>
                        <div style={{ display: 'grid', gap: '16px' }}>
                          {afterImages.map(img => (
                            <div
                              key={img.id}
                              style={{
                                borderRadius: '12px',
                                overflow: 'hidden',
                                backgroundColor: 'var(--beige)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              <img
                                src={img.blob_url}
                                alt={img.caption || 'After photo'}
                                onClick={() => setLightboxImage(img)}
                                style={{
                                  width: '100%',
                                  height: '200px',
                                  objectFit: 'cover',
                                  cursor: 'pointer'
                                }}
                              />
                              <div style={{
                                padding: '8px 12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
                                  {img.caption || 'Finished space'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteImage(img, e)}
                                  style={{ background: 'none', border: 'none', color: 'var(--negative)', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* VIEW 3: FLOOR PLAN                                              */}
            {/* Simple gallery with captions; click to open larger view         */}
            {/* =============================================================== */}
            {studioView === 'plan' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-20)'
                }}>
                  <Eyebrow>ARCHITECTURAL FLOOR PLANS & SCHEMATICS</Eyebrow>
                  <div>
                    <input
                      type="file"
                      ref={planFileInputRef}
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      style={{ display: 'none' }}
                      onChange={(e) => handleUploadImageFiles(e.target.files, 'plan')}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => planFileInputRef.current?.click()}
                    >
                      + ADD FLOOR PLAN →
                    </Button>
                  </div>
                </div>

                {planImages.length === 0 ? (
                  <EmptyState
                    title="No floor plans uploaded"
                    description="Upload dimensional 2D floor plans, electrical maps, or furniture layout schematics for this room."
                    action={
                      <Button variant="primary" onClick={() => planFileInputRef.current?.click()}>
                        + UPLOAD FLOOR PLAN →
                      </Button>
                    }
                  />
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '20px'
                  }}>
                    {planImages.map(img => (
                      <div
                        key={img.id}
                        style={{
                          borderRadius: '12px',
                          overflow: 'hidden',
                          backgroundColor: '#ffffff',
                          border: '1px solid var(--border)',
                          boxShadow: 'var(--shadow-card)',
                          cursor: 'pointer',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                        }}
                        onClick={() => setLightboxImage(img)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 10px 24px rgba(30, 21, 9, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                        }}
                      >
                        <div style={{ height: '220px', backgroundColor: 'var(--beige)', overflow: 'hidden' }}>
                          <img
                            src={img.blob_url}
                            alt={img.caption || 'Floor plan'}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
                          />
                        </div>
                        <div style={{
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--espresso)', fontWeight: 500 }}>
                            {img.caption || 'Floor plan schematic'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteImage(img, e)}
                            style={{ background: 'none', border: 'none', color: 'var(--negative)', fontSize: '11px', cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* VIEW 4: RENDERS                                                 */}
            {/* Simple gallery with captions; click to open larger view         */}
            {/* =============================================================== */}
            {studioView === 'render' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-20)'
                }}>
                  <Eyebrow>3D VISUALIZATIONS & SPATIAL RENDERS</Eyebrow>
                  <div>
                    <input
                      type="file"
                      ref={renderFileInputRef}
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      style={{ display: 'none' }}
                      onChange={(e) => handleUploadImageFiles(e.target.files, 'render')}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => renderFileInputRef.current?.click()}
                    >
                      + ADD 3D RENDER →
                    </Button>
                  </div>
                </div>

                {renderImages.length === 0 ? (
                  <EmptyState
                    title="No renders uploaded"
                    description="Upload photorealistic 3D renders, CAD perspectives, and elevation drawings for this room."
                    action={
                      <Button variant="primary" onClick={() => renderFileInputRef.current?.click()}>
                        + UPLOAD 3D RENDER →
                      </Button>
                    }
                  />
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '20px'
                  }}>
                    {renderImages.map(img => (
                      <div
                        key={img.id}
                        style={{
                          borderRadius: '12px',
                          overflow: 'hidden',
                          backgroundColor: '#ffffff',
                          border: '1px solid var(--border)',
                          boxShadow: 'var(--shadow-card)',
                          cursor: 'pointer',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                        }}
                        onClick={() => setLightboxImage(img)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 10px 24px rgba(30, 21, 9, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                        }}
                      >
                        <div style={{ height: '240px', backgroundColor: 'var(--espresso)', overflow: 'hidden' }}>
                          <img
                            src={img.blob_url}
                            alt={img.caption || '3D Render'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        <div style={{
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--espresso)', fontWeight: 500 }}>
                            {img.caption || '3D Perspective'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteImage(img, e)}
                            style={{ background: 'none', border: 'none', color: 'var(--negative)', fontSize: '11px', cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Lightbox Modal for enlarged view                                      */}
      {/* ===================================================================== */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(30, 21, 9, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close enlarged view"
              style={{
                position: 'absolute',
                top: '-42px',
                right: '0',
                background: 'none',
                border: 'none',
                color: 'var(--on-dark)',
                fontSize: '28px',
                cursor: 'pointer',
                lineHeight: 1
              }}
            >
              ×
            </button>

            <img
              src={lightboxImage.blob_url}
              alt={lightboxImage.caption || 'Enlarged photo'}
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                borderRadius: '8px',
                objectFit: 'contain',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
              }}
            />

            {lightboxImage.caption && (
              <div style={{
                marginTop: '12px',
                color: 'var(--on-dark)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                letterSpacing: '0.02em',
                textAlign: 'center'
              }}>
                {lightboxImage.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Add Room Modal                                                        */}
      {/* ===================================================================== */}
      {isAddRoomOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(30, 21, 9, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '32px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: 'var(--shadow-floating)',
              border: '1px solid var(--border)'
            }}
          >
            <Eyebrow>NEW ROOM</Eyebrow>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              color: 'var(--espresso)',
              margin: '6px 0 20px 0'
            }}>
              Add room to project
            </h3>

            <form onSubmit={handleCreateRoom}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: '6px'
                }}>
                  Room Type
                </label>
                <select
                  value={newRoomType}
                  onChange={(e) => {
                    const sel = e.target.value;
                    setNewRoomType(sel);
                    if (!newRoomName || ROOM_TYPES.some(t => t.label === newRoomName)) {
                      const match = ROOM_TYPES.find(t => t.value === sel);
                      if (match) setNewRoomName(match.label);
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {ROOM_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: '6px'
                }}>
                  Room Name
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Kitchen, Primary Bath"
                  required
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: '6px'
                }}>
                  Style Direction (Optional)
                </label>
                <input
                  type="text"
                  value={newRoomStyle}
                  onChange={(e) => setNewRoomStyle(e.target.value)}
                  placeholder="e.g. Japandi, Warm Minimalist"
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAddRoomOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={addRoomSaving}
                >
                  {addRoomSaving ? 'Creating...' : 'CREATE ROOM →'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Rename Room Modal                                                     */}
      {/* ===================================================================== */}
      {editingRoom && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(30, 21, 9, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '32px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: 'var(--shadow-floating)',
              border: '1px solid var(--border)'
            }}
          >
            <Eyebrow>EDIT ROOM</Eyebrow>
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              color: 'var(--espresso)',
              margin: '6px 0 20px 0'
            }}>
              Rename {editingRoom.name}
            </h3>

            <form onSubmit={handleSaveRenameRoom}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: '6px'
                }}>
                  Room Name
                </label>
                <input
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: '6px'
                }}>
                  Room Type
                </label>
                <select
                  value={renameType}
                  onChange={(e) => setRenameType(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {ROOM_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  marginBottom: '6px'
                }}>
                  Style Direction
                </label>
                <input
                  type="text"
                  value={renameStyle}
                  onChange={(e) => setRenameStyle(e.target.value)}
                  placeholder="e.g. Japandi, Warm Minimalist"
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingRoom(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                >
                  SAVE CHANGES →
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Success Toast */}
      {itemSuccessToast && (
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
          fontWeight: 600
        }}>
          {itemSuccessToast}
        </div>
      )}

      {/* Room Item SidePanel Form with Trade / Vendor select */}
      <SidePanel
        isOpen={isItemDrawerOpen}
        onClose={() => !isSavingItem && setIsItemDrawerOpen(false)}
        eyebrow="DESIGN STUDIO"
        title={`Add item to ${currentRoom?.name || 'Room'}`}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
            <Button
              variant="secondary"
              onClick={() => setIsItemDrawerOpen(false)}
              disabled={isSavingItem}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveRoomItem}
              disabled={isSavingItem}
            >
              {isSavingItem ? 'Saving...' : 'Add Item →'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveRoomItem} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {itemDrawerError && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: 'var(--negative-bg)',
              color: 'var(--negative)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)'
            }}>
              {itemDrawerError}
            </div>
          )}

          <Field
            label="Item Name"
            required
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. Cle Tile Zellige 4x4, Brass Wall Sconce"
          />

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Category
            </label>
            <select
              value={itemCategory}
              onChange={(e) => setItemCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px'
              }}
            >
              <option value="materials">Materials</option>
              <option value="fixtures">Fixtures</option>
              <option value="furniture">Furniture</option>
              <option value="lighting">Lighting</option>
              <option value="plumbing">Plumbing</option>
              <option value="hardware">Hardware</option>
              <option value="appliances">Appliances</option>
              <option value="labor">Labor</option>
              <option value="decor">Decor</option>
              <option value="paint">Paint</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Trade / Vendor Select */}
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
                value={itemTradeId}
                onChange={(e) => {
                  const selId = e.target.value;
                  setItemTradeId(selId);
                  const matched = trades.find(t => t.id === selId);
                  if (matched) {
                    setItemVendor(matched.company);
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
              value={itemVendor}
              onChange={(e) => {
                setItemVendor(e.target.value);
                if (itemTradeId && !trades.some(t => t.id === itemTradeId && t.company === e.target.value)) {
                  setItemTradeId('');
                }
              }}
              placeholder="e.g. Ferguson, Floor & Decor, CB2"
            />
          </div>

          <Field
            label="Specification / Model"
            value={itemSpec}
            onChange={(e) => setItemSpec(e.target.value)}
            placeholder="e.g. Brushed Brass, 60W LED"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field
              label="Quantity"
              type="number"
              min="1"
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
            />
            <Field
              label="Unit Cost ($)"
              value={itemUnitCost}
              onChange={(e) => setItemUnitCost(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--espresso)', marginBottom: '6px' }}>
              Status
            </label>
            <select
              value={itemStatus}
              onChange={(e) => setItemStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px'
              }}
            >
              <option value="selected">Selected</option>
              <option value="idea">Idea / Planned</option>
              <option value="ordered">Ordered</option>
              <option value="delivered">Delivered</option>
              <option value="installed">Installed</option>
            </select>
          </div>
        </form>
      </SidePanel>

      {/* ========================================================================= */}
      {/* ADD PINTEREST PIN DRAWER                                                  */}
      {/* ========================================================================= */}
      <SidePanel
        isOpen={isAddPinOpen}
        onClose={() => {
          setIsAddPinOpen(false);
          setPinFormError(null);
        }}
        title={`Add Pin to ${currentRoom?.name || 'Room'}`}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setIsAddPinOpen(false);
                setPinFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={isSavingPin}
              onClick={handleSaveRoomPin}
            >
              {isSavingPin ? 'Saving...' : 'Add Pin →'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveRoomPin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>
            Paste a Pinterest pin link to embed directly into your room mood board. No image files are downloaded or stored.
          </p>

          <Field
            label="Pinterest Pin URL"
            required
            hint="pinterest.com/pin/<id>/ or pin.it short link"
          >
            <input
              type="url"
              placeholder="https://www.pinterest.com/pin/99220005531980838/"
              value={pinUrlInput}
              onChange={(e) => {
                setPinUrlInput(e.target.value);
                if (pinFormError) setPinFormError(null);
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input, 14px)',
                border: '1px solid var(--border-strong)',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                backgroundColor: 'var(--cream)',
                color: 'var(--espresso)'
              }}
              required
            />
          </Field>

          <Field
            label="Note (Optional)"
            hint="Displayed at the bottom of the pin tile"
          >
            <input
              type="text"
              placeholder="e.g. Fluted white oak island reference"
              value={pinNoteInput}
              onChange={(e) => setPinNoteInput(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-input, 14px)',
                border: '1px solid var(--border-strong)',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                backgroundColor: 'var(--cream)',
                color: 'var(--espresso)'
              }}
            />
          </Field>

          {pinFormError && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: 'var(--negative-bg, #F5E6E3)',
              border: '1px solid var(--negative, #8A2A1E)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--negative, #8A2A1E)'
            }}>
              {pinFormError}
            </div>
          )}
        </form>
      </SidePanel>
    </div>
  );
}
