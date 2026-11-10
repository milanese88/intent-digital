import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  Card,
  Numeral,
  Eyebrow,
  Pill,
  SidePanel,
  Field,
  ScriptAccent
} from '../../components/ui/index.js';

function formatCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  return `$${Math.round(Number(val)).toLocaleString()}`;
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function StudioJournal({ setActiveTab, navigateTo }) {
  // Main journal state
  const [stats, setStats] = useState(null);
  const [todayImage, setTodayImage] = useState(null);
  const [learningNote, setLearningNote] = useState(null);
  const [allNotes, setAllNotes] = useState([]);
  const [allImages, setAllImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imageRotating, setImageRotating] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Modals & Drawers state
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isMoodboardModalOpen, setIsMoodboardModalOpen] = useState(false);
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);

  // Save to moodboard state
  const [designerProjects, setDesignerProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectRooms, setProjectRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [moodboardCaption, setMoodboardCaption] = useState('');
  const [isSavingMoodboard, setIsSavingMoodboard] = useState(false);

  // Note editor state (inside Notes drawer)
  const [editingNote, setEditingNote] = useState(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [noteFormTitle, setNoteFormTitle] = useState('');
  const [noteFormBody, setNoteFormBody] = useState('');
  const [noteFormLinkUrl, setNoteFormLinkUrl] = useState('');
  const [noteFormLinkLabel, setNoteFormLinkLabel] = useState('');
  const [noteFormColors, setNoteFormColors] = useState([
    { label: 'Base 60%', color: '#FAF8F5', pct: 60 },
    { label: 'Depth 30%', color: '#34292A', pct: 30 },
    { label: 'Accent 10%', color: '#BDD3E2', pct: 10 }
  ]);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Image library manager state
  const [editingImage, setEditingImage] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [newImageFile, setNewImageFile] = useState(null);
  const [newImagePreview, setNewImagePreview] = useState(null);
  const [imageFormTitle, setImageFormTitle] = useState('');
  const [imageFormCredit, setImageFormCredit] = useState('');
  const [imageFormAlt, setImageFormAlt] = useState('');
  const [imageFormNotice, setImageFormNotice] = useState('');
  const [imageFormTryIt, setImageFormTryIt] = useState('');
  const [imageFormPalette, setImageFormPalette] = useState(['#FAF8F5', '#34292A', '#BDD3E2']);
  const [isSavingImage, setIsSavingImage] = useState(false);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3600);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (msg) => setToastMessage(msg);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    async function loadJournalData() {
      try {
        setLoading(true);
        const [statsRes, imageRes, notesRes] = await Promise.all([
          fetch('/api/journal/stats'),
          fetch('/api/journal/inspiration?mode=today'),
          fetch('/api/journal/learning-notes')
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (isMounted) setStats(statsData);
        }

        if (imageRes.ok) {
          const imageData = await imageRes.json();
          if (isMounted && imageData.image) {
            setTodayImage(imageData.image);
            setMoodboardCaption(imageData.image.title || 'Inspiration');
          }
        }

        if (notesRes.ok) {
          const notesData = await notesRes.json();
          if (isMounted) {
            setLearningNote(notesData.latestNote || null);
            setAllNotes(notesData.allNotes || []);
          }
        }
      } catch (err) {
        console.error('Failed to load journal data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadJournalData();
    return () => { isMounted = false; };
  }, []);

  // Fetch next inspiration image
  const handleNextImage = async () => {
    if (imageRotating) return;
    try {
      setImageRotating(true);
      const currentId = todayImage?.id || '';
      const res = await fetch(`/api/journal/inspiration?mode=today&action=next&current_id=${currentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          setTodayImage(data.image);
          setMoodboardCaption(data.image.title || 'Inspiration');
          showToast(`Switched to "${data.image.title}"`);
        }
      }
    } catch (err) {
      console.error('Failed to rotate image:', err);
    } finally {
      setImageRotating(false);
    }
  };

  // Toggle Instagram day tick
  const handleToggleInstagramDay = async (dayIndex) => {
    if (!stats) return;
    const currentTicked = stats.instagramTracker?.tickedDays || [];
    const isTicked = currentTicked.includes(dayIndex);
    const nextTicked = isTicked
      ? currentTicked.filter(d => d !== dayIndex)
      : [...currentTicked, dayIndex].sort((a, b) => a - b);

    // Optimistic UI update
    setStats(prev => ({
      ...prev,
      instagramTracker: {
        ...prev.instagramTracker,
        tickedDays: nextTicked
      }
    }));

    try {
      const res = await fetch('/api/journal/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex, ticked: !isTicked })
      });
      if (!res.ok) {
        throw new Error('Failed to update tracker');
      }
    } catch (err) {
      console.error('Failed to update Instagram tracker:', err);
      // Revert on failure
      setStats(prev => ({
        ...prev,
        instagramTracker: {
          ...prev.instagramTracker,
          tickedDays: currentTicked
        }
      }));
      showToast('Could not save post tracker');
    }
  };

  // Open Save to Moodboard Modal
  const handleOpenMoodboardModal = async () => {
    if (!todayImage) return;
    setIsMoodboardModalOpen(true);
    try {
      const res = await fetch('/api/designer/projects');
      if (res.ok) {
        const data = await res.json();
        const projs = data.projects || [];
        setDesignerProjects(projs);
        if (projs.length > 0) {
          const firstProjId = projs[0].id;
          setSelectedProjectId(firstProjId);
          loadRoomsForProject(firstProjId);
        }
      }
    } catch (err) {
      console.error('Failed to load projects for moodboard:', err);
    }
  };

  const loadRoomsForProject = async (projectId) => {
    try {
      const res = await fetch(`/api/designer/rooms?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const rooms = data.rooms || [];
        setProjectRooms(rooms);
        if (rooms.length > 0) {
          setSelectedRoomId(rooms[0].id);
        } else {
          setSelectedRoomId('');
        }
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  };

  const handleSelectProject = (projId) => {
    setSelectedProjectId(projId);
    loadRoomsForProject(projId);
  };

  const handleConfirmSaveToMoodboard = async () => {
    if (!selectedRoomId || !todayImage?.url) {
      showToast('Please select a project and room');
      return;
    }
    try {
      setIsSavingMoodboard(true);
      const res = await fetch('/api/journal/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_to_moodboard',
          room_id: selectedRoomId,
          image_url: todayImage.url,
          caption: moodboardCaption || todayImage.title
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save to mood board');
      }

      setIsMoodboardModalOpen(false);
      showToast(`Saved to "${data.room_name || 'Room'}" in ${data.project_name || 'Project'}`);
    } catch (err) {
      console.error('Error saving to moodboard:', err);
      showToast(err.message || 'Error saving to mood board');
    } finally {
      setIsSavingMoodboard(false);
    }
  };

  // Open Inspiration Library Manager
  const handleOpenLibrary = async () => {
    setIsLibraryOpen(true);
    try {
      const res = await fetch('/api/journal/inspiration');
      if (res.ok) {
        const data = await res.json();
        setAllImages(data.images || []);
      }
    } catch (err) {
      console.error('Failed to load library images:', err);
    }
  };

  // Toggle active image in Library
  const handleToggleImageActive = async (img) => {
    const nextActive = !img.active;
    try {
      const res = await fetch('/api/journal/inspiration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: img.id, active: nextActive })
      });
      if (res.ok) {
        setAllImages(prev => prev.map(item => item.id === img.id ? { ...item, active: nextActive } : item));
        showToast(nextActive ? `Activated "${img.title}"` : `Deactivated "${img.title}"`);
      }
    } catch (err) {
      console.error('Failed to toggle image active status:', err);
    }
  };

  // Safe Image Pipeline: Client-side resize & convert to JPEG base64
  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Max dimension 2000px
        const maxDim = 2000;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const base64DataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setNewImagePreview(base64DataUrl);
        setNewImageFile(base64DataUrl.split(',')[1]);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Save new uploaded inspiration image
  const handleUploadNewImage = async () => {
    if (!newImageFile) {
      showToast('Please select a photo');
      return;
    }
    if (!imageFormTitle.trim() || !imageFormNotice.trim() || !imageFormTryIt.trim()) {
      showToast('Please fill in title, Notice sentence, and Try It sentence');
      return;
    }

    try {
      setIsSavingImage(true);
      // 1. Upload to Blob
      const uploadRes = await fetch('/api/journal/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: newImageFile,
          contentType: 'image/jpeg'
        })
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Failed to upload photo');
      }

      // 2. Insert into inspiration_images table
      const insertRes = await fetch('/api/journal/inspiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: uploadData.url,
          title: imageFormTitle.trim(),
          credit: imageFormCredit.trim() || null,
          alt: imageFormAlt.trim() || imageFormTitle.trim(),
          notice: imageFormNotice.trim(),
          try_it: imageFormTryIt.trim(),
          palette: imageFormPalette,
          active: true
        })
      });
      const insertData = await insertRes.json();
      if (!insertRes.ok) {
        throw new Error(insertData.error || 'Failed to save inspiration record');
      }

      setAllImages(prev => [insertData.image, ...prev]);
      setIsUploadingImage(false);
      setNewImageFile(null);
      setNewImagePreview(null);
      setImageFormTitle('');
      setImageFormCredit('');
      setImageFormAlt('');
      setImageFormNotice('');
      setImageFormTryIt('');
      showToast('New inspiration image added to library');
    } catch (err) {
      console.error('Upload error:', err);
      showToast(err.message || 'Error uploading photo');
    } finally {
      setIsSavingImage(false);
    }
  };

  // Update existing image in Library
  const handleSaveEditImage = async () => {
    if (!editingImage) return;
    try {
      setIsSavingImage(true);
      const res = await fetch('/api/journal/inspiration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingImage.id,
          title: imageFormTitle.trim(),
          credit: imageFormCredit.trim() || null,
          alt: imageFormAlt.trim(),
          notice: imageFormNotice.trim(),
          try_it: imageFormTryIt.trim(),
          palette: imageFormPalette
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update image');

      setAllImages(prev => prev.map(item => item.id === editingImage.id ? data.image : item));
      if (todayImage?.id === editingImage.id) {
        setTodayImage(data.image);
      }
      setEditingImage(null);
      showToast('Inspiration details updated');
    } catch (err) {
      console.error('Update image error:', err);
      showToast(err.message || 'Error updating details');
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleStartEditImage = (img) => {
    setEditingImage(img);
    setImageFormTitle(img.title || '');
    setImageFormCredit(img.credit || '');
    setImageFormAlt(img.alt || '');
    setImageFormNotice(img.notice || '');
    setImageFormTryIt(img.try_it || '');
    setImageFormPalette(Array.isArray(img.palette) && img.palette.length === 3 ? img.palette : ['#FAF8F5', '#34292A', '#BDD3E2']);
  };

  // Notes Drawer Handlers
  const handleOpenNotes = async () => {
    setIsNotesOpen(true);
    try {
      const res = await fetch('/api/journal/learning-notes');
      if (res.ok) {
        const data = await res.json();
        setAllNotes(data.allNotes || []);
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  };

  const handleStartCreateNote = () => {
    setIsCreatingNote(true);
    setEditingNote(null);
    setNoteFormTitle('');
    setNoteFormBody('');
    setNoteFormLinkUrl('');
    setNoteFormLinkLabel('');
    setNoteFormColors([
      { label: 'Base 60%', color: '#FAF8F5', pct: 60 },
      { label: 'Depth 30%', color: '#34292A', pct: 30 },
      { label: 'Accent 10%', color: '#BDD3E2', pct: 10 }
    ]);
  };

  const handleStartEditNote = (note) => {
    setEditingNote(note);
    setIsCreatingNote(false);
    setNoteFormTitle(note.title || '');
    setNoteFormBody(note.body || '');
    setNoteFormLinkUrl(note.link_url || '');
    setNoteFormLinkLabel(note.link_label || '');
    setNoteFormColors(Array.isArray(note.color_bar) ? note.color_bar : []);
  };

  const handleSaveNote = async () => {
    if (!noteFormTitle.trim() || !noteFormBody.trim()) {
      showToast('Title and body are required');
      return;
    }
    try {
      setIsSavingNote(true);
      const isEdit = Boolean(editingNote);
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        title: noteFormTitle.trim(),
        body: noteFormBody.trim(),
        color_bar: noteFormColors.length > 0 ? noteFormColors : null,
        link_url: noteFormLinkUrl.trim() || null,
        link_label: noteFormLinkLabel.trim() || null
      };
      if (isEdit) payload.id = editingNote.id;

      const res = await fetch('/api/journal/learning-notes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save note');

      if (isEdit) {
        setAllNotes(prev => prev.map(n => n.id === data.note.id ? data.note : n));
        if (learningNote?.id === data.note.id) setLearningNote(data.note);
      } else {
        setAllNotes(prev => [data.note, ...prev]);
        setLearningNote(data.note);
      }

      setEditingNote(null);
      setIsCreatingNote(false);
      showToast(isEdit ? 'Note updated' : 'New note published to Journal');
    } catch (err) {
      console.error('Note save error:', err);
      showToast(err.message || 'Error saving note');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Helper to render two-tone title: first part regular, second part italic
  const renderEditorialTitle = (titleStr) => {
    if (!titleStr) return null;
    if (titleStr.includes(':')) {
      const parts = titleStr.split(':');
      return (
        <>
          {parts[0]}: <em>{parts.slice(1).join(':').trim()}</em>
        </>
      );
    }
    const words = titleStr.trim().split(' ');
    if (words.length <= 2) return titleStr;
    const splitIndex = Math.ceil(words.length / 2);
    const firstPart = words.slice(0, splitIndex).join(' ');
    const secondPart = words.slice(splitIndex).join(' ');
    return (
      <>
        {firstPart} <em>{secondPart}</em>
      </>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <span style={{
          fontFamily: 'var(--font-script)',
          fontSize: '24px',
          color: 'var(--burgundy)'
        }}>
          Preparing The Studio Journal...
        </span>
      </div>
    );
  }

  const issueNumber = stats?.daysSinceStart || 109;
  const ownerFirstName = (stats?.firstName || 'Florencia').toUpperCase();
  const latestProject = stats?.latestProject;
  const studyingProperty = stats?.studyingProperty;
  const instagramTickedDays = stats?.instagramTracker?.tickedDays || [];
  const nextBooking = stats?.nextBooking;
  const projectsOverTargetCount = stats?.projectsOverTargetCount || 0;

  return (
    <div className="studio-journal-container" style={{
      maxWidth: '1160px',
      margin: '0 auto',
      paddingBottom: '80px',
      boxSizing: 'border-box'
    }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--espresso, #1E1509)',
          color: '#FAF8F5',
          fontFamily: 'var(--font-sans)',
          fontSize: '12.5px',
          padding: '12px 20px',
          borderRadius: '50px',
          boxShadow: '0 8px 24px rgba(30, 21, 9, 0.25)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <span style={{ color: 'var(--burgundy, #BDD3E2)' }}>✦</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =====================================================================
          MASTHEAD (Centered, editorial, dated, script accent)
          ===================================================================== */}
      <header style={{
        textAlign: 'center',
        paddingTop: '8px',
        paddingBottom: '36px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '40px'
      }}>
        {/* Today's Date in Handwritten Script */}
        <div style={{ marginBottom: '8px' }}>
          <span style={{
            fontFamily: "var(--font-script, 'Dreams on Paper', cursive)",
            fontSize: '26px',
            color: 'var(--burgundy, #41101B)',
            display: 'inline-block',
            transform: 'rotate(-2deg)',
            letterSpacing: '0.02em',
            userSelect: 'none'
          }}>
            {formatDate()}
          </span>
        </div>

        {/* Issue Eyebrow */}
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--muted, #52453C)',
          marginBottom: '12px'
        }}>
          ISSUE NO. {issueNumber} · FOR {ownerFirstName}
        </div>

        {/* Serif H1 Display Title */}
        <h1 style={{
          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
          fontSize: 'clamp(44px, 5.8vw, 72px)',
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: '-0.025em',
          color: 'var(--espresso, #1E1509)',
          margin: '0 0 10px 0'
        }}>
          The Studio Journal
        </h1>

        {/* Italic Serif Subtitle (Same color as title) */}
        <p style={{
          fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
          fontSize: 'clamp(17px, 2.2vw, 21px)',
          fontStyle: 'italic',
          color: 'var(--espresso, #1E1509)',
          margin: '0 auto',
          maxWidth: '680px',
          lineHeight: 1.45,
          opacity: 0.9
        }}>
          Design, deals & discoveries — a page for a curious mind.
        </p>
      </header>

      {/* =====================================================================
          01 · TODAY'S INSPIRATION
          ===================================================================== */}
      <section style={{ marginBottom: '56px' }}>
        {/* Section Header with Numeral */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '18px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <Numeral number="01" size="md" color="var(--burgundy)" />
            <Eyebrow style={{ margin: 0 }}>TODAY'S INSPIRATION</Eyebrow>
          </div>

          <button
            type="button"
            onClick={handleOpenLibrary}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--burgundy, #41101B)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 0',
              transition: 'opacity 0.2s ease'
            }}
          >
            Inspiration library →
          </button>
        </div>

        {todayImage ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {/* Image Container with Credit Overlay */}
            <div style={{
              position: 'relative',
              width: '100%',
              maxHeight: '520px',
              backgroundColor: 'var(--beige, #F2EFEA)',
              overflow: 'hidden'
            }}>
              <img
                src={todayImage.url}
                alt={todayImage.alt || todayImage.title || 'Inspiration image'}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '520px',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />

              {/* Photo Credit Overlay (Bottom-Right) */}
              {todayImage.credit && (
                <div style={{
                  position: 'absolute',
                  bottom: '16px',
                  right: '16px',
                  backgroundColor: 'rgba(30, 21, 9, 0.65)',
                  backdropFilter: 'blur(8px)',
                  color: 'var(--on-dark, #FAF8F5)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}>
                  {todayImage.credit}
                </div>
              )}
            </div>

            {/* Content Body Beneath Image */}
            <div style={{ padding: '32px 36px 36px 36px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '28px',
                alignItems: 'start'
              }}>
                {/* Left: Title + Notice */}
                <div>
                  <h2 style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: 'clamp(26px, 3vw, 36px)',
                    fontWeight: 400,
                    lineHeight: 1.15,
                    color: 'var(--espresso, #1E1509)',
                    margin: '0 0 12px 0',
                    letterSpacing: '-0.02em'
                  }}>
                    {todayImage.title}
                  </h2>

                  <p style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '15px',
                    lineHeight: 1.6,
                    color: 'var(--espresso, #1E1509)',
                    margin: '0 0 20px 0'
                  }}>
                    {todayImage.notice}
                  </p>

                  {/* 3 Color Swatches */}
                  {Array.isArray(todayImage.palette) && todayImage.palette.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--muted, #52453C)'
                      }}>
                        Palette:
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {todayImage.palette.map((hex, idx) => (
                          <div
                            key={idx}
                            title={hex}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              backgroundColor: hex,
                              border: '1px solid rgba(30, 21, 9, 0.15)',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Beige "TRY IT" Box + Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{
                    backgroundColor: 'var(--beige, #F2EFEA)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '20px 24px'
                  }}>
                    <span style={{
                      display: 'block',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--burgundy, #41101B)',
                      marginBottom: '8px'
                    }}>
                      TRY IT
                    </span>
                    <p style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      lineHeight: 1.55,
                      color: 'var(--espresso, #1E1509)',
                      margin: 0,
                      fontWeight: 500
                    }}>
                      {todayImage.try_it}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Button
                      variant="primary"
                      onClick={handleOpenMoodboardModal}
                    >
                      SAVE TO MOOD BOARD →
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={handleNextImage}
                      disabled={imageRotating}
                    >
                      {imageRotating ? 'SHUFFLING...' : 'NEW IMAGE'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              No active inspiration images in library.
            </p>
            <Button variant="secondary" onClick={handleOpenLibrary}>
              OPEN LIBRARY MANAGER →
            </Button>
          </Card>
        )}
      </section>

      {/* =====================================================================
          TWO-COLUMN GRID: 02 (WHAT I'M LEARNING) & 03 (ON MY DESK)
          ===================================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '32px',
        marginBottom: '56px'
      }}>
        {/* -------------------------------------------------------------------
            02 · WHAT I'M LEARNING
            ------------------------------------------------------------------- */}
        <section>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '18px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
              <Numeral number="02" size="md" color="var(--burgundy)" />
              <Eyebrow style={{ margin: 0 }}>WHAT I'M LEARNING</Eyebrow>
            </div>

            <button
              type="button"
              onClick={handleOpenNotes}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--burgundy, #41101B)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 0'
              }}
            >
              All notes →
            </button>
          </div>

          <Card style={{ padding: '32px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 50px)', boxSizing: 'border-box' }}>
            {learningNote ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Serif Title with Italic Second Line/Half */}
                <h3 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '24px',
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: 'var(--espresso, #1E1509)',
                  margin: '0 0 16px 0',
                  letterSpacing: '-0.015em'
                }}>
                  {renderEditorialTitle(learningNote.title)}
                </h3>

                {/* Multiline Body */}
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14.5px',
                  lineHeight: 1.65,
                  color: 'var(--text-2, #4A413A)',
                  marginBottom: '24px',
                  whiteSpace: 'pre-line',
                  flex: 1
                }}>
                  {learningNote.body}
                </div>

                {/* Color-Proportion Bar if Present */}
                {Array.isArray(learningNote.color_bar) && learningNote.color_bar.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{
                      display: 'flex',
                      height: '14px',
                      borderRadius: '50px',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      marginBottom: '8px'
                    }}>
                      {learningNote.color_bar.map((seg, sIdx) => (
                        <div
                          key={sIdx}
                          title={`${seg.label || ''} (${seg.pct}%)`}
                          style={{
                            width: `${seg.pct}%`,
                            backgroundColor: seg.color || '#CCC',
                            height: '100%'
                          }}
                        />
                      ))}
                    </div>
                    {/* Legend */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {learningNote.color_bar.map((seg, sIdx) => (
                        <span key={sIdx} style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '11px',
                          color: 'var(--muted, #52453C)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: seg.color
                          }} />
                          {seg.pct}% {seg.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional Link */}
                {learningNote.link_url && (
                  <div style={{ paddingTop: '8px' }}>
                    <a
                      href={learningNote.link_url}
                      target={learningNote.link_url.startsWith('http') ? '_blank' : '_self'}
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--burgundy, #41101B)',
                        textDecoration: 'none'
                      }}
                    >
                      {learningNote.link_label || 'Explore notes →'}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
                  No learning notes created yet.
                </p>
                <Button variant="secondary" size="sm" onClick={handleOpenNotes}>
                  WRITE FIRST NOTE →
                </Button>
              </div>
            )}
          </Card>
        </section>

        {/* -------------------------------------------------------------------
            03 · ON MY DESK
            ------------------------------------------------------------------- */}
        <section>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '18px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
              <Numeral number="03" size="md" color="var(--burgundy)" />
              <Eyebrow style={{ margin: 0 }}>ON MY DESK</Eyebrow>
            </div>
          </div>

          <Card style={{ padding: '32px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 50px)', boxSizing: 'border-box' }}>
            {latestProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Serif Project Name */}
                <h3 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '26px',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  color: 'var(--espresso, #1E1509)',
                  margin: '0 0 6px 0',
                  letterSpacing: '-0.02em'
                }}>
                  {latestProject.name}
                </h3>

                {/* Progress / Status Line */}
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13.5px',
                  color: 'var(--muted, #52453C)',
                  margin: '0 0 20px 0'
                }}>
                  {latestProject.roomsCount || 0} {latestProject.roomsCount === 1 ? 'room' : 'rooms'} · {formatCurrency(latestProject.totalSpent)} spent
                  {latestProject.target_budget ? ` of ${formatCurrency(latestProject.target_budget)} budget` : ''}
                </p>

                {/* Mini Mood Board Mosaic */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  marginBottom: '24px',
                  flex: 1
                }}>
                  {Array.isArray(latestProject.moodImages) && latestProject.moodImages.length > 0 ? (
                    latestProject.moodImages.slice(0, 3).map((img, idx) => (
                      <div
                        key={idx}
                        style={{
                          aspectRatio: '1',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          backgroundColor: 'var(--beige, #F2EFEA)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <img
                          src={img.blob_url}
                          alt={img.caption || 'Room mood tile'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))
                  ) : (
                    // Elegant placeholder tiles
                    ['#FAF8F5', '#F2EFEA', '#EAE6E1'].map((bg, idx) => (
                      <div
                        key={idx}
                        style={{
                          aspectRatio: '1',
                          borderRadius: '10px',
                          backgroundColor: bg,
                          border: '1px dashed var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--muted)'
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', opacity: 0.6 }}>
                          Tile {idx + 1}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Action: Jump to Designer Hub */}
                <div style={{ marginTop: 'auto' }}>
                  <Button
                    variant="primary"
                    onClick={() => setActiveTab && setActiveTab('designer')}
                  >
                    CONTINUE IN DESIGNER HUB →
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
                  No active projects on your desk yet.
                </p>
                <Button
                  variant="primary"
                  onClick={() => setActiveTab && setActiveTab('designer')}
                >
                  CREATE FIRST PROJECT →
                </Button>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* =====================================================================
          04 · A DEAL I'M STUDYING (Dark Espresso Card)
          ===================================================================== */}
      <section style={{ marginBottom: '56px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '18px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <Numeral number="04" size="md" color="var(--burgundy)" />
            <Eyebrow style={{ margin: 0 }}>A DEAL I'M STUDYING</Eyebrow>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--espresso, #1E1509)',
          borderRadius: 'var(--radius-card)',
          padding: '36px 40px',
          color: 'var(--on-dark, #FAF8F5)',
          boxShadow: 'var(--shadow-floating)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {studyingProperty ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '32px',
              alignItems: 'center'
            }}>
              <div>
                {/* Eyebrow badge */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(250, 248, 245, 0.1)',
                  padding: '4px 12px',
                  borderRadius: '50px',
                  marginBottom: '14px'
                }}>
                  <span style={{ color: 'var(--burgundy, #BDD3E2)' }}>★</span>
                  <span style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--eyebrow-on-dark, #E6DFD7)'
                  }}>
                    {studyingProperty.is_studying ? 'PINNED STUDY' : 'LATEST PROPERTY'}
                  </span>
                </div>

                {/* Serif H2 Address */}
                <h2 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: 'clamp(28px, 3.4vw, 42px)',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  color: 'var(--on-dark, #FAF8F5)',
                  margin: '0 0 10px 0',
                  letterSpacing: '-0.02em'
                }}>
                  {studyingProperty.address}
                </h2>

                {/* Price Line: Asking vs Comp avg */}
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '15px',
                  color: 'var(--on-dark-muted, #E6DFD7)',
                  margin: '0 0 20px 0',
                  letterSpacing: '0.01em'
                }}>
                  <strong style={{ color: '#FAF8F5' }}>{formatCurrency(studyingProperty.list_price)}</strong> asking
                  {studyingProperty.avgComp ? (
                    <>
                      {' · '}
                      <strong style={{ color: '#FAF8F5' }}>{formatCurrency(studyingProperty.avgComp)}</strong> avg comps
                      {studyingProperty.list_price && (
                        <span style={{ color: Number(studyingProperty.avgComp) >= Number(studyingProperty.list_price) ? '#7ECB94' : '#E88B80', marginLeft: '6px' }}>
                          ({Number(studyingProperty.avgComp) >= Number(studyingProperty.list_price) ? '+' : '−'}
                          {formatCurrency(Math.abs(Number(studyingProperty.avgComp) - Number(studyingProperty.list_price)))} spread)
                        </span>
                      )}
                    </>
                  ) : ' · Comps being compiled'}
                </p>

                {/* Note displayed as an italic serif question */}
                <p style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: 'clamp(16px, 2vw, 20px)',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                  color: 'rgba(250, 248, 245, 0.92)',
                  margin: 0
                }}>
                  "{studyingProperty.notes || 'Can we convert the rear garage into an ADU while preserving the courtyard pool?'}"
                </p>
              </div>

              {/* Action Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                <Button
                  variant="cream-on-dark"
                  size="lg"
                  onClick={() => setActiveTab && setActiveTab('investor')}
                >
                  KEEP STUDYING →
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '22px',
                fontStyle: 'italic',
                margin: '0 0 16px 0'
              }}>
                No deals marked for study yet.
              </p>
              <Button
                variant="cream-on-dark"
                onClick={() => setActiveTab && setActiveTab('investor')}
              >
                BROWSE INVESTOR STUDIO →
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          QUIET ESSENTIALS LINE (Next Cal.com booking, Instagram posts, target projects)
          ===================================================================== */}
      <section style={{ marginBottom: '40px' }}>
        <div style={{
          backgroundColor: 'var(--sand, #F7F3EE)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '24px'
        }}>
          {/* 1. Next Cal.com Consultation (Gracefully skip if none) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(65, 16, 27, 0.08)',
              color: 'var(--burgundy, #41101B)'
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </span>
            <div>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted, #52453C)'
              }}>
                CONSULTATIONS
              </span>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--espresso, #1E1509)'
              }}>
                {nextBooking ? (
                  `${new Date(nextBooking.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${nextBooking.attendee}`
                ) : (
                  'No upcoming bookings'
                )}
              </span>
            </div>
          </div>

          {/* 2. Weekly Instagram Tracker (7 Clickable day ticks) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted, #52453C)'
            }}>
              INSTAGRAM THIS WEEK:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {DAY_LABELS.map((dayLabel, idx) => {
                const isTicked = instagramTickedDays.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleToggleInstagramDay(idx)}
                    title={`Click to toggle ${dayLabel} post status`}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: isTicked ? 'none' : '1px solid var(--border-strong)',
                      backgroundColor: isTicked ? 'var(--burgundy, #41101B)' : 'transparent',
                      color: isTicked ? '#FAF8F5' : 'var(--muted, #52453C)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {dayLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Designer Hub Projects Over Target */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: projectsOverTargetCount > 0 ? 'var(--negative, #8A2A1E)' : 'var(--positive, #3F5A3A)'
            }} />
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--espresso, #1E1509)'
            }}>
              {projectsOverTargetCount === 0
                ? 'All projects on budget'
                : `${projectsOverTargetCount} project${projectsOverTargetCount === 1 ? '' : 's'} over budget`}
            </span>
          </div>
        </div>
      </section>

      {/* =====================================================================
          TODAY IN THE LAB TEASER CARD
          ===================================================================== */}
      <section>
        <Card
          hoverable
          onClick={() => setIsLabModalOpen(true)}
          style={{
            padding: '24px 32px',
            backgroundColor: '#FAF8F5',
            border: '1px dashed var(--border-strong)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--burgundy, #41101B)'
              }}>
                THE LAB
              </span>
              <Pill variant="neutral" size="sm">COMING SOON</Pill>
            </div>

            <h4 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '20px',
              fontWeight: 400,
              color: 'var(--espresso, #1E1509)',
              margin: '0 0 4px 0'
            }}>
              Today in the Lab →
            </h4>

            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13.5px',
              color: 'var(--muted, #52453C)',
              margin: 0
            }}>
              Interactive experiments in daylight orientation, material tactility & spatial acoustics.
            </p>
          </div>

          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--burgundy, #41101B)'
          }}>
            PREVIEW EXPERIMENT →
          </span>
        </Card>
      </section>

      {/* =====================================================================
          MODAL: SAVE TO MOOD BOARD
          ===================================================================== */}
      {isMoodboardModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(27, 19, 13, 0.48)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 1200
          }}
        >
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-card)',
            maxWidth: '480px',
            width: '100%',
            padding: '32px',
            boxShadow: 'var(--shadow-floating)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '24px',
                fontWeight: 400,
                color: 'var(--espresso, #1E1509)',
                margin: 0
              }}>
                Save to Mood Board
              </h3>
              <button
                type="button"
                onClick={() => setIsMoodboardModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)' }}
              >
                ✕
              </button>
            </div>

            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13.5px',
              color: 'var(--muted, #52453C)',
              margin: '0 0 20px 0'
            }}>
              Pin "{todayImage?.title}" directly to any active room board in Designer Hub.
            </p>

            {/* Project Picker */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: '6px'
              }}>
                Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--espresso)'
                }}
              >
                {designerProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Room Picker */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: '6px'
              }}>
                Room
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--espresso)'
                }}
              >
                {projectRooms.length > 0 ? (
                  projectRooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.room_type || 'Room'})</option>
                  ))
                ) : (
                  <option value="">No rooms created in this project</option>
                )}
              </select>
            </div>

            {/* Caption */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: '6px'
              }}>
                Caption / Note
              </label>
              <input
                type="text"
                value={moodboardCaption}
                onChange={(e) => setMoodboardCaption(e.target.value)}
                placeholder="Evocative caption"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsMoodboardModalOpen(false)}
              >
                CANCEL
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSavingMoodboard || !selectedRoomId}
                onClick={handleConfirmSaveToMoodboard}
              >
                {isSavingMoodboard ? 'SAVING...' : 'SAVE IMAGE →'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DRAWER: INSPIRATION LIBRARY MANAGER
          ===================================================================== */}
      <SidePanel
        isOpen={isLibraryOpen}
        onClose={() => {
          setIsLibraryOpen(false);
          setEditingImage(null);
          setIsUploadingImage(false);
        }}
        eyebrow="STUDIO JOURNAL ARCHIVE"
        title="Inspiration Library"
        width="620px"
      >
        <div style={{ padding: '24px 0' }}>
          {/* Header Action: Add New Photo */}
          {!isUploadingImage && !editingImage && (
            <div style={{ marginBottom: '24px' }}>
              <Button
                variant="primary"
                onClick={() => {
                  setIsUploadingImage(true);
                  setImageFormTitle('');
                  setImageFormCredit('');
                  setImageFormAlt('');
                  setImageFormNotice('Notice ');
                  setImageFormTryIt('');
                  setNewImagePreview(null);
                  setNewImageFile(null);
                }}
              >
                + UPLOAD NEW INSPIRATION →
              </Button>
            </div>
          )}

          {/* Upload or Edit Form */}
          {(isUploadingImage || editingImage) && (
            <div style={{
              backgroundColor: 'var(--sand, #F7F3EE)',
              padding: '24px',
              borderRadius: '14px',
              marginBottom: '32px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '20px',
                  margin: 0,
                  color: 'var(--espresso)'
                }}>
                  {editingImage ? `Edit "${editingImage.title}"` : 'Upload Inspiration Photo'}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadingImage(false);
                    setEditingImage(null);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
                >
                  ✕
                </button>
              </div>

              {/* Photo Input (Upload mode only) */}
              {isUploadingImage && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    marginBottom: '6px'
                  }}>
                    Select Photo (JPEG, max 2000px, EXIF stripped)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageFileChange}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: '13px' }}
                  />
                  {newImagePreview && (
                    <div style={{ marginTop: '12px', width: '100%', maxHeight: '200px', overflow: 'hidden', borderRadius: '8px' }}>
                      <img src={newImagePreview} alt="Preview" style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Title (2–4 words, evocative)
                </label>
                <input
                  type="text"
                  value={imageFormTitle}
                  onChange={(e) => setImageFormTitle(e.target.value)}
                  placeholder="e.g. Timber Atrium"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Credit */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Credit (e.g. "Photo: Alex Rusciano" or empty)
                </label>
                <input
                  type="text"
                  value={imageFormCredit}
                  onChange={(e) => setImageFormCredit(e.target.value)}
                  placeholder="Photo: Name"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Notice Sentence */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Notice sentence (max ~18 words, start with "Notice")
                </label>
                <input
                  type="text"
                  value={imageFormNotice}
                  onChange={(e) => setImageFormNotice(e.target.value)}
                  placeholder="Notice how..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Try It Sentence */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Try it move (one imperative sentence, max ~16 words)
                </label>
                <input
                  type="text"
                  value={imageFormTryIt}
                  onChange={(e) => setImageFormTryIt(e.target.value)}
                  placeholder="e.g. Ground a soft wall color with one dark, glossy door."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Alt Text */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Alt text (descriptive, accessibility)
                </label>
                <input
                  type="text"
                  value={imageFormAlt}
                  onChange={(e) => setImageFormAlt(e.target.value)}
                  placeholder="Detailed visual description"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Palette Hexes */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Palette Swatches (3 Hex colors)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[0, 1, 2].map(idx => (
                    <input
                      key={idx}
                      type="text"
                      value={imageFormPalette[idx] || '#FAF8F5'}
                      onChange={(e) => {
                        const next = [...imageFormPalette];
                        next[idx] = e.target.value;
                        setImageFormPalette(next);
                      }}
                      style={{
                        width: '33%',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-strong)',
                        fontFamily: 'monospace',
                        fontSize: '12px'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsUploadingImage(false);
                    setEditingImage(null);
                  }}
                >
                  CANCEL
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isSavingImage}
                  onClick={editingImage ? handleSaveEditImage : handleUploadNewImage}
                >
                  {isSavingImage ? 'SAVING...' : (editingImage ? 'SAVE CHANGES →' : 'PUBLISH PHOTO →')}
                </Button>
              </div>
            </div>
          )}

          {/* List of Images */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {allImages.map(img => (
              <div
                key={img.id}
                style={{
                  display: 'flex',
                  gap: '16px',
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border)',
                  alignItems: 'center'
                }}
              >
                <div style={{
                  width: '90px',
                  height: '68px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--beige)',
                  flexShrink: 0
                }}>
                  <img src={img.url} alt={img.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h5 style={{
                      fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                      fontSize: '17px',
                      margin: 0,
                      color: 'var(--espresso)'
                    }}>
                      {img.title}
                    </h5>
                    {img.credit && (
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
                        ({img.credit})
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    color: 'var(--muted)',
                    margin: '0 0 6px 0',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {img.notice}
                  </p>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {Array.isArray(img.palette) && img.palette.map((h, i) => (
                      <span
                        key={i}
                        title={h}
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          backgroundColor: h,
                          display: 'inline-block',
                          border: '1px solid rgba(0,0,0,0.1)'
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Actions: Toggle Active + Edit */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleToggleImageActive(img)}
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      borderRadius: '50px',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      backgroundColor: img.active ? 'rgba(63, 90, 58, 0.12)' : 'rgba(138, 42, 30, 0.1)',
                      color: img.active ? 'var(--positive)' : 'var(--negative)'
                    }}
                  >
                    {img.active ? '● Active' : '○ Inactive'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartEditImage(img)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      color: 'var(--burgundy)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Edit details →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SidePanel>

      {/* =====================================================================
          DRAWER: WHAT I'M LEARNING ALL NOTES
          ===================================================================== */}
      <SidePanel
        isOpen={isNotesOpen}
        onClose={() => {
          setIsNotesOpen(false);
          setEditingNote(null);
          setIsCreatingNote(false);
        }}
        eyebrow="STUDIO JOURNAL ARCHIVE"
        title="Learning Notes"
        width="600px"
      >
        <div style={{ padding: '24px 0' }}>
          {!isCreatingNote && !editingNote && (
            <div style={{ marginBottom: '24px' }}>
              <Button
                variant="primary"
                onClick={handleStartCreateNote}
              >
                + WRITE NEW NOTE →
              </Button>
            </div>
          )}

          {/* Note Form */}
          {(isCreatingNote || editingNote) && (
            <div style={{
              backgroundColor: 'var(--sand, #F7F3EE)',
              padding: '24px',
              borderRadius: '14px',
              marginBottom: '32px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: '20px',
                  margin: 0,
                  color: 'var(--espresso)'
                }}>
                  {editingNote ? 'Edit Learning Note' : 'New Learning Note'}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingNote(false);
                    setEditingNote(null);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
                >
                  ✕
                </button>
              </div>

              {/* Note Title */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Title (use a colon for italic subtitle, e.g. "The 60-30-10 Rule: distribution that breathes")
                </label>
                <input
                  type="text"
                  value={noteFormTitle}
                  onChange={(e) => setNoteFormTitle(e.target.value)}
                  placeholder="Title: subtitle"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}
                />
              </div>

              {/* Note Body */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                  Body Notes
                </label>
                <textarea
                  rows={6}
                  value={noteFormBody}
                  onChange={(e) => setNoteFormBody(e.target.value)}
                  placeholder="Write clear, directorial thoughts..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', boxSizing: 'border-box', lineHeight: 1.5 }}
                />
              </div>

              {/* Color Bar Config */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                  Proportion Bar (Optional 3 Segments: Label, Hex, %)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {noteFormColors.map((seg, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={seg.label}
                        onChange={(e) => {
                          const next = [...noteFormColors];
                          next[idx].label = e.target.value;
                          setNoteFormColors(next);
                        }}
                        placeholder="Label"
                        style={{ width: '40%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}
                      />
                      <input
                        type="text"
                        value={seg.color}
                        onChange={(e) => {
                          const next = [...noteFormColors];
                          next[idx].color = e.target.value;
                          setNoteFormColors(next);
                        }}
                        placeholder="#Hex"
                        style={{ width: '35%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                      <input
                        type="number"
                        value={seg.pct}
                        onChange={(e) => {
                          const next = [...noteFormColors];
                          next[idx].pct = Number(e.target.value);
                          setNoteFormColors(next);
                        }}
                        placeholder="%"
                        style={{ width: '25%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Link Url & Label */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                    Link URL
                  </label>
                  <input
                    type="text"
                    value={noteFormLinkUrl}
                    onChange={(e) => setNoteFormLinkUrl(e.target.value)}
                    placeholder="e.g. /news"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                    Link Label
                  </label>
                  <input
                    type="text"
                    value={noteFormLinkLabel}
                    onChange={(e) => setNoteFormLinkLabel(e.target.value)}
                    placeholder="e.g. Read guidelines →"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-sans)', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsCreatingNote(false);
                    setEditingNote(null);
                  }}
                >
                  CANCEL
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isSavingNote}
                  onClick={handleSaveNote}
                >
                  {isSavingNote ? 'SAVING...' : (editingNote ? 'SAVE CHANGES →' : 'PUBLISH NOTE →')}
                </Button>
              </div>
            </div>
          )}

          {/* Notes List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {allNotes.map(n => (
              <div
                key={n.id}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h5 style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '18px',
                    margin: 0,
                    color: 'var(--espresso)'
                  }}>
                    {renderEditorialTitle(n.title)}
                  </h5>
                  <button
                    type="button"
                    onClick={() => handleStartEditNote(n)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      color: 'var(--burgundy)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Edit →
                  </button>
                </div>

                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: 'var(--text-2)',
                  margin: '0 0 10px 0',
                  whiteSpace: 'pre-line'
                }}>
                  {n.body}
                </p>

                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
                  Published {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </SidePanel>

      {/* =====================================================================
          MODAL: TODAY IN THE LAB PREVIEW
          ===================================================================== */}
      {isLabModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(27, 19, 13, 0.48)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 1200
          }}
        >
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-card)',
            maxWidth: '560px',
            width: '100%',
            padding: '40px',
            boxShadow: 'var(--shadow-floating)',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{
                fontFamily: "var(--font-script, 'Dreams on Paper', cursive)",
                fontSize: '28px',
                color: 'var(--burgundy, #41101B)'
              }}>
                Coming Soon
              </span>
            </div>

            <Eyebrow style={{ margin: '0 0 12px 0' }}>THE LEARNING LAB</Eyebrow>

            <h3 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: '32px',
              fontWeight: 400,
              color: 'var(--espresso)',
              margin: '0 0 16px 0',
              letterSpacing: '-0.02em'
            }}>
              Laboratory for Architectural Curiosity
            </h3>

            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14.5px',
              lineHeight: 1.65,
              color: 'var(--text-2)',
              margin: '0 auto 28px auto',
              maxWidth: '460px'
            }}>
              We are assembling an interactive suite of real-time design simulations: sun-angle daylight calculators, texture-reflectance testing, and finish tactility studies for high-end residential interiors.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <Button
                variant="primary"
                onClick={() => setIsLabModalOpen(false)}
              >
                RETURN TO JOURNAL →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
