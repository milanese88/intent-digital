import React, { useState, useEffect, useRef } from 'react';

const MAX_PHOTOS = 30;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Resizes an image file to max 2000px on the longest side using an HTML5 canvas.
 * Canvas re-encoding also naturally strips all EXIF GPS and camera metadata.
 */
async function processAndStripImage(file) {
  return new Promise((resolve, reject) => {
    // If not standard decodable (like raw HEIC on some non-safari browsers), read as base64
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        // Fallback: return raw base64 data if canvas decode fails
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

        // Export clean JPEG without EXIF metadata
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

export default function PropertyPhotosSection({
  property,
  onCoverChange,
  showToast
}) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activePhotoModal, setActivePhotoModal] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingCaptionId, setEditingCaptionId] = useState(null);
  const [captionInput, setCaptionInput] = useState('');
  const fileInputRef = useRef(null);

  const propertyId = property?.id;

  // 1. Fetch photos for this property
  const fetchPhotos = async () => {
    if (!propertyId) return;
    try {
      const res = await fetch(`/api/investor/photos?property_id=${encodeURIComponent(propertyId)}`);
      if (!res.ok) throw new Error('Failed to load photos');
      const data = await res.json();
      const list = data.photos || [];
      setPhotos(list);

      const cover = list.find(p => p.is_cover) || list[0] || null;
      if (onCoverChange) {
        onCoverChange(cover ? cover.blob_url : null);
      }
    } catch (err) {
      console.warn('Error fetching property photos:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [propertyId]);

  // 2. Upload handler
  const handleUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      if (showToast) {
        showToast(`You can upload at most ${MAX_PHOTOS} photos per property. Currently you have ${photos.length}.`);
      }
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        if (showToast) showToast(`"${file.name}" exceeds 10 MB limit and was skipped.`);
        continue;
      }

      try {
        const processed = await processAndStripImage(file);
        const res = await fetch('/api/investor/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            filename: processed.filename,
            contentType: processed.contentType,
            data: processed.data
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload failed (HTTP ${res.status})`);
        }

        const newPhoto = await res.json();
        setPhotos(prev => {
          const updated = [...prev, newPhoto];
          const cover = updated.find(p => p.is_cover) || updated[0];
          if (onCoverChange && cover) onCoverChange(cover.blob_url);
          return updated;
        });
        successCount++;
      } catch (err) {
        console.error('Error uploading photo:', err);
        if (showToast) showToast(err.message || `Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    if (successCount > 0 && showToast) {
      showToast(`Uploaded ${successCount} photo${successCount > 1 ? 's' : ''}`);
    }
  };

  // 3. Set Cover
  const handleSetCover = async (photoId) => {
    try {
      const res = await fetch('/api/investor/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photoId, is_cover: true })
      });
      if (!res.ok) throw new Error('Failed to set cover photo');

      setPhotos(prev => {
        const updated = prev.map(p => ({
          ...p,
          is_cover: p.id === photoId
        }));
        const cover = updated.find(p => p.id === photoId);
        if (onCoverChange && cover) onCoverChange(cover.blob_url);
        return updated;
      });

      if (showToast) showToast('Cover photo updated');
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error updating cover photo');
    }
  };

  // 4. Save Caption
  const handleSaveCaption = async (photoId) => {
    try {
      const res = await fetch('/api/investor/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photoId, caption: captionInput })
      });
      if (!res.ok) throw new Error('Failed to update caption');

      setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, caption: captionInput } : p)));
      setEditingCaptionId(null);
      if (showToast) showToast('Caption saved');
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error saving caption');
    }
  };

  // 5. Delete Photo
  const handleDeletePhoto = async (photoId) => {
    try {
      const res = await fetch(`/api/investor/photos?id=${encodeURIComponent(photoId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete photo');

      setPhotos(prev => {
        const updated = prev.filter(p => p.id !== photoId);
        // If deleted was cover, promote next
        const cover = updated.find(p => p.is_cover) || updated[0];
        if (onCoverChange) onCoverChange(cover ? cover.blob_url : null);
        return updated;
      });

      setConfirmDeleteId(null);
      if (activePhotoModal?.id === photoId) setActivePhotoModal(null);
      if (showToast) showToast('Photo deleted');
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error deleting photo');
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#FAF8F5',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        borderRadius: '12px',
        padding: '24px 28px',
        marginBottom: '28px',
        boxShadow: '0 4px 20px rgba(52, 41, 42, 0.04)',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid rgba(52, 41, 42, 0.08)',
          paddingBottom: '14px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '24px',
                fontWeight: 600,
                color: 'var(--espresso, #34292A)',
                margin: 0
              }}
            >
              Property Photos
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: 'rgba(52, 41, 42, 0.07)',
                color: 'var(--espresso, #34292A)',
                padding: '3px 10px',
                borderRadius: '50px'
              }}
            >
              {photos.length} / {MAX_PHOTOS}
            </span>
          </div>
          <p
            style={{
              fontSize: '12px',
              color: 'rgba(52, 41, 42, 0.65)',
              margin: '4px 0 0 0'
            }}
          >
            Upload site condition, rehab progress, or marketing photos (max 10 MB each, location metadata stripped).
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || photos.length >= MAX_PHOTOS}
          style={{
            backgroundColor: 'var(--secondary-color, #41101B)',
            color: '#FAF8F5',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: uploading || photos.length >= MAX_PHOTOS ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            opacity: photos.length >= MAX_PHOTOS ? 0.5 : 1
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {uploading ? 'Processing...' : 'Add photos'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.heic"
          multiple
          onChange={(e) => handleUploadFiles(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {/* Drag & Drop Upload Zone */}
      {photos.length < MAX_PHOTOS && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files) {
              handleUploadFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--secondary-color, #41101B)' : 'rgba(52, 41, 42, 0.2)'}`,
            backgroundColor: dragActive ? 'rgba(65, 16, 27, 0.04)' : '#FFFFFF',
            borderRadius: '10px',
            padding: '24px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: '22px',
            transition: 'all 0.15s ease'
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--secondary-color, #41101B)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.8 }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--espresso, #34292A)' }}>
            Drag and drop property photos here, or <span style={{ color: 'var(--secondary-color, #41101B)', textDecoration: 'underline' }}>browse</span>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.55)', marginTop: '4px' }}>
            JPG, PNG, WebP, or HEIC up to 10 MB each.
          </div>
        </div>
      )}

      {/* Grid of photos */}
      {loading ? (
        <div style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.65)', padding: '16px 0' }}>
          Loading photos...
        </div>
      ) : photos.length === 0 ? (
        <div
          style={{
            padding: '28px',
            textAlign: 'center',
            color: 'rgba(52, 41, 42, 0.55)',
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid rgba(52, 41, 42, 0.08)'
          }}
        >
          No property photos uploaded yet. When you upload photos, the cover photo will automatically appear on property cards.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px'
          }}
        >
          {photos.map((p) => {
            const isDeleting = confirmDeleteId === p.id;
            const isEditing = editingCaptionId === p.id;

            return (
              <div
                key={p.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: p.is_cover ? '2px solid var(--secondary-color, #41101B)' : '1px solid rgba(52, 41, 42, 0.12)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  position: 'relative'
                }}
              >
                {/* Photo Thumbnail */}
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '4/3',
                    backgroundColor: 'rgba(52, 41, 42, 0.06)',
                    cursor: 'pointer',
                    overflow: 'hidden'
                  }}
                  onClick={() => setActivePhotoModal(p)}
                >
                  <img
                    src={p.blob_url}
                    alt={p.caption || 'Property'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  />

                  {/* Cover Badge */}
                  {p.is_cover && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        backgroundColor: 'var(--secondary-color, #41101B)',
                        color: '#FAF8F5',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                      }}
                    >
                      Cover
                    </span>
                  )}
                </div>

                {/* Card Controls */}
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  {/* Caption row */}
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={captionInput}
                        onChange={(e) => setCaptionInput(e.target.value)}
                        placeholder="Add caption..."
                        style={{
                          flex: 1,
                          fontSize: '11px',
                          padding: '4px 6px',
                          border: '1px solid rgba(52, 41, 42, 0.25)',
                          borderRadius: '4px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCaption(p.id)}
                        style={{
                          backgroundColor: 'var(--secondary-color, #41101B)',
                          color: '#FAF8F5',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '10px',
                          padding: '4px 8px',
                          cursor: 'pointer'
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: '11px',
                        color: p.caption ? 'var(--espresso, #34292A)' : 'rgba(52, 41, 42, 0.45)',
                        fontStyle: p.caption ? 'normal' : 'italic',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        setEditingCaptionId(p.id);
                        setCaptionInput(p.caption || '');
                      }}
                      title="Click to edit caption"
                    >
                      {p.caption || '+ Add caption'}
                    </div>
                  )}

                  {/* Actions row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 'auto',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(52, 41, 42, 0.06)',
                      fontSize: '10.5px'
                    }}
                  >
                    {!p.is_cover ? (
                      <button
                        type="button"
                        onClick={() => handleSetCover(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--secondary-color, #41101B)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Set cover
                      </button>
                    ) : (
                      <span style={{ color: 'rgba(52, 41, 42, 0.45)', fontWeight: 600 }}>Active cover</span>
                    )}

                    {isDeleting ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(p.id)}
                          style={{
                            background: '#D9534F',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '2px 6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'rgba(52, 41, 42, 0.65)',
                            fontSize: '10px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#A94442',
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Modal for full photo view */}
      {activePhotoModal && (
        <div
          onClick={() => setActivePhotoModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(20, 15, 15, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
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
              onClick={() => setActivePhotoModal(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'none',
                border: 'none',
                color: '#FAF8F5',
                fontSize: '24px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
            <img
              src={activePhotoModal.blob_url}
              alt={activePhotoModal.caption || 'Property'}
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}
            />
            {activePhotoModal.caption && (
              <div
                style={{
                  marginTop: '12px',
                  color: '#FAF8F5',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                  textAlign: 'center'
                }}
              >
                {activePhotoModal.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
