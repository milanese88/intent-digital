import React, { useState, useEffect } from 'react';

export default function EmailTemplates() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  
  const [editForm, setEditForm] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email-templates');
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.templates || []);
      } else {
        setErrorMsg('Failed to load templates.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleEditClick = (template) => {
    setActiveTemplate(template.id);
    setEditForm({ ...template });
    setStatusMessage('');
    setErrorMsg('');
  };

  const handleFormChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    if (!editForm) return;
    
    setSaving(true);
    setStatusMessage('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          id: editForm.id,
          name: editForm.name,
          subject: editForm.subject,
          body: editForm.body
        })
      });

      if (res.ok) {
        setStatusMessage('Template saved successfully.');
        await fetchTemplates(); // Refresh the list
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to save template.');
      }
    } catch (err) {
      setErrorMsg('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const activateTemplate = async (id, category) => {
    setStatusMessage('');
    setErrorMsg('');
    
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'activate',
          id,
          category
        })
      });

      if (res.ok) {
        setStatusMessage('Template activated successfully.');
        await fetchTemplates();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to activate template.');
      }
    } catch (err) {
      setErrorMsg('Network error while activating.');
    }
  };

  if (loading && templates.length === 0) {
    return <div style={{ padding: '24px' }}>Loading templates...</div>;
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ 
        fontFamily: '"Atelier Fleur", serif', 
        fontSize: '42px', 
        letterSpacing: '-0.02em', 
        color: '#34292A',
        margin: '0 0 32px 0'
      }}>
        Email Templates
      </h1>

      {errorMsg && <p style={{ color: 'red', marginBottom: '16px' }}>{errorMsg}</p>}
      {statusMessage && <p style={{ color: '#34292A', fontWeight: 500, marginBottom: '16px' }}>{statusMessage}</p>}

      <div style={{ 
        backgroundColor: '#fff', 
        border: '1px solid rgba(52, 41, 42, 0.1)', 
        borderRadius: '8px', 
        padding: '32px',
        marginBottom: '32px'
      }}>
        <h2 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '28px', color: '#34292A', margin: '0 0 24px 0' }}>Available Templates</h2>
        
        <div style={{ display: 'grid', gap: '16px' }}>
          {templates.map(t => (
            <div 
              key={t.id} 
              style={{
                border: '1px solid rgba(52, 41, 42, 0.2)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: activeTemplate === t.id ? 'rgba(52, 41, 42, 0.03)' : 'transparent',
                cursor: 'pointer'
              }}
              onClick={() => handleEditClick(t)}
            >
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#34292A' }}>{t.name}</h3>
                <span style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', textTransform: 'uppercase' }}>
                  Category: {t.category}
                </span>
              </div>
              <div>
                {t.is_active ? (
                  <span style={{ 
                    backgroundColor: '#859DCE', 
                    color: '#fff', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase'
                  }}>
                    Active
                  </span>
                ) : (
                  <button 
                    className="btn btn-pill-primary"
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      activateTemplate(t.id, t.category);
                    }}
                  >
                    Use This Template
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editForm && (
        <div style={{ 
          backgroundColor: '#fff', 
          border: '1px solid rgba(52, 41, 42, 0.1)', 
          borderRadius: '8px', 
          padding: '32px'
        }}>
          <h2 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '28px', color: '#34292A', margin: '0 0 24px 0' }}>
            Edit: {editForm.name}
          </h2>

          <form onSubmit={saveTemplate} style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label className="form-pill-label" htmlFor="name">Template Name</label>
              <input 
                className="form-pill-input" 
                id="name" 
                name="name" 
                value={editForm.name} 
                onChange={handleFormChange} 
                required
              />
            </div>
            <div>
              <label className="form-pill-label" htmlFor="subject">Email Subject</label>
              <input 
                className="form-pill-input" 
                id="subject" 
                name="subject" 
                value={editForm.subject || ''} 
                onChange={handleFormChange} 
                required
              />
            </div>
            <div>
              <label className="form-pill-label" htmlFor="body">Email Body (Plain Text)</label>
              <textarea 
                className="form-pill-input" 
                id="body" 
                name="body" 
                value={editForm.body || ''} 
                onChange={handleFormChange} 
                rows={12}
                style={{ 
                  resize: 'vertical',
                  borderRadius: '12px',
                  padding: '16px',
                  fontFamily: 'Montserrat, sans-serif'
                }}
                required
              />
              <p style={{ fontSize: '12px', color: 'rgba(52, 41, 42, 0.6)', marginTop: '8px', fontFamily: 'Montserrat' }}>
                Available placeholders: {'{{name}}'}, {'{{email}}'}, {'{{message}}'}
              </p>
            </div>

            <button type="submit" className="btn btn-pill-primary" style={{ width: 'fit-content' }} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          {/* Live Preview */}
          <div style={{ marginTop: '48px', borderTop: '1px solid rgba(52, 41, 42, 0.1)', paddingTop: '32px' }}>
            <h3 style={{ fontFamily: '"Atelier Fleur", serif', fontSize: '20px', color: '#34292A', marginBottom: '16px' }}>Live Preview</h3>
            <div style={{ 
              backgroundColor: '#FAF8F5', 
              padding: '24px', 
              borderRadius: '8px',
              border: '1px solid rgba(52, 41, 42, 0.1)',
              fontFamily: 'Montserrat, sans-serif'
            }}>
              <p style={{ margin: '0 0 16px 0', borderBottom: '1px solid rgba(52, 41, 42, 0.1)', paddingBottom: '16px' }}>
                <strong>Subject:</strong> {editForm.subject 
                  ? editForm.subject.replace(/\{\{name\}\}/g, 'Jane Doe')
                                    .replace(/\{\{email\}\}/g, 'jane@example.com')
                                    .replace(/\{\{message\}\}/g, 'I love your work!')
                  : ''}
              </p>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '14px', color: '#34292A' }}>
                {editForm.body 
                  ? editForm.body.replace(/\{\{name\}\}/g, 'Jane Doe')
                                 .replace(/\{\{email\}\}/g, 'jane@example.com')
                                 .replace(/\{\{message\}\}/g, 'I love your work!')
                  : ''}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
