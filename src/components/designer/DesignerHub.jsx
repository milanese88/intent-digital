import React, { useState, useEffect, useRef } from 'react';
import AddressAutocomplete from '../investor/AddressAutocomplete.jsx';

const PROJECT_TYPES = [
  { value: 'client', label: 'Client' },
  { value: 'investor', label: 'Investor' },
  { value: 'concept', label: 'Concept' },
  { value: 'coursework', label: 'Coursework' }
];

const PROJECT_STATUSES = [
  { value: 'concept', label: 'Concept', bg: '#F4EFEA', color: '#6A5649' },
  { value: 'in_design', label: 'In Design', bg: '#EBF1F7', color: '#274D73' },
  { value: 'in_progress', label: 'In Progress', bg: '#FCF3E5', color: '#8A5816' },
  { value: 'complete', label: 'Complete', bg: '#E9F5ED', color: '#1B6334' },
  { value: 'on_hold', label: 'On Hold', bg: '#EFEFEC', color: '#63635E' }
];

const STYLE_OPTIONS = [
  'Modern Organic',
  'Warm Minimalist',
  'Japandi',
  'Coastal Contemporary',
  'Mid-Century Modern',
  'Transitional',
  'Mediterranean Revival',
  'Industrial Chic'
];

const QUICK_ROOMS = [
  'Kitchen',
  'Primary bath',
  'Guest bath',
  'Living room',
  'Bedrooms',
  'Front of house'
];

const DESIGNER_TABS = [
  { id: 'projects', label: 'Projects' },
  { id: 'studio', label: 'Design studio' },
  { id: 'budget', label: 'Budget & costs' },
  { id: 'sourcing', label: 'Sourcing library' },
  { id: 'portfolio', label: 'Portfolio' }
];

