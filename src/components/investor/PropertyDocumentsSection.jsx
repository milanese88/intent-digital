import React, { useState, useEffect, useRef } from 'react';

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PropertyDocumentsSection({ property, showToast }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const propertyId = property?.id;

  const fetchDocuments = async () => {
    if (!propertyId) return;
    try {
      const res = await fetch(`/api/investor/documents?property_id=${encodeURIComponent(propertyId)}`);
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.warn('Error fetching property documents:', err.message);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [propertyId]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      if (showToast) showToast('File exceeds 25 MB limit.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const res = await fetch('/api/investor/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: propertyId,
              title: file.name.replace(/\.[^/.]+$/, ''),
              data: base64Data,
              filename: file.name
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Upload failed');
          }

          const resData = await res.json();
          if (resData.document) {
            setDocuments(prev => [resData.document, ...prev]);
            if (showToast) showToast('Document saved successfully.');
          }
        } catch (err) {
          console.error('Error saving document:', err);
          if (showToast) showToast(`Error saving document: ${err.message}`);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File read error:', err);
      setUploading(false);
    } finally {
      e.target.value = '';
    }
  };

  const handleDelete = async (docId) => {
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/investor/documents?id=${encodeURIComponent(docId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error('Failed to delete document');
      }
      setDocuments(prev => prev.filter(d => d.id !== docId));
      setConfirmDeleteId(null);
      if (showToast) showToast('Document deleted.');
    } catch (err) {
      console.error('Delete error:', err);
      if (showToast) showToast(err.message || 'Error deleting document');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #E4DDD3',
      borderRadius: '20px',
      padding: '24px 28px',
      marginTop: '28px',
      boxShadow: '0 4px 16px rgba(27, 19, 13, 0.03)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--secondary-color, #41101B)'
          }}>
            DOCUMENTS & DEAL REPORTS
          </span>
          <span style={{
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '11px',
            fontWeight: 700,
            color: 'rgba(52, 41, 42, 0.5)',
            backgroundColor: 'rgba(52, 41, 42, 0.06)',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {documents.length}
          </span>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: 'none',
              border: '1px solid rgba(65, 16, 27, 0.25)',
              borderRadius: '50px',
              padding: '6px 14px',
              color: 'var(--secondary-color, #41101B)',
              fontSize: '11.5px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {uploading ? 'Uploading...' : '+ Upload document'}
          </button>
        </div>
      </div>

      {/* Document List */}
      {loading ? (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'rgba(52, 41, 42, 0.5)',
          fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
        }}>
          Loading property documents...
        </div>
      ) : documents.length === 0 ? (
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          backgroundColor: '#FAF8F5',
          borderRadius: '12px',
          border: '1px dashed rgba(52, 41, 42, 0.15)'
        }}>
          <p style={{
            margin: '0 0 6px 0',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--espresso, #34292A)'
          }}>
            No documents saved for this property yet
          </p>
          <p style={{
            margin: 0,
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
            fontSize: '12px',
            color: 'rgba(52, 41, 42, 0.55)',
            lineHeight: 1.45
          }}>
            Generate and save a Deal Report from the Deal tab, or upload inspection reports and acquisition files above.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {documents.map((doc) => {
            const dateStr = doc.created_at
              ? new Date(doc.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })
              : '';
            const isConfirming = confirmDeleteId === doc.id;
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: '#FAF8F5',
                  border: '1px solid rgba(52, 41, 42, 0.08)',
                  borderRadius: '10px',
                  gap: '12px'
                }}
              >
                {/* Left: Icon & Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(65, 16, 27, 0.08)',
                    color: 'var(--secondary-color, #41101B)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '10px',
                    letterSpacing: '0.04em',
                    flexShrink: 0
                  }}>
                    PDF
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--espresso, #34292A)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {doc.title || 'Deal Report'}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11px',
                      color: 'rgba(52, 41, 42, 0.55)',
                      marginTop: '2px'
                    }}>
                      {dateStr}
                      {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <a
                    href={doc.blob_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--secondary-color, #41101B)',
                      textDecoration: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(65, 16, 27, 0.06)'
                    }}
                  >
                    Open PDF ↗
                  </a>

                  {isConfirming ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        disabled={isDeleting}
                        style={{
                          backgroundColor: '#b91c1c',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: isDeleting ? 'wait' : 'pointer'
                        }}
                      >
                        {isDeleting ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        style={{
                          backgroundColor: 'transparent',
                          color: 'rgba(52, 41, 42, 0.7)',
                          border: '1px solid rgba(52, 41, 42, 0.2)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(doc.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(52, 41, 42, 0.45)',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                      title="Delete document"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