export default function DesignerHub({ setActiveDashboardTab }) {
  const [projects, setProjects] = useState([]);
  const [investorProperties, setInvestorProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab & selected project from URL
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('designer_tab') || 'projects';
    }
    return 'projects';
  });

  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('project_id') || null;
    }
    return null;
  });

  // Slide-in panel state (add / edit)
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formType, setFormType] = useState('concept');
  const [formStatus, setFormStatus] = useState('concept');
  const [formStyle, setFormStyle] = useState('');
  const [formTargetBudget, setFormTargetBudget] = useState('');
  const [formContingencyPct, setFormContingencyPct] = useState('10');
  const [formInvestorPropId, setFormInvestorPropId] = useState('');
  const [formCoverUrl, setFormCoverUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formRooms, setFormRooms] = useState([]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Project switcher dropdown state
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  // Sync state with URL params
  const updateUrl = (tab, projId) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'designer');
    if (tab) {
      url.searchParams.set('designer_tab', tab);
    }
    if (projId) {
      url.searchParams.set('project_id', projId);
    } else {
      url.searchParams.delete('project_id');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    updateUrl(newTab, selectedProjectId);
  };

  const handleSelectProject = (projId, andGoToStudio = false) => {
    setSelectedProjectId(projId);
    const targetTab = andGoToStudio ? 'studio' : activeTab;
    if (andGoToStudio) {
      setActiveTab('studio');
    }
    updateUrl(targetTab, projId);
    setSwitcherOpen(false);
  };

  // Close switcher dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch projects and investor properties on load
  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/designer/projects');
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized. Please log in to access Designer Hub.');
        }
        throw new Error(`Failed to load projects (HTTP ${res.status})`);
      }
      const data = await res.json();
      const list = data.projects || [];
      setProjects(list);

      // Auto-select first project if none selected and projects exist
      setSelectedProjectId(prev => {
        if (prev && list.some(p => p.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (err) {
      console.error('fetchProjects error:', err);
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvestorProperties = async () => {
    try {
      const res = await fetch('/api/investor/properties');
      if (res.ok) {
        const data = await res.json();
        setInvestorProperties(data.properties || []);
      }
    } catch (err) {
      console.warn('Could not load investor properties for linking:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchInvestorProperties();
  }, []);

  // Handle URL pre-fill from Investor Studio ("Design this property →")
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const linkedPropId = params.get('new_project_property_id');
    if (linkedPropId && investorProperties.length > 0) {
      const prop = investorProperties.find(p => p.id === linkedPropId);
      if (prop) {
        handleOpenNewProject(prop);
        // Clear param
        const url = new URL(window.location.href);
        url.searchParams.delete('new_project_property_id');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [investorProperties]);

  // Current selected project object
  const currentProject = projects.find(p => p.id === selectedProjectId) || projects[0] || null;

  // Open New Project Drawer
  const handleOpenNewProject = (prefillProp = null) => {
    setEditingProject(null);
    if (prefillProp) {
      setFormName(`${prefillProp.address} Design`);
      setFormLocation(`${prefillProp.address}${prefillProp.city ? ', ' + prefillProp.city : ''}`);
      setFormType('investor');
      setFormStatus('concept');
      setFormStyle('');
      setFormTargetBudget(prefillProp.list_price ? String(Math.round(Number(prefillProp.list_price) * 0.1)) : '');
      setFormContingencyPct('10');
      setFormInvestorPropId(prefillProp.id);
      setFormCoverUrl(prefillProp.cover_photo_url || '');
      setFormNotes(`Linked to Investor Studio property at ${prefillProp.address}.`);
      setFormRooms(['Kitchen', 'Primary bath', 'Living room', 'Bedrooms']);
    } else {
      setFormName('');
      setFormLocation('');
      setFormType('concept');
      setFormStatus('concept');
      setFormStyle('');
      setFormTargetBudget('');
      setFormContingencyPct('10');
      setFormInvestorPropId('');
      setFormCoverUrl('');
      setFormNotes('');
      setFormRooms([]);
    }
    setFormError(null);
    setIsPanelOpen(true);
  };

  // Open Edit Project Drawer
  const handleOpenEditProject = (proj, e) => {
    if (e) e.stopPropagation();
    setEditingProject(proj);
    setFormName(proj.name || '');
    setFormLocation(proj.location || '');
    setFormType(proj.project_type || 'concept');
    setFormStatus(proj.status || 'concept');
    setFormStyle(proj.style || '');
    setFormTargetBudget(proj.target_budget != null ? String(proj.target_budget) : '');
    setFormContingencyPct(proj.contingency_pct != null ? String(proj.contingency_pct) : '10');
    setFormInvestorPropId(proj.investor_property_id || '');
    setFormCoverUrl(proj.cover_url || '');
    setFormNotes(proj.notes || '');
    setFormRooms([]);
    setFormError(null);
    setIsPanelOpen(true);
  };

  // Save Project (POST or PUT)
  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Project name is required.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    const payload = {
      name: formName.trim(),
      location: formLocation.trim() || null,
      project_type: formType,
      status: formStatus,
      style: formStyle.trim() || null,
      target_budget: formTargetBudget ? Number(formTargetBudget.replace(/[$,]/g, '')) : null,
      contingency_pct: formContingencyPct ? Number(formContingencyPct.replace(/[%,]/g, '')) : 10,
      investor_property_id: formInvestorPropId || null,
      cover_url: formCoverUrl.trim() || null,
      notes: formNotes.trim() || null,
      initial_rooms: editingProject ? [] : formRooms
    };

    try {
      let res;
      if (editingProject) {
        res = await fetch(`/api/designer/projects?id=${editingProject.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/designer/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save project');
      }

      const result = await res.json();
      setIsPanelOpen(false);
      await fetchProjects();

      if (result.project?.id) {
        handleSelectProject(result.project.id);
      }
    } catch (err) {
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete Project with confirmation
  const handleDeleteProject = async (proj, e) => {
    if (e) e.stopPropagation();
    const confirmed = window.confirm('Delete this project and all its rooms, images and items?');
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/designer/projects?id=${proj.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to delete project');
      }
      if (selectedProjectId === proj.id) {
        setSelectedProjectId(null);
      }
      await fetchProjects();
    } catch (err) {
      alert(`Error deleting project: ${err.message}`);
    }
  };

  // Calculate stats for Projects Tab
  const activeCount = projects.filter(p => p.status === 'in_design' || p.status === 'in_progress').length;
  const conceptCount = projects.filter(p => p.status === 'concept').length;
  const portfolioCount = projects.filter(p => p.status === 'complete').length;
  const totalBudgets = projects.reduce((acc, p) => acc + (Number(p.target_budget) || 0), 0);

  const formatCurrency = (val) => {
    if (val == null || isNaN(val)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#FAF8F4', position: 'relative' }}>
      <style>{`
        .designer-hero-band {
          background-color: #1B130D;
          background-image: linear-gradient(180deg, #1B130D 0%, #241812 100%);
          color: #FAF8F4;
          padding: 64px 32px 0 32px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
        }
        .designer-hero-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .designer-hero-eyebrow {
          display: block;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #E9DFD2;
          margin-bottom: 14px;
        }
        .designer-hero-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 24px;
          margin-bottom: 36px;
        }
        .designer-hero-title {
          font-family: var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif);
          font-size: clamp(34px, 4.5vw, 52px);
          font-weight: 300;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: #FAF8F4;
          margin: 0;
        }
        .designer-hero-title em {
          font-family: var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif);
          font-style: italic;
          font-weight: 400;
          color: #E9B08F;
        }
        .designer-hero-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .designer-pill-btn {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 10px 22px;
          border-radius: 50px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .designer-pill-outline {
          background: transparent;
          border: 1px solid rgba(233, 223, 210, 0.35);
          color: #E9DFD2;
        }
        .designer-pill-outline:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .designer-pill-terracotta {
          background-color: #C05A2A;
          border: 1px solid #C05A2A;
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(192, 90, 42, 0.35);
        }
        .designer-pill-terracotta:hover {
          background-color: #A84B1F;
          border-color: #A84B1F;
          transform: translateY(-1px);
        }

        /* Project Switcher Bar */
        .designer-switcher-bar {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(233, 223, 210, 0.12);
          border-radius: 12px;
          padding: 14px 20px;
          margin-bottom: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .designer-switcher-left {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .designer-switcher-name {
          font-family: var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif);
          font-size: 22px;
          font-weight: 400;
          color: #FAF8F4;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .designer-switcher-meta {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 12px;
          color: #E9DFD2;
          opacity: 0.75;
          letter-spacing: 0.04em;
        }
        .designer-linked-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(192, 90, 42, 0.15);
          border: 1px solid rgba(192, 90, 42, 0.35);
          border-radius: 50px;
          padding: 4px 12px;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 600;
          color: #E9B08F;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .designer-linked-pill:hover {
          background: rgba(192, 90, 42, 0.28);
          border-color: #C05A2A;
          color: #FAF8F4;
        }

        /* Bottom edge tabs */
        .designer-tabs-row {
          display: flex;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
          margin-bottom: -1px;
        }
        .designer-tabs-row::-webkit-scrollbar {
          display: none;
        }
        .designer-tab-btn {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 14px 22px;
          border-radius: 12px 12px 0 0;
          border: 1px solid transparent;
          border-bottom: none;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .designer-tab-btn.active {
          background-color: #FAF8F4;
          color: #1B130D;
          border-color: rgba(228, 221, 211, 0.8);
          box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
        }
        .designer-tab-btn:not(.active) {
          background: transparent;
          color: #E9DFD2;
          opacity: 0.7;
        }
        .designer-tab-btn:not(.active):hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.05);
        }

        /* Content Area */
        .designer-body {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 32px 80px 32px;
        }

        /* Stat tiles */
        .designer-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 40px;
        }
        .designer-stat-card {
          background: #ffffff;
          border: 1px solid #E4DDD3;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 4px 18px rgba(27, 19, 13, 0.03);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .designer-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(27, 19, 13, 0.06);
        }
        .designer-stat-label {
          display: block;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(52, 41, 42, 0.55);
          margin-bottom: 10px;
        }
        .designer-stat-val {
          font-family: var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif);
          font-size: 32px;
          font-weight: 400;
          color: #1B130D;
          line-height: 1;
        }

        /* Project Cards Grid */
        .designer-projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 24px;
        }
        .designer-project-card {
          background: #ffffff;
          border: 1px solid #E4DDD3;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 4px 18px rgba(27, 19, 13, 0.03);
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }
        .designer-project-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(27, 19, 13, 0.08);
          border-color: #C05A2A;
        }
        .designer-card-cover {
          height: 190px;
          width: 100%;
          position: relative;
          background: linear-gradient(135deg, #3A1418 0%, #C05A2A 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .designer-card-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        .designer-project-card:hover .designer-card-cover img {
          transform: scale(1.03);
        }
        .designer-card-initials {
          font-family: var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif);
          font-size: 42px;
          font-style: italic;
          color: rgba(255, 255, 255, 0.65);
        }
        .designer-card-body {
          padding: 24px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .designer-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .designer-card-title {
          font-family: var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif);
          font-size: 24px;
          font-weight: 400;
          color: #1B130D;
          margin: 0 0 6px 0;
          line-height: 1.2;
        }
        .designer-card-location {
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 12px;
          color: rgba(52, 41, 42, 0.65);
          margin-bottom: 16px;
        }
        .designer-card-footer {
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid rgba(52, 41, 42, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 12px;
          color: #1B130D;
        }

        /* Slide Panel */
        .designer-panel-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(27, 19, 13, 0.5);
          backdrop-filter: blur(2px);
          z-index: 999;
        }
        .designer-slide-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 540px;
          max-width: 100vw;
          background: #ffffff;
          box-shadow: -8px 0 32px rgba(27, 19, 13, 0.18);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .designer-field-group {
          margin-bottom: 18px;
        }
        .designer-field-label {
          display: block;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #1B130D;
          margin-bottom: 6px;
        }
        .designer-field-input,
        .designer-field-select,
        .designer-field-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(52, 41, 42, 0.18);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: var(--font-sans, "Montserrat", sans-serif);
          font-size: 13px;
          color: #1B130D;
          background: #FAF8F5;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .designer-field-input:focus,
        .designer-field-select:focus,
        .designer-field-textarea:focus {
          outline: none;
          border-color: #C05A2A;
          background: #ffffff;
        }

        @media (max-width: 900px) {
          .designer-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .designer-hero-band {
            padding: 48px 20px 0 20px;
          }
          .designer-body {
            padding: 30px 20px 60px 20px;
          }
        }
        @media (max-width: 600px) {
          .designer-stats-grid {
            grid-template-columns: 1fr;
          }
          .designer-hero-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .designer-hero-title {
            font-size: 32px;
          }
        }
      `}</style>

      {/* ========================================================================= */}
      {/* 4. HEADER (shared by all Designer Hub tabs)                                */}
      {/* ========================================================================= */}
      <section className="designer-hero-band">
        <div className="designer-hero-inner">
          <span className="designer-hero-eyebrow">DESIGNER HUB · STUDIO</span>

          <div className="designer-hero-row">
            <div>
              <h1 className="designer-hero-title">
                Design the space. <em>Own the budget.</em>
              </h1>
            </div>

            <div className="designer-hero-actions">
              <button
                type="button"
                className="designer-pill-btn designer-pill-outline"
                disabled
                title="Coming in Stage 2"
              >
                + NEW MOOD BOARD
              </button>

              <button
                type="button"
                className="designer-pill-btn designer-pill-terracotta"
                onClick={() => handleOpenNewProject()}
              >
                + NEW PROJECT
              </button>
            </div>
          </div>

          {/* Project Switcher Bar (when projects exist) */}
          {currentProject && (
            <div className="designer-switcher-bar">
              <div className="designer-switcher-left">
                {/* Switcher title with dropdown */}
                <div style={{ position: 'relative' }} ref={switcherRef}>
                  <div
                    className="designer-switcher-name"
                    onClick={() => setSwitcherOpen(prev => !prev)}
                    title="Switch project"
                  >
                    <span>{currentProject.name}</span>
                    <span style={{ fontSize: '13px', opacity: 0.6 }}>▾</span>
                  </div>

                  {switcherOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      backgroundColor: '#241812',
                      border: '1px solid rgba(233, 223, 210, 0.2)',
                      borderRadius: '12px',
                      padding: '8px 0',
                      boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
                      zIndex: 100,
                      minWidth: '260px'
                    }}>
                      <div style={{
                        padding: '6px 16px',
                        fontFamily: 'Montserrat, sans-serif',
                        fontSize: '10px',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#E9DFD2',
                        opacity: 0.5
                      }}>
                        YOUR PROJECTS ({projects.length})
                      </div>
                      {projects.map(p => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProject(p.id)}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: p.id === currentProject.id ? 'rgba(192, 90, 42, 0.2)' : 'transparent',
                            color: p.id === currentProject.id ? '#E9B08F' : '#FAF8F4',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (p.id !== currentProject.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                          }}
                          onMouseLeave={(e) => {
                            if (p.id !== currentProject.id) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span style={{ fontFamily: 'Georgia, serif', fontSize: '15px' }}>{p.name}</span>
                          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '11px', opacity: 0.6 }}>
                            {p.location || 'No location'} · {p.project_type}
                          </span>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px solid rgba(233, 223, 210, 0.1)', marginTop: '6px', paddingTop: '6px' }}>
                        <div
                          onClick={() => { setSwitcherOpen(false); handleOpenNewProject(); }}
                          style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontFamily: 'Montserrat, sans-serif',
                            fontSize: '11px',
                            color: '#E9B08F',
                            fontWeight: 600
                          }}
                        >
                          + Create new project
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="designer-switcher-meta">
                  {currentProject.location ? `${currentProject.location} · ` : ''}
                  <span style={{ textTransform: 'capitalize' }}>{currentProject.project_type}</span>
                  {currentProject.style ? ` · ${currentProject.style}` : ''}
                </div>
              </div>

              {/* Linked to Investor Studio pill */}
              {currentProject.investor_property_id && (
                <div
                  className="designer-linked-pill"
                  onClick={() => {
                    if (typeof setActiveDashboardTab === 'function') {
                      setActiveDashboardTab('investor');
                    }
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location.href);
                      url.searchParams.set('tab', 'investor');
                      url.searchParams.set('property', currentProject.investor_property_id);
                      window.history.pushState({}, '', url.toString());
                      window.location.reload();
                    }
                  }}
                  title="Open this property in Investor Studio"
                >
                  <span>🏛 Linked to Investor Studio · {currentProject.investor_property_address || 'Property'} &rarr;</span>
                </div>
              )}
            </div>
          )}

          {/* Bottom Edge Tabs */}
          <div className="designer-tabs-row">
            {DESIGNER_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`designer-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. TAB CONTENT                                                            */}
      {/* ========================================================================= */}
      <main className="designer-body">
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: 'Montserrat, sans-serif' }}>
            <p style={{ color: 'rgba(52, 41, 42, 0.6)' }}>Loading Designer Hub...</p>
          </div>
        )}

        {error && (
          <div style={{
            padding: '16px 20px',
            backgroundColor: '#FDEEE9',
            border: '1px solid #EFA795',
            borderRadius: '12px',
            color: '#A82B13',
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '13px',
            marginBottom: '24px'
          }}>
            {error}
          </div>
        )}

        {!loading && activeTab === 'projects' && (
          <div>
            {/* Stat tiles */}
            <div className="designer-stats-grid">
              <div className="designer-stat-card">
                <span className="designer-stat-label">Active Projects</span>
                <span className="designer-stat-val">{activeCount}</span>
              </div>
              <div className="designer-stat-card">
                <span className="designer-stat-label">Concepts</span>
                <span className="designer-stat-val">{conceptCount}</span>
              </div>
              <div className="designer-stat-card">
                <span className="designer-stat-label">In Portfolio</span>
                <span className="designer-stat-val">{portfolioCount}</span>
              </div>
              <div className="designer-stat-card">
                <span className="designer-stat-label">Budgets Tracked</span>
                <span className="designer-stat-val">{formatCurrency(totalBudgets)}</span>
              </div>
            </div>

            {/* Empty State */}
            {projects.length === 0 ? (
              <div style={{
                background: '#ffffff',
                border: '1px dashed #E4DDD3',
                borderRadius: '24px',
                padding: '64px 32px',
                textAlign: 'center',
                maxWidth: '640px',
                margin: '0 auto'
              }}>
                <div style={{ fontSize: '42px', marginBottom: '16px' }}>🎨</div>
                <h3 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif)',
                  fontSize: '26px',
                  fontWeight: 400,
                  color: '#1B130D',
                  margin: '0 0 10px 0'
                }}>
                  No projects yet
                </h3>
                <p style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '14px',
                  color: 'rgba(52, 41, 42, 0.65)',
                  lineHeight: 1.6,
                  margin: '0 auto 24px auto',
                  maxWidth: '460px'
                }}>
                  No projects yet — start with a concept or link a property from Investor Studio.
                </p>
                <button
                  type="button"
                  className="designer-pill-btn designer-pill-terracotta"
                  onClick={() => handleOpenNewProject()}
                >
                  + Create your first project
                </button>
              </div>
            ) : (
              /* Projects Grid */
              <div className="designer-projects-grid">
                {projects.map(proj => {
                  const statusObj = PROJECT_STATUSES.find(s => s.value === proj.status) || PROJECT_STATUSES[0];
                  const budgetVal = Number(proj.target_budget) || 0;
                  const contPct = Number(proj.contingency_pct) || 10;
                  const initials = (proj.name || 'P').substring(0, 2).toUpperCase();

                  return (
                    <div
                      key={proj.id}
                      className="designer-project-card"
                      onClick={() => handleSelectProject(proj.id, true)}
                    >
                      {/* Cover */}
                      <div className="designer-card-cover">
                        {proj.cover_url ? (
                          <img src={proj.cover_url} alt={proj.name} />
                        ) : (
                          <div className="designer-card-initials">{initials}</div>
                        )}
                      </div>

                      {/* Card Body */}
                      <div className="designer-card-body">
                        <div className="designer-card-header">
                          <span style={{
                            backgroundColor: statusObj.bg,
                            color: statusObj.color,
                            padding: '3px 10px',
                            borderRadius: '50px',
                            fontFamily: 'Montserrat, sans-serif',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase'
                          }}>
                            {statusObj.label}
                          </span>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditProject(proj, e)}
                              title="Edit project"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(52, 41, 42, 0.45)',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '4px'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#C05A2A'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(52, 41, 42, 0.45)'; }}
                            >
                              ✎
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteProject(proj, e)}
                              title="Delete project"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(52, 41, 42, 0.45)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                padding: '4px'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#A82B13'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(52, 41, 42, 0.45)'; }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <h3 className="designer-card-title">{proj.name}</h3>

                        <div className="designer-card-location">
                          {proj.location ? `${proj.location} · ` : ''}
                          <span style={{ textTransform: 'capitalize' }}>{proj.project_type}</span>
                          {proj.style ? ` · ${proj.style}` : ''}
                        </div>

                        {proj.investor_property_address && (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginBottom: '12px',
                            fontFamily: 'Montserrat, sans-serif',
                            fontSize: '11px',
                            color: '#C05A2A'
                          }}>
                            <span>🏛 {proj.investor_property_address}</span>
                          </div>
                        )}

                        <div className="designer-card-footer">
                          <span>
                            <strong>{proj.room_count || 0}</strong> {Number(proj.room_count) === 1 ? 'room' : 'rooms'}
                          </span>

                          <span style={{ textAlign: 'right' }}>
                            {budgetVal > 0 ? (
                              <span>
                                <strong>{formatCurrency(budgetVal)}</strong>
                                <span style={{ opacity: 0.6, fontSize: '11px', marginLeft: '4px' }}>
                                  +{contPct}% cont.
                                </span>
                              </span>
                            ) : (
                              <span style={{ opacity: 0.5 }}>No budget set</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Placeholder for tabs other than Projects */}
        {!loading && activeTab !== 'projects' && (
          <div style={{
            background: '#ffffff',
            border: '1px solid #E4DDD3',
            borderRadius: '24px',
            padding: '80px 32px',
            textAlign: 'center',
            maxWidth: '720px',
            margin: '0 auto'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '18px' }}>
              {activeTab === 'studio' && '📐'}
              {activeTab === 'budget' && '📊'}
              {activeTab === 'sourcing' && '🛋'}
              {activeTab === 'portfolio' && '✨'}
            </div>

            <span style={{
              display: 'inline-block',
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#C05A2A',
              backgroundColor: 'rgba(192, 90, 42, 0.1)',
              padding: '4px 14px',
              borderRadius: '50px',
              marginBottom: '14px'
            }}>
              STAGE 2 FEATURE
            </span>

            <h2 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif)',
              fontSize: '32px',
              fontWeight: 400,
              color: '#1B130D',
              margin: '0 0 12px 0'
            }}>
              {DESIGNER_TABS.find(t => t.id === activeTab)?.label}
            </h2>

            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '15px',
              color: 'rgba(52, 41, 42, 0.65)',
              lineHeight: 1.6,
              maxWidth: '500px',
              margin: '0 auto 28px auto'
            }}>
              Coming in the next stage.
            </p>

            {currentProject && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '12px',
                backgroundColor: '#FAF8F5',
                border: '1px solid #E4DDD3',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: '12px',
                color: '#1B130D'
              }}>
                <span>Current project: <strong>{currentProject.name}</strong></span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 5b. SLIDE-IN ADD / EDIT PROJECT PANEL                                      */}
      {/* ========================================================================= */}
      {isPanelOpen && (
        <>
          <div className="designer-panel-overlay" onClick={() => !formSaving && setIsPanelOpen(false)} />
          <div className="designer-slide-panel" role="dialog" aria-modal="true">
            {/* Panel Header */}
            <div style={{
              padding: '24px 30px',
              borderBottom: '1px solid #E4DDD3',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#FAF8F5'
            }}>
              <div>
                <span style={{
                  display: 'block',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#C05A2A',
                  marginBottom: '4px'
                }}>
                  DESIGNER HUB
                </span>
                <h2 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", "Playfair Display", Georgia, serif)',
                  fontSize: '26px',
                  fontWeight: 400,
                  color: '#1B130D',
                  margin: 0
                }}>
                  {editingProject ? 'Edit project' : 'Create new project'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => !formSaving && setIsPanelOpen(false)}
                disabled={formSaving}
                aria-label="Close"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  lineHeight: 1,
                  color: 'rgba(52, 41, 42, 0.6)',
                  cursor: formSaving ? 'not-allowed' : 'pointer',
                  padding: '6px'
                }}
              >
                &times;
              </button>
            </div>

            {/* Panel Form Body */}
            <form onSubmit={handleSaveProject} style={{ padding: '30px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {formError && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#FDEEE9',
                  border: '1px solid #EFA795',
                  borderRadius: '8px',
                  color: '#A82B13',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '12px',
                  marginBottom: '20px'
                }}>
                  {formError}
                </div>
              )}

              {/* Name */}
              <div className="designer-field-group">
                <label className="designer-field-label">Project Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Las Olas Villa Renovation"
                  className="designer-field-input"
                />
              </div>

              {/* Location (Reusing AddressAutocomplete) */}
              <div className="designer-field-group">
                <label className="designer-field-label">Location</label>
                <AddressAutocomplete
                  value={formLocation}
                  onChange={(val) => setFormLocation(val)}
                  onSelect={(data) => {
                    const loc = data.address ? `${data.address}${data.city ? ', ' + data.city : ''}` : data.name || '';
                    setFormLocation(loc);
                  }}
                  placeholder="Address, city or neighborhood"
                />
              </div>

              {/* Type & Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="designer-field-group">
                  <label className="designer-field-label">Project Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="designer-field-select"
                  >
                    {PROJECT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="designer-field-group">
                  <label className="designer-field-label">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="designer-field-select"
                  >
                    {PROJECT_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Style */}
              <div className="designer-field-group">
                <label className="designer-field-label">Design Style</label>
                <input
                  type="text"
                  list="style-options-list"
                  value={formStyle}
                  onChange={(e) => setFormStyle(e.target.value)}
                  placeholder="e.g. Modern Organic, Japandi, Warm Minimalist"
                  className="designer-field-input"
                />
                <datalist id="style-options-list">
                  {STYLE_OPTIONS.map(opt => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              {/* Budget & Contingency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                <div className="designer-field-group">
                  <label className="designer-field-label">Target Budget ($)</label>
                  <input
                    type="text"
                    value={formTargetBudget}
                    onChange={(e) => setFormTargetBudget(e.target.value)}
                    placeholder="e.g. 150000"
                    className="designer-field-input"
                  />
                </div>

                <div className="designer-field-group">
                  <label className="designer-field-label">Contingency %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formContingencyPct}
                    onChange={(e) => setFormContingencyPct(e.target.value)}
                    placeholder="10"
                    className="designer-field-input"
                  />
                </div>
              </div>

              {/* Link to Investor Studio Property */}
              <div className="designer-field-group">
                <label className="designer-field-label">Link to Investor Studio Property</label>
                <select
                  value={formInvestorPropId}
                  onChange={(e) => setFormInvestorPropId(e.target.value)}
                  className="designer-field-select"
                >
                  <option value="">None (Independent project)</option>
                  {investorProperties.map(ip => (
                    <option key={ip.id} value={ip.id}>
                      {ip.address} ({ip.city || 'FL'}) {ip.list_price ? `· $${Number(ip.list_price).toLocaleString()}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cover URL */}
              <div className="designer-field-group">
                <label className="designer-field-label">Cover Image URL (optional)</label>
                <input
                  type="url"
                  value={formCoverUrl}
                  onChange={(e) => setFormCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="designer-field-input"
                />
              </div>

              {/* Quick-start Rooms (on new project only) */}
              {!editingProject && (
                <div className="designer-field-group" style={{
                  padding: '16px',
                  backgroundColor: '#FAF8F5',
                  border: '1px solid #E4DDD3',
                  borderRadius: '12px'
                }}>
                  <label className="designer-field-label" style={{ marginBottom: '8px' }}>
                    Quick-Start Rooms (Optional)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {QUICK_ROOMS.map(room => (
                      <label
                        key={room}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontFamily: 'Montserrat, sans-serif',
                          fontSize: '12px',
                          color: '#1B130D',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formRooms.includes(room)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormRooms(prev => [...prev, room]);
                            } else {
                              setFormRooms(prev => prev.filter(r => r !== room));
                            }
                          }}
                        />
                        {room}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="designer-field-group">
                <label className="designer-field-label">Notes</label>
                <textarea
                  rows="3"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Design brief, client preferences, inspiration notes..."
                  className="designer-field-textarea"
                />
              </div>

              {/* Submit Buttons */}
              <div style={{
                marginTop: 'auto',
                paddingTop: '24px',
                borderTop: '1px solid #E4DDD3',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                <button
                  type="button"
                  onClick={() => setIsPanelOpen(false)}
                  disabled={formSaving}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(52, 41, 42, 0.2)',
                    borderRadius: '50px',
                    padding: '10px 20px',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#1B130D',
                    cursor: formSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={formSaving}
                  className="designer-pill-btn designer-pill-terracotta"
                  style={{ opacity: formSaving ? 0.7 : 1 }}
                >
                  {formSaving ? 'Saving...' : (editingProject ? 'Update Project' : 'Create Project')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
